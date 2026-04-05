const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

// 🔥 CACHE SYSTEM
let cache = {
  data: { friends: 0, followers: 0, following: 0 },
  lastFetch: 0
};

const CACHE_TIME = 10000; // 10 detik

async function getRobloxData(){
  const now = Date.now();

  // pakai cache kalau masih fresh
  if(now - cache.lastFetch < CACHE_TIME){
    return cache.data;
  }

  try{
    const [friends, followers, following] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r=>r.json())
    ]);

    cache.data = {
      friends: friends.count || 0,
      followers: followers.count || 0,
      following: following.count || 0
    };

    cache.lastFetch = now;

    return cache.data;

  }catch(err){
    console.log("ERROR FETCH:", err);
    return cache.data;
  }
}

// 🔥 API
app.get("/api", async (req, res)=>{
  const data = await getRobloxData();
  res.json(data);
});

// 🔥 WEBSOCKET REALTIME
wss.on("connection", (ws)=>{
  console.log("CLIENT CONNECTED 🔗");

  const sendData = async ()=>{
    const data = await getRobloxData();
    ws.send(JSON.stringify(data));
  };

  sendData();

  const interval = setInterval(sendData, 5000);

  ws.on("close", ()=>{
    clearInterval(interval);
    console.log("CLIENT DISCONNECTED ❌");
  });
});

// 🔥 ROUTE
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER LIVE ⚡ REALTIME"));
