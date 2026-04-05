const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

// 🔥 FETCH DENGAN RETRY (ANTI ERROR ROBLOX)
async function fetchWithRetry(url, retries = 3){
  for(let i = 0; i < retries; i++){
    try{
      const res = await fetch(url);
      const data = await res.json();

      if(data && typeof data.count === "number"){
        return data.count;
      }

    }catch(e){
      console.log("Retry fetch:", url);
    }
  }

  return 0;
}

// 🔥 API ROBLOX SUPER STABLE
app.get("/api", async (req, res) => {
  try {

    const friends = await fetchWithRetry(
      `https://friends.roblox.com/v1/users/${USER_ID}/friends/count`
    );

    const followers = await fetchWithRetry(
      `https://friends.roblox.com/v1/users/${USER_ID}/followers/count`
    );

    const following = await fetchWithRetry(
      `https://friends.roblox.com/v1/users/${USER_ID}/followings/count`
    );

    res.json({
      friends,
      followers,
      following
    });

  } catch (err) {
    console.error("API ERROR:", err);

    res.json({
      friends: 0,
      followers: 0,
      following: 0
    });
  }
});

// ROUTE
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER LIVE 🔥"));
