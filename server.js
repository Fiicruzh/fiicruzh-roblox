const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Roblox User ID
const USER_ID = 8941948601;

let currentData = {
  stats: { friends: 0, followers: 0, following: 0 },
  items: [],
  lastItemsUpdate: 0
};

const getCurrentHost = () => {
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}`;
  }
  return `http://localhost:${PORT}`;
};

async function robloxFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }
    } catch (err) {
      console.log(`Roblox retry ${i + 1}:`, err.message);
      if (i === retries - 1) return { success: false, error: err.message };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

app.get("/api", async (req, res) => {
  console.log('📊 Fetching stats...');
  
  try {
    const [friendsRes, followersRes, followingRes] = await Promise.all([
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      robloxFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const stats = {
      friends: friendsRes.success ? (friendsRes.data.count || 0) : 0,
      followers: followersRes.success ? (followersRes.data.count || 0) : 0,
      following: followingRes.success ? (followingRes.data.count || 0) : 0
    };

    currentData.stats = stats;
    broadcast({ stats });
    
    console.log('✅ Stats:', stats);
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.json(currentData.stats);
  }
});

app.get("/api/avatar", async (req, res) => {
  console.log('👤 Fetching avatar...');
  
  try {
    const avatarRes = await robloxFetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );
    
    let imageUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`;
    
    if (avatarRes.success && avatarRes.data.data?.[0]?.imageUrl) {
      imageUrl = avatarRes.data.data[0].imageUrl;
    }
    
    console.log('✅ Avatar:', imageUrl);
    res.json({ image: imageUrl });
  } catch (err) {
    console.error('Avatar error:', err);
    res.json({ image: `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png` });
  }
});

app.get("/api/items", async (req, res) => {
  console.log('🎒 Fetching items...');
  
  try {
    const wearRes = await robloxFetch(`https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`);
    
    if (!wearRes.success || !wearRes.data.assetIds?.length) {
      console.log('❌ No items');
      currentData.items = [];
      broadcast({ items: [], itemsCount: 0 });
      return res.json({ items: [], totalValue: 0 });
    }

    const assetIds = wearRes.data.assetIds.slice(0, 20);
    
    const thumbsRes = await robloxFetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${assetIds.join(',')}&size=150x150&format=Png`
    );
    const thumbs = thumbsRes.success ? (thumbsRes.data.data || []) : [];

    const itemPromises = assetIds.map(async (id) => {
      try {
        const detailRes = await robloxFetch(`https://economy.roblox.com/v2/assets/${id}/details`);
        if (!detailRes.success) return null;

        const detail = detailRes.data;
        const thumb = thumbs.find(t => t.targetId == parseInt(id));
        
        return {
          name: detail.Name || `Item #${id}`,
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || `https://www.roblox.com/asset-thumbnail/image?assetId=${id}&width=150&height=150&format=png`,
          link: `https://www.roblox.com/catalog/${id}/item`
        };
      } catch {
        // ✅ FIXED: Convert id to string before slice
        const idStr = String(id);
        return {
          name: `Item #${id}`,
          price: 0,
          limited: false,
          image: `https://via.placeholder.com/90x70/333/fff?text=ID${idStr.slice(-4)}`,
          link: `https://www.roblox.com/catalog/${id}`
        };
      }
    });

    const items = (await Promise.all(itemPromises)).filter(Boolean);
    currentData.items = items;
    
    broadcast({ items, itemsCount: items.length });
    
    console.log(`✅ Items: ${items.length}`);
    res.json({
      items,
      totalValue: items.reduce((sum, i) => sum + (i.price || 0), 0)
    });
    
  } catch (err) {
    console.error('Items error:', err);
    res.json({ items: currentData.items, totalValue: 0 });
  }
});

function broadcast(data) {
  const message = JSON.stringify(data);
  let sent = 0;
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sent++;
      } catch (err) {}
    }
  });
  if (sent > 0) console.log(`📡 Broadcast: ${sent} clients`);
}

wss.on('connection', (ws) => {
  console.log('👤 Client connected');
  ws.send(JSON.stringify({
    stats: currentData.stats,
    items: currentData.items,
    itemsCount: currentData.items.length
  }));
  ws.on('close', () => console.log('👋 Client disconnected'));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    port: PORT,
    clients: wss.clients.size,
    stats: currentData.stats,
    itemsCount: currentData.items.length 
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server: port ${PORT}`);
  console.log(`✅ FIXED - No more slice errors`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
