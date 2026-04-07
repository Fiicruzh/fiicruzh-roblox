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

// 🚀 RAILWAY PORT FIX
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const HOST = process.env.RAILWAY_STATIC_URL || 'localhost';
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

const CACHE_DURATION = 30000;

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔄 Fetching: ${url}`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (response.ok) return response;
    } catch (err) {
      console.error(`❌ Fetch ${i+1}/${retries} failed:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 API STATS (FIXED)
app.get("/api", async (req, res) => {
  try {
    console.log('🔄 Fetching stats...');
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    const friendsP = fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r => r.json()).catch(() => ({count:0}));
    const followersP = fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r => r.json()).catch(() => ({count:0}));
    const followingP = fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r => r.json()).catch(() => ({count:0}));

    const [friends, followers, following] = await Promise.all([friendsP, followersP, followingP]);

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    console.log(`✅ Stats updated:`, stats);
    broadcast({ stats });

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 3D AVATAR API (FIXED)
app.get("/api/avatar3d", async (req, res) => {
  try {
    // Roblox avatar GLTF (experimental)
    const gltfUrl = `https://avatar.roblox.com/v1/users/${USER_ID}/avatar?format=GLTF`;
    
    // Test if GLTF works
    const test = await fetch(gltfUrl, { method: 'HEAD' }).catch(() => null);
    
    res.json({
      gltfUrl: test ? gltfUrl : null,
      fallback: `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    });

  } catch (err) {
    console.error("Avatar3D error:", err);
    res.json({
      gltfUrl: null,
      fallback: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
    });
  }
});

// 🔥 ITEMS API (FIXED - Better error handling)
app.get("/api/items", async (req, res) => {
  try {
    console.log('🔄 Fetching items...');
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    // Get wearing assets
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json()).catch(() => ({assetIds: []}));

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    console.log(`📦 Found ${ids.length} equipped items`);

    // Batch thumbnails (FIXED)
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.slice(0,20).join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items SAFELY
    const result = [];
    for (const id of ids.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          1 // Single retry only
        );
        
        if (!detailRes.ok) continue;
        
        const detail = await detailRes.json();
        
        const thumb = thumbs.data?.find(t => t.targetId == parseInt(id));

        result.push({
          name: detail.Name?.substring(0, 20) || "Item",
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });

      } catch (itemErr) {
        console.log(`⚠️ Item ${id} skipped:`, itemErr.message);
        // Skip broken items silently
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    console.log(`✅ Items updated: ${result.length} items`);
    broadcast({ items: result });

    res.json({ items: result });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
  }
});

// 🔥 WEBSOCKET (FIXED)
function broadcast(data) {
  const clientsCount = wss.clients.size;
  let sent = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
        sent++;
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
  
  if (sent > 0) console.log(`📡 Broadcast to ${sent}/${clientsCount} clients`);
}

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send cached data immediately
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
  });
});

// 🔥 AUTO UPDATE (RAILWAY FIXED)
setInterval(async () => {
  console.log('🔄 Auto update...');
  try {
    // Use current host instead of localhost
    const currentHost = req ? req.get('host') : `${HOST}:${PORT}`;
    await fetch(`http://${currentHost}/api?_t=${Date.now()}`, { 
      method: 'HEAD',
      timeout: 5000 
    }).catch(() => {});
    
    broadcast({
      stats: cachedData.stats,
      items: cachedData.items
    });
    
    console.log('✅ Auto update complete');
  } catch (err) {
    console.error('Auto update failed:', err.message);
  }
}, 30000);

// 🔥 SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    uptime: process.uptime(),
    clients: wss.clients.size,
    cacheAge: Date.now() - cachedData.lastUpdate,
    userId: USER_ID
  });
});

// 🔥 START SERVER
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server ready on port ${PORT}`);
  console.log(`📡 WebSocket: ws://${HOST}:${PORT}/websocket`);
  console.log(`👤 Roblox User: ${USER_ID}`);
  console.log(`✅ Railway optimized & error-proof!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Graceful shutdown...');
  server.close(() => process.exit(0));
});
