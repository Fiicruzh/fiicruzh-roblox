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

// 🔧 SEPARATE CACHES for smart updates
let statsCache = { friends: 0, followers: 0, following: 0, lastUpdate: 0 };
let itemsCache = { items: [], totalValue: 0, lastUpdate: 0, hash: '' };
const CACHE_DURATION = 30000; // 30 seconds

// ==========================
// 🔥 SMART CACHING + RETRY
// ==========================
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

// 🔧 Hash function for items
function hashItems(items) {
  return items.map(item => `${item.name}-${item.price}-${item.limited}`).join('|');
}

// ==========================
// 🔥 API STATS (SEPARATE CACHE)
// ==========================
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - statsCache.lastUpdate < CACHE_DURATION) {
      return res.json(statsCache);
    }

    const [friendsRes, followersRes, followingRes] = await Promise.all([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const [friends, followers, following] = await Promise.all([
      friendsRes.json(),
      followersRes.json(),
      followingRes.json()
    ]);

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    statsCache = { ...stats, lastUpdate: now };
    
    // Broadcast stats only
    broadcast({ stats });

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(statsCache);
  }
});

// ==========================
// 🔥 AVATAR API (Enhanced for 3D)
// ==========================
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarFront = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r => r.json());

    res.json({
      image: avatarFront.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

// ==========================
// 🔥 ITEMS API (SEPARATE CACHE + SMART HASH)
// ==========================
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - itemsCache.lastUpdate < CACHE_DURATION && itemsCache.items.length > 0) {
      return res.json(itemsCache);
    }

    // Get currently wearing
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      const emptyCache = { items: [], totalValue: 0, lastUpdate: now, hash: '' };
      itemsCache = emptyCache;
      broadcast({ items: [], totalValue: 0 });
      return res.json(emptyCache);
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items
    const result = [];
    let totalValue = 0;

    for (const id of ids.slice(0, 20)) { // Limit 20 items
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        const detail = await detailRes.json();
        const thumb = thumbs.data?.find(t => t.targetId == id);

        const item = {
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
          name: "Unknown",
          price: 0,
          limited: false,
          image: "https://via.placeholder.com/150?text=ERR",
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    const newHash = hashItems(result);
    
    // Only update cache if items actually changed
    if (newHash !== itemsCache.hash) {
      itemsCache = { 
        items: result, 
        totalValue, 
        lastUpdate: now, 
        hash: newHash 
      };
      
      // Broadcast ONLY when items change
      broadcast({
        items: result,
        totalValue: totalValue
      });
      console.log('🔄 Items updated & broadcasted');
    }

    res.json(itemsCache);

  } catch (err) {
    console.error("Items error:", err);
    res.json(itemsCache);
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
    stats: statsCache,
    items: itemsCache.items,
    totalValue: itemsCache.totalValue
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// 🔥 BACKGROUND UPDATE - Only when needed
setInterval(async () => {
  console.log('🔄 Background refresh...');
  try {
    // Force refresh both APIs
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { method: 'GET' });
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { method: 'GET' });
    
    console.log('✅ Background refresh complete');
  } catch (err) {
    console.error('Background refresh failed:', err);
  }
}, 30000); // 30 seconds

// ==========================
// 🔥 SPA ROUTING
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
    statsAge: Date.now() - statsCache.lastUpdate,
    itemsAge: Date.now() - itemsCache.lastUpdate
  });
});

// ==========================
// 🔥 SERVER START
// ==========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log(`✅ Smart caching enabled`);
  console.log('🚀 Portfolio ready!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
