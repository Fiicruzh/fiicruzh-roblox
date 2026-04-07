const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastUpdate: 0
};

let isShuttingDown = false;
let refreshInterval;

async function safeFetch(url, timeout = 8000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res?.ok ? res : null;
  } catch {
    return null;
  }
}

async function safeJson(response) {
  try {
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function refreshAllData() {
  if (isShuttingDown) return;
  
  try {
    console.log('🔄 Auto refresh...');
    
    // Stats - safe parallel fetch
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = {
      friends: (await safeJson(friendsRes.status === 'fulfilled' ? friendsRes.value : null))?.count || 0,
      followers: (await safeJson(followersRes.status === 'fulfilled' ? followersRes.value : null))?.count || 0,
      following: (await safeJson(followingRes.status === 'fulfilled' ? followingRes.value : null))?.count || 0
    };

    // Items - ALL equipped items
    const wearRes = await safeFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await safeJson(wearRes);
    const allIds = wear?.assetIds?.filter(id => typeof id === 'number' && id > 0) || [];
    
    console.log(`👕 Found ${allIds.length} equipped items`);

    let newItems = [];
    if (allIds.length > 0) {
      // Batch thumbnails for ALL items
      const thumbsRes = await safeFetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${allIds.join(',')}&size=150x150&format=Png`
      );
      const thumbsData = await safeJson(thumbsRes);

      // Process EVERY item safely
      for (const id of allIds) {
        try {
          const detailRes = await safeFetch(`https://economy.roblox.com/v2/assets/${id}/details`, 3000);
          const detail = await safeJson(detailRes);
          
          const thumb = thumbsData?.data?.find(t => t.targetId == id);
          
          newItems.push({
            name: detail?.Name || `Item #${id}`,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            id: id,
            limited: detail?.IsLimited || detail?.IsLimitedUnique || false,
            price: detail?.PriceInRobux || 0
          });
          
        } catch {
          // Fallback for any failed item
          newItems.push({
            name: `Item #${id}`,
            image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            id: id,
            limited: false,
            price: 0
          });
        }
      }
    }

    // Detect changes & update
    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    const itemsChanged = JSON.stringify(newItems) !== JSON.stringify(cachedData.items);

    if (statsChanged || itemsChanged) {
      cachedData.stats = newStats;
      cachedData.items = newItems;
      cachedData.lastUpdate = Date.now();
      
      console.log(`✅ UPDATE: ${newItems.length} items ${statsChanged ? '+stats' : ''}`);
      
      if (statsChanged) broadcast({ stats: newStats });
      if (itemsChanged) broadcast({ items: newItems });
    }

  } catch (err) {
    console.log('⚠️ Refresh skipped');
  }
}

function broadcast(data) {
  try {
    const message = JSON.stringify(data);
    for (const client of [...wss.clients]) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  } catch {}
}

// API Endpoints
app.get("/api", (req, res) => res.json(cachedData.stats));

app.get("/api/items", async (req, res) => {
  await refreshAllData();
  res.json({ items: cachedData.items });
});

app.get("/api/avatar", async (req, res) => {
  const avatarRes = await safeFetch(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
  );
  const avatar = await safeJson(avatarRes);
  res.json({ image: avatar?.data?.[0]?.imageUrl || null });
});

// WebSocket
wss.on('connection', (ws) => {
  console.log(`👤 Connected (${wss.clients.size})`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log(`👋 Disconnected (${wss.clients.size})`));
});

// Routes
app.get('*', (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get('/health', (req, res) => res.json({
  status: 'OK',
  port: PORT,
  clients: wss.clients.size,
  items: cachedData.items.length,
  uptime: Math.floor(process.uptime())
}));

// PERFECT STARTUP
console.log('🚀 Starting...');
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server ready on port ${PORT}`);
  
  // Auto refresh every 12 seconds
  refreshInterval = setInterval(refreshAllData, 12000);
  
  // Initial load
  setTimeout(refreshAllData, 1000);
});

// PERFECT SHUTDOWN - RAILWAY SAFE
process.on('SIGTERM', () => {
  console.log('\n🛑 Graceful shutdown...');
  isShuttingDown = true;
  if (refreshInterval) clearInterval(refreshInterval);
  wss.close();
  server.close(() => {
    console.log('✅ Shutdown OK');
    process.exit(0);
  });
});

process.on('SIGINT', () => process.emit('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('💥 Fatal:', err.message);
  process.exit(1);
});
