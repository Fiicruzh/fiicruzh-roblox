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

const USER_ID = 8941948601; // Ganti dengan Roblox ID kamu jika berbeda
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  itemsHash: '',
  totalValue: 0,
  avatar3d: '',
  lastUpdate: 0
};

// 🔥 BULLETPROOF FETCH
async function safeApiCall(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Portfolio)',
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response?.ok || !response?.body) {
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
  } catch {
    return { success: false, data: null };
  }
}

// 🔥 STATS API - FIXED ENDPOINTS
app.get("/api", async (req, res) => {
  const now = Date.now();
  if (now - cachedData.lastUpdate < 30000) {
    return res.json(cachedData.stats);
  }

  try {
    console.log('🔄 Updating stats...');
    
    // FIXED ROBLOX ENDPOINTS - REAL DATA
    const results = await Promise.all([
      safeApiCall(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeApiCall(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeApiCall(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);
    
    const stats = {
      friends: results[0].success ? Math.floor(results[0].data.count || 0) : 0,
      followers: results[1].success ? Math.floor(results[1].data.count || 0) : 0,
      following: results[2].success ? Math.floor(results[2].data.count || 0) : 0
    };

    console.log(`📊 Stats: Friends:${stats.friends} Followers:${stats.followers} Following:${stats.following}`);

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    
    // Broadcast
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ stats }));
        } catch {}
      }
    });

    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.json(cachedData.stats);
  }
});

// 🔥 3D AVATAR .glb Roblox OFFICIAL
app.get("/api/avatar3d", async (req, res) => {
  try {
    // Roblox Official 3D Avatar GLB
    const glbUrl = `https://avatar.roblox.com/v1/users/${USER_ID}/avatar?format=glb`;
    
    const result = await safeApiCall(glbUrl);
    
    if (result.success) {
      cachedData.avatar3d = result.data.url || '';
      res.json({ glb: result.data.url || '' });
    } else {
      // Fallback to thumbnail
      const thumbResult = await safeApiCall(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png`
      );
      const thumbUrl = thumbResult.success && thumbResult.data.data?.[0]?.imageUrl || null;
      res.json({ glb: null, fallback: thumbUrl });
    }
  } catch {
    res.json({ glb: null, fallback: null });
  }
});

// 🔥 FULL ITEMS (SEMUA YANG DIPAKAI)
app.get("/api/items", async (req, res) => {
  const checkOnly = req.query.checkOnly;
  const now = Date.now();
  
  if (now - cachedData.lastUpdate < 30000 && cachedData.itemsHash) {
    return res.json({
      items: checkOnly ? [] : cachedData.items,
      itemsHash: cachedData.itemsHash,
      totalValue: cachedData.totalValue
    });
  }

  try {
    console.log('🔄 Updating items...');
    
    const wearResult = await safeApiCall(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    let assetIds = wearResult.success ? (wearResult.data.assetIds || []) : [];

    if (!assetIds?.length) {
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

    console.log(`📦 Processing ${assetIds.length} wearing items`);

    // CHANGE DETECTION
    const fingerprint = assetIds.sort().join(',');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // THUMBNAILS BATCH
    let thumbsData = { data: [] };
    if (assetIds.length) {
      const thumbsResult = await safeApiCall(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
      );
      if (thumbsResult.success) thumbsData = thumbsResult.data;
    }

    // PROCESS ALL ITEMS PARALLEL
    const itemPromises = assetIds.map(async (id) => {
      try {
        const itemResult = await safeApiCall(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (itemResult.success) {
          const detail = itemResult.data;
          const thumb = thumbsData.data?.find(t => t.targetId == parseInt(id));

          return {
            name: detail.Name?.substring(0, 30) || "Item",
            price: detail.PriceInRobux || 0,
            limited: !!(detail.IsLimited || detail.IsLimitedUnique),
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`
          };
        }
      } catch {
        return null;
      }
    });

    const allItems = (await Promise.all(itemPromises)).filter(Boolean);
    const totalValue = allItems.reduce((sum, item) => sum + (item.price || 0), 0);

    // HASH & CACHE
    const itemsString = JSON.stringify(allItems);
    const newHash = crypto.createHash('md5').update(itemsString).digest('hex').slice(0, 12);

    if (newHash !== cachedData.itemsHash) {
      cachedData.items = allItems;
      cachedData.itemsHash = newHash;
      cachedData.totalValue = totalValue;
      cachedData.lastItemsFingerprint = fingerprint;
      cachedData.lastUpdate = now;

      const broadcastData = { items: allItems, itemsHash: newHash, totalValue };
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(broadcastData));
        }
      });
      
      console.log(`✅ FULL ITEMS: ${allItems.length} | Value: ${totalValue.toLocaleString()} R$`);
    }

    res.json({ items: allItems, itemsHash: newHash, totalValue });

  } catch (error) {
    res.json({
      items: cachedData.items,
      itemsHash: cachedData.itemsHash || 'error',
      totalValue: cachedData.totalValue || 0
    });
  }
});

// WEBSOCKET
wss.on('connection', (ws) => {
  console.log('👤 Connected');
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    itemsHash: cachedData.itemsHash,
    totalValue: cachedData.totalValue
  }));
  ws.on('close', () => console.log('👋 Disconnected'));
});

// BACKGROUND
setInterval(() => {
  cachedData.lastUpdate = Date.now() - 25000;
}, 90000);

// ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'LIVE', 
    stats: cachedData.stats,
    items: cachedData.items.length,
    userId: USER_ID
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LIVE on ${PORT}`);
  console.log(`👤 User ID: ${USER_ID}`);
  console.log('✅ Stats + 3D GLB + ALL Items!');
});

// NO CRASH
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});
