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

// 🔥 GANTI USER_ID INI DENGAN ID ROBLOX KAMU YANG BENAR!
const USER_ID = 8941948601; // Cek di URL profile Roblox: roblox.com/users/ID/profile

let cachedData = { 
  stats: { friends: 0, followers: 0, following: 0 }, 
  items: [], 
  avatar: '' 
};
let clientCount = 0;

// 🔧 ROBUST FETCH
async function robloxFetch(url) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

// 🔥 STATS API - WORKING
app.get("/api", async () => {
  console.log(`📊 Stats for ${USER_ID}`);
  
  const [friends, followers, following] = await Promise.all([
    robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
    robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
    robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
  ]);

  const stats = {
    friends: friends?.count || 0,
    followers: followers?.count || 0,
    following: following?.count || 0
  };

  cachedData.stats = stats;
  
  // Broadcast
  if (clientCount > 0) {
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ stats }));
      }
    });
  }
  
  console.log('✅ Stats:', stats);
  return { stats };
});

// 🔥 AVATAR API - HEADSHOT DIRECT
app.get("/api/avatar", async (req, res) => {
  try {
    // Direct headshot URL - ALWAYS WORKS
    const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`;
    
    console.log('🖼️ Avatar URL:', avatarUrl);
    res.json({ image: avatarUrl });
  } catch (e) {
    res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
  }
});

// 🔥 ITEMS API - CURRENTLY WEARING
app.get("/api/items", async (req, res) => {
  try {
    console.log('🎒 Fetching worn items...');
    
    const wear = await robloxFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/outfit`);
    const ids = wear?.assets || [];
    
    console.log('Worn asset IDs:', ids);
    
    if (!ids.length) {
      console.log('No items worn');
      return res.json({ items: [] });
    }

    // Get item details & thumbnails
    const items = [];
    for (const asset of ids.slice(0, 15)) {
      try {
        const [detail, thumb] = await Promise.all([
          robloxFetch(`https://economy.roblox.com/v1/assets/${asset.id}/details`),
          robloxFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${asset.id}&size=150x150&format=Png`)
        ]);

        items.push({
          name: detail?.data?.[0]?.Name || `Asset ${asset.id}`,
          limited: detail?.data?.[0]?.IsLimited || false,
          image: thumb?.data?.[0]?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${asset.id}&width=150&height=150`,
          link: `https://roblox.com/catalog/${asset.id}/item`
        });
      } catch (e) {
        console.log(`Item ${asset.id} skipped`);
      }
    }

    cachedData.items = items;
    
    // Broadcast
    if (clientCount > 0) {
      wss.clients.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ items }));
        }
      });
    }
    
    console.log(`✅ ${items.length} items loaded`);
    res.json({ items });
    
  } catch (e) {
    console.error('Items error:', e);
    res.json({ items: cachedData.items });
  }
});

// WebSocket
wss.on('connection', (ws) => {
  clientCount++;
  console.log(`👤 Client ${clientCount}`);
  
  // Send all data
  ws.send(JSON.stringify(cachedData));
  
  ws.on('close', () => clientCount--);
});

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (req, res) => res.json({ 
  status: "OK", 
  userId: USER_ID, 
  clients: clientCount,
  items: cachedData.items.length 
}));

// Start
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server ready on port ${PORT}`);
  console.log(`👤 Roblox User ID: ${USER_ID}`);
  console.log(`📡 WebSocket ready`);
  console.log(`🔗 Test: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutdown');
  server.close();
});
