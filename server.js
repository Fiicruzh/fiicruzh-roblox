const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

// 🔥 FIX FETCH (WAJIB)
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

// 🔥 CACHE
let cache = {
  data: {
    friends: 0,
    followers: 0,
    following: 0,
    online: false
  },
  lastFetch: 0
};

const CACHE_TIME = 10000;

async function getRobloxData(){
  const now = Date.now();

  if(now - cache.lastFetch < CACHE_TIME){
    return cache.data;
  }

  try{
    const [friends, followers, following, status] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r=>r.json()),
      fetch(`https://presence.roblox.com/v1/presence/users`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ userIds:[USER_ID] })
      }).then(r=>r.json())
    ]);

    const isOnline = status?.userPresences?.[0]?.userPresenceType !== 0;

    cache.data = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0,
      online: isOnline
    };

    cache.lastFetch = now;

    return cache.data;

  }catch(err){
    console.log("ERROR FETCH:", err);
    return cache.data;
  }
}

// 🔥 API
// 🔥 REAL EQUIPPED ITEMS (100% WORK)
app.get("/api/items", async (req,res)=>{
  try{
    const response = await fetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );

    const data = await response.json();

    if(!data.assetIds || data.assetIds.length === 0){
      return res.json([]);
    }

    // 🔥 ambil 5 pertama
    const ids = data.assetIds.slice(0,5);

    const result = ids.map(id=>({
      name: "Equipped Item",
      image: `https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=150x150&format=Png&isCircular=false`,
      link: `https://www.roblox.com/catalog/${id}`
    }));

    res.json(result);

  }catch(err){
    console.log("EQUIPPED ERROR:", err);
    res.json([]);
  }
});

// 🔥 ROUTE
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});
// 🔥 ITEMS ROBLOX
app.get("/api", async (req,res)=>{
  try{
    const response = await fetch(
      `https://inventory.roblox.com/v2/users/${USER_ID}/inventory?limit=10&sortOrder=Desc`
    );

    const data = await response.json();

    console.log("INVENTORY:", data);

    if(!data.data || data.data.length === 0){
      return res.json([]);
    }

    const result = data.data.slice(0,5).map(item=>({
      name: item.name,
      image: `https://thumbnails.roblox.com/v1/assets?assetIds=${item.assetId}&size=150x150&format=Png&isCircular=false`,
      link: `https://www.roblox.com/catalog/${item.assetId}`
    }));

    res.json(result);

  }catch(err){
    console.log("ITEM ERROR:", err);
    res.json([]);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER LIVE ⚡ FIXED"));
