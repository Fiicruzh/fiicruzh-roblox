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
app.get("/api", async (req,res)=>{
  const data = await getRobloxData();
  res.json(data);
});

app.get("/api/items", async (req,res)=>{
  try{
    const wearRes = await fetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );

    const wearData = await wearRes.json();

    let ids = wearData.assetIds;

    // fallback kalau kosong
    if(!ids || ids.length === 0){
      ids = [
        2510233257,
        13948472096,
        14618207727,
        72586402670658,
        88273993498454
      ];
    }
    
// 🔥 FULL INVENTORY ROBLOX
app.get("/api/inventory", async (req,res)=>{
  try{
    const response = await fetch(
      `https://inventory.roblox.com/v2/users/${USER_ID}/inventory?assetTypes=Hat,Face,Accessory,HairAccessory&limit=20&sortOrder=Desc`
    );

    const data = await response.json();

    if(!data.data){
      return res.json([]);
    }

    const ids = data.data.map(item=>item.assetId);

    // thumbnail
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png&isCircular=false`
    );

    const thumbData = await thumbRes.json();

    const result = data.data.map((item,i)=>({
      id: item.assetId,
      name: item.name,
      image: thumbData?.data?.[i]?.imageUrl,
      link: `https://www.roblox.com/catalog/${item.assetId}`,
      price: item.recentAveragePrice || 0,
      limited: item.isLimited || false
    }));

    res.json(result);

  }catch(err){
    console.log("❌ INVENTORY ERROR:", err);
    res.json([]);
  }
});
    
    // 🔥 ambil thumbnail sekali
    const thumbRes = await fetch(
      "https://thumbnails.roblox.com/v1/assets?assetIds=" + ids.join(",") + "&size=150x150&format=Png&isCircular=false"
    );

    const thumbData = await thumbRes.json();

    const result = [];

    // 🔥 LOOP SATU-SATU (ANTI ERROR)
    for(let i=0;i<ids.length;i++){
      const id = ids[i];

      try{
        const detailRes = await fetch(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );

        const detail = await detailRes.json();

        result.push({
          name: detail.Name || "Unknown Item",
          image: thumbData.data?.[i]?.imageUrl || "https://via.placeholder.com/150",
          link: `https://www.roblox.com/catalog/${id}`
        });

      }catch(e){
        result.push({
          name: "Unknown Item",
          image: thumbData.data?.[i]?.imageUrl || "https://via.placeholder.com/150",
          link: `https://www.roblox.com/catalog/${id}`
        });
      }
    }

    res.json(result);

  }catch(err){
    console.log("❌ ERROR ROBLOX:", err);

    res.json([
      {
        name:"Fallback",
        image:"https://via.placeholder.com/150",
        link:"#"
      }
    ]);
  }
});

// 🔥 WEBSOCKET
wss.on("connection", (ws)=>{

  const send = async ()=>{
    const stats = await getRobloxData();

    let items = [];

    try{
      const res = await fetch(`http://localhost:${PORT}/api/inventory`);
      items = await res.json();
    }catch(e){}

    ws.send(JSON.stringify({
      stats,
      items
    }));
  };

  send();
  const interval = setInterval(send, 5000);

  ws.on("close", ()=>clearInterval(interval));
});

// 🔥 ROUTE
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER LIVE ⚡ FIXED"));
