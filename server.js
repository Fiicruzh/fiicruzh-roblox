const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const USER_ID = 8941948601;

let data = { stats: {}, items: [] };

async function api(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch {
    return null;
  }
}

app.get("/api", async (req, res) => {
  const [friends, followers, following] = await Promise.all([
    api(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
    api(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
    api(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
  ]);
  
  data.stats = {
    friends: friends?.count || 0,
    followers: followers?.count || 0,
    following: following?.count || 0
  };
  
  wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify(data.stats)));
  res.json(data.stats);
});

app.get("/api/avatar", async (req, res) => {
  const avatar = await api(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`);
  res.json({ 
    image: avatar?.data?.[0]?.imageUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
  });
});

app.get("/api/items", async (req, res) => {
  const wear = await api(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
  
  if (!wear?.assetIds?.length) {
    data.items = [];
    wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify({ items: [], itemsCount: 0 })));
    return res.json({ items: [], totalValue: 0 });
  }

  const ids = wear.assetIds.slice(0, 8);
  const thumbs = await api(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png`);
  
  data.items = ids.map(id => ({
    name: `Item #${id}`,
    price: 0,
    limited: false,
    image: thumbs?.data?.find(t => t.targetId == id)?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
    link: `https://www.roblox.com/catalog/${id}/item`
  }));

  wss.clients.forEach(c => c.readyState === 1 && c.send(JSON.stringify({ items: data.items, itemsCount: data.items.length })));
  res.json({ items: data.items, totalValue: 0 });
});

wss.on('connection', ws => {
  ws.send(JSON.stringify(data));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ${PORT}`);
});
