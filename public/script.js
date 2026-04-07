const API = "/api";

async function loadAvatar(){
  try{
    const res = await fetch("/api/avatar");
    const data = await res.json();

    if(data.image){
      document.getElementById("avatar").src = data.image;
    }
  }catch{
    console.log("avatar error");
  }
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
  loadAvatar();
  loadStats();
  loadItems();
});

function getRarity(price){
  if(price > 10000) return "legendary";
  if(price > 5000) return "epic";
  if(price > 1000) return "rare";
  return "normal";
}

function getRarity(price){
  if(price > 10000) return "legendary";
  if(price > 5000) return "epic";
  if(price > 1000) return "rare";
  return "";
}

function createCard(item, index){
  const rarity = getRarity(item.price);

  const div = document.createElement("div");
  div.className = `item-card ${rarity}`;

  div.innerHTML = `
    ${index === 0 ? '<div class="equipped">ON</div>' : ''}
    ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
    <img src="${item.image}">
    <div class="item-name">${item.name}</div>
    <div class="item-price">${item.price} R$</div>
  `;

  div.onclick = ()=> window.open(item.link);

  return div;
}

function renderItems(items){
  const container = document.getElementById("itemsContainer");
  container.innerHTML = "";

  items.slice(0,20).forEach((item,i)=>{
    container.appendChild(createCard(item,i));
  });
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

// ======================
// 🔴 WEBSOCKET LIVE UPDATE
// ======================

const ws = new WebSocket(
  location.protocol === "https:"
    ? "wss://" + location.host
    : "ws://" + location.host
);

ws.onmessage = (msg)=>{
  try{
    const data = JSON.parse(msg.data);

    if(data.type === "stats"){
      animate(document.getElementById("friends"), data.data.friends);
      animate(document.getElementById("followers"), data.data.followers);
      animate(document.getElementById("following"), data.data.following);
    }

    if(data.type === "items"){
      renderItems(data.data);
    }

  }catch(e){
    console.log("WS ERROR", e);
  }
};

async function loadStats(){
  try{
    const res = await fetch("/api");
    const data = await res.json();

    animate(document.getElementById("friends"), data.friends);
    animate(document.getElementById("followers"), data.followers);
    animate(document.getElementById("following"), data.following);
  }catch{
    console.log("fallback stats gagal");
  }
}

async function loadItems(){
  try{
    const res = await fetch("/api/items");
    const items = await res.json();
    renderItems(items);
  }catch{
    console.log("fallback item gagal");
  }
}
