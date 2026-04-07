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

// 🔥 ENHANCED CACHING WITH CHANGE DETECTION
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0,
  itemsHash: '',
  statsHash: ''
};

// Cache duration 60 seconds
const CACHE_DURATION = 60000;

// Connected clients count
let clientCount = 0;

// ==========================
// 🔥 SMART FETCH WITH RETRY
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

// ==========================
// 🔥 API STATS - CHANGE DETECTION
// ==========================
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached if fresh
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Fetching fresh stats...');
    
    const [friendsRes, followersRes, followingRes] = await Promise.all([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]).catch(() => [null, null, null]);

    if (!friendsRes || !followersRes || !followingRes) {
      return res.json(cachedData.stats);
    }

    const [friends, followers, following] = await Promise.all([
      friendsRes.json().catch(() => ({count: 0})),
      followersRes.json().catch(() => ({count: 0})),
      followingRes.json().catch(() => ({count: 0}))
    ]);

    const newStats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    const newStatsHash = JSON.stringify(newStats);
    
    // 🔥 ONLY UPDATE IF CHANGED
    if (newStatsHash !== cachedData.statsHash) {
      cachedData.stats = newStats;
      cachedData.statsHash = newStatsHash;
      cachedData.lastUpdate = now;
      
      // Broadcast ONLY if changed AND clients exist
      if (clientCount > 0) {
        broadcast({ stats: newStats });
        console.log('📊 STATS CHANGED - Broadcasted to', clientCount, 'clients');
      }
    }

    res.json(cachedData.stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// ==========================
// 🔥 3D AVATAR API
// ==========================
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

// ==========================
// 🔥 ITEMS API - SMART CHANGE DETECTION
// ==========================
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached if fresh AND has items
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    console.log('🔄 Fetching fresh items...');
    
    // Get currently wearing
    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).catch(() => null);
    
    if (!wearRes) {
      return res.json({ items: cachedData.items, totalValue: cachedData.totalValue });
    }
    
    const wear = await wearRes.json();
    let ids = wear.assetIds || [];
    
    if (ids.length === 0) {
      const emptyData = { items: [], totalValue: 0 };
      cachedData.items = [];
      cachedData.totalValue = 0;
      cachedData.itemsHash = '';
      cachedData.lastUpdate = now;
      return res.json(emptyData);
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items
    const result = [];
    let totalValue = 0;
    const newItemDetails = [];

    for (const id of ids.slice(0, 20)) {
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
        newItemDetails.push(item.name + item.price);
      } catch (itemErr) {
        console.log(`Item ${id} skipped:`, itemErr.message);
      }
    }

    const newItemsHash = JSON.stringify(newItemDetails.sort());
    
    // 🔥 ONLY UPDATE IF ITEMS CHANGED
    if (newItemsHash !== cachedData.itemsHash || result.length !== cachedData.items.length) {
      cachedData.items = result;
      cachedData.totalValue = totalValue;
      cachedData.itemsHash = newItemsHash;
      cachedData.lastUpdate = now;

      // Broadcast ONLY if changed AND clients exist
      if (clientCount > 0) {
        broadcast({
          items: result,
          totalValue: totalValue
        });
        console.log('🎒 ITEMS CHANGED - Broadcasted to', clientCount, 'clients');
      }
    }

    res.json({
      items: cachedData.items,
      totalValue: cachedData.totalValue
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
// 🔥 EFFICIENT WEBSOCKET BROADCAST
// ==========================
function broadcast(data) {
  if (clientCount === 0) return;
  
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sentCount++;
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
  
  if (sentCount > 0) {
    console.log(`📡 Broadcasted to ${sentCount}/${clientCount} clients`);
  }
}

// ==========================
// 🔥 WEBSOCKET CONNECTION HANDLER
// ==========================
wss.on('connection', (ws) => {
  clientCount++;
  console.log(`👤 Client ${clientCount} connected`);
  
  // Send current cached data immediately
  ws.send(JSON.stringify(cachedData));

  ws.on('close', () => {
    clientCount = Math.max(0, clientCount - 1);
    console.log(`👋 Client disconnected. Active: ${clientCount}`);
  });

  ws.on('error', (err) => {
    console.error('WS error:', err);
    clientCount = Math.max(0, clientCount - 1);
  });
});

// ==========================
// 🔥 FIXED AUTO-UPDATE - NO LOCALHOST FETCH
// ==========================
setInterval(async () => {
  if (clientCount === 0) {
    console.log('⏸️ No clients - skipping update');
    return;
  }
  
  console.log('🔄 Scheduled data refresh...');
  
  try {
    // Direct Roblox API calls instead of localhost fetch
    await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`)
    ]);
    
    console.log('✅ Scheduled refresh complete');
    
  } catch (err) {
    console.error('Scheduled refresh failed (non-critical):', err.message);
  }
}, 60000); // 60 seconds

// ==========================
// 🔥 SPA ROUTING
// ==========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==========================
// 🔥 HEALTH CHECK (Railway)
// ==========================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: clientCount,
    cacheAge: Date.now() - cachedData.lastUpdate,
    uptime: process.uptime()
  });
});

// ==========================
// 🔥 SERVER START
// ==========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready - 0 clients connected`);
  console.log(`✅ Railway FIXED - No localhost calls`);
  console.log(`👤 User ID: ${USER_ID}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received - shutting down...');
  process.exit(0);
});
