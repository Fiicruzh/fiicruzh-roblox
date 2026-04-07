const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

// 🔥 USERNAME (AUTO DETECT)
const USERNAME = "dapaarowr4";

// ==========================
// 🔥 GET USER ID
// ==========================
async function getUserId(){
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [USERNAME] })
  });

  const data = await res.json();
  return data.data?.[0]?.id;
}

// ==========================
// 🔥 STATS
// ==========================
app.get("/api", async (req,res)=>{
  try{
    const userId = await getUserId();

    const [friends, followers, following] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`).then(r=>r.json())
    ]);

    res.json({
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    });

  }catch{
    res.json({friends:100,followers:500,following:200});
  }
});

// ==========================
// 🔥 AVATAR 3D FIX (NO IFRAME)
// ==========================
app.get("/api/avatar", async (req,res)=>{
  try{
    const userId = await getUserId();

    const avatar = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-3d?userIds=${userId}`
    ).then(r=>r.json());

    res.json({
      image: avatar.data?.[0]?.imageUrl
    });

  }catch{
    res.json({image:null});
  }
});

// ==========================
// 🔥 FULL INVENTORY
// ==========================
app.get("/api/items", async (req,res)=>{
  try{
    const userId = await getUserId();

    const inv = await fetch(
      `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=30`
    ).then(r=>r.json());

    const items = inv.data || [];

    const result = items.map(item => ({
      name: item.name,
      price: item.recentAveragePrice || 0,
      limited: true,
      image: item.thumbnail?.url || "https://via.placeholder.com/150",
      link: `https://www.roblox.com/catalog/${item.assetId}`
    }));

    res.json(result);

  }catch(err){
    console.log("INV ERROR", err);
    res.json([]);
  }
});

// ==========================
// 🔴 WEBSOCKET LIVE
// ==========================
wss.on("connection", (ws)=>{

  const sendData = async ()=>{
    try{
      const stats = await fetch("http://localhost:3000/api").then(r=>r.json());
      const items = await fetch("http://localhost:3000/api/items").then(r=>r.json());

      ws.send(JSON.stringify({
        type:"stats",
        data:stats
      }));

      ws.send(JSON.stringify({
        type:"items",
        data:items
      }));

    }catch{}
  };

  sendData();
  const interval = setInterval(sendData, 5000);

  ws.on("close", ()=>clearInterval(interval));
});

// ==========================
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER DEWA LIVE 🚀"));
