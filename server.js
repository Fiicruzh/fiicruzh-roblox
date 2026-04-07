const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  itemsHash: '',
  totalValue: 0,
  lastUpdate: 0
};

// 🔥 ABSOLUTE SAFE FETCH
async function safeApiCall(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Portfolio/1.0' }
    });
    clearTimeout(timeoutId);
    
    if (!response || !response.ok || !response.body) {
      return { success: false, data: null };
    }
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, data: null };
    }
    
    return { success: true, data };
  } catch (error) {
    return { success: false, data: null };
  }
}

// 🔥 STATS API
app.get("/api", async (req, res) => {
  const now = Date.now();
  if (now - cachedData.lastUpdate < 25000) {
    return res.json(cachedData.stats);
  }

  try {
    const urls = [
      `https://friends.roblox.com/v1/users/${USER_ID}/friends/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followers/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followings/count`
    ];

    const results = await Promise.all(urls.map(url => safeApiCall(url)));
    
    const stats = {
      friends: results[0].success ? (results[0].data.count || 0) : 0,
      followers: results[1].success ? (results[1].data.count || 0) : 0,
      following: results[2].success ? (results[2].data.count || 0) : 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ stats }));
      }
    });

    res.json(stats);
  } catch {
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API
app.get("/api/avatar2d", async (req, res) => {
  try {
    const result = await safeApiCall(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const imageUrl = result.success && result.data.data && result.data.data[0] 
      ? result.data.data[0].imageUrl 
      : null;
    
    res.json({ image: imageUrl });
  } catch {
    res.json({ image: null });
  }
});

// 🔥 ITEMS API - SEMUA ITEMS DIPAKAI (FULL LIST) ✅
app.get("/api/items", async (req, res) => {
  const checkOnly = req.query.checkOnly;
  const now = Date.now();
  
  if (now - cachedData.lastUpdate < 25000 && cachedData.itemsHash) {
    return res.json({
      items: checkOnly ? [] : cachedData.items,
      itemsHash: cachedData.itemsHash,
      totalValue: cachedData.totalValue
    });
  }

  try {
    // 1. GET ALL WEARING ITEMS
    const wearResult = await safeApiCall(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    let assetIds = wearResult.success ? (wearResult.data.assetIds || []) : [];

    if (!assetIds || assetIds.length === 0) {
      const emptyHash = 'd41d8cd98f00b204';
      cachedData.items = [];
      cachedData.itemsHash = emptyHash;
      cachedData.totalValue = 0;
      cachedData.lastUpdate = now;
      
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ items: [], itemsHash: emptyHash, totalValue: 0 }));
        }
      });
      
      return res.json({ items: [], itemsHash: emptyHash, totalValue: 0 });
    }

    console.log(`📦 Found ${assetIds.length} wearing items`);

    // 2. CHANGE DETECTION
    const fingerprint = assetIds.sort().join(',');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // 3. BATCH THUMBNAILS (ALL ITEMS)
    let thumbsData = { data: [] };
    if (assetIds.length > 0) {
      const idsBatch = assetIds.join(',');
      const thumbsResult = await safeApiCall(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${idsBatch}&size=150x150&format=Png`
      );
      if (thumbsResult.success) {
        thumbsData = thumbsResult.data;
      }
    }

    // 4. PROCESS ALL ITEMS ⚡ PARALLEL
    const itemPromises = assetIds.map(async (id) => {
      try {
        const itemResult = await safeApiCall(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (itemResult.success) {
          const detail = itemResult.data;
          const thumb = thumbsData.data.find(t => t.targetId == parseInt(id));

          return {
            name: detail.Name || "Unknown Item",
            price: detail.PriceInRobux || 0,
            limited: !!(detail.IsLimited || detail.IsLimitedUnique),
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`
          };
        }
      } catch {
        return null;
      }
      return null;
    });

    const allItems = (await Promise.all(itemPromises)).filter(item => item !== null);
    let totalValue = allItems.reduce((sum, item) => sum + item.price, 0);

    console.log(`✅ Processed ${allItems.length}/${assetIds.length} items`);

    // 5. HASH & UPDATE CACHE
    const itemsString = JSON.stringify(allItems);
    const newHash = crypto.createHash('md5').update(itemsString).digest('hex').slice(0, 12);

    if (newHash !== cachedData.itemsHash) {
      cachedData.items = allItems;
      cachedData.itemsHash = newHash;
      cachedData.totalValue = totalValue;
      cachedData.lastItemsFingerprint = fingerprint;
      cachedData.lastUpdate = now;

      const broadcastData = { items: allItems, itemsHash: newHash, totalValue };
      const message = JSON.stringify(broadcastData);
      
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
      
      console.log(`🔄 FULL UPDATE: ${allItems.length} items | Value: ${totalValue.toLocaleString()} R$`);
    }

    res.json({
      items: allItems,
      itemsHash: newHash,
      totalValue: totalValue
    });

  } catch (error) {
    console.error("Items fallback:", error.message);
    res.json({
      items: cachedData.items,
      itemsHash: cachedData.itemsHash || 'error',
      totalValue: cachedData.totalValue || 0
    });
  }
});

// 🔥 WEBSOCKET
wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  
  const initialData = {
    stats: cachedData.stats,
    items: cachedData.items,
    itemsHash: cachedData.itemsHash,
    totalValue: cachedData.totalValue
  };
  
  ws.send(JSON.stringify(initialData));
  
  ws.on('close', () => console.log('👋 Client left'));
});

// 🔥 BACKGROUND REFRESH
setInterval(() => {
  cachedData.lastUpdate = Date.now() - 20000;
  console.log('🔄 Ready for next refresh');
}, 120000);

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'LIVE', 
    items: cachedData.items.length,
    totalValue: cachedData.totalValue,
    hash: cachedData.itemsHash,
    timestamp: Date.now()
  });
});

// START SERVER
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server LIVE on port ${PORT}`);
  console.log('✅ SHOWS ALL WEARING ITEMS!');
  console.log('🧠 Smart updates only on change');
});

// ERROR IGNORER
process.on('uncaughtException', (err) => console.log('IGNORED:', err.message));
process.on('unhandledRejection', (err) => console.log('IGNORED:', err.message));
