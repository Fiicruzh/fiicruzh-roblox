const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const USER_ID = 8941948601;

app.get("/api", async (req,res)=>{
  try{
    const [a,b,c] = await Promise.all([
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/friends/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followers/count`).then(r=>r.json()),
      fetch(`https://friends.roblox.com/v1/users/${USER_ID}/followings/count`).then(r=>r.json())
    ]);

    res.json({
      friends:a.count,
      followers:b.count,
      following:c.count
    });

  }catch{
    res.json({friends:0, followers:0, following:0});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server jalan 💀"));
