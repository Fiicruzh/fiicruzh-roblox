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
const WEAR_CHECK_INTERVAL = 10000;

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

// 🔥 ROBUST WEARING ITEMS CHECK - Error-proof version
async function checkWearingItemsAndUpdate() {
  try {
    console.log('🔍 [WEAR] Checking currently-wearing items...');
    
    // 1. Safe fetch wearing items
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (!wearRes) {
      console.log('⚠️ [WEAR] No wear response');
      return false;
    }

    const wear = await wearRes.json().catch(() => null);
    if (!wear || !wear.assetIds) {
      console.log('⚠️ [WEAR] No wearing items found');
      // Update empty items if no wearing
      if (cachedData.items.length > 0) {
        cachedData.items = [];
        cachedData.lastUpdate = Date.now();
        broadcast({ items: [] });
        console.log('✅ [WEAR] Cleared items (none wearing)');
      }
      return true;
    }

    let allIds = wear.assetIds.filter(id => id && !isNaN(id));
    console.log(`👕 [WEAR] Found ${allIds.length} valid wearing items`);

    // 2. Filter hanya aksesoris dan pakaian dengan BATCH processing
    let filteredIds = [];
    const BATCH_SIZE = 5; // Process 5 IDs at a time to avoid rate limits
    
    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
      const batch = allIds.slice(i, i + BATCH_SIZE);
      console.log(`🔍 Processing batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(allIds.length/BATCH_SIZE)}`);
      
      for (let id of batch) {
        try {
          const detailRes = await fetchWithRetry(
            `https://economy.roblox.com/v2/assets/${id}/details`,
            1, 300 // Reduced retries for speed
          );
          
          if (detailRes) {
            const detail = await detailRes.json().catch(() => null);
            if (detail && detail.AssetTypeId) {
              // Filter hanya aksesoris dan pakaian
              const assetTypeId = detail.AssetTypeId;
              const isClothing = [2, 11, 12]; // Shirt, T-Shirt, Pants
              const isAccessory = [8]; // Accessory
              
              if (isClothing.includes(assetTypeId) || isAccessory.includes(assetTypeId)) {
                filteredIds.push(id);
                console.log(`✅ ID ${id} (${detail.Name || 'Unknown'}) - Type ${assetTypeId}`);
              }
            }
          }
        } catch (e) {
          // Skip silently - common for body parts
        }
      }
      
      // Small delay between batches
      if (i + BATCH_SIZE < allIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`👗 [WEAR] Filtered: ${filteredIds.length} clothing/accessories`);

    // 3. Fetch thumbnails dan details untuk filtered items
    let newItems = [];
    if (filteredIds.length > 0) {
      try {
        // Get thumbnails
        const thumbsRes = await fetchWithRetry(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${filteredIds.join(",")}&size=150x150&format=Png`,
          2, 500
        );
        const thumbs = thumbsRes ? await thumbsRes.json().catch(() => ({})) : {};

        // Process each item
        for (let id of filteredIds) {
          try {
            const detailRes = await fetchWithRetry(
              `https://economy.roblox.com/v2/assets/${id}/details`,
              1, 300
            );
            const detail = detailRes ? await detailRes.json().catch(() => null) : null;
            
            const thumb = thumbs.data?.find(t => t.targetId == id);

            newItems.push({
              name: detail?.Name || `Item #${String(id).slice(-4)}`,
              image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
              link: `https://www.roblox.com/catalog/${id}/item`,
              type: detail?.AssetTypeId || 'unknown',
              limited: detail?.IsLimited || detail?.IsLimitedUnique || false
            });
          } catch (e) {
            // Fallback item
            newItems.push({
              name: `Item #${String(id).slice(-4)}`,
              image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
              link: `https://www.roblox.com/catalog/${id}/item`,
              type: 'unknown',
              limited: false
            });
          }
        }
      } catch (e) {
        console.log('⚠️ Thumbnails batch failed, using fallbacks');
        // Fallback to Roblox thumbnails
        filteredIds.forEach(id => {
          newItems.push({
            name: `Item #${String(id).slice(-4)}`,
            image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            type: 'unknown',
            limited: false
          });
        });
      }
    }
    
    // 4. Safe cache update & broadcast
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);
    if (itemsChanged || newItems.length !== cachedData.items.length) {
      console.log(`✅ [WEAR] Items updated! ${newItems.length} items`);
      broadcast({ items: newItems });
    } else {
      console.log(`ℹ️ [WEAR] No changes detected`);
    }
    
    return true;
    
  } catch (err) {
    console.error('❌ [WEAR] Critical error:', err.message);
    return false;
  }
}

// 🔥 Safe stats update
async function updateStats() {
  try {
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = { friends: 0, followers: 0, following: 0 };

    if (friendsRes.status === 'fulfilled' && friendsRes.value) {
      try { 
        const data = await friendsRes.value.json();
        newStats.friends = data?.count || 0; 
      } catch {}
    }
    if (followersRes.status === 'fulfilled' && followersRes.value) {
      try { 
        const data = await followersRes.value.json();
        newStats.followers = data?.count || 0; 
      } catch {}
    }
    if (followingRes.status === 'fulfilled' && followingRes.value) {
      try { 
        const data = await followingRes.value.json();
        newStats.following = data?.count || 0; 
      } catch {}
    }

    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    if (statsChanged) {
      cachedData.stats = newStats;
      console.log(`✅ Stats: F${newStats.friends} FL${newStats.followers} FG${newStats.following}`);
      broadcast({ stats: newStats });
    }
  } catch (err) {
    console.error('Stats update failed:', err.message);
  }
}

app.get("/api", async (req, res) => {
  try {
    if (Date.now() - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }
    await updateStats();
    res.json(cachedData.stats);
  } catch {
    res.json(cachedData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = avatarRes ? await avatarRes.json() : {};
    res.json({ image: avatar.data?.[0]?.imageUrl || null });
  } catch (err) {
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    if (Date.now() - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length >= 0) {
      return res.json({ items: cachedData.items });
    }
    await checkWearingItemsAndUpdate();
    res.json({ items: cachedData.items });
  } catch {
    res.json({ items: cachedData.items });
  }
});

function broadcast(data) {
  console.log(`📡 Broadcast:`, Object.keys(data));
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (e) {
        // Silent fail
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size}`);
  try {
    ws.send(JSON.stringify(cachedData));
  } catch {}
  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
});

// 🔥 Safe intervals with error recovery
const wearInterval = setInterval(async () => {
  try {
    await checkWearingItemsAndUpdate();
  } catch (e) {
    console.error('Interval error:', e.message);
  }
}, WEAR_CHECK_INTERVAL);

const statsInterval = setInterval(async () => {
  try {
    await updateStats();
  } catch (e) {
    console.error('Stats interval error:', e.message);
  }
}, 30000);

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
    lastUpdate: cachedData.lastUpdate ? new Date(cachedData.lastUpdate).toISOString() : 'never',
    uptime: process.uptime()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server OK on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ ZERO-ERROR WEAR SYSTEM ACTIVE`);
  console.log(`👗 Clothing & Accessories Only - Updates every 10s\n`);
});

process.on('SIGTERM', () => {
  clearInterval(wearInterval);
  clearInterval(statsInterval);
  server.close(() => process.exit(0));
});
