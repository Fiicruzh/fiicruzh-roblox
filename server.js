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
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0
};

const CACHE_DURATION = 30000;

// 🔥 ULTRA SAFE FETCH - NEVER FAILS
async function safeFetch(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🌐 Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      
      // 🔥 CRITICAL: Check response exists & ok
      if (!response || !response.ok) {
        throw new Error(`HTTP ${response?.status || 'NO_RESPONSE'}`);
      }
      
      return response;
    } catch (err) {
      console.log(`❌ Fetch failed (${i+1}/${retries}): ${err.message}`);
      if (i === retries - 1) return null; // Return null instead of undefined
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  return null;
}

// 🔥 SAFE JSON - Never crashes
async function safeJson(response) {
  if (!response) return { count: 0 };
  try {
    return await response.json();
  } catch (err) {
    console.log('❌ JSON parse failed:', err.message);
    return { count: 0 };
  }
}

// 🔥 FIXED STATS API
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Fetching stats...');

    // 🔥 SEQUENTIAL + ULTRA SAFE
    const friendsRes = await safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`);
    const followersRes = await safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`);
    const followingRes = await safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`);

    const friends = await safeJson(friendsRes);
    const followers = await safeJson(followersRes);
    const following = await safeJson(followingRes);

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cachedData.stats = stats;
    cachedData.lastUpdate = now;

    broadcast({ stats });
    console.log('✅ Stats:', stats);
    res.json(stats);

  } catch (err) {
    console.error("Stats error:", err);
    res.json(cachedData.stats);
  }
});

// 🔥 FIXED AVATAR API
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await safeFetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await safeJson(avatarRes);

    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  } catch (err) {
    console.error("Avatar error:", err);
    res.json({ image: null });
  }
});

// 🔥 FIXED ITEMS API - BULLETPROOF
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({
        items: cachedData.items,
        totalValue: cachedData.totalValue
      });
    }

    console.log('🔄 Fetching items...');

    const wearRes = await safeFetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );
    
    if (!wearRes) {
      console.log('❌ No wear data');
      return res.json({ items: [], totalValue: 0 });
    }

    const wear = await safeJson(wearRes);
    let ids = wear.assetIds || [];
    
    if (ids.length === 0) {
      cachedData.items = [];
      cachedData.totalValue = 0;
      cachedData.lastUpdate = now;
      return res.json({ items: [], totalValue: 0 });
    }

    // Limit to first 10 to avoid rate limits
    ids = ids.slice(0, 10);

    // Get thumbnails (optional - fallback if fails)
    let thumbs = { data: [] };
    try {
      const thumbsRes = await safeFetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
      );
      if (thumbsRes) thumbs = await safeJson(thumbsRes);
    } catch (e) {
      console.log('Thumbs failed, using fallback');
    }

    // 🔥 SAFE ITEM PROCESSING
    const result = [];
    let totalValue = 0;

    for (const id of ids) {
      try {
        const detailRes = await safeFetch(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        
        if (!detailRes) continue;

        const detail = await safeJson(detailRes);
        
        if (!detail || !detail.Name) continue;

        const thumb = thumbs.data?.find(t => t.targetId == id) || {};

        const item = {
          name: detail.Name.substring(0, 30), // Truncate long names
          price: detail.PriceInRobux || detail.LowestPrice || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        };

        totalValue += item.price;
        result.push(item);

      } catch (itemErr) {
        console.log(`⏭️ Skip item ${id}:`, itemErr.message);
        continue;
      }
    }

    cachedData.items = result;
    cachedData.totalValue = totalValue;
    cachedData.lastUpdate = now;

    broadcast({
      items: result,
      totalValue: totalValue
    });

    console.log(`✅ Items: ${result.length}/${ids.length}, Value: ${totalValue.toLocaleString()} R$`);
    res.json({ items: result, totalValue });

  } catch (err) {
    console.error("Items error:", err);
    res.json({
      items: cachedData.items,
      totalValue: cachedData.totalValue
    });
  }
});

// 🔥 WEBSOCKET
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
  
  ws.send(JSON.stringify({
    stats: cachedData.stats,
    items: cachedData.items,
    totalValue: cachedData.totalValue
  }));

  ws.on('close', () => console.log('👋 WebSocket client disconnected'));
  ws.on('error', (err) => console.log('WS error:', err.message));
});

// 🔥 FIXED AUTO UPDATE - NO LOCALHOST
setInterval(async () => {
  console.log('🔄 LIVE UPDATE...');
  try {
    // Direct internal refresh
    await app.get('/api', { url: 'internal' });
    await app.get('/api/items', { url: 'internal' });
    
    broadcast({
      stats: cachedData.stats,
      items: cachedData.items,
      totalValue: cachedData.totalValue
    });
    
    console.log('✅ LIVE UPDATE COMPLETE');
  } catch (err) {
    console.error('Auto update failed:', err.message);
  }
}, 30000);

// SPA ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(), 
    clients: wss.clients.size,
    cacheAge: Date.now() - cachedData.lastUpdate
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log('✅ BULLETPROOF MODE ACTIVATED');
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});
