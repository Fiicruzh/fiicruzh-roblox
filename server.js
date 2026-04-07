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

// 🔥 CORRECT USER ID - Ganti dengan ID Roblox FiiCruzh yang bener!
const USER_ID = 8941948601; // Pastikan ini ID yang benar!

let cachedData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  totalValue: 0,
  lastUpdate: 0
};

let clientCount = 0;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// STATS API
app.get("/api", async (req, res) => {
  try {
    console.log(`📊 Stats request for user ${USER_ID}`);
    
    const [friends, followers, following] = await Promise.allSettled([
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetchWithRetry(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: (await friends.value?.json().catch(() => ({}))).count || 0,
      followers: (await followers.value?.json().catch(() => ({}))).count || 0,
      following: (await following.value?.json().catch(() => ({}))).count || 0
    };

    cachedData.stats = stats;
    console.log('✅ Stats:', stats);
    
    if (clientCount > 0) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ stats }));
        }
      });
    }

    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.json(cachedData.stats);
  }
});

// AVATAR API
app.get("/api/avatar", async (req, res) => {
  try {
    const avatarRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    const avatar = await avatarRes.json();
    
    const imageUrl = avatar.data?.[0]?.imageUrl;
    console.log('🖼️ Avatar:', imageUrl);
    
    res.json({ image: imageUrl });
  } catch (err) {
    console.error('Avatar error:', err);
    res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
  }
});

// ITEMS API
app.get("/api/items", async (req, res) => {
  try {
    console.log('🎒 Items request...');
    
    const wearRes = await fetchWithRetry(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    const wear = await wearRes.json();
    const assetIds = wear.assetIds || [];
    
    console.log('Asset IDs:', assetIds);
    
    if (assetIds.length === 0) {
      return res.json({ items: [], totalValue: 0 });
    }

    // Thumbnails
    const thumbsRes = await fetchWithRetry(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
    );
    const thumbs = await thumbsRes.json();

    // Process items
    const items = [];
    let totalValue = 0;

    for (const assetId of assetIds.slice(0, 12)) {
      try {
        const detailRes = await fetchWithRetry(`https://economy.roblox.com/v2/assets/${assetId}/details`);
        const detail = await detailRes.json();
        
        const thumb = thumbs.data?.find(t => t.targetId == assetId);

        const item = {
          name: detail.Name || `Item #${assetId}`,
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || false,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${assetId}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${assetId}/item`
        };

        totalValue += item.price;
        items.push(item);
      } catch (e) {
        console.log(`Item ${assetId} skipped`);
      }
    }

    cachedData.items = items;
    cachedData.totalValue = totalValue;
    
    console.log(`✅ ${items.length} items loaded, total: ${totalValue} R$`);
    
    if (clientCount > 0) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ items, totalValue }));
        }
      });
    }

    res.json({ items, totalValue });
  } catch (err) {
    console.error('Items error:', err);
    res.json({ items: cachedData.items, totalValue: cachedData.totalValue });
  }
});

// WEBSOCKET
wss.on('connection', (ws) => {
  clientCount++;
  console.log(`👤 Client ${clientCount} connected`);
  
  ws.send(JSON.stringify(cachedData));
  
  ws.on('close', () => {
    clientCount--;
    console.log(`👋 Active clients: ${clientCount}`);
  });
});

// SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// HEALTH
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    clients: clientCount,
    userId: USER_ID 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`👤 User ID: ${USER_ID}`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
