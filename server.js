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

const USER_ID = 8941948601;

// 🔥 CACHE BIAR GA 0 TERUS
let cache = {
  friends: 0,
  followers: 0,
  following: 0
};

// ==========================
// 🔥 API STATS (FIXED)
// ==========================
app.get("/api", async (req,res)=>{
  try{
    const [friendsRes, followersRes, followingRes] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    const friends = await friendsRes.json();
    const followers = await followersRes.json();
    const following = await followingRes.json();

    const data = {
      friends: friends?.count ?? cache.friends,
      followers: followers?.count ?? cache.followers,
      following: following?.count ?? cache.following
    };

    // 🔥 UPDATE CACHE
    cache = data;

    res.json(data);

  }catch(err){
    console.log("API ERROR:", err);

    // 🔥 FALLBACK KE DATA TERAKHIR
    res.json(cache);
  }
});

// ==========================
// 🔥 AVATAR
// ==========================
app.get("/api/avatar", async (req,res)=>{
  try{
    const avatar = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png&isCircular=false`
    ).then(r=>r.json());

    res.json({
      image: avatar.data?.[0]?.imageUrl || null
    });

  }catch{
    res.json({image:null});
  }
});

// ==========================
// 🔥 ITEMS
// ==========================
app.get("/api/items", async (req,res)=>{
  try{
    const wear = await fetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    ).then(r=>r.json());

    let ids = wear.assetIds || [];

    if(ids.length === 0){
      return res.json([]);
    }

    const thumbs = await fetch(
      `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}&size=150x150&format=Png`
    ).then(r=>r.json());

    const result = [];

    for(const id of ids){
      try{
        const detail = await fetch(
          `https://economy.roblox.com/v2/assets/${id}/details`
        ).then(r=>r.json());

        const thumb = thumbs.data?.find(t => t.targetId === id);

        result.push({
          name: detail.Name || "Unknown",
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || "https://via.placeholder.com/150",
          link: `https://www.roblox.com/catalog/${id}`
        });

      }catch{
        result.push({
          name:"Unknown",
          price:0,
          limited:false,
          image:"https://via.placeholder.com/150",
          link:"#"
        });
      }
    }

    res.json(result);

  }catch(err){
    console.log("ITEM ERROR:", err);
    res.json([]);
  }
});

// ==========================
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER LIVE ⚡"));
