const API = "/api";

// 🔥 ANIMASI ANGKA
function animate(el, end){
  end = Number(end) || 0;

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

// 🔥 UPDATE UI
function updateUI(data){
  animate(document.getElementById("friends"), data.friends);
  animate(document.getElementById("followers"), data.followers);
  animate(document.getElementById("following"), data.following);

  // 🔥 STATUS ONLINE
  const statusEl = document.getElementById("status");
  if(statusEl){
    statusEl.innerText = data.online ? "ONLINE" : "OFFLINE";
    statusEl.style.color = data.online ? "lime" : "red";
  }
}

// 🔥 WEBSOCKET
function startRealtime(){
  const ws = new WebSocket(`ws://${location.host}`);

  ws.onmessage = (msg)=>{
    const data = JSON.parse(msg.data);
    updateUI(data);
  };

  ws.onerror = ()=>{
    loadStats();
  };
}

// 🔥 FALLBACK API
async function loadStats(){
  try{
    const res = await fetch(API);
    const data = await res.json();
    updateUI(data);
  }catch(err){
    console.log("API ERROR", err);
  }
}

startRealtime();
loadStats();

// 🔥 EFEK BUTTON
document.querySelectorAll(".buttons a").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform = "scale(0.9)";
    setTimeout(()=>btn.style.transform="scale(1.05)",150);
  });
});

// 🔥 ICON
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
    let x = (window.innerWidth/2 - e.clientX)/25;
    let y = (window.innerHeight/2 - e.clientY)/25;

    avatar.style.transform = `rotateY(${x}deg) rotateX(${y}deg) scale(1.05)`;
  });

  document.addEventListener("mouseleave", ()=>{
    avatar.style.transform = "rotateY(0deg) rotateX(0deg)";
  });
}
