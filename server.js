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

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: {},
  lastItemHash: null,  // 🔥 HASH UNTUK DETECT PERUBAHAN
  lastUpdate: 0
};

const CACHE_DURATION = 10000; // 10 detik - CEPAT DETECT

async function fetchWithRetry(url, retries = 3, delay = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response?.ok) return response;
    } catch (err) {
      if (i === retries - 1) return null;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  return null;
}

// 🔥 HASH GENERATOR UNTUK DETECT PERUBAHAN
function generateHash(items) {
  return JSON.stringify(items).slice(0, 50);
}

// STATS
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION) return res.json(cachedData.stats);

    const requests = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = { friends: 0, followers: 0, following: 0 };
    for (let i = 0; i < requests.length; i++) {
      if (requests[i].status === 'fulfilled' && requests[i].value) {
        try {
          const data = await requests[i].value.json();
          if (i === 0) stats.friends = data?.count || 0;
          if (i === 1) stats.followers = data?.count || 0;
          if (i === 2) stats.following = data?.count || 0;
        } catch (e) {}
      }
    }

    cachedData.stats = stats;
    cachedData.lastUpdate = now;
    broadcast({ stats });
    res.json(stats);
  } catch (err) {
    res.json(cachedData.stats);
  }
});

// AVATAR
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    if (avatarRes) {
      const avatar = await avatarRes.json();
      res.json({ image: avatar?.data?.[0]?.imageUrl });
    } else {
      res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
    }
  } catch (err) {
    res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
  }
});

// 🔥 AUTO DETECT ITEM CHANGES + FORCE REFRESH
app.get("/api/items", async (req, res) => {
  try {
    console.log('🔥 Checking items...');
    
    // SELALU FETCH FRESH DATA UNTUK DETECT PERUBAHAN
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (!wearRes) {
      return res.json({ items: cachedData.items });
    }
    
    const wearData = await wearRes.json();
    const currentHash = generateHash(wearData.assetIds || []);
    
    console.log(`📦 Current hash: ${currentHash.slice(0,12)} | Cached: ${cachedData.lastItemHash?.slice(0,12)}`);
    
    // 🔥 JIKA HASH BERUBAH = FORCE REFRESH
    const hasChanged = currentHash !== cachedData.lastItemHash;
    
    if (!hasChanged && Date.now() - cachedData.lastUpdate < CACHE_DURATION) {
      console.log('✅ Using cache - no changes');
      return res.json({ items: cachedData.items });
    }

    console.log(hasChanged ? '🔄 ITEMS CHANGED - REFRESHING!' : '🔄 Cache expired - refreshing...');

    // Get equipped items dengan type mapping
    let equippedItems = [];
    if (wearData.assetIds && wearData.assetIds.length > 0) {
      const detailsPromises = wearData.assetIds.slice(0, 20).map(async (assetId) => {
        try {
          const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${assetId}/details`, 1);
          if (detailRes) {
            const detail = await detailRes.json();
            return {
              id: assetId,
              name: detail.Name || `Item #${assetId}`,
              type: detail.AssetTypeId || 0
            };
          }
        } catch (e) {}
        return null;
      });

      equippedItems = (await Promise.all(detailsPromises)).filter(Boolean);
    }

    // Category mapping berdasarkan AssetTypeId Roblox
    const categoryMap = {
      // PAKAIAN
      11: 'atasan',      // Shirt
      12: 'atasan',      // T-Shirt  
      2: 'bawahan',      // Pants
      8: 'sepatu',       // Shoes (fix)
      46: 'kemeja klasik', 
      47: 'kaus klasik', 
      
      // AKSESORIS
      1: 'kepala',       // Hat
      41: 'wajah',       // Face
      42: 'leher',       // Neck
      43: 'belakang',    // Back
      44: 'pinggang',    // Waist
      45: 'bahu',        // Shoulder
      49: 'depan',       // Front
      50: 'perlengkapan' // Gear
    };

    // Categorize items
    const categorized = {
      pakaian: {},
      aksesoris: {}
    };

    // Batch thumbnails
    const assetIds = equippedItems.map(item => item.id);
    let thumbs = {};
    if (assetIds.length > 0) {
      const thumbRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
      );
      if (thumbRes) {
        const thumbData = await thumbRes.json();
        thumbData.data?.forEach(t => {
          thumbs[t.targetId] = t.imageUrl;
        });
      }
    }

    equippedItems.forEach(item => {
      const category = categoryMap[item.type];
      if (category) {
        const section = ['atasan', 'bawahan', 'sepatu', 'kemeja klasik', 'kaus klasik'].includes(category) 
          ? 'pakaian' : 'aksesoris';
        
        if (!categorized[section][category]) {
          categorized[section][category] = {
            id: item.id,
            image: thumbs[item.id] || `https://www.roblox.com/asset-thumbnail/image?assetId=${item.id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${item.id}/item`
          };
        }
      }
    });

    // 🔥 UPDATE CACHE + HASH
    cachedData.items = categorized;
    cachedData.lastItemHash = currentHash;
    cachedData.lastUpdate = Date.now();
    
    console.log(`✅ REFRESHED! Pakaian: ${Object.keys(categorized.pakaian).length} | Aksesoris: ${Object.keys(categorized.aksesoris).length}`);
    broadcast({ items: categorized });
    res.json({ items: categorized });

  } catch (err) {
    console.error('Items error:', err.message);
    res.json({ items: cachedData.items || {} });
  }
});

// WEBSOCKET BROADCAST
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('👤 Connected');
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log('👋 Disconnected'));
});

// SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    items: Object.keys(cachedData.items || {}).length,
    lastHash: cachedData.lastItemHash?.slice(0,12),
    changed: cachedData.lastItemHash ? '✅' : '⏳'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log('✅ AUTO ITEM DETECTION READY!');
  console.log('🔥 Changes detected = INSTANT REFRESH');
});
