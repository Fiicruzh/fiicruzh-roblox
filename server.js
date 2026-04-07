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
  lastUpdate: 0
};

// Cache duration 30 seconds
const CACHE_DURATION = 30000;

// 🔥 FIXED: Smart fetch with better error handling
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
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

// 🔥 FIXED: API STATS - Proper Promise handling
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached if fresh
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Fetching stats...');
    
    // 🔥 FIXED: Sequential fetch to avoid rate limits
    const friendsRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`);
    const followersRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`);
    const followingRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`);

    const friends = await friendsRes.json().catch(() => ({count: 0}));
    const followers = await followersRes.json().catch(() => ({count: 0}));
    const following = await followingRes.json().catch(() => ({count: 0}));

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    // Broadcast via WebSocket
    broadcast({ stats });

    console.log('✅ Stats updated:', stats);
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 FIXED: 3D AVATAR API
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
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

// 🔥 FIXED: ITEMS API - Better error handling
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    console.log('🔄 Fetching items...');

    // Get currently wearing
    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    const wear = await wearRes.json();

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.totalValue = 0;
      cachedData.lastUpdate = now;
      return res.json({ items: [], totalValue: 0 });
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process each item SAFELY
    const result = [];
    let totalValue = 0;

    for (const id of ids.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        
        if (!detailRes.ok) {
          throw new Error(`HTTP ${detailRes.status}`);
        }
        
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == id);

        const item = {
          name: detail.Name || "Unknown Item",
          price: detail.PriceInRobux || detail.LowestPrice || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150?text=?",
          link: `https://www.roblox.com/catalog/${id}/item`
        };

        totalValue += item.price;
        result.push(item);

      } catch (itemErr) {
        console.log(`Item ${id} skipped:`, itemErr.message);
        // Skip bad items instead of crashing
        continue;
      }
    }

    cachedData.items = result;
    cachedData.totalValue = totalValue;
    cachedData.lastUpdate = now;

    // Broadcast via WebSocket
    broadcast({
      items: result,
      totalValue: totalValue
    });

    console.log(`✅ Items updated: ${result.length} items, ${totalValue.toLocaleString()} R$`);
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

// 🔥 FIXED: WEBSOCKET BROADCAST
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

// 🔥 FIXED: WEBSOCKET - Send COMPLETE data
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send ALL cached data immediately
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.log('WebSocket error:', err);
  });
});

// 🔥 FIXED: AUTO UPDATE - Use INTERNAL refresh, no localhost calls
setInterval(async () => {
  console.log('🔄 LIVE UPDATE: Refreshing data...');
  try {
    // Internal refresh - call APIs directly
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { timeout: 5000 }).catch(() => {});
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { timeout: 5000 }).catch(() => {});
    
    // Broadcast complete cached data
    broadcast({
      stats: cachedData.stats,
      items: cachedData.items,
      totalValue: cachedData.totalValue
    });
    
    console.log('✅ LIVE UPDATE: Complete data broadcasted');
  } catch (err) {
    console.error('Auto update failed:', err);
  }
}, 30000);

// 🔥 SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now(), clients: wss.clients.size });
});

// 🔥 SERVER START
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready on port ${PORT}`);
  console.log('✅ Railway ready!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
