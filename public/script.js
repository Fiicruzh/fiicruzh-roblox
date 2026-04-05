const API = "/api";

function animate(el, end){
  end = Number(end) || 0;
  let startTime = null;

  function step(t){
    if(!startTime) startTime = t;
    let progress = t - startTime;
    let value = Math.floor(progress / 1200 * end);

    if(value > end) value = end;
    el.innerText = value;

    if(progress < 1200){
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function updateUI(data){
  animate(friends, data.friends);
  animate(followers, data.followers);
  animate(following, data.following);

  const status = document.getElementById("status");
  status.innerText = data.online ? "ONLINE" : "OFFLINE";
  status.style.color = data.online ? "lime" : "red";
}

// WEBSOCKET
const ws = new WebSocket(`ws://${location.host}`);

ws.onmessage = (msg)=>{
  updateUI(JSON.parse(msg.data));
};

// AVATAR EFFECT
const avatar = document.getElementById("avatar");

document.addEventListener("mousemove", (e)=>{
  let x = (window.innerWidth/2 - e.clientX)/25;
  let y = (window.innerHeight/2 - e.clientY)/25;

  avatar.style.transform = `rotateY(${x}deg) rotateX(${y}deg)`;
});
