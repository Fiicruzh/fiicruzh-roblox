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
  lastUpdate: 0
};

const CACHE_DURATION = 30000;
const WEAR_CHECK_INTERVAL = 10000; // Cek currently-wearing setiap 10 detik

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

// 🔥 DIRECT WEARING ITEMS CHECK - Langsung cek currently-wearing, filter aksesoris & pakaian
async function checkWearingItemsAndUpdate() {
  try {
    console.log('🔍 [WEAR] Checking currently-wearing items...');
    
    // 1. Ambil current wearing items
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    let allIds = wear.assetIds || [];
    console.log(`👕 [WEAR] Found ${allIds.length} wearing items`);

    // 2. Filter hanya aksesoris dan pakaian
    let filteredIds = [];
    for (let id of allIds) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          2, 500
        );
        const detail = await detailRes.json();
        
        // Filter hanya aksesoris dan pakaian
        const assetTypeId = detail.AssetTypeId;
        const isClothing = [11, 12]; // T-Shirt, Shirt
        const isPants = 12; // Pants
        const isAccessory = [8]; // Accessory
        
        if (isClothing.includes(assetTypeId) || assetTypeId === isPants || isAccessory.includes(assetTypeId)) {
          filteredIds.push(id);
        }
      } catch (e) {
        console.log(`⚠️ Skip ID ${id}: detail fetch failed`);
      }
    }

    console.log(`👗 [WEAR] Filtered: ${filteredIds.length} clothing/accessories`);

    // 3. Fetch thumbnails dan details untuk filtered items
    let newItems = [];
    if (filteredIds.length > 0) {
      let thumbs = [];
      try {
        const thumbsRes = await fetchWithRetry(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${filteredIds.join(",")}&size=150x150&format=Png`
        );
        thumbs = await thumbsRes.json();
      } catch (e) {
        console.log('Thumbs failed');
      }

      for (let id of filteredIds) {
        try {
          const detailRes = await fetchWithRetry(
            `https://economy.roblox.com/v2/assets/${id}/details`,
            2, 500
          );
          const detail = await detailRes.json();
          const thumb = thumbs.data?.find(t => t.targetId == id);

          newItems.push({
            name: detail.Name || `Item #${String(id).slice(-4)}`,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            type: detail.AssetTypeId, // Tambahan info type
            limited: detail.IsLimited || detail.IsLimitedUnique || false
          });
        } catch {
          const idStr = String(id);
          newItems.push({
            name: `Item #${idStr.slice(-4)}`,
            image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            type: 'unknown',
            limited: false
          });
        }
      }
    }
    
    // 4. Update cache & broadcast jika ada perubahan
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    
    if (itemsChanged) {
      console.log(`✅ [WEAR] Items updated! ${newItems.length} clothing/accessories`);
      broadcast({ items: newItems });
    } else {
      console.log(`ℹ️ [WEAR] No changes in wearing items`);
    }
    
    return true;
    
  } catch (err) {
    console.error('❌ [WEAR] Check failed:', err.message);
    return false;
  }
}

// 🔥 Separate stats update
async function updateStats() {
  try {
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = {
      friends: 0,
      followers: 0,
      following: 0
    };

    if (friendsRes.status === 'fulfilled') {
      try { newStats.friends = (await friendsRes.value.json()).count || 0; } catch {}
    }
    if (followersRes.status === 'fulfilled') {
      try { newStats.followers = (await followersRes.value.json()).count || 0; } catch {}
    }
    if (followingRes.status === 'fulfilled') {
      try { newStats.following = (await followingRes.value.json()).count || 0; } catch {}
    }

    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    if (statsChanged) {
      cachedData.stats = newStats;
      console.log(`✅ Stats updated: F${newStats.friends} FL${newStats.followers} FG${newStats.following}`);
      broadcast({ stats: newStats });
    }
  } catch (err) {
    console.error('Stats update failed:', err.message);
  }
}

app.get("/api", async (req, res) => {
  if (Date.now() - cachedData.lastUpdate < CACHE_DURATION) {
    return res.json(cachedData.stats);
  }
  await updateStats();
  res.json(cachedData.stats);
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await avatarRes.json();
    res.json({ image: avatar.data?.[0]?.imageUrl || null });
  } catch (err) {
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  if (Date.now() - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
    return res.json({ items: cachedData.items });
  }
  await checkWearingItemsAndUpdate();
  res.json({ items: cachedData.items });
});

function broadcast(data) {
  console.log(`📡 Broadcast:`, Object.keys(data));
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch {}
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size}`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
});

// 🔥 INTERVALS - Langsung cek wearing items setiap 10 detik
setInterval(checkWearingItemsAndUpdate, WEAR_CHECK_INTERVAL); // 10 detik cek wearing items
setInterval(updateStats, 30000); // 30 detik stats

// Initial load
checkWearingItemsAndUpdate();
updateStats();

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    port: PORT,
    clients: wss.clients.size,
    items: cachedData.items.length,
    wearUpdate: 'ACTIVE - Clothing & Accessories Only',
    lastUpdate: new Date(cachedData.lastUpdate).toISOString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server OK on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ WEAR UPDATE: Real-time Clothing & Accessories Only!\n`);
  console.log(`⏰ Check every 10s - Updates instantly when changed!\n`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
