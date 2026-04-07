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
console.log("📁 Public folder:", path.join(__dirname, "public"));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0,
  lastWearHash: null // Track changes
};

const CACHE_DURATION = 30000;
const WEAR_CHECK_INTERVAL = 8000; // 8 detik - lebih cepat

async function fetchWithRetry(url, retries = 2, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// 🔥 ULTRA-FAST WEAR CHECK - Langsung tampil + detect changes
async function checkWearingItemsAndUpdate() {
  try {
    // 1. Get wearing items FAST
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    const currentWearIds = wear.assetIds?.filter(id => id && !isNaN(id)) || [];
    
    // 2. Create hash untuk detect changes
    const currentHash = currentWearIds.sort().join(',');
    if (currentHash === cachedData.lastWearHash && cachedData.items.length > 0) {
      return; // No changes - skip processing
    }
    
    cachedData.lastWearHash = currentHash;
    console.log(`🔄 [WEAR] ${currentWearIds.length} items → Processing clothing/accessories...`);

    // 3. Filter & process PARALLEL (super fast)
    const clothingTypes = [2, 11, 12]; // Shirt, T-Shirt, Pants
    const accessoryType = [8]; // Accessory
    
    const validItems = await Promise.allSettled(
      currentWearIds.map(async (id) => {
        try {
          const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`);
          const detail = await detailRes.json();
          
          const typeId = detail.AssetTypeId;
          if (clothingTypes.includes(typeId) || accessoryType.includes(typeId)) {
            return {
              id: id,
              name: detail.Name || `Item #${String(id).slice(-4)}`,
              type: typeId,
              limited: detail.IsLimited || detail.IsLimitedUnique || false
            };
          }
        } catch {}
        return null;
      })
    );

    // 4. Get thumbnails PARALLEL
    const filteredIds = validItems
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value.id);

    let newItems = [];
    if (filteredIds.length > 0) {
      const thumbsRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${filteredIds.join(",")}&size=150x150&format=Png`
      );
      const thumbs = await thumbsRes.json();

      newItems = validItems
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(result => {
          const item = result.value;
          const thumb = thumbs.data?.find(t => t.targetId == item.id);
          
          return {
            name: item.name,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${item.id}/item`,
            type: item.type,
            limited: item.limited
          };
        });
    }

    // 5. Update & broadcast
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    
    console.log(`✅ [WEAR] ${newItems.length} clothing/accessories LOADED!`);
    broadcast({ items: newItems });

  } catch (err) {
    console.error('❌ [WEAR] Error:', err.message);
  }
}

// 🔥 Fast stats
async function updateStats() {
  try {
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = { friends: 0, followers: 0, following: 0 };
    
    if (friendsRes.status === 'fulfilled') newStats.friends = (await friendsRes.value.json()).count || 0;
    if (followersRes.status === 'fulfilled') newStats.followers = (await followersRes.value.json()).count || 0;
    if (followingRes.status === 'fulfilled') newStats.following = (await followingRes.value.json()).count || 0;

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
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await avatarRes.json();
    res.json({ image: avatar.data?.[0]?.imageUrl || null });
  } catch {
    res.json({ image: null });
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
  console.log(`👤 Connected: ${wss.clients.size}`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
});

// 🔥 STARTUP - Load IMMEDIATELY
console.log('🚀 LOADING ITEMS...');
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
    lastUpdate: new Date(cachedData.lastUpdate).toLocaleString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server LIVE on ${HOST}`);
  console.log(`⚡ Items load INSTANTLY + update on change only!\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
