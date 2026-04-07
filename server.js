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
const PORT = process.env.PORT || 3000;
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

// 🔥 API STATS
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
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

// 🔥 ITEMS API - SEMUA AKSESORIS & PAKAIAN EQUIPPED
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    // 1. Get ALL currently wearing items
    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/outfit`
    );
    const wear = await wearRes.json();

    // 2. Extract SEMUA asset IDs yang equipped
    let allAssetIds = [];
    
    // Add dari outfit assets
    if (wear.assets) {
      wear.assets.forEach(asset => {
        if (asset.id) allAssetIds.push(asset.id);
      });
    }
    
    // Add dari legacy assetIds (backup)
    if (wear.assetIds) {
      wear.assetIds.forEach(id => allAssetIds.push(id));
    }

    // Remove duplicates
    allAssetIds = [...new Set(allAssetIds)];

    console.log(`🔍 Found ${allAssetIds.length} equipped items`);

    if (allAssetIds.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    // 3. Get thumbnails untuk SEMUA items
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${allAssetIds.slice(0,24).join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // 4. Process SEMUA items (max 24 untuk smooth)
    const result = [];
    for (const id of allAssetIds.slice(0, 24)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          2, 800
        );
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == parseInt(id));

        // ✅ Tampilkan SEMUA equipped items (pakaian + aksesoris)
        result.push({
          name: detail.Name || `Item #${id}`,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });

      } catch (itemErr) {
        console.log(`Item ${id} fallback`);
        // Fallback image
        result.push({
          name: "Equipped Item",
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    console.log(`✅ Processed ${result.length} equipped items`);
    broadcast({ items: result });
    res.json({ items: result });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
  }
});

// 🔥 WEBSOCKET
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

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  ws.send(JSON.stringify(cachedData));
  
  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// 🔥 AUTO UPDATE - FIXED FOR RAILWAY
setInterval(async () => {
  console.log('🔄 Updating data...');
  try {
    // Update stats
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { 
      timeout: 10000 
    }).catch(() => {});
    
    // Update items  
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { 
      timeout: 10000 
    }).catch(() => {});
    
    console.log('✅ Data updated & broadcasted');
  } catch (err) {
    console.error('Auto update failed:', err);
  }
}, 30000);

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
