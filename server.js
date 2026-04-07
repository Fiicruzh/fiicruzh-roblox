const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

let currentData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastItemsUpdate: 0
};

async function robloxFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (response.ok) return { success: true, data: await response.json() };
    } catch (err) {
      if (i === retries - 1) return { success: false };
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

app.get("/api", async (req, res) => {
  try {
    const [friends, followers, following] = await Promise.all([
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends.success ? friends.data.count || 0 : 0,
      followers: followers.success ? followers.data.count || 0 : 0,
      following: following.success ? following.data.count || 0 : 0
    };

    currentData.stats = stats;
    broadcast({ stats });
    res.json(stats);
  } catch (err) {
    res.json(currentData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatar = await robloxFetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const image = avatar.success && avatar.data.data?.[0]?.imageUrl 
      ? avatar.data.data[0].imageUrl 
      : `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`;
    
    res.json({ image });
  } catch (err) {
    res.json({ 
      image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
    });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const wear = await robloxFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    
    if (!wear.success || !wear.data.assetIds?.length) {
      currentData.items = [];
      broadcast({ items: [], itemsCount: 0 });
      return res.json({ items: [], totalValue: 0 });
    }

    const assetIds = wear.data.assetIds.slice(0, 12); // Limit 12 items
    
    // Batch thumbnails
    const thumbs = await robloxFetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
    );
    
    const thumbMap = thumbs.success ? 
      thumbs.data.data.reduce((map, t) => { map[t.targetId] = t.imageUrl; return map; }, {}) 
      : {};

    // Simple items - NO COMPLEX PROCESSING
    const items = assetIds.map(id => ({
      name: `Item #${id}`,
      price: 0,
      limited: false,
      image: thumbMap[id] || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
      link: `https://www.roblox.com/catalog/${id}/item`
    })).slice(0, 8); // Show max 8

    currentData.items = items;
    broadcast({ items, itemsCount: items.length });
    
    res.json({
      items,
      totalValue: 0
    });
    
  } catch (err) {
    console.error('Items error:', err);
    res.json({ items: currentData.items, totalValue: 0 });
  }
});

function broadcast(data) {
  try {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (err) {}
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    stats: currentData.stats,
    items: currentData.items,
    itemsCount: currentData.items.length
  }));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => res.json({ status: 'OK' }));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on ${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
