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
  items: [],
  lastUpdate: 0
};

const CACHE_DURATION = 30000; // 30 detik - lebih cepat update

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

// 🔥 ITEMS API - HANYA PAKAIAN + AKSESORIS + AssetTypeId Filter
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔥 Loading PAKAIAN + AKSESORIS items...');

    // 1. Get CURRENTLY WEARING (PAKAIAN SAAT INI)
    let wearData = { assetIds: [] };
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (wearRes) wearData = await wearRes.json();

    let equippedIds = wearData.assetIds?.filter(id => id) || [];
    
    // 2. Backup dari inventory/outfit
    if (equippedIds.length < 10) {
      const inventoryRes = await fetchWithRetry(`https://inventory.roblox.com/v1/users/${USER_ID}/assets/collectibles?sortOrder=Asc&limit=30`);
      if (inventoryRes) {
        const inventory = await inventoryRes.json();
        inventory.data?.forEach(item => {
          if (item.assetId) equippedIds.push(item.assetId);
        });
      }
    }

    equippedIds = [...new Set(equippedIds)].slice(0, 25);
    console.log(`🎒 Found ${equippedIds.length} asset IDs`);

    if (!equippedIds.length) return res.json({ items: [] });

    // 🔥 BATCH THUMBNAILS + ASSET DETAILS
    const [thumbRes, detailPromises] = await Promise.all([
      fetchWithRetry(`https://thumbnails.roblox.com/v1/assets?assetIds=${equippedIds.join(',')}&size=150x150&format=Png`),
      Promise.all(equippedIds.map(id => 
        fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`)
          .then(res => res?.ok ? res.json() : null)
      ))
    ]);

    let thumbs = {};
    if (thumbRes) {
      const thumbData = await thumbRes.json();
      thumbData.data?.forEach(t => {
        thumbs[t.targetId] = t.imageUrl;
      });
    }

    // 🔥 BUILD ITEMS - HANYA PAKAIAN + AKSESORIS
    const clothingTypes = [2, 8, 11, 12, 13, 27, 41, 42, 46, 47, 48]; // Shirt, Pants, Hat, Hair, Face, etc
    const items = [];

    for (let i = 0; i < equippedIds.length; i++) {
      const assetId = equippedIds[i];
      const details = detailPromises[i];
      
      try {
        let assetTypeId = 0;
        let name = `Item #${assetId}`;
        let equipped = i < wearData.assetIds?.length; // First items = equipped

        if (details) {
          assetTypeId = details.AssetTypeId || 0;
          name = details.Name || name;
          equipped = wearData.assetIds?.includes(assetId) || false;
        }

        // 🎯 FILTER HANYA PAKAIAN + AKSESORIS
        if (!clothingTypes.includes(assetTypeId)) continue;

        const imageUrls = [
          thumbs[assetId],
          `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=150x150&format=Png`,
          `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          `https://via.placeholder.com/85x65/0f0f23/00ff88?text=✓`
        ];

        items.push({
          id: assetId,
          name: name.substring(0, 20),
          image: imageUrls[0] || imageUrls[1] || imageUrls[2],
          link: `https://www.roblox.com/catalog/${assetId}/item`,
          assetTypeId: assetTypeId,
          equipped: equipped
        });

      } catch (e) {
        console.warn(`Failed item ${assetId}:`, e.message);
      }
    }

    cachedData.items = items;
    cachedData.lastUpdate = now;
    console.log(`✅ ${items.length} PAKAIAN+AKSESORIS items ready (${items.filter(i => i.equipped).length} equipped)`);
    broadcast({ items });
    res.json({ items });

  } catch (err) {
    console.error('Items error:', err.message);
    res.json({ items: cachedData.items || [] });
  }
});

// THUMBNAIL PROXY
app.get("/thumbnail/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=150x150&format=Png`;
    const thumbRes = await fetchWithRetry(url);
    
    if (thumbRes) {
      const thumbs = await thumbRes.json();
      const imageUrl = thumbs?.data?.[0]?.imageUrl;
      if (imageUrl) {
        res.redirect(302, imageUrl);
        return;
      }
    }
    
    res.redirect(302, `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`);
    
  } catch (err) {
    res.redirect(302, 'https://via.placeholder.com/85x65/333/fff?text=ROBLOX');
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
  console.log('👤 Client connected');
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log('👋 Client disconnected'));
});

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', items: cachedData.items.length, timestamp: new Date().toISOString() });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('✅ PAKAIAN + AKSESORIS filter ready!');
  console.log('🟢 WebSocket live updates enabled!');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
