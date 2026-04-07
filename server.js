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

// 🔥 USERNAME SUPPORT
const USERNAME = "dapaarowr4";
let USER_ID = null;

// 🔥 SMART RETRY FETCH
async function smartFetch(url, retries = 3){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error("fail");
    return await res.json();
  }catch{
    if(retries > 0){
      await new Promise(r => setTimeout(r, 500));
      return smartFetch(url, retries - 1);
    }
    return null;
  }
}

// 🔥 GET USER ID FROM USERNAME
async function getUserId(){
  const data = await smartFetch("https://users.roblox.com/v1/usernames/users", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ usernames:[USERNAME] })
  });

  if(data?.data?.[0]){
    USER_ID = data.data[0].id;
  }
}

// ==========================
// 🔥 API STATS
// ==========================
app.get("/api", async (req,res)=>{
  try{
    if(!USER_ID) await getUserId();

    const [friends, followers, following] = await Promise.all([
      smartFetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`),
      smartFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`),
      smartFetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`)
    ]);

    res.json({
      friends: friends?.count || 0,
      followers: followers?.count || 0,
      following: following?.count || 0
    });

  }catch{
    res.json({friends:0,followers:0,following:0});
  }
});

// ==========================
// 🔥 AVATAR
// ==========================
app.get("/api/avatar", async (req,res)=>{
  if(!USER_ID) await getUserId();

  const avatar = await smartFetch(
    `https://thumbnails.roblox.com/v1/users/avatar?userIds=${USER_ID}&size=420x420&format=Png`
  );

  res.json({
    image: avatar?.data?.[0]?.imageUrl || null
  });
});

// ==========================
// 🔥 ITEMS + TOTAL PRICE
// ==========================
app.get("/api/items", async (req,res)=>{
  if(!USER_ID) await getUserId();

  const wear = await smartFetch(
    `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
  );

  const ids = wear?.assetIds || [];

  if(!ids.length) return res.json({items:[], total:0});

  const thumbs = await smartFetch(
    `https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(",")}`
  );

  let total = 0;
  const result = [];

  for(const id of ids){
    const detail = await smartFetch(
      `https://economy.roblox.com/v2/assets/${id}/details`
    );

    const thumb = thumbs?.data?.find(t => t.targetId === id);

    const price = detail?.PriceInRobux || 0;
    total += price;

    result.push({
      name: detail?.Name || "Unknown",
      price,
      limited: detail?.IsLimited || detail?.IsLimitedUnique || false,
      image: thumb?.imageUrl || "",
      link: `https://www.roblox.com/catalog/${id}`
    });
  }

  res.json({items:result, total});
});

// ==========================
// 🔥 WEBSOCKET REALTIME
// ==========================
wss.on("connection", (ws)=>{
  console.log("Client connected");

  setInterval(async ()=>{
    if(!USER_ID) await getUserId();

    const wear = await smartFetch(
      `https://avatar.roblox.com/v1/users/${USER_ID}/currently-wearing`
    );

    ws.send(JSON.stringify(wear));
  }, 5000);
});

// ==========================
app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log("SERVER LIVE ⚡"));
