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

// Railway fix - handle all ports
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

// Cache duration 30 seconds
const CACHE_DURATION = 30000;

// 🔥 UPGRADED fetchWithRetry - 100% SAFE
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response && response.ok) {
        return response;
      }
    } catch (err) {
      if (i === retries - 1) {
        console.log(`❌ Fetch failed: ${url}`);
        return null; // Return null instead of throw
      }
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  return null;
}

// 🔥 API STATS - SAFE VERSION
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
          if (i === 0) stats.friends = data.count || 0;
          if (i === 1) stats.followers = data.count || 0;
          if (i === 2) stats.following = data.count || 0;
        } catch (e) {}
      }
    }

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    broadcast({ stats });
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 AVATAR API - SAFE
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    if (avatarRes) {
      const avatar = await avatarRes.json();
      res.json({
        image: avatar?.data?.[0]?.imageUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
      });
    } else {
      res.json({ 
        image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
      });
    }
  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ 
      image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
    });
  }
});

// 🔥 ITEMS API - FULLY EQUIPPED ITEMS + 100% ERROR-PROOF
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items });
    }

    console.log('🔄 Fetching ALL equipped items...');

    // 1. Get outfit data (primary)
    let wearData = { assets: [], assetIds: [] };
    let outfitRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
    
    if (outfitRes) {
      wearData = await outfitRes.json();
    } else {
      // Fallback
      console.log('🔄 Outfit failed, using currently-wearing...');
      const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
      if (wearRes) {
        wearData = await wearRes.json();
      }
    }

    // 2. Extract ALL asset IDs
    let allAssetIds = [];
    if (wearData.assets && Array.isArray(wearData.assets)) {
      wearData.assets.forEach(asset => {
        if (asset?.id) allAssetIds.push(asset.id);
      });
    }
    if (wearData.assetIds && Array.isArray(wearData.assetIds)) {
      wearData.assetIds.forEach(id => {
        if (id) allAssetIds.push(id);
      });
    }

    // Remove duplicates & limit to 20
    allAssetIds = [...new Set(allAssetIds)].slice(0, 20);
    console.log(`🔍 Found ${allAssetIds.length} equipped items:`, allAssetIds.slice(0, 5));

    if (allAssetIds.length === 0) {
      cachedData.items = [];
      cachedData.lastUpdate = now;
      console.log('❌ No equipped items');
      return res.json({ items: [] });
    }

    // 3. Process each item SAFELY
    const result = [];
    for (const id of allAssetIds) {
      try {
        let itemName = `Equipped #${id}`;
        
        // Try get name
        const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${id}/details`, 1, 500);
        if (detailRes) {
          const detail = await detailRes.json();
          itemName = detail.Name || itemName;
        }

        result.push({
          name: itemName,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });

      } catch (itemErr) {
        console.log(`⚠️ Item ${id} fallback`);
        result.push({
          name: `Equipped Item #${id}`,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        });
      }
    }

    cachedData.items = result;
    cachedData.lastUpdate = now;

    console.log(`✅ SUCCESS: ${result.length} items processed`);
    broadcast({ items: result });
    res.json({ items: result });

  } catch (err) {
    console.error("Items ERROR:", err.message);
    res.status(200).json({ items: cachedData.items || [] });
  }
});

// 🔥 WEBSOCKET BROADCAST
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch (err) {
        console.error("Broadcast error:", err);
      }
    }
  });
}

wss.on('connection', (ws) => {
  console.log('👤 WebSocket client connected');
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log('👋 WebSocket disconnected'));
});

// 🔥 AUTO UPDATE LOOP
setInterval(async () => {
  console.log('🔄 Auto refresh...');
  try {
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`, { timeout: 5000 }).catch(() => {});
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`, { timeout: 5000 }).catch(() => {});
    console.log('✅ Auto refresh complete');
  } catch (err) {
    console.log('⚠️ Auto refresh skipped');
  }
}, 30000);

// 🔥 SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔥 HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: Date.now(), items: cachedData.items.length });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server ON: port ${PORT}`);
  console.log(`✅ 100% Railway Ready!`);
});

process.on('SIGTERM', () => {
  console.log('🛑 Graceful shutdown');
  server.close(() => process.exit(0));
});
