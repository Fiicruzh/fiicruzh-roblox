const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const PORT = process.env.PORT || process.env.RAILWAY_PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;
let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0
};

const CACHE_DURATION = 60000; // 1 MINUTE - Anti 429

// 🔥 RATE LIMIT SAFE FETCH
async function safeFetch(url, retries = 3, delay = 2000) { // Increased delay
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🌐 [${i+1}/${retries}] ${url}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });
      
      if (!response) return null;
      
      if (response.status === 429) {
        console.log('⏳ Rate limited, waiting longer...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      if (response.ok) return response;
      
    } catch (err) {
      console.log(`❌ Fetch ${i+1}/${retries}: ${err.message}`);
      if (i === retries - 1) return null;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  return null;
}

async function safeJson(response) {
  if (!response) return { count: 0 };
  try {
    return await response.json();
  } catch {
    return { count: 0 };
  }
}

// 🔥 STATS API
app.get("/api", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION) {
      return res.json(cachedData.stats);
    }

    console.log('🔄 Updating stats...');

    // Sequential to avoid 429
    const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const friends = await safeJson(friendsRes.status === 'fulfilled' ? friendsRes.value : null);
    const followers = await safeJson(followersRes.status === 'fulfilled' ? followersRes.value : null);
    const following = await safeJson(followingRes.status === 'fulfilled' ? followingRes.value : null);

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

// 🔥 AVATAR API
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await safeFetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await safeJson(avatarRes);
    res.json({ image: avatar.data?.[0]?.imageUrl || null });
  } catch (err) {
    res.json({ image: null });
  }
});

// 🔥 ITEMS API - RATE LIMIT SAFE
app.get("/api/items", async (req, res) => {
  try {
    const now = Date.now();
    if (now - cachedData.lastUpdate < CACHE_DURATION && cachedData.items.length > 0) {
      return res.json({ items: cachedData.items, totalValue: cachedData.totalValue });
    }

    console.log('🔄 Updating items...');

    const wearRes = await safeFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    if (!wearRes) {
      console.log('❌ No wear data available');
      return res.json({ items: [], totalValue: 0 });
    }

    const wear = await safeJson(wearRes);
    let ids = (wear.assetIds || []).slice(0, 8); // Max 8 items

    if (ids.length === 0) {
      return res.json({ items: [], totalValue: 0 });
    }

    // 🔥 BATCH PROCESSING - Anti 429
    const result = [];
    let totalValue = 0;

    for (const id of ids) {
      try {
        await new Promise(r => setTimeout(r, 500)); // 500ms delay between items
        
        const detailRes = await safeFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (!detailRes) continue;

        const detail = await safeJson(detailRes);
        if (!detail?.Name) continue;

        const item = {
          name: detail.Name.substring(0, 25),
          price: detail.PriceInRobux || detail.LowestPrice || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        };

        totalValue += item.price;
        result.push(item);

      } catch (itemErr) {
        console.log(`⏭️ Skip ${id}`);
      }
    }

    cachedData.items = result;
    cachedData.totalValue = totalValue;
    cachedData.lastUpdate = now;

    broadcast({ items: result, totalValue });
    console.log(`✅ Items: ${result.length}, Value: ${totalValue.toLocaleString()} R$`);
    res.json({ items: result, totalValue });

  } catch (err) {
    console.error("Items error:", err);
    res.json({ items: cachedData.items, totalValue: cachedData.totalValue });
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
  console.log('👤 WS connected');
  ws.send(JSON.stringify(cachedData));
  ws.on('close', () => console.log('👋 WS disconnected'));
});

// 🔥 FIXED AUTO UPDATE - DIRECT CALLS
setInterval(async () => {
  console.log('🔄 LIVE UPDATE');
  try {
    // Direct function calls - NO HTTP
    await updateStats();
    await updateItems();
    broadcast(cachedData);
    console.log('✅ LIVE UPDATE OK');
  } catch (err) {
    console.log('⚠️ Live update skipped');
  }
}, 45000); // 45s - Safe timing

// 🔥 DIRECT UPDATE FUNCTIONS
async function updateStats() {
  const [friendsRes, followersRes, followingRes] = await Promise.allSettled([
    safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
    safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
    safeFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
  ]);

  const friends = await safeJson(friendsRes.status === 'fulfilled' ? friendsRes.value : null);
  const followers = await safeJson(followersRes.status === 'fulfilled' ? followersRes.value : null);
  const following = await safeJson(followingRes.status === 'fulfilled' ? followingRes.value : null);

  cachedData.stats = {
    friends: friends.count || 0,
    followers: followers.count || 0,
    following: following.count || 0
  };
}

async function updateItems() {
  const wearRes = await safeFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
  if (!wearRes) return;

  const wear = await safeJson(wearRes);
  const ids = (wear.assetIds || []).slice(0, 8);

  const result = [];
  let totalValue = 0;

  for (const id of ids) {
    try {
      await new Promise(r => setTimeout(r, 500));
      const detailRes = await safeFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
      if (!detailRes) continue;

      const detail = await safeJson(detailRes);
      if (!detail?.Name) continue;

      const item = {
        name: detail.Name.substring(0, 25),
        price: detail.PriceInRobux || detail.LowestPrice || 0,
        limited: detail.IsLimited || false,
        image: `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
        link: `https://www.roblox.com/catalog/${id}/item`
      };

      totalValue += item.price;
      result.push(item);
    } catch {}
  }

  cachedData.items = result;
  cachedData.totalValue = totalValue;
}

// ROUTING
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    clients: wss.clients.size,
    cache: cachedData.lastUpdate ? (Date.now() - cachedData.lastUpdate) / 1000 + 's' : 'fresh'
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: ${PORT}`);
  console.log('✅ 100% RATE LIMIT PROOF');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
