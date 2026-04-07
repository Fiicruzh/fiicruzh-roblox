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

// 🔥 ABSOLUTE SAFE FETCH - NO CRASH EVER
async function safeApiCall(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Portfolio/1.0' }
    });
    clearTimeout(timeoutId);
    
    if (!response || !response.ok || !response.body) {
      return { success: false, data: null };
    }
    
    const text = await response.text();
    clearTimeout(timeoutId);
    
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

// 🔥 STATS API - IMPENETRABLE
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
    
    // Safe broadcast
    try {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ stats }));
        }
      });
    } catch {}

    res.json(stats);
  } catch {
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API - SIMPLE
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

// 🔥 ITEMS API - THE FINAL BOSS ✅ NO JSON ERROR
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
    // Step 1: Get wearing items
    const wearResult = await safeApiCall(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const assetIds = wearResult.success ? (wearResult.data.assetIds || []) : [];

    if (!assetIds || assetIds.length === 0) {
      const emptyHash = 'd41d8cd98f00b204';
      cachedData.items = [];
      cachedData.itemsHash = emptyHash;
      cachedData.totalValue = 0;
      cachedData.lastUpdate = now;
      
      try {
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ items: [], itemsHash: emptyHash, totalValue: 0 }));
          }
        });
      } catch {}
      
      return res.json({ items: [], itemsHash: emptyHash, totalValue: 0 });
    }

    // Step 2: Check if changed (fingerprint)
    const fingerprint = assetIds.slice(0, 8).sort().join('-');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // Step 3: Get thumbnails (optional)
    let thumbsData = { data: [] };
    try {
      const thumbsResult = await safeApiCall(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.slice(0,10).join(",")}&size=150x150&format=Png`
      );
      if (thumbsResult.success) thumbsData = thumbsResult.data;
    } catch {}

    // Step 4: Process limited items FAST
    const result = [];
    let totalValue = 0;
    
    // Only process first 8 items for speed
    for (const id of assetIds.slice(0, 8)) {
      try {
        const itemResult = await safeApiCall(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (itemResult.success) {
          const detail = itemResult.data;
          const thumb = thumbsData.data.find(t => t.targetId == id);

          result.push({
            name: detail.Name || "Item",
            price: detail.PriceInRobux || 0,
            limited: !!(detail.IsLimited || detail.IsLimitedUnique),
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`
          });
          
          totalValue += (detail.PriceInRobux || 0);
        }
      } catch {
        // Skip single item
      }
    }

    // Step 5: Hash & cache
    const itemsString = JSON.stringify(result);
    const newHash = crypto.createHash('md5').update(itemsString).digest('hex').slice(0, 12);

    if (newHash !== cachedData.itemsHash) {
      cachedData.items = result;
      cachedData.itemsHash = newHash;
      cachedData.totalValue = totalValue;
      cachedData.lastItemsFingerprint = fingerprint;
      cachedData.lastUpdate = now;

      // Safe broadcast
      try {
        const broadcastData = { items: result, itemsHash: newHash, totalValue };
        const message = JSON.stringify(broadcastData);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      } catch {}
      
      console.log(`🔄 ITEMS CHANGED: ${result.length} items`);
    }

    res.json({
      items: result,
      itemsHash: newHash,
      totalValue: totalValue
    });

  } catch (error) {
    // ULTIMATE FALLBACK
    console.error("Items fallback active");
    res.json({
      items: cachedData.items,
      itemsHash: cachedData.itemsHash || 'fallback',
      totalValue: cachedData.totalValue || 0
    });
  }
});

// 🔥 CLEAN WEBSOCKET
wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  
  try {
    ws.send(JSON.stringify({
      stats: cachedData.stats,
      items: cachedData.items,
      itemsHash: cachedData.itemsHash,
      totalValue: cachedData.totalValue
    }));
  } catch {}

  ws.on('close', () => console.log('👋 Client left'));
});

// 🔥 GENTLE BACKGROUND REFRESH - NO FETCH ISSUES
setInterval(() => {
  cachedData.lastUpdate = Date.now() - 20000; // Force refresh next request
  console.log('🔄 Gentle refresh ready');
}, 120000); // 2 minutes

// SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// HEALTH
app.get('/health', (req, res) => {
  res.json({ 
    status: 'LIVE', 
    items: cachedData.items.length,
    hash: cachedData.itemsHash,
    clients: wss.clients.size 
  });
});

// START
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LIVE on ${PORT}`);
  console.log('✅ BULLETPROOF - Zero crashes!');
});

// NO CRASH
process.on('uncaughtException', (err) => {
  console.error('IGNORED:', err.message);
});
process.on('unhandledRejection', (err) => {
  console.error('IGNORED:', err.message);
});
