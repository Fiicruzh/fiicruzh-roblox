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

// Railway fix
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Roblox User ID
const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0
};

// Cache 60 seconds (lebih lama tanpa auto refresh)
const CACHE_DURATION = 60000;

// 🔥 SUPER SAFE fetchWithRetry
async function fetchWithRetry(url, retries = 2, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response?.ok) return response;
    } catch (err) {
      if (i === retries - 1) return null;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

// 🔥 STATS API
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

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

// 🔥 AVATAR API
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

// 🔥 ITEMS API - AKSESORIS & PAKAIAN YANG DIPAKAI SAAT INI
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔍 Loading CURRENT equipped items...');

    // 1. Get CURRENTLY WEARING (paling akurat)
    let wearData = { assetIds: [] };
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    
    if (wearRes) {
      wearData = await wearRes.json();
    } else {
      // Backup outfit
      const outfitRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
      if (outfitRes) {
        wearData = await outfitRes.json();
      }
    }

    // 2. Extract asset IDs yang DIPAKAI
    let equippedIds = [];
    
    // Dari currently-wearing (prioritas 1)
    if (wearData.assetIds && Array.isArray(wearData.assetIds)) {
      equippedIds = wearData.assetIds.filter(id => id);
    }
    
    // Dari outfit assets (backup)
    if (wearData.assets && Array.isArray(wearData.assets)) {
      wearData.assets.forEach(asset => {
        if (asset?.id) equippedIds.push(asset.id);
      });
    }

    // Unique & max 18 items
    equippedIds = [...new Set(equippedIds)].slice(0, 18);
    console.log(`🎒 ${equippedIds.length} items equipped:`, equippedIds.slice(0, 6));

    if (equippedIds.length === 0) {
      return res.json({ items: [] });
    }

    // 3. Create items list
    const items = [];
    for (const assetId of equippedIds) {
      try {
        // Get item name
        let name = `Item #${assetId}`;
        const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${assetId}/details`, 1, 500);
        if (detailRes) {
          const detail = await detailRes.json();
          name = detail?.Name || name;
        }

        items.push({
          name: name,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });

      } catch (e) {
        items.push({
          name: `Equipped #${assetId}`,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });
      }
    }

    cachedData.items = items;
    cachedData.lastUpdate = now;
    
    console.log(`✅ ${items.length} equipped items ready`);
    broadcast({ items });
    res.json({ items });

  } catch (err) {
    console.error('Items error:', err.message);
    res.json({ items: cachedData.items || [] });
  }
});

// 🔥 WEBSOCKET - REAL-TIME ON REFRESH
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  // Kirim data terbaru saat connect (page refresh)
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log('👋 Client left'));
});

// ❌ NO AUTO REFRESH - hanya update saat page refresh/cache expire

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    items: cachedData.items.length,
    cacheAge: Date.now() - cachedData.lastUpdate 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: port ${PORT}`);
  console.log('✅ NO AUTO REFRESH - Update on page refresh only');
  console.log('✅ Shows CURRENT equipped accessories & clothing');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
