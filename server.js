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
const HOST = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
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
  lastUpdate: 0,
  lastWearHash: null
};

const WEAR_CHECK_INTERVAL = 8000;

async function safeFetchJson(url) {
  try {
    const res = await fetchWithRetry(url);
    if (!res) return null;
    const data = await res.json();
    return data || null;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, retries = 2, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      if (res && res.ok) return res;
    } catch {}
    if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
  }
  return null;
}

// 🔥 BULLETPROOF WEAR CHECK
async function checkWearingItemsAndUpdate() {
  try {
    // 1. Safe get wearing
    const wear = await safeFetchJson(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (!wear || !wear.assetIds) {
      if (cachedData.items.length > 0) {
        cachedData.items = [];
        broadcast({ items: [] });
      }
      return;
    }

    const currentWearIds = Array.isArray(wear.assetIds) 
      ? wear.assetIds.filter(id => id && typeof id === 'number')
      : [];

    // 2. Hash check - skip if no change
    const currentHash = currentWearIds.sort((a,b) => a-b).join(',');
    if (currentHash === cachedData.lastWearHash && cachedData.items.length > 0) {
      return; // PERFECT - no changes
    }

    cachedData.lastWearHash = currentHash;
    console.log(`🔄 [WEAR] Detected change: ${currentWearIds.length} items`);

    // 3. Filter clothing/accessories SAFELY
    const clothingTypes = [2, 11, 12];
    const accessoryType = 8;
    
    const itemPromises = currentWearIds.slice(0, 20).map(async (id) => { // Limit 20
      try {
        const detail = await safeFetchJson(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (!detail || !detail.AssetTypeId) return null;

        const typeId = detail.AssetTypeId;
        if (clothingTypes.includes(typeId) || typeId === accessoryType) {
          return {
            id,
            name: detail.Name || `Item #${id.toString().slice(-4)}`,
            type: typeId,
            limited: !!detail.IsLimited || !!detail.IsLimitedUnique
          };
        }
      } catch {}
      return null;
    });

    const results = await Promise.all(itemPromises);
    const validItems = results.filter(Boolean);

    // 4. Get thumbnails if any valid items
    let newItems = [];
    if (validItems.length > 0) {
      const idsStr = validItems.map(i => i.id).join(',');
      try {
        const thumbs = await safeFetchJson(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${idsStr}&size=150x150&format=Png`
        );
        
        newItems = validItems.map(item => {
          const thumb = thumbs?.data?.find(t => t.targetId == item.id);
          return {
            name: item.name,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${item.id}/item`,
            type: item.type,
            limited: item.limited
          };
        });
      } catch {
        // Fallback thumbnails
        newItems = validItems.map(item => ({
          name: item.name,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${item.id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${item.id}/item`,
          type: item.type,
          limited: item.limited
        }));
      }
    }

    // 5. Update cache & broadcast
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    console.log(`✅ [WEAR] ${newItems.length} clothing/accessories LOADED!`);
    broadcast({ items: newItems });

  } catch (err) {
    // Silent fail - continue
  }
}

async function updateStats() {
  try {
    const endpoints = [
      `https://friends.roblox.com/v1/users/${USER_ID}/friends/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followers/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followings/count`
    ];

    const results = await Promise.allSettled(endpoints.map(url => safeFetchJson(url)));
    const newStats = { friends: 0, followers: 0, following: 0 };

    if (results[0]?.status === 'fulfilled') newStats.friends = results[0].value?.count || 0;
    if (results[1]?.status === 'fulfilled') newStats.followers = results[1].value?.count || 0;
    if (results[2]?.status === 'fulfilled') newStats.following = results[2].value?.count || 0;

    if (JSON.stringify(newStats) !== JSON.stringify(cachedData.stats)) {
      cachedData.stats = newStats;
      broadcast({ stats: newStats });
    }
  } catch {}
}

app.get("/api", (req, res) => res.json(cachedData.stats));
app.get("/api/items", async (req, res) => {
  await checkWearingItemsAndUpdate();
  res.json({ items: cachedData.items });
});
app.get("/api/avatar", async (req, res) => {
  try {
    const avatar = await safeFetchJson(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    res.json({ image: avatar?.data?.[0]?.imageUrl || null });
  } catch {
    res.json({ image: null });
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
  } catch {}
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size}`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
});

// 🔥 INSTANT LOAD ON STARTUP
console.log('🚀 Server starting - loading items...');
checkWearingItemsAndUpdate();
updateStats();

setInterval(checkWearingItemsAndUpdate, WEAR_CHECK_INTERVAL);
setInterval(updateStats, 30000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    items: cachedData.items.length,
    lastUpdate: new Date(cachedData.lastUpdate || 0).toLocaleString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server LIVE on ${HOST}`);
  console.log(`✅ BULLETPROOF - Items instant + update on change only!\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
