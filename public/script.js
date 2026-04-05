const API = "/api";

// animasi angka
function animate(el, end){
  let start = 0;
  let duration = 1000;
  let startTime = null;

  function step(t){
    if(!startTime) startTime = t;
    let progress = t - startTime;
    let value = Math.floor(progress / duration * end);

    if(value > end) value = end;
    el.innerText = value;

    if(progress < duration) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// ambil data roblox
async function loadStats(){
  const res = await fetch(API);
  const data = await res.json();

  animate(document.getElementById("friends"), data.friends);
  animate(document.getElementById("followers"), data.followers);
  animate(document.getElementById("following"), data.following);
}

loadStats();
setInterval(loadStats,5000);

// efek klik
document.querySelectorAll(".buttons a").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    btn.style.transform="scale(0.9)";
    setTimeout(()=>btn.style.transform="scale(1.05)",150);
  });
});
