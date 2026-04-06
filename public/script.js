const API = "/api";

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
// 🔥 FORCE LOAD ITEMS (FIX TOTAL)
// ============================

window.addEventListener("DOMContentLoaded", ()=>{
  loadItems();
});

function createCard(item, index){
  const div = document.createElement("div");
  div.className = "item-card";

  div.innerHTML = `
    ${index === 0 ? '<div class="equipped">ON</div>' : ''}
    <img src="${item.image}" onerror="this.src='https://via.placeholder.com/150'">
    <div class="item-name">${item.name}</div>
  `;

  div.onclick = ()=>{
    window.open(item.link, "_blank");
  };

  // 🔥 3D tilt
  div.addEventListener("mousemove", e=>{
    const rect = div.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    div.style.transform = `
      rotateX(${-(y-rect.height/2)/10}deg)
      rotateY(${(x-rect.width/2)/10}deg)
      scale(1.05)
    `;
  });

  div.addEventListener("mouseleave", ()=>{
    div.style.transform = "rotateX(0) rotateY(0)";
  });

  return div;
}

async function loadItems(){
  try{
    console.log("🔥 LOAD ITEMS START");

    const container = document.getElementById("itemsContainer");

    if(!container){
      console.error("❌ itemsContainer TIDAK ADA");
      return;
    }

    // 🔥 skeleton dulu
    container.innerHTML = "";
    for(let i=0;i<5;i++){
      const sk = document.createElement("div");
      sk.className = "skeleton";
      container.appendChild(sk);
    }

    const res = await fetch("/api/items");

    if(!res.ok){
      throw new Error("API gagal");
    }

    const items = await res.json();

    console.log("✅ ITEMS:", items);

    container.innerHTML = "";

    // 🔥 fallback (HARUS ADA)
    if(!items || items.length === 0){
      console.warn("⚠️ kosong, pakai dummy");

      for(let i=0;i<5;i++){
        container.appendChild(createCard({
          name:"No Item",
          image:"https://via.placeholder.com/150",
          link:"#"
        }, i));
      }

      return;
    }

    items.slice(0,5).forEach((item,i)=>{
      container.appendChild(createCard(item, i));
    });

  }catch(err){
    console.error("❌ ERROR LOAD:", err);

    const container = document.getElementById("itemsContainer");
    if(container){
      container.innerHTML = "<p style='font-size:11px'>Gagal load item</p>";
    }
  }
}
