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

async function fetchWithRetry(url, options = {}, retries = 2, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, { 
        ...options,
        signal: controller.signal 
      });
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

// 🔥 ITEMS API - BULLETPROOF FIX
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔥 Loading ALL equipped items...');

    // Get equipped items - BULLETPROOF
    let wearData = { assetIds: [] };
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (wearRes) {
      try {
        wearData = await wearRes.json();
      } catch (e) {
        console.log('Wear parse error:', e.message);
      }
    }

    // CLEAN IDs ONLY (numbers only)
    let equippedIds = (wearData.assetIds || [])
      .map(id => Number(id))
      .filter(id => !isNaN(id) && id > 0 && id.toString().length > 3)
      .slice(0, 18);

    console.log(`🎒 Clean IDs (${equippedIds.length}):`, equippedIds.slice(0, 5));

    // Backup outfit
    if (equippedIds.length < 5) {
      const outfitRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
      if (outfitRes) {
        try {
          const outfit = await outfitRes.json();
          if (outfit.assets) {
            outfit.assets.forEach(asset => {
              const id = Number(asset?.id);
              if (!isNaN(id) && id > 0) equippedIds.push(id);
            });
          }
        } catch (e) {}
      }
    }

    equippedIds = [...new Set(equippedIds)].slice(0, 18);
    
    if (!equippedIds.length) {
      console.log('❌ No valid items found');
      return res.json({ items: [] });
    }

    // 🔥 THUMBNAILS BATCH
    const thumbRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${equippedIds.join(',')}&size=150x150&format=Png`
    );
    let thumbs = {};
    if (thumbRes) {
      try {
        const thumbData = await thumbRes.json();
        thumbData.data?.forEach(t => {
          thumbs[t.targetId] = t.imageUrl;
        });
      } catch (e) {}
    }

    // 🔥 PROCESS ITEMS (SAFE)
    const items = [];
    for (const assetId of equippedIds) {
      try {
        // Safe string conversion
        const safeId = assetId.toString();
        
        // PRIORITY #1: CATALOG API
        let name = `Item #${safeId.slice(-6)}`;
        
        const catalogRes = await fetchWithRetry(
          `https://catalog.roblox.com/v1/catalog/items/details`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              items: [{ itemType: 'Asset', id: parseInt(safeId) }] 
            })
          },
          1
        );
        
        if (catalogRes) {
          try {
            const catalogData = await catalogRes.json();
            const itemData = catalogData?.data?.[0];
            if (itemData?.Name && itemData.Name.length > 2) {
              name = itemData.Name;
            }
          } catch (e) {}
        }

        // FALLBACK #2: Asset details
        if (name === `Item #${safeId.slice(-6)}`) {
          const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${safeId}/details`, 1);
          if (detailRes) {
            try {
              const detail = await detailRes.json();
              if (detail.Name && detail.Name.length > 2) {
                name = detail.Name;
              }
            } catch (e) {}
          }
        }

        // PERFECT IMAGES
        const imageUrls = [
          thumbs[assetId], 
          `https://thumbnails.roblox.com/v1/assets?assetIds=${safeId}&size=150x150&format=Png`,
          `https://www.roblox.com/asset-thumbnail/image?assetId=${safeId}&width=150&height=150&format=png`,
          `/thumbnail/${safeId}`,
          `https://via.placeholder.com/90x70/0f0f23/00ff88?text=✓`
        ];

        items.push({
          id: safeId,
          name: name.substring(0, 28) + (name.length > 28 ? '...' : ''),
          image: imageUrls[0] || imageUrls[1] || imageUrls[2],
          link: `https://www.roblox.com/catalog/${safeId}/item`
        });

      } catch (e) {
        console.log(`⚠️ Skip item ${assetId}:`, e.message);
      }
    }

    cachedData.items = items;
    cachedData.lastUpdate = now;
    console.log(`✅ ${items.length} PERFECT items ready!`);
    broadcast({ items });
    res.json({ items });

  } catch (err) {
    console.error('Items error:', err.message);
    res.json({ items: cachedData.items || [] });
  }
});

// 🔥 THUMBNAIL PROXY
app.get("/thumbnail/:assetId", async (req, res) => {
  try {
    const { assetId } = req.params;
    console.log(`🖼️ Thumbnail: ${assetId}`);
    
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
    
    const fallback1 = `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`;
    res.redirect(302, fallback1);
    
  } catch (err) {
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
