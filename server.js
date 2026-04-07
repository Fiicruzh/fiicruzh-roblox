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

// FIXED: Proper port detection
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const HOST = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

// Static files
app.use(express.static(path.join(__dirname, "public"))));

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
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

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

    console.log(`✅ Stats updated: ${JSON.stringify(stats)}`);
    broadcast({ stats });
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const avatar = await avatarRes.json();
    console.log('✅ Avatar loaded');
    
    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    console.log('🔄 Fetching items...');
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      console.log('📦 Using cached items');
      return res.json({ items: cachedData.items });
    }

    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    
    const wear = await wearRes.json();
    let ids = wear.assetIds || [];
    console.log(`👕 Found ${ids.length} equipped items`);
    
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      console.log('📦 No items equipped');
      return res.json({ items: [] });
    }

    ids = ids.slice(0, 20);

    // Get thumbnails
    let thumbs = [];
    try {
      const thumbsRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
      );
      thumbs = await thumbsRes.json();
    } catch (thumbErr) {
      console.log('Thumbnails failed:', thumbErr);
    }

    // Process items
    const result = [];
    
    for (let i = 0; i < Math.min(ids.length, 12); i++) {
      const id = ids[i];
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        const detail = await detailRes.json();

        const thumb = thumbs.data?.find(t => t.targetId == id);

        const item = {
          name: detail.Name || `Item #${id}`,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`,
          limited: detail.IsLimited || detail.IsLimitedUnique || false
        };

        result.push(item);
        console.log(`✅ Item ${i+1}: ${item.name}`);

      } catch (itemErr) {
        console.log(`⚠️ Item ${id} error:`, itemErr.message);
        result.push({
          name: `Item #${id}`,
          image: `https://via.placeholder.com/150x150/333/ccc?text=ID${id.substring(0,4)}`,
          link: `https://www.roblox.com/catalog/${id}`,
          limited: false
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    console.log(`✅ Items loaded: ${result.length} items`);
    broadcast({ items: result });
    res.json({ items: result });

  } catch (err) {
    console.error("Items error:", err);
    res.status(500).json({ items: cachedData.items });
  }
});

function broadcast(data) {
  const count = wss.clients.size;
  console.log(`📡 Broadcasting to ${count} clients:`, data);
  
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
  console.log('👤 WebSocket client connected. Total:', wss.clients.size);
  
  // Send cached data immediately
  ws.send(JSON.stringify(cachedData));

  ws.on('close', () => {
    console.log('👋 WebSocket client disconnected. Total:', wss.clients.size);
  });

  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
});

// 🔥 FIXED AUTO UPDATE - NO LOCALHOST
setInterval(async () => {
  console.log('🔄 Auto refresh started...');
  try {
    // Update stats
    await app._router.stack.find(layer => layer.route && layer.route.path === '/api')
      ?.route?.stack[0]?.handle?.call({ app }, { url: '/api?_t=' + Date.now() }, { json: () => {} });
    
    // Update items  
    await app._router.stack.find(layer => layer.route && layer.route.path === '/api/items')
      ?.route?.stack[0]?.handle?.call({ app }, { url: '/api/items?_t=' + Date.now() }, { json: () => {} });
    
    console.log('✅ Auto refresh completed');
  } catch (err) {
    console.error('⚠️ Auto refresh warning:', err.message);
  }
}, 30000);

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    clients: wss.clients.size,
    cachedItems: cachedData.items.length 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Public URL: ${HOST}`);
  console.log(`✅ Deployed successfully!`);
  console.log(`📦 Cached items: ${cachedData.items.length}`);
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
