const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET"]
}));
app.use(express.json({ limit: '1mb' }));

// Railway optimized port
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

// 🔥 ULTRA LIGHT CACHE - 60s
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0
};
const CACHE_DURATION = 60000; // 60 seconds

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { 
        timeout: 10000,
        headers: { 'User-Agent': 'PortfolioApp/1.0' }
      });
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// 🔥 STATS API - SEPARATE ENDPOINT
app.get("/api/stats", async (req, res) => {
  const now = Date.now();
  
  // Return cached if fresh
  if (now - cachedData.lastUpdate < CACHE_DURATION) {
    return res.json(cachedData.stats);
  }

  try {
    const [friends, followers, following] = await Promise.all([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]).then(([f, fl, fg]) => [
      f.json(),
      fl.json(),
      fg.json()
    ]);

    const stats = {
      friends: (await friends).count || 0,
      followers: (await followers).count || 0,
      following: (await following).count || 0
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

// 🔥 AVATAR API - DIRECT 3D
app.get("/api/avatar", async (req, res) => {
  try {
    const avatar = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r => r.json());

    res.json({
      image: avatar.data?.[0]?.imageUrl || `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`
    });
  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ 
      image: `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png` 
    });
  }
});

// 🔥 ITEMS API - NO PRICE, LIGHTER
app.get("/api/items", async (req, res) => {
  const now = Date.now();
  
  if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
    return res.json({ items: cachedData.items });
  }

  try {
    // Get currently wearing
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    // Get thumbnails + names
    const [thumbsRes, namesRes] = await Promise.all([
      fetchWithRetry(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.slice(0,20).join(",")}&size=150x150&format=Png`),
      fetchWithRetry(`https://catalog.roblox.com/v1/catalog/assets/details?assetIds=${ids.slice(0,20).join(",")}`)
    ]);

    const thumbs = await thumbsRes.json();
    const names = await namesRes.json();

    // Process items (NO PRICE CALLS - LIGHTER)
    const result = [];
    for (const [i, id] of ids.slice(0, 20).entries()) {
      const nameData = names.data?.[i];
      const thumb = thumbs.data?.find(t => t.targetId == id);

      result.push({
        name: nameData?.Name || `Item #${id}`,
        limited: nameData?.IsLimited || nameData?.IsLimitedUnique || false,
        image: thumb?.imageUrl || "https://via.placeholder.com/150?text=?",
        link: `https://www.roblox.com/catalog/${id}/item`
      });
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

// 🔥 LIGHT WEBSOCKET - NO SPAM
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        // Silent fail
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  ws.send(JSON.stringify(cachedData));
  
  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });
});

// 🔥 VERY LIGHT AUTO UPDATE - 60s
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/api/stats?_t=${Date.now()}`);
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`);
    broadcast(cachedData);
  } catch (err) {
    // Silent fail
  }
}, 60000);

// SPA Routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now() });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log('✅ Railway optimized!');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
