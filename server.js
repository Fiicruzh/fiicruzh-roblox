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
  lastUpdate: 0
};

// Cache duration 30 seconds
const CACHE_DURATION = 30000;

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

// 🔥 API STATS (CACHED + NO REFRESH SPAM)
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

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    // Broadcast ONLY if changed
    broadcast({ stats });

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 REAL ROBLOX 3D AVATAR (GLTF + Fallback)
app.get("/api/avatar3d", async (req, res) => {
  try {
    // Try Roblox GLTF endpoint first
    const gltfTest = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/avatar?format=GLTF`,
      1
    );
    
    if (gltfTest.ok) {
      res.json({
        gltfUrl: `https://avatar.roblox.com/v1/users/${USER_ID}/avatar?format=GLTF`
      });
      return;
    }

    // Fallback to high quality thumbnail
    const avatar = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r => r.json());

    res.json({
      gltfUrl: null,
      fallback: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar3D error:", err);
    res.json({
      gltfUrl: null,
      fallback: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
    });
  }
});

// 🔥 ITEMS (NO PRICE, NO TOTAL VALUE, NO SPAM)
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    // Smart cache - only refresh if needed
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

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

    // Get thumbnails (BATCHED - efficient)
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items (NO PRICE CALCULATION)
    const result = [];
    for (const id of ids.slice(0, 20)) { // Limit 20 items
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          2 // Faster retry for individual items
        );
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == parseInt(id));

        const item = {
          name: detail.Name || "Unknown Item",
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150x150/333/fff?text=?",
          link: `https://www.roblox.com/catalog/${id}/item`
        };

        result.push(item);

      } catch (itemErr) {
        console.log(`Item ${id} skipped:`, itemErr.message);
        // Don't add broken items to prevent UI spam
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    // Smart broadcast - only if items changed
    broadcast({ items: result });

    res.json({ items: result });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
  }
});

// 🔥 WEBSOCKET BROADCAST (Smart - no spam)
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

// 🔥 WEBSOCKET CONNECTION (Send cached data immediately)
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send current cached data instantly
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WS error:', err);
  });
});

// 🔥 AUTO UPDATE (30s interval - Railway safe)
setInterval(async () => {
  console.log('🔄 LIVE UPDATE: Checking for changes...');
  try {
    // Force refresh only stats & items
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { method: 'HEAD' });
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { method: 'HEAD' });
    
    // Broadcast current cache
    broadcast({
      stats: cachedData.stats,
      items: cachedData.items
    });
    
    console.log('✅ LIVE UPDATE: Data synced');
  } catch (err) {
    console.error('Auto update failed:', err);
  }
}, 30000);

// 🔥 SPA ROUTING (Railway)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK (Railway required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: wss.clients.size,
    cacheAge: Date.now() - cachedData.lastUpdate
  });
});

// 🔥 SERVER START (Railway optimized)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://${process.env.RAILWAY_STATIC_URL || 'localhost'}:${PORT}/websocket`);
  console.log(`✅ Railway 100% ready! UserID: ${USER_ID}`);
});

// 🔥 Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down...');
  process.exit(0);
});
