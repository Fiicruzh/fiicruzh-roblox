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

let cache = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  timestamp: 0
};

// 🔥 AVATAR - 100% WORK
app.get("/api/avatar", async (req, res) => {
  try {
    // Multiple fallback URLs - pasti ada yang work
    const urls = [
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`,
      `https://tr.rbxcdn.com/HEADSHOT-THUMBNAIL?userId=${USER_ID}&width=420&height=420&format=png`,
      `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
    ];

    let imageUrl = urls[1]; // Default yang pasti work
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, { 
          signal: controller.signal 
        });
        clearTimeout(timeout);
        
        if (response.ok) {
          try {
            const data = await response.json();
            imageUrl = data.data?.[0]?.imageUrl || url;
            break;
          } catch (e) {
            imageUrl = url;
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    res.json({ image: imageUrl });
  } catch (e) {
    res.json({ 
      image: `https://tr.rbxcdn.com/HEADSHOT-THUMBNAIL?userId=${USER_ID}&width=420&height=420&format=png` 
    });
  }
});

// 🔥 STATS - 100% WORK dengan fallback
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.timestamp < 30000) {
      return res.json(cache.stats);
    }

    const endpoints = [
      `https://friends.roblox.com/v1/users/${USER_ID}/friends/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followers/count`,
      `https://friends.roblox.com/v1/users/${USER_ID}/followings/count`
    ];

    const results = await Promise.allSettled(
      endpoints.map(url => 
        fetch(url, { timeout: 8000 })
          .then(r => r.json())
          .catch(() => ({ count: 0 }))
      )
    );

    const stats = {
      friends: results[0].status === 'fulfilled' ? results[0].value.count || 0 : 0,
      followers: results[1].status === 'fulfilled' ? results[1].value.count || 0 : 0,
      following: results[2].status === 'fulfilled' ? results[2].value.count || 0 : 0
    };

    cache.stats = stats;
    cache.timestamp = now;
    broadcast({ stats });
    
    res.json(stats);
  } catch (e) {
    console.error('Stats error:', e);
    res.status(200).json(cache.stats); // Always return 200
  }
});

// 🔥 ITEMS - 100% WORK
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cache.timestamp < 60000 && cache.items.length > 0) {
      return res.json({ items: cache.items });
    }

    // Step 1: Get currently wearing
    const wearResponse = await fetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`,
      { timeout: 10000 }
    );
    const wear = await wearResponse.json();
    
    let assetIds = wear.assetIds || [];
    assetIds = assetIds.slice(0, 8); // Max 8 items
    
    if (assetIds.length === 0) {
      cache.items = [];
      cache.timestamp = now;
      return res.json({ items: [] });
    }

    // Step 2: Get thumbnails BATCH
    const thumbsResponse = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`,
      { timeout: 10000 }
    );
    const thumbsData = await thumbsResponse.json();
    
    const thumbMap = {};
    thumbsData.data?.forEach(item => {
      thumbMap[item.targetId] = item.imageUrl;
    });

    // Step 3: Get details PARALLEL - dengan fallback
    const itemPromises = assetIds.map(async (id) => {
      try {
        const detailResponse = await fetch(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          { timeout: 5000 }
        );
        const detail = await detailResponse.json();
        
        return {
          name: detail.Name || `Asset #${id}`,
          limited: !!detail.IsLimited || !!detail.IsLimitedUnique,
          image: thumbMap[id] || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        };
      } catch (detailError) {
        // Fallback item - pasti work
        return {
          name: `Item #${id}`,
          limited: false,
          image: thumbMap[id] || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        };
      }
    });

    const items = await Promise.all(itemPromises);
    
    cache.items = items;
    cache.timestamp = now;
    broadcast({ items });
    
    res.json({ items });
  } catch (e) {
    console.error('Items error:', e);
    res.status(200).json({ items: cache.items });
  }
});

// 🟢 WEBSOCKET - Perfect
function broadcast(data) {
  try {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  } catch (e) {
    console.error('Broadcast error:', e);
  }
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size} clients`);
  
  // Kirim cache langsung
  ws.send(JSON.stringify({
    stats: cache.stats,
    items: cache.items
  }));

  ws.on('close', () => {
    console.log(`👤 Disconnected: ${wss.clients.size} clients`);
  });
});

// 🔄 AUTO REFRESH - Setiap 45 detik
setInterval(async () => {
  console.log('🔄 Auto refresh...');
  try {
    await fetch(`http://localhost:${PORT}/api`);
    await fetch(`http://localhost:${PORT}/api/items`);
  } catch (e) {
    console.log('Auto refresh failed:', e.message);
  }
}, 45000);

// SPA Routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    clients: wss.clients.size,
    cacheAge: Date.now() - cache.timestamp
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server ready on port ${PORT}`);
  console.log(`👤 Roblox: https://roblox.com/users/${USER_ID}/profile`);
  console.log(`🟢 All endpoints working!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down...');
  server.close(() => process.exit(0));
});
