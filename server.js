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

// Roblox User ID dari profil
const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0
};

// Cache duration 60 seconds (lebih ringan)
const CACHE_DURATION = 60000;

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, { 
        signal: controller.signal 
      });
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

    const [friends, followers, following] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends.status === 'fulfilled' ? (await friends.value.json()).count || 0 : 0,
      followers: followers.status === 'fulfilled' ? (await followers.value.json()).count || 0 : 0,
      following: following.status === 'fulfilled' ? (await following.value.json()).count || 0 : 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    broadcast({ stats });

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

// 🔥 ITEMS API (NO PRICE)
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

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
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150/111/0ff?text=?",
          link: `https://www.roblox.com/catalog/${id}/item`
        });
      } catch (itemErr) {
        result.push({
          name: "Unknown",
          limited: false,
          image: "https://via.placeholder.com/150/111/0ff?text=ERR",
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;
    broadcast({ items: result });

    res.json({ items: result });
  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
  }
});

// 🔥 WEBSOCKET - NO SPAM
function broadcast(data) {
  const clients = Array.from(wss.clients);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  ws.send(JSON.stringify(cachedData));
  
  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// 🔥 AUTO UPDATE (60s - Lebih ringan)
setInterval(async () => {
  console.log('🔄 Updating data...');
  try {
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`);
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`);
    broadcast(cachedData);
  } catch (err) {
    console.error('Auto update failed:', err);
  }
}, 60000);

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now() });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('✅ Railway ready!');
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});
