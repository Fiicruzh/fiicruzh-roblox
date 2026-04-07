const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// Railway fix - handle all ports
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
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0,
  itemsHash: '',
  statsHash: ''
};

// 🔥 LONGER CACHE DURATION - 60 seconds
const CACHE_DURATION = 60000;

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

// ==========================
// 🔥 API STATS (SMART CACHE + HASH)
// ==========================
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached if fresh
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

    // 🔥 ONLY UPDATE IF STATS CHANGED
    const statsHash = JSON.stringify(stats);
    if (statsHash !== cachedData.statsHash) {
      cachedData.stats = stats;
      cachedData.statsHash = statsHash;
      cachedData.lastUpdate = now;
      
      // Broadcast ONLY changed stats
      broadcast({ stats });
      console.log('📊 STATS CHANGED - Broadcasted');
    }

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// ==========================
// 🔥 2D AVATAR API
// ==========================
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

// ==========================
// 🔥 ITEMS API - CHANGE DETECTION
// ==========================
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached if fresh AND has items hash
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.itemsHash) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    // Get currently wearing
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      const emptyData = { items: [], totalValue: 0 };
      if (cachedData.itemsHash !== '') {
        cachedData.items = [];
        cachedData.totalValue = 0;
        cachedData.itemsHash = '';
        cachedData.lastUpdate = now;
        broadcast(emptyData);
        console.log('🛒 ITEMS CLEARED - Broadcasted');
      }
      return res.json(emptyData);
    }

    // 🔥 NEW HASH CHECK - Only process if changed
    const newItemsHash = ids.join(',');
    if (newItemsHash === cachedData.itemsHash) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process each item
    const result = [];
    let totalValue = 0;

    for (const id of ids.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == id);

        const item = {
          id: id,
          name: detail.Name || "Unknown Item",
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150?text=?",
          link: `https://www.roblox.com/catalog/${id}/item`
        };

        totalValue += item.price;
        result.push(item);

      } catch (itemErr) {
        console.log(`Item ${id} error:`, itemErr);
        result.push({
          id: id,
          name: "Unknown",
          price: 0,
          limited: false,
          image: "https://via.placeholder.com/150?text=ERR",
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    // 🔥 UPDATE CACHE & BROADCAST ONLY IF CHANGED
    cachedData.items = result;
    cachedData.totalValue = totalValue;
    cachedData.itemsHash = newItemsHash;
    cachedData.lastUpdate = now;

    // Broadcast ONLY when items actually changed
    broadcast({
      items: result,
      totalValue: totalValue
    });
    console.log('🛒 ITEMS UPDATED -', result.length, 'items broadcasted');

    res.json({
      items: result,
      totalValue: totalValue
    });

  } catch (err) {
    console.error("Items error:", err);
    res.json({
      items: cachedData.items,
      totalValue: cachedData.totalValue
    });
  }
});

// ==========================
// 🔥 WEBSOCKET BROADCAST
// ==========================
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

// ==========================
// 🔥 WEBSOCKET CONNECTION
// ==========================
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send current cached data immediately
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// 🔥 BACKGROUND UPDATE CHECK - EVERY 60 SECONDS
setInterval(async () => {
  console.log('🔄 Background data check...');
  try {
    // Force refresh to check for changes
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { method: 'HEAD' });
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { method: 'HEAD' });
    console.log('✅ Background check complete');
  } catch (err) {
    console.error('Background check failed:', err);
  }
}, 60000);

// ==========================
// 🔥 SPA ROUTING (Railway)
// ==========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==========================
// 🔥 HEALTH CHECK
// ==========================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: wss.clients.size,
    cacheAge: Date.now() - cachedData.lastUpdate
  });
});

// ==========================
// 🔥 SERVER START
// ==========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://${process.env.RAILWAY_STATIC_URL || 'localhost'}:${PORT}/websocket`);
  console.log('✅ Portfolio ready! Items update only when changed.');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
