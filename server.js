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

// 🔥 SAFE FETCH WITH RETRY & ERROR HANDLING
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 API STATS (SAFE)
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    const requests = [
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).catch(() => ({json: () => Promise.resolve({count: 0})})),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).catch(() => ({json: () => Promise.resolve({count: 0})})),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).catch(() => ({json: () => Promise.resolve({count: 0})}))
    ];

    const [friendsRes, followersRes, followingRes] = await Promise.all(requests);
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
    console.error("Stats error:", err.message);
    res.json(cachedData.stats);
  }
});

// 🔥 2D ROBLOX AVATAR API (SAFE)
app.get("/api/avatar2d", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).catch(() => null);
    
    if (!avatarRes) {
      return res.json({ image: null });
    }
    
    const avatar = await avatarRes.json();
    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err.message);
    res.json({ image: null });
  }
});

// 🔥 SMART ITEMS - FULLY SAFE ✅ FIXED ERROR
app.get("/api/items", async (req, res) => {
  const checkOnly = req.query.checkOnly === 'true';
  const now = Date.now();
  
  try {
    // QUICK CACHE CHECK
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.itemsHash) {
      return res.json({
        items: checkOnly ? [] : cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // SAFE Wear API call
    let wear;
    try {
      const wearRes = await fetchWithRetry(
        `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
      );
      wear = await wearRes.json();
    } catch (wearErr) {
      console.error("Wear API failed:", wearErr.message);
      wear = { assetIds: [] };
    }

    const assetIds = wear.assetIds || [];
    
    // EMPTY INVENTORY CHECK
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

    // FINGERPRINT CHECK
    const fingerprint = assetIds.slice(0, 10).sort().join(',');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // SAFE Thumbnails
    let thumbs = { data: [] };
    try {
      const thumbsRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}&size=150x150&format=Png`
      );
      thumbs = await thumbsRes.json();
    } catch (thumbsErr) {
      console.error("Thumbs failed:", thumbsErr.message);
    }

    // PROCESS ITEMS SAFELY
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
        console.log(`Item ${id} skipped:`, itemErr.message);
        // Skip failed items, don't crash
      }
    }

    // CREATE HASH
    const itemsData = JSON.stringify(result.sort((a,b) => b.price - a.price));
    const newHash = crypto.createHash('md5').update(itemsData).digest('hex').slice(0, 16);

    // UPDATE ONLY IF CHANGED
    if (newHash !== cachedData.itemsHash) {
      cachedData.items = result;
      cachedData.itemsHash = newHash;
      cachedData.totalValue = totalValue;
      cachedData.lastItemsFingerprint = fingerprint;
      cachedData.lastUpdate = now;

      broadcast({
        items: result,
        itemsHash: newHash,
        totalValue: totalValue
      });
      console.log(`🔄 ITEMS CHANGED! New: ${result.length} items, Hash: ${newHash}`);
    }

    res.json({
      items: result,
      itemsHash: newHash,
      totalValue: totalValue
    });

  } catch (err) {
    console.error("Items error:", err.message);
    res.status(200).json({  // Always return 200 with cache
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
        console.error("Broadcast error:", err.message);
      }
    }
  });
}

// 🔥 WEBSOCKET CONNECTION
wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    itemsHash: cachedData.itemsHash,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected');
  });
  
  ws.on('error', (err) => {
    console.error('WS error:', err.message);
  });
});

// 🔥 FIXED SMART AUTO UPDATE - NO LOCALHOST CALLS
setInterval(async () => {
  console.log('🔄 SMART CHECK: Background update...');
  try {
    // Update stats
    await app._router.stack.find(layer => layer.route && layer.route.path === '/api')?.handle?.call(app, {
      url: '/api',
      query: { _t: Date.now() }
    }, {
      json: data => cachedData.stats = data
    });
    
    // Lightweight items check
    await app._router.stack.find(layer => layer.route && layer.route.path === '/api/items')?.handle?.call(app, {
      url: '/api/items',
      query: { checkOnly: true, _t: Date.now() }
    }, {
      json: () => {}
    });
    
    console.log('✅ Background check complete');
  } catch (err) {
    console.error('Background check failed:', err.message);
  }
}, 60000);

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
    itemsCount: cachedData.items.length,
    clients: wss.clients.size,
    uptime: process.uptime()
  });
});

// 🔥 SERVER START
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log('✅ FIXED: No more JSON errors!');
  console.log('🧠 SMART MODE: Items update only on CHANGE');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});
