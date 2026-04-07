const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const USER_ID = 8941948601;

// Cache
let cache = {
  equipped: [],
  avatar: '',
  stats: { friends: 0, followers: 0, following: 0 },
  timestamp: 0
};

// Simple fetch wrapper
async function fetchRoblox(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 8000
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.log(`Fetch failed: ${url}`);
  }
  return null;
}

// 🔥 EQUIPPED ITEMS - SIMPLIFIED & STABLE
app.get("/api/equipped", async (req, res) => {
  const now = Date.now();
  if (now - cache.timestamp < 20000 && cache.equipped.length > 0) {
    res.json({ items: cache.equipped });
    return;
  }

  console.log('Loading equipped items...');

  try {
    // Method 1: Try outfit endpoint
    let wearing = await fetchRoblox(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`) || {};
    let assetIds = wearing.assets ? wearing.assets.map(a => a.id) : [];

    // Method 2: Fallback to currently-wearing
    if (!assetIds.length) {
      wearing = await fetchRoblox(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`) || {};
      assetIds = wearing.assetIds || [];
    }

    console.log(`Found ${assetIds.length} assets`);

    const items = [];
    
    // Process max 12 items
    for (let i = 0; i < Math.min(assetIds.length, 12); i++) {
      const id = assetIds[i];
      try {
        const detail = await fetchRoblox(`https://economy.roblox.com/v2/assets/${id}/details`) || {};
        const name = detail.Name || `Item #${id}`;
        
        items.push({
          id: id,
          name: name.substring(0, 20),
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`,
          limited: detail.IsLimited || false
        });
      } catch (e) {
        // Fallback item
        items.push({
          id: id,
          name: `Equipped #${i + 1}`,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`,
          limited: false
        });
      }
    }

    cache.equipped = items;
    cache.timestamp = now;
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ equipped: { items } }));
      }
    });

    console.log(`✅ Loaded ${items.length} items`);
    res.json({ items });
  } catch (err) {
    console.error('Equipped error:', err);
    res.json({ items: cache.equipped });
  }
});

// 🔥 AVATAR - DIRECT URL
app.get("/api/avatar", async (req, res) => {
  const avatarUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`;
  cache.avatar = avatarUrl;
  res.json({ image: avatarUrl });
});

// 🔥 STATS
app.get("/api/stats", async (req, res) => {
  try {
    const [friends, followers, following] = await Promise.all([
      fetchRoblox(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchRoblox(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchRoblox(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends?.count || 0,
      followers: followers?.count || 0,
      following: following?.count || 0
    };

    cache.stats = stats;
    res.json(stats);
  } catch {
    res.json(cache.stats);
  }
});

// WebSocket
wss.on('connection', (ws) => {
  ws.send(JSON.stringify(cache));
});

// Routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, items: cache.equipped.length });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on ${PORT}`);
});

// Auto refresh - NO LOCALHOST
setInterval(async () => {
  await app._router.handle({ method: 'GET', url: '/api/equipped' }, {}, () => {});
}, 30000);
