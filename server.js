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

// Cache duration 30 seconds
const CACHE_DURATION = 30000;

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
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
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({
        items: cachedData.items
      });
    }

    const wearRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    
    const wear = await wearRes.json();
    let ids = wear.assetIds || [];
    
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      return res.json({ items: [] });
    }

    ids = ids.slice(0, 20); // Limit 20 items

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
    
    for (const id of ids) {
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

      } catch (itemErr) {
        console.log(`Item ${id} error:`, itemErr);
        result.push({
          name: `Item #${id}`,
          image: `https://via.placeholder.com/150x150/333/ccc?text=ID${id}`,
          link: `https://www.roblox.com/catalog/${id}`,
          limited: false
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    broadcast({ items: result });
    res.json({ items: result });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items });
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

  ws.on('error', (err) => {
    console.log('WebSocket error:', err);
  });
});

// AUTO UPDATE EVERY 30 SECONDS
setInterval(async () => {
  console.log('🔄 Updating data...');
  try {
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { method: 'HEAD' });
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { method: 'HEAD' });
    broadcast(cachedData);
    console.log('✅ Data updated');
  } catch (err) {
    console.error('Auto update failed:', err);
  }
}, 30000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now() });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('✅ Railway ready!');
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => {
    process.exit(0);
  });
});
