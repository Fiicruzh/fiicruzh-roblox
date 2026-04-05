const API = "/api";

// 🔥 LOADING SCREEN AUTO HILANG
window.addEventListener("load", ()=>{
  const loading = document.querySelector(".loading");
  if(loading){
    setTimeout(()=>{
      loading.style.opacity = "0";
      setTimeout(()=> loading.style.display = "none", 500);
    },1500);
  }
});

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

// 🔥 EFEK KLIK BUTTON (UPGRADE LEBIH HALUS)
document.querySelectorAll(".button, .buttons a").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform = "scale(0.9)";
    btn.style.boxShadow = "0 0 40px cyan";

    setTimeout(()=>{
      btn.style.transform = "scale(1.05)";
    },120);

    setTimeout(()=>{
      btn.style.transform = "scale(1)";
    },220);
  });
});

// 🔥 HOVER ICON LEBIH HIDUP (UPGRADE GLOW)
document.querySelectorAll(".icons a").forEach(icon=>{
  icon.addEventListener("mouseenter", ()=>{
    icon.style.transform = "scale(1.35) rotate(10deg)";
    icon.style.textShadow = "0 0 20px cyan";
  });

  icon.addEventListener("mouseleave", ()=>{
    icon.style.transform = "scale(1)";
    icon.style.textShadow = "none";
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

// 🔥 PARALLAX BACKGROUND (BARU)
document.addEventListener("mousemove", (e)=>{
  const bg = document.querySelector(".bg");
  if(bg){
    let x = e.clientX / 100;
    let y = e.clientY / 100;
    bg.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
  }
});

// 🔥 HUD GLOW RANDOM (EFEK HIDUP)
setInterval(()=>{
  document.querySelectorAll(".profile-card, .avatar-box, .bio").forEach(el=>{
    el.style.boxShadow = `
      0 0 ${20 + Math.random()*40}px rgba(0,255,255,0.7)
    `;
  });
}, 1200);

// 🔥 SCANLINE INTENSITY CHANGE
setInterval(()=>{
  const scan = document.querySelector(".scanline");
  if(scan){
    scan.style.opacity = Math.random() * 0.15;
  }
}, 300);

// 🔥 FLOATING EFFECT PANEL
setInterval(()=>{
  document.querySelectorAll(".profile-card, .avatar-box").forEach(el=>{
    el.style.transform = `translateY(${Math.sin(Date.now()/500)*5}px)`;
  });
}, 30);
