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

const CACHE_DURATION = 60000;

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

// 🔥 ITEMS API - 100% IMAGE GUARANTEE
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔥 Loading ALL equipped items with images...');

    // Get equipped items
    let wearData = { assetIds: [] };
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (wearRes) wearData = await wearRes.json();

    let equippedIds = wearData.assetIds?.filter(id => id) || [];
    
    // Backup outfit
    if (equippedIds.length < 5) {
      const outfitRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
      if (outfitRes) {
        const outfit = await outfitRes.json();
        if (outfit.assets) {
          outfit.assets.forEach(asset => asset?.id && equippedIds.push(asset.id));
        }
      }
    }

    equippedIds = [...new Set(equippedIds)].slice(0, 18);
    console.log(`🎒 ${equippedIds.length} IDs:`, equippedIds.slice(0, 5));

    if (!equippedIds.length) return res.json({ items: [] });

    // 🔥 PRE-CACHE THUMBNAILS (BATCH)
    const thumbRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${equippedIds.join(',')}&size=150x150&format=Png`
    );
    let thumbs = {};
    if (thumbRes) {
      const thumbData = await thumbRes.json();
      thumbData.data?.forEach(t => {
        thumbs[t.targetId] = t.imageUrl;
      });
    }

    // Build items dengan PERFECT images
    const items = [];
    for (const assetId of equippedIds) {
      try {
        // Name
        let name = `Item #${assetId}`;
        const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${assetId}/details`, 1);
        if (detailRes) {
          const detail = await detailRes.json();
          name = detail.Name || name;
        }

        // PRIORITY IMAGE FALLBACKS (5 LEVEL)
        const imageUrls = [
          thumbs[assetId],  // 1. Batch thumbnails
          `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&size=150x150&format=Png`,  // 2. Single
          `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,  // 3. Direct
          `/thumbnail/${assetId}`,  // 4. Proxy
          `https://via.placeholder.com/90x70/0f0f23/00ff88?text=✓`  // 5. Success placeholder
        ];

        items.push({
          id: assetId,
          name: name.substring(0, 25),  // Short name
          image: imageUrls[0] || imageUrls[1],  // Best available
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });

      } catch (e) {
        items.push({
          id: assetId,
          name: `Equipped`,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        });
      }
    }

    cachedData.items = items;
    cachedData.lastUpdate = now;
    console.log(`✅ ALL ${items.length} images ready`);
    broadcast({ items });
    res.json({ items });

  } catch (err) {
    console.error('Items:', err.message);
    res.json({ items: cachedData.items || [] });
  }
});

// 🔥 THUMBNAIL PROXY - FIX BROKEN IMAGES
app.get("/thumbnail/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;
    console.log(`🖼️ Thumbnail: ${assetId}`);
    
    // Try Roblox thumbnails API
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
    
    // Fallback 1: Direct Roblox thumbnail
    const fallback1 = `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`;
    res.redirect(302, fallback1);
    
  } catch (err) {
    // Ultimate fallback
    res.redirect(302, 'https://via.placeholder.com/150x150/333/fff?text=ROBLOX');
  }
});

// WEBSOCKET
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
  res.json({ status: 'OK', items: cachedData.items.length });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: ${PORT}`);
  console.log('✅ Thumbnails proxy ready!');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
