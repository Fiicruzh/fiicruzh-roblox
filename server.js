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

// Railway optimized port handling
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false,
  maxPayload: 10 * 1024 // 10KB limit
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Roblox User ID dari profil
const USER_ID = 8941948601;

// ✅ SMART CACHE - Update hanya jika berubah
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0,
  lastStatsHash: '',
  lastItemsHash: ''
};

const CACHE_DURATION = 60000; // 1 menit

// Rate limiting sederhana
const requestTimestamps = new Map();

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'PortfolioApp/1.0' },
        timeout: 10000
      });
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

function hashData(data) {
  return JSON.stringify(data).slice(0, 50);
}

// 🔥 API STATS - Lebih ringan
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    // Cache hit - langsung return
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    // Rate limit check
    const clientIp = req.ip || req.connection.remoteAddress;
    const lastReq = requestTimestamps.get(clientIp) || 0;
    if (now - lastReq < 5000) {
      return res.json(cachedData.stats);
    }
    requestTimestamps.set(clientIp, now);

    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friendsRes.status === 'fulfilled' ? (await friendsRes.value.json()).count || 0 : cachedData.stats.friends,
      followers: followersRes.status === 'fulfilled' ? (await followersRes.value.json()).count || 0 : cachedData.stats.followers,
      following: followingRes.status === 'fulfilled' ? (await followingRes.value.json()).count || 0 : cachedData.stats.following
    };

    const newHash = hashData(stats);
    if (newHash !== cachedData.lastStatsHash) {
      cachedData.stats = stats;
      cachedData.lastStatsHash = newHash;
      cachedData.lastUpdate = now;
      broadcast({ stats });
    }

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 REAL ROBLOX AVATAR 3D
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await avatarRes.json();

    res.json({
      image: avatar.data?.[0]?.imageUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ 
      image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
    });
  }
});

// 🔥 ITEMS - Tanpa Total Value & Harga
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    // Rate limit
    const clientIp = req.ip || req.connection.remoteAddress;
    const lastReq = requestTimestamps.get(clientIp + '_items') || 0;
    if (now - lastReq < 10000) {
      return res.json({ items: cachedData.items });
    }
    requestTimestamps.set(clientIp + '_items', now);

    // Get equipped items
    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    const wear = await wearRes.json();

    const assetIds = wear.assetIds?.slice(0, 12) || []; // Max 12 items
    if (assetIds.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    // Batch thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items efficiently
    const items = [];
    const thumbMap = new Map(thumbs.data?.map(t => [t.targetId, t.imageUrl]) || []);

    for (const assetId of assetIds) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${assetId}/details`,
          1 // Single retry only
        );
        const detail = await detailRes.json();

        items.push({
          name: detail.Name || `Item #${assetId}`,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumbMap.get(assetId) || `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });

      } catch (itemErr) {
        // Fallback item
        items.push({
          name: `Item #${assetId}`,
          limited: false,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });
      }
    }

    const newHash = hashData(items);
    if (newHash !== cachedData.lastItemsHash) {
      cachedData.items = items;
      cachedData.lastItemsHash = newHash;
      cachedData.lastUpdate = now;
      broadcast({ items });
    }

    res.json({ items });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
  }
});

// ✅ WEBSOCKET - NO SPAM
function broadcast(data) {
  const clientsCount = wss.clients.size;
  if (clientsCount === 0) return;
  
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

wss.on('connection', (ws) => {
  console.log('👤 Client connected. Total:', wss.clients.size);
  
  // Send current cache only ONCE
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items
  }));

  ws.on('close', () => {
    console.log('👋 Client disconnected. Total:', wss.clients.size);
  });

  // Ping/pong untuk Railway stability
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);
});

// Railway stability - heartbeat
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// 🔥 AUTO UPDATE - Lebih jarang (2 menit) & pintar
setInterval(async () => {
  if (wss.clients.size === 0) return; // No clients = no update
  
  console.log('🔄 Background update...');
  try {
    await fetch(`http://localhost:${PORT}/api?_cache=${Date.now()}`);
    await fetch(`http://localhost:${PORT}/api/items?_cache=${Date.now()}`);
    console.log('✅ Background update complete');
  } catch (err) {
    console.error('Background update failed:', err);
  }
}, 120000); // 2 menit

// SPA Routing untuk Railway
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check untuk Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: wss.clients.size,
    cacheAge: Date.now() - cachedData.lastUpdate
  });
});

// Server start
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`👤 Roblox ID: ${USER_ID}`);
  console.log(`✅ Railway optimized & ready!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Graceful shutdown...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
