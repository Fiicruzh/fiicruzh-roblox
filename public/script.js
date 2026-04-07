const API = "/api";

// =====================
// 🔥 AVATAR
// =====================
async function loadAvatar(){
  try{
    const res = await fetch("/api/avatar");
    const data = await res.json();

    if(data.image){
      document.getElementById("avatar").src = data.image;
    }
  }catch{
    console.log("Avatar gagal load");
  }
}

// =====================
// 🔥 ANIMATE NUMBER
// =====================
function animate(el, end){
  end = Number(end) || 0;

  let startTime = null;

  function step(t){
    if(!startTime) startTime = t;

    let progress = t - startTime;
    let duration = 1200;

    let value = Math.floor(progress / duration * end);
    if(value > end) value = end;

    el.innerText = value;

    if(progress < duration){
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// =====================
// 🔥 LOAD STATS + FALLBACK
// =====================
async function loadStats(){
  try{
    const res = await fetch(API);
    const data = await res.json();

    animate(document.getElementById("friends"), data.friends || 0);
    animate(document.getElementById("followers"), data.followers || 0);
    animate(document.getElementById("following"), data.following || 0);

  }catch{
    // fallback biar ga 0 kosong
    animate(document.getElementById("friends"), 120);
    animate(document.getElementById("followers"), 999);
    animate(document.getElementById("following"), 50);
  }
}

// =====================
// 🔥 ITEMS
// =====================
function getRarity(price){
  if(price > 10000) return "legendary";
  if(price > 5000) return "epic";
  if(price > 1000) return "rare";
  return "normal";
}

function createCard(item, index){
  const div = document.createElement("div");
  div.className = `item-card ${getRarity(item.price)}`;

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

async function loadItems(){
  const container = document.getElementById("itemsContainer");

  container.innerHTML = "";

  // skeleton
  for(let i=0;i<5;i++){
    const sk = document.createElement("div");
    sk.className = "skeleton";
    container.appendChild(sk);
  }

  try{
    const res = await fetch("/api/items");
    const items = await res.json();

    container.innerHTML = "";

    const finalItems = (items && items.length) ? items : [
      {name:"Item Dummy", price:1000, image:"https://via.placeholder.com/150", link:"#"},
      {name:"Item Dummy", price:2000, image:"https://via.placeholder.com/150", link:"#"},
      {name:"Item Dummy", price:5000, image:"https://via.placeholder.com/150", link:"#"}
    ];

    finalItems.forEach((item,i)=>{
      container.appendChild(createCard(item,i));
    });

  }catch{
    container.innerHTML = "<p>Gagal load item</p>";
  }
}

// =====================
// 🚀 INIT
// =====================
window.addEventListener("DOMContentLoaded", ()=>{
  loadAvatar();
  loadStats();
  loadItems();

  setInterval(loadStats, 5000);
});
