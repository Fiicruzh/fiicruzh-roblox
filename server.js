const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

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
  itemsHash: '',
  totalValue: 0,
  lastUpdate: 0,
  lastItemsFingerprint: ''
};

const CACHE_DURATION = 30000;

// 🔥 SMART FETCH WITH RETRY
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

// 🔥 API STATS (CACHED)
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
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

    broadcast({ stats });
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 2D ROBLOX AVATAR API
app.get("/api/avatar2d", async (req, res) => {
  try {
    const avatar = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r => r.json());

    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

// 🔥 SMART ITEMS - HASH + CHANGE DETECTION ✅ NO CONSTANT REFRESH
app.get("/api/items", async (req, res) => {
  const checkOnly = req.query.checkOnly === 'true';
  const now = Date.now();
  
  try {
    // QUICK CHECK - Return cached if fresh
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.itemsHash) {
      return res.json({
        items: checkOnly ? [] : cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // Get currently wearing
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    const assetIds = wear.assetIds || [];
    
    // FAST CHECK - Empty inventory
    if (assetIds.length === 0) {
      const emptyHash = crypto.createHash('md5').update('[]').digest('hex').slice(0, 16);
      if (cachedData.itemsHash !== emptyHash) {
        cachedData.items = [];
        cachedData.itemsHash = emptyHash;
        cachedData.totalValue = 0;
        cachedData.lastUpdate = now;
        broadcast({ items: [], itemsHash: emptyHash, totalValue: 0 });
      }
      return res.json({ items: [], itemsHash: emptyHash, totalValue: 0 });
    }

    // ✅ CHANGE DETECTION - Fingerprint check
    const fingerprint = assetIds.slice(0, 10).sort().join(',');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items
    const result = [];
    let totalValue = 0;

    for (const id of assetIds.slice(0, 20)) {
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

      } catch (itemErr) {
        console.log(`Item ${id} error:`, itemErr);
      }
    }

    // ✅ CREATE UNIQUE HASH
    const itemsData = JSON.stringify(result.sort((a,b) => b.price - a.price));
    const newHash = crypto.createHash('md5').update(itemsData).digest('hex').slice(0, 16);

    // ✅ ONLY UPDATE IF CHANGED
    if (newHash !== cachedData.itemsHash) {
      cachedData.items = result;
      cachedData.itemsHash = newHash;
      cachedData.totalValue = totalValue;
      cachedData.lastItemsFingerprint = fingerprint;
      cachedData.lastUpdate = now;

      // Broadcast ONLY when changed
      broadcast({
        items: result,
        itemsHash: newHash,
        totalValue: totalValue
      });
      console.log('🔄 ITEMS UPDATED - New hash:', newHash);
    }

    res.json({
      items: result,
      itemsHash: newHash,
      totalValue: totalValue
    });

  } catch (err) {
    console.error("Items error:", err);
    res.json({
      items: cachedData.items,
      itemsHash: cachedData.itemsHash,
      totalValue: cachedData.totalValue
    });
  }
});

// 🔥 WEBSOCKET BROADCAST
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

// 🔥 WEBSOCKET CONNECTION
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  // Send current cached data
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    itemsHash: cachedData.itemsHash,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
});

// 🔥 SMART AUTO UPDATE - 60s interval, only when needed
setInterval(async () => {
  console.log('🔄 SMART CHECK: Checking for updates...');
  try {
    // Check stats every 60s
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`);
    
    // Smart items check - lightweight
    await fetch(`http://localhost:${PORT}/api/items?checkOnly=true&_t=${Date.now()}`);
    
    console.log('✅ SMART CHECK: Complete');
  } catch (err) {
    console.error('Smart check failed:', err);
  }
}, 60000); // 60 seconds - MUCH BETTER

// 🔥 SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    itemsHash: cachedData.itemsHash,
    clients: wss.clients.size 
  });
});

// 🔥 SERVER START
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://${process.env.RAILWAY_STATIC_URL || 'localhost'}:${PORT}/websocket`);
  console.log('✅ Portfolio ready! 🚀');
  console.log('🧠 SMART MODE: Items only refresh when CHANGED');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
