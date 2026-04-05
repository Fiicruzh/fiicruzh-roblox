const API = "/api";

// LOADING (optional kalau nanti kamu tambahin)
window.addEventListener("load", ()=>{});

// ANIMASI ANGKA
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

// LOAD DATA
async function loadStats(){
  try{
    const res = await fetch(API);
    const data = await res.json();

    animate(friends, data.friends);
    animate(followers, data.followers);
    animate(following, data.following);

  }catch{
    animate(friends, 0);
    animate(followers, 0);
    animate(following, 0);
  }
}

loadStats();
setInterval(loadStats, 5000);

// BUTTON EFFECT
document.querySelectorAll(".button, .qr-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform="scale(.9)";
    setTimeout(()=>btn.style.transform="scale(1)",150);
  });
});

// ICON EFFECT
document.querySelectorAll(".icons a").forEach(icon=>{
  icon.addEventListener("mouseenter", ()=>{
    icon.style.transform="scale(1.3) rotate(8deg)";
  });
  icon.addEventListener("mouseleave", ()=>{
    icon.style.transform="scale(1)";
  });
});

// AVATAR PARALLAX
const avatar = document.getElementById("avatar");

document.addEventListener("mousemove",(e)=>{
let x=(window.innerWidth/2 - e.clientX)/25;
let y=(window.innerHeight/2 - e.clientY)/25;

avatar.style.transform=`rotateY(${x}deg) rotateX(${y}deg) scale(1.05)`;
});
