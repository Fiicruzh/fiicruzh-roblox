const API = "/api";
const USERNAME = "dapaarowr4";
let USER_ID = null;

async function getUserId(){
  try{
    const res = await fetch(`/api/user/${USERNAME}`);
    const data = await res.json();
    USER_ID = data.id;
  }catch{
    console.log("Gagal ambil USER_ID");
  }
}

// ======================
// 🔥 AVATAR
// ======================
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
// 🔥 LOAD STATS (FIX 0 PALSU)
// ======================
async function loadStats(){
  try{
    const res = await fetch(API);
    const data = await res.json();

    console.log("DATA:", data);

    const friends = data?.friends ?? 0;
    const followers = data?.followers ?? 0;
    const following = data?.following ?? 0;

    animate(document.getElementById("friends"), friends);
    animate(document.getElementById("followers"), followers);
    animate(document.getElementById("following"), following);

  }catch(err){
    console.log("ERROR:", err);
  }
}

// ======================
// 🔥 RARITY SYSTEM
// ======================
function getRarity(price){
  price = Number(price) || 0;

  if(price > 10000) return "legendary";
  if(price > 5000) return "epic";
  if(price > 1000) return "rare";
  return "normal";
}

// ======================
// 🔥 CREATE ITEM CARD (ANTI UNDEFINED)
// ======================
function createCard(item, index){

  const safeName = item?.name || "Unknown Item";
  const safeImage = item?.image || "https://via.placeholder.com/150";
  const safePrice = item?.price || 0;
  const safeLink = item?.link || "#";
  const safeLimited = item?.limited || false;

  const rarity = getRarity(safePrice);

  const div = document.createElement("div");
  div.className = `item-card ${rarity}`;

  div.innerHTML = `
    ${index === 0 ? '<div class="equipped">ON</div>' : ''}
    ${safeLimited ? '<div class="limited">LIMITED</div>' : ''}
    <img src="${safeImage}">
    <div class="item-name">${safeName}</div>
    <div class="item-price">${safePrice} R$</div>
  `;

  div.onclick = ()=> window.open(safeLink);

  return div;
}

// ======================
// 🔥 LOAD ITEMS (FINAL FIX)
// ======================
async function safeFetch(url, retry = 3){
  try{
    const res = await fetch(url);
    if(!res.ok) throw new Error();
    return await res.json();
  }catch{
    if(retry > 0){
      return await safeFetch(url, retry - 1);
    }
    return null;
  }
}

async function loadItems(){
  const container = document.getElementById("itemsContainer");
  if(!container) return;
  
let totalPrice = 0;

function updateTotal(){
  document.getElementById("totalPrice").innerText =
    "Total: " + totalPrice.toLocaleString() + " R$";
}
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

    // 🔥 fallback kalau kosong / rusak
    const finalItems = (items && items.length) ? items : [
      {name:"No Item", image:"https://via.placeholder.com/150", price:0, link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", price:0, link:"#"},
      {name:"No Item", image:"https://via.placeholder.com/150", price:0, link:"#"}
    ];

    totalPrice = 0;

finalItems.slice(0,20).forEach((item,i)=>{
  totalPrice += item.price || 0;
  container.appendChild(createCard(item,i));
});

updateTotal();

  }catch(err){
    console.log("ITEM ERROR:", err);
    container.innerHTML = "<p style='font-size:11px'>Gagal load item</p>";
  }
}

// ======================
// 🔥 INIT (SATU KALI AJA)
// ======================
window.addEventListener("DOMContentLoaded", async ()=>{
  await getUserId();
  loadItems();
  loadAvatar();
  init3DAvatar();
});

  // 🔥 BUTTON EFFECT
  document.querySelectorAll(".buttons a").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      btn.style.transform = "scale(0.9)";
      setTimeout(()=>{
        btn.style.transform = "scale(1.05)";
      },150);
    });
  });

  // 🔥 ICON HOVER
  document.querySelectorAll(".icons a").forEach(icon=>{
    icon.addEventListener("mouseenter", ()=>{
      icon.style.transform = "scale(1.3) rotate(8deg)";
    });

    icon.addEventListener("mouseleave", ()=>{
      icon.style.transform = "scale(1)";
    });
  });

  // 🔥 AVATAR INTERAKTIF
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
});

const socket = new WebSocket(location.origin.replace("http","ws"));

socket.onmessage = (event)=>{
  const data = JSON.parse(event.data);

  if(data.type === "items"){
    loadItems(); // reload dari server
  }

  if(data.type === "stats"){
    animate(document.getElementById("friends"), data.friends);
    animate(document.getElementById("followers"), data.followers);
    animate(document.getElementById("following"), data.following);
  }
};

function init3DAvatar(){
  const container = document.querySelector(".avatar-box");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({alpha:true});
  renderer.setSize(180,180);

  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({
    color:0x00ffff,
    wireframe:true
  });

  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  camera.position.z = 2;

  function loop(){
    requestAnimationFrame(loop);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  }

  loop();
}

// 🔥 AUTO REFRESH
setInterval(loadStats, 5000);
