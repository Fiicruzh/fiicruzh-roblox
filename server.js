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

// FIXED: Proper port detection
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const HOST = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

console.log("📁 Public folder:", path.join(__dirname, "public"));

// Roblox User ID
const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0
};

const CACHE_DURATION = 15000; // 🔥 15 detik untuk auto-update cepat

// ✅ FILTER PAKAIAN & AKSESORIS - Asset Type IDs Roblox
const CLOTHING_ACCESSORIES_TYPES = [
  1,  // T-Shirt
  2,  // Shirt
  11, // Pants
  8,  // Hat
  42, // Hair
  41, // Face
  47, // Front
  48, // Back
  49, // Neck
  50, // Shoulder
  51, // Waist
  12, // T-Shirt (duplikat)
  27, // Face Accessory
  3,  // Classic Shirt
  4   // Classic Pants
];

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

// 🔥 AUTO UPDATE FUNCTION - HANYA PAKAIAN & AKSESORIS
async function refreshAllData() {
  console.log('🔄 [AUTO] Checking Roblox updates (Clothing+Accessories only)...');
  
  try {
    // 1. Refresh Stats
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

    // 2. Refresh Items - HANYA PAKAIAN & AKSESORIS
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    let allIds = wear.assetIds || [];
    console.log(`👕 [AUTO] Found ${allIds.length} equipped items (filtering clothing+accessories)`);

    // 🔥 FILTER HANYA PAKAIAN & AKSESORIS
    let filteredIds = [];
    let newItems = [];

    if (allIds.length > 0) {
      // Batch fetch details untuk semua items dulu
      const detailsPromises = allIds.map(id => 
        fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`, 2, 500)
          .then(res => res.json().catch(() => null))
      );
      
      const detailsResults = await Promise.all(detailsPromises);
      
      // Filter berdasarkan AssetTypeId
      for (let i = 0; i < allIds.length; i++) {
        const detail = detailsResults[i];
        const assetTypeId = detail?.AssetTypeId;
        
        if (assetTypeId && CLOTHING_ACCESSORIES_TYPES.includes(assetTypeId)) {
          filteredIds.push(allIds[i]);
        }
      }

      console.log(`👗 Filtered: ${filteredIds.length}/${allIds.length} clothing+accessories items`);

      if (filteredIds.length > 0) {
        // 🔥 Batch thumbnails untuk filtered items
        let thumbs = [];
        try {
          const thumbsRes = await fetchWithRetry(
            `https://thumbnails.roblox.com/v1/assets?assetIds=${filteredIds.join(",")}&size=150x150&format=Png`
          );
          thumbs = await thumbsRes.json();
        } catch (e) {
          console.log('Thumbs batch failed');
        }

        // Process filtered items
        for (let i = 0; i < filteredIds.length; i++) {
          const id = filteredIds[i];
          const detail = detailsResults.find(d => d && String(d.AssetId) === String(id));
          
          try {
            const thumb = thumbs.data?.find(t => t.targetId == id);

            newItems.push({
              name: detail?.Name || `Item #${String(id).slice(-4)}`,
              image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
              link: `https://www.roblox.com/catalog/${id}/item`,
              limited: detail?.IsLimited || detail?.IsLimitedUnique || false,
              type: detail?.AssetTypeId || 0
            });

          } catch (itemErr) {
            const idStr = String(id);
            newItems.push({
              name: `Item #${idStr.slice(-4)}`,
              image: `https://via.placeholder.com/150x150/333/aaa?text=#${idStr.slice(-4)}`,
              link: `https://www.roblox.com/catalog/${id}`,
              limited: false,
              type: 0
            });
          }
        }
      }
    }

    // 🔥 DETEKSI PERUBAHAN - Hanya update jika berbeda
    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);

    if (statsChanged || itemsChanged) {
      cachedData.stats = newStats;
      cachedData.items = newItems;
      cachedData.lastUpdate = Date.now();
      
      console.log(`✅ [AUTO] UPDATED! Stats:${statsChanged?'✓':'-'} Items:${itemsChanged?'✓':'-'} (${newItems.length} clothing+accessories)`);
      
      // 🔥 BROADCAST perubahan ke semua client
      if (statsChanged) broadcast({ stats: newStats });
      if (itemsChanged) broadcast({ items: newItems });
    } else {
      console.log('ℹ️ [AUTO] No changes - clothing+accessories same');
    }

  } catch (err) {
    console.error('❌ [AUTO] Refresh failed:', err.message);
  }
}

app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Fetching stats...');
    await refreshAllData();
    res.json(cachedData.stats);

  } catch (err) {
    console.error("Stats error:", err.message);
    res.json(cachedData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const avatar = await avatarRes.json();
    console.log('✅ Avatar OK');
    
    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err.message);
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      console.log(`📦 Cache hit: ${cachedData.items.length} clothing+accessories items`);
      return res.json({ items: cachedData.items });
    }

    console.log('🔄 Fetching clothing+accessories items...');
    await refreshAllData();
    res.json({ items: cachedData.items });

  } catch (err) {
    console.error("Items error:", err.message);
    res.json({ items: cachedData.items || [] });
  }
});

function broadcast(data) {
  console.log(`📡 Broadcast:`, Object.keys(data));
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {}
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size} total`);
  ws.send(JSON.stringify(cachedData));

  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
  ws.onerror = (err) => console.log('WS error:', err.message);
});

// 🔥 AUTO UPDATE SETIAP 15 DETIK - Hanya Clothing + Accessories
setInterval(refreshAllData, 15000);

// Initial load
refreshAllData();

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    port: PORT,
    clients: wss.clients.size,
    items: cachedData.items.length,
    clothingAccessoriesOnly: true,
    cacheAge: Date.now() - cachedData.lastUpdate,
    autoUpdate: 'ACTIVE (15s)'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server OK on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ AUTO-UPDATE ACTIVE - Shows CLOTHING + ACCESSORIES only + Real-time changes!\n`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
