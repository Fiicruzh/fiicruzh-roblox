const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

// CACHE
let cache = {
  stats: {},
  items: [],
  totalValue: 0
};

let lastHash = "";

// 🔥 FETCH RETRY
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
}

// 🔥 SMART BROADCAST
function broadcastIfChanged(data) {
  const hash = JSON.stringify(data);
  if (hash === lastHash) return;

  lastHash = hash;

  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(JSON.stringify(data));
    }
  });
}

// ================= API =================

app.get("/api", async (req, res) => {
  try {
    const [f, fl, fg] = await Promise.all([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r => r.json()),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r => r.json()),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r => r.json())
    ]);

    const stats = {
      friends: f.count || 0,
      followers: fl.count || 0,
      following: fg.count || 0
    };

    cache.stats = stats;

    broadcastIfChanged({ stats });

    res.json(stats);
  } catch {
    res.json(cache.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  const r = await fetchWithRetry(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`
  ).then(r => r.json());

  res.json({ image: r.data?.[0]?.imageUrl });
});

app.get("/api/items", async (req, res) => {
  try {
    const wear = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r => r.json());

    const ids = wear.assetIds || [];

    const thumbs = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    ).then(r => r.json());

    let items = [];
    let total = 0;

    for (let id of ids.slice(0, 20)) {
      const d = await fetchWithRetry(
        `https://economy.roblox.com/v2/assets/${id}/details`
      ).then(r => r.json());

      const thumb = thumbs.data.find(t => t.targetId == id);

      const item = {
        name: d.Name,
        price: d.PriceInRobux || 0,
        image: thumb?.imageUrl
      };

      total += item.price;
      items.push(item);
    }

    cache.items = items;
    cache.totalValue = total;

    broadcastIfChanged({ items, totalValue: total });

    res.json({ items, totalValue: total });

  } catch {
    res.json({ items: cache.items, totalValue: cache.totalValue });
  }
});

// ================= WS =================

wss.on("connection", ws => {
  ws.send(JSON.stringify(cache));
});

// AUTO UPDATE
setInterval(async () => {
  await fetch(`http://localhost:${PORT}/api`);
  await fetch(`http://localhost:${PORT}/api/items`);
}, 30000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

server.listen(PORT, () => {
  console.log("Server jalan di", PORT);
});
