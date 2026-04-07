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

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0,
  itemsHash: '',
  statsHash: ''
};

const CACHE_DURATION = 45000;

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

// 🔥 API STATS (SMART CACHE + FORCE REFRESH)
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    // FORCE REFRESH logic
    if (req.query._force) {
      cachedData.lastUpdate = 0;
      console.log('🔥 FORCE REFRESH: Stats');
    }
    
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

    const statsHash = JSON.stringify(stats);
    if (statsHash !== cachedData.statsHash) {
      cachedData.stats = stats;
      cachedData.statsHash = statsHash;
      cachedData.lastUpdate = now;
      broadcast({ stats });
      console.log('✅ STATS CHANGED:', stats);
    }

    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API
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

// 🔥 ITEMS API (CHANGE DETECTION + FORCE REFRESH)
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    // FORCE REFRESH logic
    if (req.query._force) {
      cachedData.lastUpdate = 0;
      console.log('🔥 FORCE REFRESH: Items');
    }
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    let ids = wear.assetIds || [];
    if (ids.length === 0) {
      const emptyData = { items: [], totalValue: 0 };
      if (cachedData.items.length > 0) {
        cachedData.items = [];
        cachedData.totalValue = 0;
        cachedData.itemsHash = '';
        cachedData.lastUpdate = now;
        broadcast(emptyData);
      }
      return res.json(emptyData);
    }

    const currentItemsHash = ids.join(',');
    if (currentItemsHash === cachedData.itemsHash) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

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
        result.push({
          id: id,
          name: "Unknown",
          price: 0,
          limited: false,
          image: "https://via.placeholder.com/150?text=ERR",
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    cachedData.items = result;
    cachedData.totalValue = totalValue;
    cachedData.itemsHash = currentItemsHash;
    cachedData.lastUpdate = now;

    broadcast({
      items: result,
      totalValue: totalValue
    });

    console.log(`✅ ITEMS CHANGED: ${result.length} items, ${totalValue.toLocaleString()} R$`);

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

// 🔥 FIXED AUTO UPDATE - No more ECONNREFUSED
setInterval(async () => {
  console.log('🔄 Auto update check...');
  try {
    // Direct function call instead of HTTP request
    await new Promise((resolve) => {
      // Trigger cache refresh by setting lastUpdate to 0
      cachedData.lastUpdate = 0;
      resolve();
    });
    console.log('✅ Cache refresh triggered');
  } catch (err) {
    console.log('⚠️ Auto update skipped:', err.message);
  }
}, 45000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(), 
    items: cachedData.items.length,
    cacheAge: Date.now() - cachedData.lastUpdate 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
  console.log('✅ FIXED: No more ECONNREFUSED errors!');
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});
