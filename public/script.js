const API = "/api";
const avatar = document.getElementById("avatar");

// ======================
// 🔥 AVATAR LOAD
// ======================
async function loadAvatar(){
  try{
    const res = await fetch("/api/avatar");
    const data = await res.json();

    if(data.image){
      avatar.src = data.image;
    }else{
      avatar.src = "https://via.placeholder.com/300";
    }

  }catch{
    console.log("avatar fallback");
    avatar.src = "https://via.placeholder.com/300";
  }
}

// ======================
// 🔥 ANIMATE NUMBER
// ======================
function animate(el, end){
  end = Number(end) || 0;

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

// ======================
// 🔥 STATS (ADA FALLBACK)
// ======================
async function loadStats(){
  try{
    const res = await fetch(API);
    const data = await res.json();

    animate(document.getElementById("friends"), data.friends || 120);
    animate(document.getElementById("followers"), data.followers || 999);
    animate(document.getElementById("following"), data.following || 300);

  }catch{
    console.log("fallback stats");

    animate(document.getElementById("friends"), 120);
    animate(document.getElementById("followers"), 999);
    animate(document.getElementById("following"), 300);
  }
}

// ======================
// 🔥 ITEM RARITY
// ======================
function getRarity(price){
  if(price > 10000) return "legendary";
  if(price > 5000) return "epic";
  if(price > 1000) return "rare";
  return "";
}

// ======================
// 🔥 CREATE CARD
// ======================
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

// ======================
// 🔥 RENDER ITEMS
// ======================
function renderItems(items){
  const container = document.getElementById("itemsContainer");
  container.innerHTML = "";

  items.slice(0,20).forEach((item,i)=>{
    container.appendChild(createCard(item,i));
  });
}

// ======================
// 🔥 LOAD ITEMS + FALLBACK
// ======================
async function loadItems(){
  const container = document.getElementById("itemsContainer");

  try{
    const res = await fetch("/api/items");
    const items = await res.json();

    if(!items || items.length === 0){
      throw "EMPTY";
    }

    renderItems(items);

  }catch{
    console.log("fallback items");

    const fallback = [
      {
        name:"Fallback Hat",
        price:5000,
        limited:true,
        image:"https://via.placeholder.com/150",
        link:"#"
      },
      {
        name:"Fallback Sword",
        price:12000,
        limited:true,
        image:"https://via.placeholder.com/150",
        link:"#"
      }
    ];

    renderItems(fallback);
  }
}

// ======================
// 🔥 WEBSOCKET LIVE UPDATE
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
    console.log("WS error", e);
  }
};

// ======================
// 🔥 INTERACTION UI
// ======================
document.querySelectorAll(".buttons a").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform = "scale(0.9)";
    setTimeout(()=>{
      btn.style.transform = "scale(1.05)";
    },150);
  });
});

document.querySelectorAll(".icons a").forEach(icon=>{
  icon.addEventListener("mouseenter", ()=>{
    icon.style.transform = "scale(1.3) rotate(8deg)";
  });

  icon.addEventListener("mouseleave", ()=>{
    icon.style.transform = "scale(1)";
  });
});

// ======================
// 🔥 AVATAR 3D EFFECT
// ======================
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

// ======================
// 🔥 INIT
// ======================
window.addEventListener("DOMContentLoaded", ()=>{
  loadAvatar();
  loadStats();
  loadItems();

  setInterval(loadStats, 5000);
});
