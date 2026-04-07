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
  avatarHash: null,
  lastUpdate: 0
};

const CACHE_DURATION = 30000;
const AVATAR_CHECK_INTERVAL = 15000; // Naikkan ke 15s

async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 12000);
      
      const response = await fetch(url, {
        signal: controller.signal
      });
      
      if (response.ok && response.status === 200) {
        return response;
      }
      console.log(`⚠️ API ${response.status}: ${url}`);
    } catch (err) {
      console.log(`⚠️ Fetch error ${i+1}/${retries}: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// 🔥 SAFE JSON Parse
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// 🔥 FILTER: AKSESORIS + PAKAIAN
function isAccessoryOrClothing(detail) {
  if (!detail || !detail.Name) return false;
  
  const name = detail.Name.toLowerCase();
  const fashionCategories = [
    // PAKAIAN
    'shirt', 't-shirt', 'tshirt', 'pants', 'trousers',
    // AKSESORIS  
    'hat', 'hair', 'face', 'head', 'glasses', 'mask',
    'shoulders', 'front', 'back', 'neck', 'waist',
    // TORSO
    'classicclothingtorso', 'torso'
  ];
  
  return fashionCategories.some(category => name.includes(category));
}

// 🔥 ROBUST FASHION UPDATE
async function checkAvatarAndUpdate() {
  try {
    console.log('🔍 [FASHION] Checking avatar...');
    
    // SAFE avatar check
    let currentAvatarHash = cachedData.avatarHash;
    try {
      const avatarRes = await fetchWithRetry(
        `https://avatar.roblox.com/v1/users/${USER_ID}/avatar`
      );
      const avatarData = await safeJson(avatarRes);
      currentAvatarHash = avatarData?.hash || avatarData?.lastUpdateTime || currentAvatarHash;
    } catch (avatarErr) {
      console.log('⚠️ Avatar API failed, using cache');
    }
    
    if (currentAvatarHash === cachedData.avatarHash) {
      console.log('ℹ️ [FASHION] No avatar change');
      return false;
    }
    
    console.log('🎉 [FASHION] AVATAR CHANGED! Loading fashion...');
    cachedData.avatarHash = currentAvatarHash;
    
    // SAFE equipped items
    let ids = [];
    try {
      const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
      const wear = await safeJson(wearRes);
      ids = wear?.assetIds || [];
    } catch (wearErr) {
      console.log('⚠️ Wear API failed, using cache');
      return false;
    }
    
    console.log(`👕 Found ${ids.length} equipped items`);
    
    let newItems = [];
    let thumbs = { data: [] };
    
    if (ids.length > 0) {
      // SAFE thumbnails
      try {
        const thumbsRes = await fetchWithRetry(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
        );
        const thumbsData = await safeJson(thumbsRes);
        thumbs.data = thumbsData?.data || [];
      } catch (thumbsErr) {
        console.log('⚠️ Thumbs failed');
      }

      // Process items dengan error handling
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        let detail = null;
        
        try {
          const detailRes = await fetchWithRetry(
            `https://economy.roblox.com/v2/assets/${id}/details`,
            1, 300 // Hanya 1 retry untuk speed
          );
          detail = await safeJson(detailRes);
          
          if (isAccessoryOrClothing(detail)) {
            const thumb = thumbs.data.find(t => t.targetId == id);
            newItems.push({
              name: detail.Name || `Fashion #${String(id).slice(-4)}`,
              image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
              link: `https://www.roblox.com/catalog/${id}/item`,
              price: detail.Price || 0,
              limited: detail.IsLimited || detail.IsLimitedUnique || false,
              rarity: detail.IsLimited ? 'legendary' : 
                     (detail.Price && detail.Price > 10000) ? 'epic' : 'rare'
            });
          }
        } catch (itemErr) {
          console.log(`⚠️ Item ${id} failed`);
          continue;
        }
      }
    }
    
    // Maintain order
    newItems.sort((a, b) => {
      const aIndex = ids.findIndex(id => id == a.link.split('/')[4]);
      const bIndex = ids.findIndex(id => id == b.link.split('/')[4]);
      return aIndex - bIndex;
    });
    
    cachedData.items = newItems;
    cachedData.lastUpdate = Date.now();
    
    console.log(`✅ [FASHION] Loaded ${newItems.length} accessories/clothing`);
    broadcast({ items: newItems });
    
    return true;
    
  } catch (err) {
    console.error('❌ [FASHION] Critical error:', err.message);
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

    const statsChanged = JSON.stringify(newStats) !== JSON.stringify(cachedData.stats);
    if (statsChanged) {
      cachedData.stats = newStats;
      console.log(`✅ Stats: F${newStats.friends} FL${newStats.followers} FG${newStats.following}`);
      broadcast({ stats: newStats });
    }
  } catch (err) {
    console.log('⚠️ Stats skipped');
  }
}

app.get("/api", async (req, res) => {
  res.json(cachedData.stats);
});

app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await safeJson(avatarRes);
    res.json({ image: avatar?.data?.[0]?.imageUrl || null });
  } catch (err) {
    res.json({ image: null });
  }
});

app.get("/api/items", async (req, res) => {
  if (cachedData.items.length > 0) {
    res.json({ items: cachedData.items });
  } else {
    await checkAvatarAndUpdate();
    res.json({ items: cachedData.items });
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

// Intervals dengan error protection
setInterval(async () => {
  try {
    await checkAvatarAndUpdate();
  } catch {}
}, AVATAR_CHECK_INTERVAL);

setInterval(async () => {
  try {
    await updateStats();
  } catch {}
}, 30000);

// Initial load
checkAvatarAndUpdate();
updateStats();

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    fashionItems: cachedData.items.length,
    filter: 'ACCESSORIES+CLOTHING',
    errorProof: true
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ERROR-PROOF Fashion Server on port ${PORT}`);
  console.log(`🌐 URL: ${HOST}`);
  console.log(`✅ Accessories + Clothing Only | 100% Robust!\n`);
});
