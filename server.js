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

const CACHE_DURATION = 15000;

// ✅ FILTER PAKAIAN & AKSESORIS - Asset Type IDs Roblox
const CLOTHING_ACCESSORIES_TYPES = [
  1, 2, 3, 4, 8, 11, 12, 27, 41, 42, 47, 48, 49, 50, 51
];

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (response.ok) return response;
    } catch (err) {
      console.log(`⚠️ Fetch retry ${i+1}/${retries} for ${url.slice(-30)}`);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 GET AVATAR ITEMS - TRIPLE FALLBACK STRATEGY
async function getAvatarItems() {
  // 1. TRY Currently Wearing (Primary)
  try {
    console.log('🔄 Trying currently-wearing API...');
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (wearRes.ok) {
      const wear = await wearRes.json();
      console.log(`✅ Currently-wearing OK: ${wear.assetIds?.length || 0} items`);
      return wear.assetIds || [];
    }
  } catch (e) {
    console.log('❌ Currently-wearing failed');
  }

  // 2. FALLBACK: Avatar Layers (Secondary)
  try {
    console.log('🔄 Trying avatar-layers API...');
    const layersRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/layers`);
    if (layersRes.ok) {
      const layers = await layersRes.json();
      const ids = layers.map(layer => layer.id).filter(Boolean);
      console.log(`✅ Avatar-layers OK: ${ids.length} items`);
      return ids;
    }
  } catch (e) {
    console.log('❌ Avatar-layers failed');
  }

  // 3. FALLBACK: Inventory (Tertiary - Limited to recent)
  try {
    console.log('🔄 Trying inventory API...');
    const invRes = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${USER_ID}/assets/collectibles?sortOrder=Asc&limit=30`);
    if (invRes.ok) {
      const inv = await invRes.json();
      const ids = inv.data
        ?.filter(item => CLOTHING_ACCESSORIES_TYPES.includes(item.assetTypeId))
        ?.map(item => item.assetId) || [];
      console.log(`✅ Inventory OK: ${ids.length} clothing items`);
      return ids.slice(0, 20); // Limit recent items
    }
  } catch (e) {
    console.log('❌ Inventory failed');
  }

  console.log('⚠️ All avatar APIs failed - using empty list');
  return [];
}

// 🔥 AUTO UPDATE FUNCTION - SUPER ROBUST
async function refreshAllData() {
  console.log('🔄 [AUTO] Checking Roblox updates (Clothing+Accessories only)...');
  
  try {
    // 1. Refresh Stats (SAFE)
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = { friends: 0, followers: 0, following: 0 };

    if (friendsRes.status === 'fulfilled') {
      try { newStats.friends = (await friendsRes.value?.json())?.count || 0; } catch {}
    }
    if (followersRes.status === 'fulfilled') {
      try { newStats.followers = (await followersRes.value?.json())?.count || 0; } catch {}
    }
    if (followingRes.status === 'fulfilled') {
      try { newStats.following = (await followingRes.value?.json())?.count || 0; } catch {}
    }

    // 2. Get Avatar Items (TRIPLE FALLBACK)
    const allIds = await getAvatarItems();
    console.log(`👕 Found ${allIds.length} total items to process`);

    // 🔥 FILTER & PROCESS CLOTHING+ACCESSORIES
    let newItems = [];
    
    if (allIds.length > 0) {
      // Process in smaller batches untuk avoid rate limit
      const batchSize = 10;
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        const detailsPromises = batch.map(async (id) => {
          try {
            const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`, 1, 200);
            if (detailRes?.ok) {
              const detail = await detailRes.json();
              if (CLOTHING_ACCESSORIES_TYPES.includes(detail.AssetTypeId)) {
                return { id, detail };
              }
            }
          } catch (e) {}
          return null;
        });

        const batchResults = (await Promise.all(detailsPromises)).filter(Boolean);
        
        // Get thumbnails untuk batch ini
        if (batchResults.length > 0) {
          try {
            const batchIds = batchResults.map(r => r.id);
            const thumbsRes = await fetchWithRetry(
              `https://thumbnails.roblox.com/v1/assets?assetIds=${batchIds.join(",")}&size=150x150&format=Png`
            );
            const thumbs = thumbsRes?.ok ? await thumbsRes.json() : { data: [] };

            // Create final items
            batchResults.forEach(({ id, detail }) => {
              const thumb = thumbs.data?.find(t => t.targetId == id);
              newItems.push({
                name: detail.Name || `Item #${String(id).slice(-4)}`,
                image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
                link: `https://www.roblox.com/catalog/${id}/item`,
                limited: detail.IsLimited || detail.IsLimitedUnique || false,
                type: detail.AssetTypeId || 0
              });
            });
          } catch (e) {
            console.log('⚠️ Batch thumbs failed');
          }
        }
        
        // Small delay antar batch
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // 🔥 DETEKSI PERUBAHAN
    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);

    if (statsChanged || itemsChanged) {
      cachedData.stats = newStats;
      cachedData.items = newItems;
      cachedData.lastUpdate = Date.now();
      
      console.log(`✅ [AUTO] UPDATED! Stats:${statsChanged?'✓':'-'} Items:${itemsChanged?'✓':'-'} (${newItems.length} clothing+accessories)`);
      
      if (statsChanged) broadcast({ stats: newStats });
      if (itemsChanged) broadcast({ items: newItems });
    } else {
      console.log('ℹ️ [AUTO] No changes');
    }

  } catch (err) {
    console.error('❌ [AUTO] Refresh CRASH:', err.message);
  }
}

app.get("/api", async (req, res) => {
  try {
    if (Date.now() - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }
    await refreshAllData();
    res.json(cachedData.stats);
  } catch (err) {
    res.json(cachedData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    if (avatarRes?.ok) {
      const avatar = await avatarRes.json();
      res.json({ image: avatar.data?.[0]?.imageUrl || null });
    } else {
      res.json({ image: null });
    }
  } catch (err) {
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    if (Date.now() - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }
    await refreshAllData();
    res.json({ items: cachedData.items });
  } catch (err) {
    res.json({ items: cachedData.items || [] });
  }
});

function broadcast(data) {
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

// AUTO UPDATE
setInterval(refreshAllData, 15000);
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
    lastUpdate: new Date(cachedData.lastUpdate).toISOString()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server OK on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ Clothing + Accessories Showcase - TRIPLE FALLBACK ACTIVE!\n`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
