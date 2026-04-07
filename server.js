const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*" }));
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 93, followers: 3, following: 2 },
  items: [],
  lastWearIds: [],
  lastUpdate: 0
};

// 🔥 ULTRA SAFE FETCH
async function safeFetch(url) {
  try {
    const res = await fetch(url, { 
      timeout: 8000 
    });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

// 🔥 FASHION FILTER
function isFashionItem(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return /shirt|pants|tshirt|hat|hair|face|head|glasses|mask|shoulders|front|back|neck|waist|torso/i.test(n);
}

// 🔥 LOAD FASHION ITEMS - DIRECT & SIMPLE
async function loadItems() {
  try {
    console.log('🔄 Loading fashion items...');
    
    // 1. Get equipped
    const wear = await safeFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const ids = wear?.assetIds || [];
    
    // 2. Check change
    const idsStr = ids.join(',');
    if (idsStr === cachedData.lastWearIds.join(',') && cachedData.items.length > 0) {
      console.log('ℹ️ No item change');
      return;
    }
    
    console.log(`👗 ${ids.length} equipped → filtering fashion...`);
    
    const newItems = [];
    
    // 3. Process each (parallel untuk speed)
    const promises = ids.slice(0, 20).map(async (id) => {
      try {
        const detail = await safeFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (isFashionItem(detail?.Name)) {
          const thumb = await safeFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=150x150&format=Png`);
          return {
            name: detail.Name || `#${id}`,
            image: thumb?.data?.[0]?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150`,
            link: `https://www.roblox.com/catalog/${id}/item`,
            limited: detail?.IsLimited || false,
            price: detail?.Price || 0
          };
        }
      } catch {}
    });
    
    const results = await Promise.allSettled(promises);
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value) {
        newItems.push(result.value);
      }
    });
    
    // 4. Update cache
    cachedData.items = newItems;
    cachedData.lastWearIds = ids;
    cachedData.lastUpdate = Date.now();
    
    console.log(`✅ Fashion items LOADED: ${newItems.length}`);
    broadcast({ items: newItems });
    
  } catch (err) {
    console.error('❌ Load error:', err.message);
  }
}

// 🔥 STATS SIMPLE
async function loadStats() {
  try {
    const [friends, followers, following] = await Promise.allSettled([
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);
    
    cachedData.stats = {
      friends: friends.status === 'fulfilled' ? friends.value.count || 0 : cachedData.stats.friends,
      followers: followers.status === 'fulfilled' ? followers.value.count || 0 : cachedData.stats.followers,
      following: following.status === 'fulfilled' ? following.value.count || 0 : cachedData.stats.following
    };
    
    broadcast({ stats: cachedData.stats });
    console.log(`✅ Stats: F${cachedData.stats.friends} FL${cachedData.stats.followers}`);
  } catch {}
}

// 🔥 API ROUTES
app.get('/api', (req, res) => res.json(cachedData.stats));
app.get('/api/items', async (req, res) => {
  await loadItems();
  res.json({ items: cachedData.items });
});
app.get('/api/avatar', async (req, res) => {
  try {
    const avatar = await safeFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`);
    res.json({ image: avatar?.data?.[0]?.imageUrl });
  } catch {
    res.json({ image: null });
  }
});

// 🔥 WEBSOCKET
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`👤 Client ${wss.clients.size}`);
  ws.send(JSON.stringify(cachedData));
});

// 🔥 AUTO UPDATE EVERY 15s
setInterval(loadItems, 15000);
setInterval(loadStats, 30000);

// 🔥 FORCE LOAD ON START
loadItems();
setTimeout(loadItems, 3000);
setTimeout(loadStats, 1000);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`\n🚀 FASHION PORTFOLIO on port ${PORT}`);
  console.log(`🌐 ${HOST}`);
  console.log('✅ Items loading... Fashion only!');
});
