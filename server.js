const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// 🔥 SERVE FRONTEND
app.use(express.static(path.join(__dirname, "public")));

const USER_ID = 8941948601;

// 🔥 API ROBLOX
app.get("/api", async (req, res) => {
  try {
    const [friends, followers, following] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r => r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r => r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r => r.json())
    ]);

    res.json({
      friends: friends.count,
      followers: followers.count,
      following: following.count
    });

  } catch (err) {
    res.json({ friends: 0, followers: 0, following: 0 });
  }
});

// 🔥 ROUTE UTAMA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("SERVER LIVE 💀"));
