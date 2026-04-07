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

// GANTI USER_ID INI DENGAN ID ROBLOX KAMU!
const USER_ID = 8941948601;

let cachedData = { stats: {}, items: [], lastUpdate: 0 };
let clientCount = 0;

async function fetchWithRetry(url) {
  try {
    const res = await fetch(url);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// STATS
app.get("/api", async (req, res) => {
  try {
    const [fRes, flRes, fgRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: (await fRes.value?.json().catch(() => ({}))).count || 0,
      followers: (await flRes.value?.json().catch(() => ({}))).count || 0,
      following: (await fgRes.value?.json().catch(() => ({}))).count || 0
    };

    cachedData.stats = stats;
    
    if (clientCount > 0) {
      wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ stats }));
      });
    }
    
    res.json(stats);
  } catch {
    res.json(cachedData.stats);
  }
});

// AVATAR
app.get("/api/avatar", async (req, res) => {
  try {
    const res = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const data = await res.json();
    res.json({ image: data.data?.[0]?.imageUrl });
  } catch {
    res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
  }
});

// 🔥 ITEMS YANG DIPAKAI SEKARANG (NO PRICE)
app.get("/api/items", async (req, res) => {
  try {
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    const ids = wear.assetIds || [];
    
    if (!ids.length) {
      return res.json({ items: [] });
    }

    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    const items = [];
    for (const id of ids.slice(0, 15)) {
      try {
        const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`);
        const detail = await detailRes.json();
        const thumb = thumbs.data?.find(t => t.targetId == id);

        items.push({
          name: detail.Name || 'Item',
          limited: detail.IsLimited || false,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });
      } catch {}
    }

    cachedData.items = items;
    
    if (clientCount > 0) {
      wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ items }));
      });
    }
    
    res.json({ items });
  } catch {
    res.json({ items: cachedData.items });
  }
});

// WebSocket
wss.on('connection', (ws) => {
  clientCount++;
  console.log(`Client ${clientCount}`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => clientCount--);
});

// SPA + Health
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get('/health', (req, res) => res.json({ ok: true, userId: USER_ID }));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Port ${PORT} | User ${USER_ID}`);
});
