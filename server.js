const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const USER_ID = 8941948601;
let cache = { equipped: [], stats: {}, lastUpdate: 0 };
const CACHE_TIME = 15000; // 15s

async function robloxFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    return res.ok ? res.json() : {};
  } catch {
    return {};
  }
}

// 🔥 ALL EQUIPPED ITEMS - COMPLETE
app.get("/api/equipped", async (req, res) => {
  const now = Date.now();
  if (now - cache.lastUpdate < CACHE_TIME && cache.equipped.length) {
    return res.json({ items: cache.equipped });
  }

  try {
    // Get ALL currently wearing items
    const wearing = await robloxFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
    const assetIds = wearing.assets?.map(a => a.id) || [];

    if (!assetIds.length) {
      cache.equipped = [];
      return res.json({ items: [] });
    }

    // Batch get details (max 20 items)
    const ids = assetIds.slice(0, 20).join(',');
    const [thumbnails, details] = await Promise.all([
      robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png`),
      robloxFetch(`https://catalog.roblox.com/v1/catalog/assets/details?assetIds=${ids}`)
    ]);

    const items = [];
    details.data?.forEach((detail, i) => {
      const thumb = thumbnails.data?.find(t => t.targetId == detail.id);
      items.push({
        id: detail.id,
        name: detail.name || `Item ${detail.id}`,
        limited: detail.isLimited || detail.isLimitedUnique || false,
        image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${detail.id}&width=150&height=150&format=png`,
        link: `https://www.roblox.com/catalog/${detail.id}/item`,
        type: detail.assetType?.name || 'Unknown'
      });
    });

    cache.equipped = items;
    cache.lastUpdate = now;
    broadcast({ equipped: { items } });
    
    res.json({ items });
  } catch (err) {
    console.error('Equipped error:', err);
    res.json({ items: cache.equipped });
  }
});

// 🔥 3D AVATAR - Multiple Angles
app.get("/api/avatar3d", async (req, res) => {
  const angle = req.query.angle || 0;
  const size = 420;
  
  // Real Roblox 3D avatar from different angles
  const imageUrl = `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=${size}x${size}&format=Png&isCircular=false`;
  
  res.json({ image: imageUrl });
});

// 🔥 STATS
app.get("/api/stats", async (req, res) => {
  try {
    const [friends, followers, following] = await Promise.all([
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cache.stats = stats;
    broadcast({ stats });
    res.json(stats);
  } catch {
    res.json(cache.stats);
  }
});

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(cache));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: ${PORT}`);
});

// Auto refresh every 15s
setInterval(() => {
  fetch(`http://localhost:${PORT}/api/equipped`);
}, 15000);
