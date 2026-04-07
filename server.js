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

const CACHE_DURATION = 60000;

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.ok) return response;
    } catch (err) {
      console.log(`Fetch retry ${i + 1}/${retries} for ${url}:`, err.message);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 API STATS - FIXED
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Fetching stats...');
    
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: 0,
      followers: 0,
      following: 0
    };

    // Safe JSON parsing
    if (friendsRes.status === 'fulfilled') {
      try {
        const data = await friendsRes.value.json();
        stats.friends = data.count || 0;
      } catch {}
    }
    
    if (followersRes.status === 'fulfilled') {
      try {
        const data = await followersRes.value.json();
        stats.followers = data.count || 0;
      } catch {}
    }
    
    if (followingRes.status === 'fulfilled') {
      try {
        const data = await followingRes.value.json();
        stats.following = data.count || 0;
      } catch {}
    }

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    
    console.log('✅ Stats updated:', stats);
    broadcast({ stats });
    
    res.json(stats);
  } catch (err) {
    console.error("Stats error:", err.message);
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const avatar = await avatarRes.json();
    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });
  } catch (err) {
    console.error("Avatar error:", err.message);
    res.json({ image: null });
  }
});

// 🔥 ITEMS API - FIXED
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔄 Fetching items...');
    
    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    const wear = await wearRes.json();

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      console.log('ℹ️ No items equipped');
      return res.json({ items: [] });
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    const result = [];
    
    // Process max 20 items
    for (const id of ids.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          2 // Less retries for individual items
        );
        
        const detail = await detailRes.json();
        const thumb = thumbs.data?.find(t => t.targetId == parseInt(id));

        result.push({
          name: detail.Name || `Item #${id}`,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });
      } catch (itemErr) {
        console.log(`⚠️ Item ${id} skipped:`, itemErr.message);
        result.push({
          name: `Item #${id}`,
          limited: false,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;
    
    console.log(`✅ Items updated: ${result.length} items`);
    broadcast({ items: result });
    
    res.json({ items: result });
  } catch (err) {
    console.error("Items error:", err.message);
    res.json({ items: cachedData.items });
  }
});

// 🔥 WEBSOCKET
function broadcast(data) {
  try {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  } catch (err) {
    console.error("Broadcast error:", err.message);
  }
}

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  ws.send(JSON.stringify({ 
    stats: cachedData.stats, 
    items: cachedData.items 
  }));
  
  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
  
  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
});

// 🔥 AUTO UPDATE - FIXED (No localhost)
setInterval(async () => {
  console.log('🔄 Auto update...');
  try {
    // Trigger API calls without localhost
    await fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`);
    await fetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    
    // Force refresh by calling our own APIs
    await fetch(`/api?_t=${Date.now()}`, { method: 'HEAD' });
    await fetch(`/api/items?_t=${Date.now()}`, { method: 'HEAD' });
    
    console.log('✅ Auto update complete');
  } catch (err) {
    console.error('Auto update failed:', err.message);
  }
}, 60000);

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    cacheAge: Date.now() - cachedData.lastUpdate,
    wsClients: wss.clients.size 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`👤 User ID: ${USER_ID}`);
  console.log('✅ Railway 100% READY!');
});

process.on('SIGTERM', () => {
  console.log('🛑 Graceful shutdown...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received...');
  process.exit(0);
});
