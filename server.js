const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const crypto = require('crypto');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// Railway fix
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Roblox User ID
const USER_ID = 8941948601;

// ✅ SMART CACHE - DETECT CHANGES ONLY
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  itemsHash: '',
  lastUpdate: 0
};

const CACHE_DURATION = 60000; // 1 menit

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 API STATS
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    const [friends, followers, following] = await Promise.all([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]).then(([f, fl, fg]) => [
      f.json(),
      fl.json(),
      fg.json()
    ]).catch(() => [Promise.resolve({count:0}), Promise.resolve({count:0}), Promise.resolve({count:0})]);

    const stats = {
      friends: (await friends).count || 0,
      followers: (await followers).count || 0,
      following: (await following).count || 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    // ✅ ONLY BROADCAST IF STATS CHANGED
    const statsChanged = JSON.stringify(stats) !== JSON.stringify(cachedData.stats);
    if (statsChanged) {
      broadcast({ stats });
    }

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API
app.get("/api/avatar", async (req, res) => {
  try {
    const avatar = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r => r.json());

    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

// 🔥 ITEMS API - CHANGE DETECTION ONLY
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.itemsHash) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.items.reduce((sum, i) => sum + (i.price || 0), 0)
      });
    }

    // Get wearing assets
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      const emptyData = { items: [], totalValue: 0 };
      cachedData.items = [];
      cachedData.itemsHash = '';
      cachedData.lastUpdate = now;
      
      // Broadcast empty items
      broadcast({ items: [], itemsCount: 0 });
      return res.json(emptyData);
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items
    const result = [];
    for (const id of ids.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == id);

        result.push({
          name: detail.Name || "Unknown Item",
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150?text=?",
          link: `https://www.roblox.com/catalog/${id}/item`
        });

      } catch (itemErr) {
        console.log(`Item ${id} error:`, itemErr);
      }
    }

    // ✅ SMART CHANGE DETECTION
    const newHash = crypto.createHash('md5')
      .update(JSON.stringify(result.map(i => ({name: i.name, price: i.price}))))
      .digest('hex');

    const itemsChanged = newHash !== cachedData.itemsHash || result.length !== cachedData.items.length;

    cachedData.items = result;
    cachedData.itemsHash = newHash;
    cachedData.lastUpdate = now;

    // ✅ BROADCAST ONLY IF ITEMS CHANGED
    if (itemsChanged) {
      console.log(`🔄 ITEMS CHANGED: ${result.length} items`);
      broadcast({
        items: result,
        itemsCount: result.length
      });
    }

    res.json({
      items: result,
      totalValue: result.reduce((sum, i) => sum + (i.price || 0), 0)
    });

  } catch (err) {
    console.error("Items error:", err);
    res.json({
      items: cachedData.items,
      totalValue: 0
    });
  }
});

// 🔥 WEBSOCKET BROADCAST - NO SPAM
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
}

// 🔥 WEBSOCKET CONNECTION
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send current cached data
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    itemsCount: cachedData.items.length
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// ✅ MINIMAL AUTO UPDATE - EVERY 60s (LIGHTWEIGHT)
setInterval(async () => {
  console.log('🔄 Background refresh...');
  try {
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { method: 'HEAD' });
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { method: 'HEAD' });
  } catch (err) {
    console.error('Background refresh failed:', err);
  }
}, 60000); // 60 detik - VERY LIGHT

// 🔥 SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK (Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now(), clients: wss.clients.size });
});

// 🔥 SERVER START
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log(`✅ Railway optimized - NO SPAM`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
