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
  avatarHash: null,
  lastUpdate: 0
};

const CACHE_DURATION = 30000;
const AVATAR_CHECK_INTERVAL = 10000;

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

// 🔥 FILTER: HANYA AKSESORIS + PAKAIAN
function isAccessoryOrClothing(detail) {
  if (!detail || !detail.Name) return false;
  
  const name = detail.Name.toLowerCase();
  
  // ✅ AKSESORIS & PAKAIAN SAJA
  const fashionCategories = [
    // PAKAIAN
    'shirt', 't-shirt', 'tshirt', 'pants', 'trousers',
    // AKSESORIS
    'hat', 'hair', 'face', 'head', 'glasses', 'mask',
    'shoulders', 'front', 'back', 'neck', 'waist',
    // TORSO
    'classicclothingtorso', 'torso'
  ];
  
  return fashionCategories.some(category => name.includes(category));
}

// 🔥 SMART AVATAR DETECTION + FASHION FILTER
async function checkAvatarAndUpdate() {
  try {
    console.log('🔍 [FASHION] Checking avatar + accessories/clothing...');
    
    // Cek avatar hash
    const avatarRes = await fetchWithRetry(
      `https://avatar.roblox.com/v1/users/${USER_ID}/avatar`
    );
    const avatarData = await avatarRes.json();
    const currentAvatarHash = avatarData.hash || avatarData.lastUpdateTime;
    
    if (currentAvatarHash === cachedData.avatarHash) {
      console.log('ℹ️ [FASHION] Avatar unchanged');
      return false;
    }
    
    console.log('🎉 [FASHION] AVATAR CHANGED! Loading accessories/clothing...');
    cachedData.avatarHash = currentAvatarHash;
    
    // Fetch equipped items
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    let ids = wear.assetIds || [];
    
    let newItems = [];
    let thumbs = [];
    
    if (ids.length > 0) {
      // Batch thumbnails
      try {
        const thumbsRes = await fetchWithRetry(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
        );
        thumbs = await thumbsRes.json();
      } catch (e) {
        console.log('Thumbs failed');
      }

      // 🔥 FILTER AKSESORIS + PAKAIAN
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        try {
          const detailRes = await fetchWithRetry(
            `https://economy.roblox.com/v2/assets/${id}/details`,
            2, 500
          );
          const detail = await detailRes.json();
          
          // ✅ HANYA aksesoris/pakaian
          if (isAccessoryOrClothing(detail)) {
            const thumb = thumbs.data?.find(t => t.targetId == id);
            newItems.push({
              name: detail.Name || `Item #${String(id).slice(-4)}`,
              image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
              link: `https://www.roblox.com/catalog/${id}/item`,
              price: detail.Price || 0,
              limited: detail.IsLimited || detail.IsLimitedUnique || false,
              rarity: detail.IsLimited ? 'legendary' : 
                     (detail.Price && detail.Price > 10000) ? 'epic' : 'rare'
            });
          }
        } catch {
          // Skip error items
        }
      }
    }
    
    // Sort by equipped order (index 0 = equipped)
    newItems.sort((a, b) => {
      const aIndex = ids.findIndex(id => id == a.link.split('/')[4]);
      const bIndex = ids.findIndex(id => id == b.link.split('/')[4]);
      return aIndex - bIndex;
    });
    
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    
    console.log(`✅ [FASHION] Accessories/Clothing: ${newItems.length} items`);
    if (itemsChanged) {
      broadcast({ items: newItems });
    }
    
    return true;
    
  } catch (err) {
    console.error('❌ [FASHION] Failed:', err.message);
    return false;
  }
}

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
      console.log(`✅ Stats: F${newStats.friends} FL${newStats.followers} FG${newStats.following}`);
      broadcast({ stats: newStats });
    }
  } catch (err) {
    console.error('Stats failed:', err.message);
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
  await checkAvatarAndUpdate();
  res.json({ items: cachedData.items });
});

function broadcast(data) {
  console.log(`📡 Fashion broadcast:`, Object.keys(data));
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

// 🔥 Smart intervals
setInterval(checkAvatarAndUpdate, AVATAR_CHECK_INTERVAL);
setInterval(updateStats, 30000);

// Initial load
checkAvatarAndUpdate();
updateStats();

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    fashionItems: cachedData.items.length,
    filter: 'ACCESSORIES+CLOTHING',
    avatarHash: cachedData.avatarHash?.slice(-8) || 'none',
    autoUpdate: 'SMART'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Fashion Server OK on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ SHOWS ONLY: Accessories + Clothing | Smart Avatar Updates!\n`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
