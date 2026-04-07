const API = "/api";

function getRarity(item){
  if(item.limited) return "legendary";
  if(item.price > 10000) return "epic";
  if(item.price > 1000) return "rare";
  return "common";
}

// 🔥 ANIMASI ANGKA (ANTI NaN)
function animate(el, end){
  end = Number(end) || 0; // FIX NaN

  let start = 0;
  let duration = 1200;
  let startTime = null;

  function step(t){
    if(!startTime) startTime = t;
    let progress = t - startTime;

    let value = Math.floor(progress / duration * end);
    if(value > end) value = end;

    el.innerText = value;

    if(progress < duration){
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// 🔥 LOAD DATA ROBLOX (ANTI ERROR)
async function loadStats(){
  try{
    const res = await fetch(API);

    if(!res.ok) throw new Error("API ERROR");

    const data = await res.json();

    console.log("DATA ROBLOX:", data); // debug

    animate(document.getElementById("friends"), data.friends);
    animate(document.getElementById("followers"), data.followers);
    animate(document.getElementById("following"), data.following);

  }catch(err){
    console.error("GAGAL LOAD:", err);

    // fallback kalau error
    animate(document.getElementById("friends"), 0);
    animate(document.getElementById("followers"), 0);
    animate(document.getElementById("following"), 0);
  }
}

// 🔥 LOAD AWAL + AUTO REFRESH
loadStats();
setInterval(loadStats, 5000);

// 🔥 EFEK KLIK BUTTON
document.querySelectorAll(".buttons a").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform = "scale(0.9)";
    setTimeout(()=>{
      btn.style.transform = "scale(1.05)";
    },150);
  });
});

// 🔥 HOVER ICON LEBIH HIDUP
document.querySelectorAll(".icons a").forEach(icon=>{
  icon.addEventListener("mouseenter", ()=>{
    icon.style.transform = "scale(1.3) rotate(8deg)";
  });

  icon.addEventListener("mouseleave", ()=>{
    icon.style.transform = "scale(1)";
  });
});

// 🔥 AVATAR INTERAKTIF (FOLLOW MOUSE)
const avatar = document.getElementById("avatar");

if(avatar){
  document.addEventListener("mousemove", (e)=>{
    let x = (window.innerWidth / 2 - e.clientX) / 25;
    let y = (window.innerHeight / 2 - e.clientY) / 25;

    avatar.style.transform = `rotateY(${x}deg) rotateX(${y}deg) scale(1.05)`;
  });

  document.addEventListener("mouseleave", ()=>{
    avatar.style.transform = "rotateY(0deg) rotateX(0deg)";
  });
}

// ============================
// 🔥 ROBLOX ITEMS FINAL SYSTEM
// ============================

window.addEventListener("DOMContentLoaded", ()=>{
  loadItems();
});

function createCard(item){
  const div = document.createElement("div");

  const rarity = getRarity(item);

  div.className = `item-card ${rarity}`;

  div.innerHTML = `
    <img src="${item.image || 'https://via.placeholder.com/150'}">
    <div class="item-name">${item.name}</div>
    ${item.price ? `<div style="font-size:9px;color:lime">${item.price} R$</div>` : ""}
    ${item.limited ? `<div style="color:violet;font-size:9px">LIMITED</div>` : ""}
  `;

  div.onclick = ()=> window.open(item.link,"_blank");

  return div;
}

async function loadItems(){
  const container = document.getElementById("itemsContainer");
  if(!container) return;

  // skeleton loading
  container.innerHTML = "";
  for(let i=0;i<5;i++){
    const sk = document.createElement("div");
    sk.className = "skeleton";
    container.appendChild(sk);
  }

  try{
    const res = await fetch("/api/items");
    const items = await res.json();

    container.innerHTML = "";

    // fallback kalau kosong
    const finalItems = (items && items.length) ? items : [
      {name:"No Item", image:"https://via.placeholder.com/150", link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", link:"#"}
    ];

    finalItems.slice(0,20).forEach((item,i)=>{
      container.appendChild(createCard(item,i));
    });

  }catch(err){
    console.log("ITEM ERROR:", err);
    container.innerHTML = "<p style='font-size:11px'>Gagal load item</p>";
  }
}

async function loadAvatar(){
  try{
    const res = await fetch("/api/avatar");
    const data = await res.json();

    document.getElementById("avatar").src = data.avatar;
  }catch(e){
    console.log("AVATAR ERROR");
  }
}

loadAvatar();
