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

// 🔥 ULTRA SAFE FETCH
async function safeFetch(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      return { success: true, data };
    }
    return { success: false };
  } catch (err) {
    return { success: false };
  }
}

// 🔥 API STATS - BULLETPROOF
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    // Parallel safe requests
    const [friends, followers, following] = await Promise.all([
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends.success ? friends.data.count || 0 : cachedData.stats.friends,
      followers: followers.success ? followers.data.count || 0 : cachedData.stats.followers,
      following: following.success ? following.data.count || 0 : cachedData.stats.following
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    broadcast({ stats });
    
    res.json(stats);
  } catch (err) {
    console.error("Stats safe fallback:", cachedData.stats);
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API - SAFE
app.get("/api/avatar2d", async (req, res) => {
  try {
    const avatar = await safeFetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    res.json({
      image: avatar.success ? avatar.data.data?.[0]?.imageUrl || null : null
    });
  } catch (err) {
    res.json({ image: null });
  }
});

// 🔥 ITEMS API - BULLETPROOF ✅ FIXED JSON ERROR
app.get("/api/items", async (req, res) => {
  const checkOnly = req.query.checkOnly === 'true';
  const now = Date.now();
  
  try {
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.itemsHash) {
      return res.json({
        items: checkOnly ? [] : cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // SAFE Wear fetch
    const wearResult = await safeFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const assetIds = wearResult.success ? wearResult.data.assetIds || [] : [];

    if (assetIds.length === 0) {
      const emptyHash = 'd41d8cd98f00b204'; // MD5 of empty array
      if (cachedData.itemsHash !== emptyHash) {
        cachedData.items = [];
        cachedData.itemsHash = emptyHash;
        cachedData.totalValue = 0;
        cachedData.lastUpdate = now;
        broadcast({ items: [], itemsHash: emptyHash, totalValue: 0 });
      }
      return res.json({ items: [], itemsHash: emptyHash, totalValue: 0 });
    }

    const fingerprint = assetIds.slice(0, 10).sort().join(',');
    if (fingerprint === cachedData.lastItemsFingerprint && !checkOnly) {
      return res.json({
        items: cachedData.items,
        itemsHash: cachedData.itemsHash,
        totalValue: cachedData.totalValue
      });
    }

    // Batch thumbnails
    const thumbsResult = await safeFetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(",")}&size=150x150&format=Png`
    );
    const thumbs = thumbsResult.success ? thumbsResult.data : { data: [] };

    // Process items SAFELY
    const result = [];
    let totalValue = 0;

    // Limit to 10 items for speed
    for (const id of assetIds.slice(0, 10)) {
      try {
        const itemResult = await safeFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (itemResult.success) {
          const detail = itemResult.data;
          const thumb = thumbs.data?.find(t => t.targetId == id);

          const item = {
            name: detail.Name || "Item",
            price: detail.PriceInRobux || 0,
            limited: detail.IsLimited || detail.IsLimitedUnique || false,
            image: thumb?.imageUrl || "https://via.placeholder.com/150?text=?",
            link: `https://www.roblox.com/catalog/${id}/item`
          };

          totalValue += item.price;
          result.push(item);
        }
      } catch (itemErr) {
        // Skip individual item errors
      }
    }

    // Generate hash
    const itemsData = JSON.stringify(result);
    const newHash = crypto.createHash('md5').update(itemsData).digest('hex').slice(0, 16);

    // Update only if changed
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
      console.log(`🔄 ITEMS UPDATED: ${result.length} items | Hash: ${newHash}`);
    }

    res.json({
      items: result,
      itemsHash: newHash,
      totalValue: totalValue
    });

  } catch (err) {
    console.error("Items fallback:", err.message);
    res.json({
      items: cachedData.items,
      itemsHash: cachedData.itemsHash,
      totalValue: cachedData.totalValue
    });
  }
});

// 🔥 WEBSOCKET - CLEAN
function broadcast(data) {
  try {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (err) {
    console.error("Broadcast failed:", err.message);
  }
}

wss.on('connection', (ws) => {
  console.log('👤 WS Connected');
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    itemsHash: cachedData.itemsHash,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => console.log('👋 WS Disconnected'));
  ws.on('error', (err) => console.error('WS Error:', err.message));
});

// 🔥 NO MORE LOCALHOST CALLS - DIRECT CACHE UPDATE
setInterval(async () => {
  try {
    console.log('🔄 Cache refresh...');
    
    // Update stats cache
    const [friends, followers, following] = await Promise.all([
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);
    
    cachedData.stats = {
      friends: friends.success ? friends.data.count || 0 : cachedData.stats.friends,
      followers: followers.success ? followers.data.count || 0 : cachedData.stats.followers,
      following: following.success ? following.data.count || 0 : cachedData.stats.following
    };
    
    cachedData.lastUpdate = Date.now();
    broadcast({ stats: cachedData.stats });
    
    console.log('✅ Cache refreshed');
  } catch (err) {
    console.log('⚠️ Cache refresh skipped');
  }
}, 90000); // 90s interval

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    itemsHash: cachedData.itemsHash,
    itemsCount: cachedData.items.length,
    clients: wss.clients.size
  });
});

// START SERVER
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server ON: Port ${PORT}`);
  console.log('✅ BULLETPROOF MODE - No crash!');
  console.log('🧠 Items update ONLY when changed');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutdown...');
  server.close(() => process.exit(0));
});
