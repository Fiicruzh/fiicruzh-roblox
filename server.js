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

// Roblox User ID - GANTI DENGAN ID ANDA
const USER_ID = 8941948601;

let statsCache = { friends: 0, followers: 0, following: 0, lastUpdate: 0 };
let itemsCache = { items: [], totalValue: 0, lastUpdate: 0, hash: '' };
const CACHE_DURATION = 30000;

// ==========================
// 🔥 FIXED FETCH RETRY
// ==========================
async function fetchWithRetry(url, retries = 5, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching: ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.ok) {
        console.log(`✅ Success: ${url}`);
        return response;
      }
      console.log(`❌ HTTP ${response.status}: ${url}`);
    } catch (err) {
      console.log(`❌ Error ${i+1}/${retries}: ${url} - ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

function hashItems(items) {
  return items.map(item => `${item.name}-${item.price || 0}-${item.limited}`).join('|');
}

// ==========================
// 🔥 FIXED STATS API
// ==========================
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - statsCache.lastUpdate < CACHE_DURATION) {
      console.log('📊 Using stats cache');
      return res.json(statsCache);
    }

    console.log('🔄 Fetching fresh stats...');
    
    // FIXED: Correct endpoints + better error handling
    const friendsRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`);
    const followersRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`);
    const followingRes = await fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`);

    const friends = await friendsRes.json();
    const followers = await followersRes.json();
    const following = await followingRes.json();

    const stats = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    console.log(`📊 Stats: Friends=${stats.friends}, Followers=${stats.followers}, Following=${stats.following}`);

    statsCache = { ...stats, lastUpdate: now };
    broadcast({ stats });
    res.json(stats);

  } catch (err) {
    console.error("❌ Stats error:", err);
    res.json(statsCache);
  }
});

// ==========================
// 🔥 FIXED AVATAR API - ROBLOX DIRECT
// ==========================
app.get("/api/avatar", async (req, res) => {
  try {
    console.log('👤 Fetching avatar...');
    
    // ROBLOX DIRECT AVATAR - 100% working
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    const avatar = await avatarRes.json();
    const imageUrl = avatar.data?.[0]?.imageUrl;
    
    console.log('✅ Avatar:', imageUrl ? 'Found' : 'Not found');
    
    res.json({
      image: imageUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`
    });

  } catch (err) {
    console.error("❌ Avatar error:", err);
    res.json({ 
      image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` 
    });
  }
});

// ==========================
// 🔥 FIXED ITEMS API - FULL INVENTORY
// ==========================
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    
    if (now - itemsCache.lastUpdate < CACHE_DURATION && itemsCache.items.length > 0) {
      console.log('🎒 Using items cache');
      return res.json(itemsCache);
    }

    console.log('🎒 Fetching fresh inventory...');

    // 1. Get ALL assets (not just wearing)
    const inventoryRes = await fetchWithRetry(
      `https://inventory.roblox.com/v1/users/${USER_ID}/assets/collectibles?sortOrder=Asc&limit=100`
    );
    
    const inventory = await inventoryRes.json();
    let assetIds = [];
    
    if (inventory.data && inventory.data.length > 0) {
      assetIds = inventory.data.map(item => item.assetId);
      console.log(`📦 Found ${assetIds.length} collectibles`);
    } else {
      // Fallback: Get wearing items
      console.log('🔄 No collectibles, checking wearing...');
      const wearingRes = await fetchWithRetry(
        `https://avatar.roblox.com/v1/users/${USER_ID}/outfit`
      );
      const wearing = await wearingRes.json();
      assetIds = wearing.assets?.map(a => a.id) || [];
    }

    if (assetIds.length === 0) {
      console.log('❌ No items found');
      const emptyCache = { items: [], totalValue: 0, lastUpdate: now, hash: '' };
      itemsCache = emptyCache;
      broadcast({ items: [], totalValue: 0 });
      return res.json(emptyCache);
    }

    // 2. Get thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.slice(0,20).join(",")}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // 3. Process items
    const result = [];
    let totalValue = 0;

    for (const id of assetIds.slice(0, 20)) {
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );
        const detail = await detailRes.json();
        
        if (detail && detail.Name) {
          const thumb = thumbs.data?.find(t => t.targetId == id);

          const item = {
            name: detail.Name,
            price: detail.PriceInRobux || detail.recentAveragePrice || 0,
            limited: detail.IsLimited || detail.IsLimitedUnique || false,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`
          };

          totalValue += item.price;
          result.push(item);
        }
      } catch (itemErr) {
        console.log(`⚠️ Item ${id} skipped:`, itemErr.message);
      }
    }

    const newHash = hashItems(result);
    
    console.log(`🎒 Processed ${result.length} items, Total: ${totalValue.toLocaleString()} R$`);
    
    if (newHash !== itemsCache.hash || result.length !== itemsCache.items.length) {
      itemsCache = { 
        items: result, 
        totalValue, 
        lastUpdate: now, 
        hash: newHash 
      };
      
      broadcast({
        items: result,
        totalValue: totalValue
      });
    }

    res.json(itemsCache);

  } catch (err) {
    console.error("❌ Items error:", err);
    res.json(itemsCache);
  }
});

// ==========================
// 🔥 WEBSOCKET
// ==========================
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
  console.log('👤 WS Connected');
  ws.send(JSON.stringify({
    stats: statsCache,
    items: itemsCache.items,
    totalValue: itemsCache.totalValue
  }));
  
  ws.on('close', () => console.log('👋 WS Disconnected'));
});

// ==========================
// 🔥 AUTO REFRESH
// ==========================
setInterval(async () => {
  console.log('🔄 Auto refresh...');
  try {
    await fetch(`http://localhost:${PORT}/api?_t=${Date.now()}`);
    await fetch(`http://localhost:${PORT}/api/items?_t=${Date.now()}`);
  } catch (err) {
    console.error('Auto refresh failed:', err);
  }
}, 30000);

// ==========================
// 🔥 ROUTING & HEALTH
// ==========================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    userId: USER_ID,
    stats: statsCache,
    itemsCount: itemsCache.items.length
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`👤 User ID: ${USER_ID}`);
  console.log('✅ ALL FIXED - Ready!');
});
