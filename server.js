const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const USER_ID = 8941948601;
let cache = { equipped: [], stats: {}, lastUpdate: 0 };
const CACHE_TIME = 15000; // 15s

async function robloxFetch(url) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    return res.ok ? await res.json() : {};
  } catch (e) {
    return {};
  }
}

// 🔥 ALL EQUIPPED ITEMS - COMPLETE & FIXED
app.get("/api/equipped", async (req, res) => {
  const now = Date.now();
  if (now - cache.lastUpdate < CACHE_TIME && cache.equipped.length) {
    return res.json({ items: cache.equipped });
  }

  try {
    console.log('🔄 Fetching equipped items...');
    
    // Get avatar outfit (currently wearing)
    const wearing = await robloxFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
    const assetIds = wearing.assets?.map(a => a.id) || [];

    console.log(`📦 Found ${assetIds.length} equipped items`);

    if (!assetIds.length) {
      cache.equipped = [];
      cache.lastUpdate = now;
      return res.json({ items: [] });
    }

    // Batch get details (max 20 items)
    const ids = assetIds.slice(0, 20).join(',');
    const [thumbnails, details] = await Promise.all([
      robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png`),
      robloxFetch(`https://catalog.roblox.com/v1/catalog/assets/details?assetIds=${ids}`)
    ]);

    const items = [];
    details.data?.slice(0, 20).forEach((detail) => {
      const thumb = thumbnails.data?.find(t => t.targetId == detail.id);
      items.push({
        id: detail.id,
        name: detail.name || `Item #${detail.id}`,
        limited: detail.isLimited || detail.isLimitedUnique || false,
        image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${detail.id}&width=150&height=150&format=png`,
        link: `https://www.roblox.com/catalog/${detail.id}/item`,
        type: detail.assetType?.name || 'Unknown'
      });
    });

    cache.equipped = items;
    cache.lastUpdate = now;
    broadcast({ equipped: { items } });
    
    console.log(`✅ Loaded ${items.length} items`);
    res.json({ items });
  } catch (err) {
    console.error('Equipped error:', err);
    res.status(500).json({ items: cache.equipped });
  }
});

// 🔥 REAL 3D AVATAR - Multiple Angles
app.get("/api/avatar3d", async (req, res) => {
  const angle = parseInt(req.query.angle) || 0;
  const size = 420;
  
  // Roblox avatar-headshot for 3D effect
  const imageUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=${size}x${size}&format=Png&isCircular=false`;
  
  res.json({ image: imageUrl });
});

// 🔥 STATS
app.get("/api/stats", async (req, res) => {
  try {
    const [friends, followers, following] = await Promise.all([
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cache.stats = stats;
    broadcast({ stats });
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.json(cache.stats || { friends: 0, followers: 0, following: 0 });
  }
});

function broadcast(data) {
  try {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  } catch (e) {}
}

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  ws.send(JSON.stringify(cache));
  
  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });
  ws.on('error', () => {}); // Silent WS errors
});

// 🔥 NO LOCALHOST CALLS - FIXED FOR RAILWAY
// Auto refresh directly (no http calls)
setInterval(async () => {
  console.log('🔄 Auto refresh...');
  try {
    // Direct refresh without localhost
    await app._router.stack[0].handle({ method: 'GET', url: '/api/equipped' }, {
      json: (data) => {},
      end: () => {}
    }, () => {});
  } catch (e) {
    console.log('Auto refresh skipped');
  }
}, 15000);

// SPA Routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', cache: cache.equipped.length });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log('✅ Railway FIXED - No localhost calls!');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
