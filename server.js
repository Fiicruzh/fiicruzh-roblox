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

const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

app.use(express.static(path.join(__dirname, "public")));

// Roblox User ID
const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0,
  lastItemsCheck: 0,
  currentAssetIds: []
};

// 🔥 REALTIME CHECK EVERY 10 SECONDS FOR ITEMS
const ITEMS_CHECK_INTERVAL = 10000; // 10 detik

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

// 🔥 REALTIME ITEMS CHECKER
async function checkItemsUpdate() {
  try {
    console.log('🔍 Checking Roblox items...');
    
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    const currentIds = wear.assetIds || [];
    
    // 🔥 DETECT CHANGE
    if (JSON.stringify(currentIds) !== JSON.stringify(cachedData.currentAssetIds)) {
      console.log('🆕 ITEMS CHANGED! Updating...', currentIds.length, 'items');
      
      // Full items refresh
      await loadAndCacheItems(currentIds);
      
      // IMMEDIATE BROADCAST TO ALL CLIENTS
      broadcast({
        items: cachedData.items,
        totalValue: cachedData.totalValue,
        type: 'items_update'
      });
      
      console.log('✅ ITEMS BROADCASTED to', wss.clients.size, 'clients');
    } else {
      console.log('✅ No items changes');
    }
    
    cachedData.currentAssetIds = currentIds;
    cachedData.lastItemsCheck = Date.now();
    
  } catch (err) {
    console.error('Items check failed:', err);
  }
}

// 🔥 FULL ITEMS PROCESSING
async function loadAndCacheItems(ids) {
  if (ids.length === 0) {
    cachedData.items = [];
    cachedData.totalValue = 0;
    return;
  }

  // Get thumbnails
  const thumbsRes = await fetchWithRetry(
    `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
  );
  const thumbs = await thumbsRes.json();

  const result = [];
  let totalValue = 0;

  for (const id of ids.slice(0, 20)) {
    try {
      const detailRes = await fetchWithRetry(
        `https://economy.roblox.com/v2/assets/${id}/details`
      );
      const detail = await detailRes.json();

      const thumb = thumbs.data?.find(t => t.targetId == id);

      const item = {
        id: id,
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
    }
  }

  cachedData.items = result;
  cachedData.totalValue = totalValue;
  cachedData.lastUpdate = Date.now();
}

// ==========================
// 🔥 API ENDPOINTS
// ==========================

// Stats API
app.get("/api", async (req, res) => {
  try {
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
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// Avatar API
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

// 🔥 ITEMS API - RETURN CACHED + FORCE REFRESH OPTION
app.get("/api/items", async (req, res) => {
  const force = req.query.force === 'true';
  
  if (force) {
    console.log('🔧 FORCE items refresh');
    await checkItemsUpdate();
  }
  
  res.json({
    items: cachedData.items,
    totalValue: cachedData.totalValue,
    lastUpdate: cachedData.lastUpdate,
    lastCheck: cachedData.lastItemsCheck
  });
});

// ==========================
// 🔥 WEBSOCKET
// ==========================
function broadcast(data) {
  const message = JSON.stringify(data);
  let sent = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sent++;
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
  
  console.log(`📡 Broadcasted to ${sent} clients`);
}

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected (Total:', wss.clients.size, ')');
  
  // Send current data immediately
  ws.send(JSON.stringify({
    items: cachedData.items,
    totalValue: cachedData.totalValue,
    stats: cachedData.stats,
    type: 'initial_load'
  }));

  ws.on('close', () => {
    console.log('👋 Client disconnected (Total:', wss.clients.size, ')');
  });
});

// ==========================
// 🔥 REALTIME ITEMS CHECKER - EVERY 10 SECONDS
// ==========================
setInterval(checkItemsUpdate, ITEMS_CHECK_INTERVAL);

// Initial load
checkItemsUpdate();

// ==========================
// 🔥 ROUTING & HEALTH
// ==========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: wss.clients.size,
    itemsCount: cachedData.items.length,
    lastItemsCheck: cachedData.lastItemsCheck,
    nextCheck: Date.now() + ITEMS_CHECK_INTERVAL
  });
});

// ==========================
// 🔥 SERVER START
// ==========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://${process.env.RAILWAY_STATIC_URL || 'localhost'}:${PORT}/websocket`);
  console.log(`🔍 Items check every ${ITEMS_CHECK_INTERVAL/1000}s`);
  console.log('✅ REALTIME PORTFOLIO READY!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
