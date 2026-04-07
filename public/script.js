body{
  margin:0;
  font-family:Orbitron;
  background:black;
  color:white;
  overflow-x:hidden;
}

/* BG */
.bg{
  position:fixed;
  width:100%;
  height:100%;
  background:url('https://i.ibb.co.com/9HQCvdjn/1775328895589.png') center/cover;
  filter:brightness(.3);
  z-index:-2;
}

/* SCANLINE */
.scanline{
  position:fixed;
  width:100%;
  height:100%;
  background:repeating-linear-gradient(
    0deg,
    rgba(255,255,255,.03) 1px,
    transparent 2px
  );
  animation:scan 6s linear infinite;
  z-index:-1;
}

@keyframes scan{
  to{background-position:0 100%;}
}

/* CONTAINER */
.container{
  display:flex;
  justify-content:center;
  align-items:center;
  min-height:100vh;
  padding:20px;
}

/* CARD */
.card{
  width:100%;
  max-width:360px;
  padding:22px;
  border-radius:20px;
  background:rgba(0,0,0,0.7);
  backdrop-filter:blur(12px);
  box-shadow:0 0 50px cyan;
}

/* GLITCH TEXT */
.glitch{
  position:relative;
  color:cyan;
  font-weight:700;
  text-shadow:0 0 5px cyan;
}

.glitch::before,
.glitch::after{
  content:attr(data-text);
  position:absolute;
  left:0;
  width:100%;
  overflow:hidden;
}

.glitch::before{
  animation:glitchTop 2s infinite;
  color:red;
}

.glitch::after{
  animation:glitchBottom 2s infinite;
  color:blue;
}

@keyframes glitchTop{
  0%{clip-path:inset(0 0 80% 0);}
  50%{clip-path:inset(0 0 20% 0);}
  100%{clip-path:inset(0 0 80% 0);}
}

@keyframes glitchBottom{
  0%{clip-path:inset(80% 0 0 0);}
  50%{clip-path:inset(20% 0 0 0);}
  100%{clip-path:inset(80% 0 0 0);}
}

/* HEADER */
.header{
  display:flex;
  align-items:center;
  gap:12px;
}

.profile{
  width:60px;
  height:60px;
  border-radius:50%;
  box-shadow:0 0 15px cyan;
}

/* AVATAR SIMPLE */
.avatar-box{
  text-align:center;
  margin-top:12px;
}

#avatarImg{
  width:180px;
  height:180px;
  border-radius:12px;
  box-shadow:0 0 30px cyan;
  object-fit:cover;
}

/* BUTTON USERNAME */
.copy-btn {
  margin-top: 10px;
  padding: 12px 18px;
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid #0ff;
  color: #0ff;
  cursor: pointer;
  border-radius: 10px;
  font-family: 'Orbitron', sans-serif;
  transition: all 0.3s ease;
  display: inline-block;
  width:100%;
  box-sizing:border-box;
}

.copy-btn:hover {
  background: #0ff;
  color: #000;
  box-shadow: 0 0 10px #0ff, 0 0 25px #0ff;
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn.copied {
  background: #00ff88;
  border-color: #00ff88;
  color: #000;
  box-shadow: 0 0 10px #00ff88, 0 0 25px #00ff88;
}

/* STATS */
.stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px;
  margin-top:12px;
}

.stat{
  text-align:center;
  background:rgba(0,255,255,0.1);
  padding:8px;
  border-radius:8px;
  font-size:12px;
  transition:.3s;
}

.stat:hover{
  transform:scale(1.1);
  box-shadow:0 0 15px cyan;
}

/* TAG */
.tagline{
  text-align:center;
  margin-top:10px;
  font-size:13px;
  color:cyan;
}

/* ICON */
.icons{
  display:flex;
  justify-content:center;
  gap:18px;
  margin-top:12px;
}

.icons a{
  font-size:18px;
  color:cyan;
  transition:.3s;
}

.icons a:hover{
  transform:scale(1.3);
}

/* BUTTON */
.btn{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:11px;
  border-radius:10px;
  border:1px solid cyan;
  color:cyan;
  text-decoration:none;
  font-size:13px;
  transition:.3s;
}

.btn:hover{
  background:cyan;
  color:black;
}

/* ROW */
.button-row{
  display:flex;
  gap:8px;
  margin-top:14px;
}

.main-btn{
  flex:1;
}

.qr-btn{
  width:48px;
  min-width:48px;
}

.discord-btn{
  margin-top:10px;
}

/* RESPONSIVE */
@media(max-width:480px){
  .header{
    flex-direction:column;
    text-align:center;
  }
}

/* ===================== */
/* ROBLOX ITEMS GRID */
/* ===================== */

.items-section{
  margin-top:15px;
}

.items-title{
  text-align:center;
  color:cyan;
  font-size:13px;
  margin-bottom:8px;
}

.items-container{
  display:flex;
  gap:8px;
  overflow-x:auto;
  padding:8px 0;
  scrollbar-width: thin;
  scrollbar-color: cyan transparent;
  scroll-snap-type: x mandatory;
  min-height:100px;
}

.items-container::-webkit-scrollbar {
  height: 4px;
}

.items-container::-webkit-scrollbar-track {
  background: transparent;
}

.items-container::-webkit-scrollbar-thumb {
  background: cyan;
  border-radius: 2px;
}

/* MINI ITEM CARD */
.item-card{
  min-width:85px;
  flex:0 0 85px;
  background:rgba(0,255,255,0.08);
  border:1px solid rgba(0,255,255,0.2);
  border-radius:10px;
  padding:8px 6px;
  text-align:center;
  cursor:pointer;
  transition:0.3s;
  scroll-snap-align: center;
  position:relative;
  backdrop-filter:blur(10px);
}

.item-card:hover{
  transform:scale(1.05) translateY(-5px);
  box-shadow:0 10px 25px rgba(0,255,255,0.3);
}

/* GLOW RARITY */
.item-card.legendary{
  border-color:gold;
  box-shadow:0 0 15px rgba(255,215,0,0.5);
}

.item-card.legendary::before{
  content:"⭐";
  position:absolute;
  top:4px;
  right:4px;
  font-size:10px;
  color:gold;
  text-shadow:0 0 5px gold;
}

.item-card.epic{
  border-color:#8a2be2;
  box-shadow:0 0 15px rgba(138,43,226,0.5);
}

.item-card.epic::before{
  content:"💜";
  position:absolute;
  top:4px;
  right:4px;
  font-size:10px;
  color:#8a2be2;
  text-shadow:0 0 5px #8a2be2;
}

.item-card.rare{
  border-color:cyan;
  box-shadow:0 0 15px rgba(0,255,255,0.4);
}

.item-card.rare::before{
  content:"🔷";
  position:absolute;
  top:4px;
  right:4px;
  font-size:10px;
  color:cyan;
  text-shadow:0 0 5px cyan;
}

/* IMAGE */
.item-card img{
  width:100%;
  height:55px;
  object-fit:cover;
  border-radius:6px;
  margin-bottom:4px;
}

/* NAME */
.item-name{
  font-size:9px;
  font-weight:500;
  line-height:1.1;
  margin-bottom:2px;
  color:#ccc;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

/* EQUIPPED */
.equipped{
  position:absolute;
  top:4px;
  left:4px;
  font-size:8px;
  background:lime;
  color:black;
  padding:1px 3px;
  border-radius:3px;
  font-weight:bold;
}

/* LOADING */
.loading-smooth{
  min-width:85px;
  flex:0 0 85px;
  height:90px;
  border-radius:10px;
  background:linear-gradient(90deg, #111 0%, #222 50%, #111 100%);
  animation:loading-smooth 1.5s ease-in-out infinite;
  position:relative;
  overflow:hidden;
}

.loading-smooth::after{
  content:"...";
  position:absolute;
  top:50%;
  left:50%;
  transform:translate(-50%,-50%);
  font-size:12px;
  color:#666;
}

@keyframes loading-smooth{
  0%,100%{opacity:0.6; transform:scale(1);}
  50%{opacity:1; transform:scale(1.02);}
}

#liveIndicator {
  animation: pulse 2s infinite;
  font-size:12px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
