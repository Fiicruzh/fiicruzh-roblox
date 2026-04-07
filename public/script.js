class App {
  constructor() {
    this.init();
  }

  init() {
    this.canvas = document.getElementById('avatar3D');
    this.setupDrag();
    this.loadData();
    this.wsConnect();
    this.copyBtn();
    this.animate();
  }

  setupDrag() {
    let dragging = false, lastX = 0, rotY = 0, targetRotY = 0;
    
    this.canvas.onmousedown = (e) => {
      dragging = true;
      lastX = e.clientX;
      this.canvas.style.cursor = 'grabbing';
    };
    
    document.onmousemove = (e) => {
      if (!dragging) return;
      const delta = e.clientX - lastX;
      targetRotY += delta * 0.5;
      lastX = e.clientX;
    };
    
    document.onmouseup = () => {
      dragging = false;
      this.canvas.style.cursor = 'grab';
    };
    
    // Touch
    this.canvas.ontouchstart = (e) => {
      dragging = true;
      lastX = e.touches[0].clientX;
    };
    document.ontouchmove = (e) => {
      if (!dragging) return;
      e.preventDefault();
      const delta = e.touches[0].clientX - lastX;
      targetRotY += delta * 0.5;
      lastX = e.touches[0].clientX;
    };
    document.ontouchend = () => dragging = false;
    
    this.animate = () => {
      rotY += (targetRotY - rotY) * 0.1;
      rotY += 0.2; // Auto rotate
      requestAnimationFrame(this.animate);
      
      const ctx = this.canvas.getContext('2d');
      ctx.clearRect(0, 0, 400, 400);
      
      ctx.save();
      ctx.translate(200, 200);
      ctx.rotate(rotY * 0.008);
      
      // Glow
      const g = ctx.createRadialGradient(0, -50, 0, 0, 0, 200);
      g.addColorStop(0, 'rgba(0,255,255,0.8)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(-110, -110, 220, 220);
      
      // Shadow
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 25;
      
      // Avatar image
      if (this.avatarImg?.complete) {
        ctx.shadowColor = 'cyan';
        ctx.drawImage(this.avatarImg, -95, -95, 190, 190);
      }
      
      ctx.restore();
    };
  }

  async loadData() {
    // Avatar
    const avatarRes = await fetch('/api/avatar');
    const avatarData = await avatarRes.json();
    this.avatarImg = new Image();
    this.avatarImg.src = avatarData.image;
    console.log('Avatar:', avatarData.image);
    
    // Stats
    const statsRes = await fetch('/api');
    const stats = await statsRes.json();
    document.getElementById('friends').textContent = stats.friends;
    document.getElementById('followers').textContent = stats.followers;
    document.getElementById('following').textContent = stats.following;
    
    // Items
    const itemsRes = await fetch('/api/items');
    const itemsData = await itemsRes.json();
    this.renderItems(itemsData.items);
  }

  wsConnect() {
    const ws = new WebSocket(`${location.protocol === 'wss:' ? 'wss' : 'ws'}://${location.host}/websocket`);
    
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      document.getElementById('liveIndicator').textContent = '🟢';
      
      if (data.stats) {
        document.getElementById('friends').textContent = data.stats.friends;
        document.getElementById('followers').textContent = data.stats.followers;
        document.getElementById('following').textContent = data.following;
      }
      
      if (data.items) {
        this.renderItems(data.items);
      }
    };
  }

  renderItems(items) {
    const container = document.getElementById('itemsContainer');
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;color:#888;text-align:center;font-size:12px">No items equipped</div>';
      return;
    }
    
    container.innerHTML = items.map((item, i) => `
      <div class="item-card" style="cursor:pointer" onclick="window.open('${item.link}')">
        ${i === 0 ? '<div class="equipped">ACTIVE</div>' : ''}
        ${item.limited ? '<div class="limited">★</div>' : ''}
        <img src="${item.image}" style="width:100%;height:70px;object-fit:cover;border-radius:6px;" onerror="this.src='https://via.placeholder.com/90x70/333/fff?text=?'">
        <div class="item-name" style="font-size:10px;margin-top:4px;">${item.name}</div>
      </div>
    `).join('');
  }

  copyBtn() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✅ Copied!';
      btn.style.background = '#00ff88';
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
        btn.style.background = '';
      }, 1500);
    };
  }
}

new App();
