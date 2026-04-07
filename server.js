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
const HOST = process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : `http://localhost:${PORT}`;
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false
});

app.use(express.static(path.join(__dirname, "public")));
console.log("📁 Public folder:", path.join(__dirname, "public"));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  wearHash: null, // 🔥 Ganti ke wear hash (lebih reliable)
  lastUpdate: 0,
  rateLimitWait: 0 // 🔥 Rate limit protection
};

const CACHE_DURATION = 30000;
const WEAR_CHECK_INTERVAL = 20000; // 20 detik

async function fetchWithRetry(url, retries = 2, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      // 🔥 Rate limit delay
      if (cachedData.rateLimitWait > Date.now()) {
        const waitTime = cachedData.rateLimitWait - Date.now();
        await new Promise(r => setTimeout(r, waitTime));
      }
      
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') || 5;
        cachedData.rateLimitWait = Date.now() + (parseInt(retryAfter) * 1000);
        console.log(`⏳ Rate limit, wait ${retryAfter}s`);
        continue;
      }
      
      if (response.ok) return response;
      
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// 🔥 FILTER FASHION
function isAccessoryOrClothing(detail) {
  if (!detail?.Name) return false;
  const name = detail.Name.toLowerCase();
  const fashion = [
    'shirt', 't-shirt', 'tshirt', 'pants', 'trousers',
    'hat', 'hair', 'face', 'head', 'glasses', 'mask',
    'shoulders', 'front', 'back', 'neck', 'waist',
    'classicclothingtorso', 'torso'
  ];
  return fashion.some(cat => name.includes(cat));
}

// 🔥 DIRECT WEAR CHECK - NO AVATAR DEPENDENCY
async function loadFashionItems() {
  try {
    console.log('👗 Loading fashion items from wear API...');
    
    // 1. Get equipped items (RELIABLE API)
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await safeJson(wearRes);
    const ids = wear?.assetIds || [];
    
    // 2. Create wear hash dari ids
    const currentWearHash = ids.slice(0, 10).join('-'); // First 10 items hash
    
    if (currentWearHash === cachedData.wearHash && cachedData.items.length > 0) {
      console.log('ℹ️ Wear unchanged, using cache');
      return false;
    }
    
    console.log(`👕 Wear changed! ${ids.length} items → processing fashion...`);
    cachedData.wearHash = currentWearHash;
    
    let newItems = [];
    
    if (ids.length === 0) {
      cachedData.items = [];
      return true;
    }
    
    // 3. Batch thumbnails
    let thumbs = { data: [] };
    try {
      const thumbsRes = await fetchWithRetry(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
      );
      thumbs = await safeJson(thumbsRes) || { data: [] };
    } catch {
      console.log('⚠️ Thumbs skipped');
    }
    
    // 4. Filter fashion items
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        const detailRes = await fetchWithRetry(
          `https://economy.roblox.com/v2/assets/${id}/details`,
          1, 500
        );
        const detail = await safeJson(detailRes);
        
        if (isAccessoryOrClothing(detail)) {
          const thumb = thumbs.data.find(t => t.targetId == id);
          newItems.push({
            name: detail.Name || `Fashion #${id.toString().slice(-4)}`,
            image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            price: detail.Price || 0,
            limited: detail.IsLimited || detail.IsLimitedUnique || false,
            rarity: detail.IsLimited ? 'legendary' : 
                   (detail.Price > 10000) ? 'epic' : 'rare'
          });
        }
      } catch (itemErr) {
        console.log(`⚠️ Skip item ${id}`);
      }
    }
    
    // 5. Sort by equipped order
    newItems.sort((a, b) => {
      const aIdx = ids.findIndex(id => id == a.link.split('/')[4]);
      const bIdx = ids.findIndex(id => id == b.link.split('/')[4]);
      return aIdx - bIdx;
    });
    
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    console.log(`✅ Fashion items: ${newItems.length}`);
    
    broadcast({ items: newItems });
    return true;
    
  } catch (err) {
    console.error('❌ Wear load failed:', err.message);
    return false;
  }
}

async function updateStats() {
  try {
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const newStats = { friends: 0, followers: 0, following: 0 };
    
    if (friendsRes.status === 'fulfilled') {
      const data = await safeJson(friendsRes.value);
      newStats.friends = data?.count || 0;
    }
    if (followersRes.status === 'fulfilled') {
      const data = await safeJson(followersRes.value);
      newStats.followers = data?.count || 0;
    }
    if (followingRes.status === 'fulfilled') {
      const data = await safeJson(followingRes.value);
      newStats.following = data?.count || 0;
    }

    if (JSON.stringify(newStats) !== JSON.stringify(cachedData.stats)) {
      cachedData.stats = newStats;
      console.log(`✅ Stats: F${newStats.friends} FL${newStats.followers} FG${newStats.following}`);
      broadcast({ stats: newStats });
    }
  } catch {}
}

app.get("/api", (req, res) => res.json(cachedData.stats));
app.get("/api/items", async (req, res) => {
  await loadFashionItems();
  res.json({ items: cachedData.items });
});
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await safeJson(avatarRes);
    res.json({ image: avatar?.data?.[0]?.imageUrl || null });
  } catch {
    res.json({ image: null });
  }
});

function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
      } catch {}
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`👤 Connected: ${wss.clients.size}`);
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log(`👋 Disconnected: ${wss.clients.size}`));
});

// 🔥 AUTO UPDATE - Direct wear check
setInterval(async () => {
  try {
    await loadFashionItems();
  } catch {}
}, WEAR_CHECK_INTERVAL);

setInterval(updateStats, 30000);

// FORCE initial load
setTimeout(loadFashionItems, 2000);

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    fashionItems: cachedData.items.length,
    wearHash: cachedData.wearHash?.slice(0, 12) + '...',
    rateLimit: cachedData.rateLimitWait > Date.now()
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ANTI-429 Fashion Server on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ Direct wear API | Fashion only | Items LOADED!\n`);
});
