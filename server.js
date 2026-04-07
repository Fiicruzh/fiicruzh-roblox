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

// 🔥 AVATAR AUTO ROBLOX
app.get("/api/avatar", async (req,res)=>{
  try{
    const response = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    );

    const data = await response.json();

    res.json({
      avatar: data.data?.[0]?.imageUrl || ""
    });

  }catch(err){
    res.json({ avatar:"" });
  }
});


// 🔥 ITEMS + DETAIL + RARITY + PRICE
app.get("/api/items", async (req,res)=>{
  try{
    const wearRes = await fetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );

    const wearData = await wearRes.json();
    let ids = wearData.assetIds;

    if(!ids || ids.length === 0){
      return res.json([]);
    }

    // 🔥 THUMBNAIL SEKALI
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png&isCircular=false`
    );

    const thumbData = await thumbRes.json();

    const result = [];

    for(let i=0;i<ids.length;i++){
      const id = ids[i];

      try{
        const detailRes = await fetch(
          `https://economy.roblox.com/v2/assets/${id}/details`
        );

        const d = await detailRes.json();

        // 🔥 RARITY SYSTEM
        let rarity = "common";
        if(d.IsLimited || d.IsLimitedUnique) rarity = "limited";
        else if(d.PriceInRobux > 1000) rarity = "legendary";
        else if(d.PriceInRobux > 200) rarity = "epic";

        result.push({
          name: d.Name || "Unknown",
          price: d.PriceInRobux || 0,
          limited: d.IsLimited || d.IsLimitedUnique || false,
          rarity: rarity,
          image: thumbData.data?.[i]?.imageUrl || "",
          link: `https://www.roblox.com/catalog/${id}`
        });

      }catch{
        result.push({
          name:"Unknown",
          price:0,
          limited:false,
          rarity:"common",
          image: thumbData.data?.[i]?.imageUrl || "",
          link:`https://www.roblox.com/catalog/${id}`
        });
      }
    }

    res.json(result);

  }catch(err){
    console.log("ITEM ERROR:", err);
    res.json([]);
  }
});

// 🔥 WEBSOCKET
wss.on("connection", (ws)=>{
  const send = async ()=>{
    const data = await getRobloxData();
    ws.send(JSON.stringify(data));
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
