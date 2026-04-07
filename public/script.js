class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;
    
    // 3D Controls
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.autoRotateSpeed = 0.3;
    this.inertiaDecay = 0.94;
    
    // Change detection
    this.lastItemsHash = '';
    this.lastStatsHash = '';
    this.lastTotalValue = 0;
    
    this.retryCount = 0;
    this.init();
  }

  init() {
    console.log('🚀 PortfolioApp starting...');
    this.setupCanvas();
    this.loadAvatar3D();
    this.connectWebSocket();
    this.loadInitialData();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar3D');
    canvas.width = 400;
    canvas.height = 400;
    this.avatarCtx = canvas.getContext('2d');
    
    // Drag events
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.drag(e));
    document.addEventListener('mouseup', () => this.stopDrag());
    
    // Touch
    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.drag(e.touches[0]);
    });
    document.addEventListener('touchend', () => this.stopDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  drag(e) {
    if (!this.isDragging) return;
    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;
    this.velocityX = deltaX * 0.4;
    this.velocityY = deltaY * 0.4;
    this.targetRotationY += deltaX * 0.6;
    this.targetRotationX -= deltaY * 0.6;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
  }

  async loadAvatar3D() {
    try {
      console.log('🖼️ Loading avatar...');
      const res = await fetch('/api/avatar');
      const data = await res.json();
      console.log('Avatar data:', data);
      
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.onload = () => {
        console.log('✅ Avatar loaded');
        this.animate3D();
      };
      this.avatarImg.onerror = () => {
        console.log('❌ Avatar failed, using default');
        this.avatarImg.src = 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
      };
      this.avatarImg.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar error:', err);
      this.avatarImg = new Image();
      this.avatarImg.src = 'https://tr.rbxcdn.com/HEADSHOT-THUMBNAIL?width=420&height=420&format=png';
      this.animate3D();
    }
  }

  animate3D() {
    const canvas = document.getElementById('avatar3D');
    
    const render = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth rotation
      if (!this.isDragging) {
        this.velocityX *= this.inertiaDecay;
        this.velocityY *= this.inertiaDecay;
        this.targetRotationY += this.velocityX;
        this.targetRotationX += this.velocityY;
        this.targetRotationY += this.autoRotateSpeed;
      }
      
      this.rotationX += (this.targetRotationX - this.rotationX) * 0.15;
      this.rotationY += (this.targetRotationY - this.rotationY) * 0.15;
      
      // 3D Transform
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(this.rotationY * 0.008);
      
      // Tilt effect
      const tiltY = this.rotationX * 0.01;
      ctx.transform(1, tiltY, 0, 1, 0, 0);
      
      // Lighting
      const gradient = ctx.createRadialGradient(0, -50, 0, 0, 0, 150);
      gradient.addColorStop(0, 'rgba(0,255,255,0.6)');
      gradient.addColorStop(0.5, 'rgba(0,255,255,0.2)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-100, -100, 200, 200);
      
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetX = 15;
      ctx.shadowOffsetY = 15;
      
      // Draw avatar
      if (this.avatarImg && this.avatarImg.complete) {
        ctx.shadowColor = 'cyan';
        ctx.shadowBlur = 20;
        ctx.drawImage(this.avatarImg, -95, -95, 190, 190);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    };
    render();
  }

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📡 WS data:', data);
        this.updateLiveData(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket closed');
      document.getElementById('liveIndicator').textContent = '🔴';
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  updateLiveData(data) {
    console.log('Updating with:', data);
    
    if (data.stats) {
      document.getElementById("friends").textContent = data.stats.friends || 0;
      document.getElementById("followers").textContent = data.stats.followers || 0;
      document.getElementById("following").textContent = data.following || 0;
    }
    
    if (data.items) {
      this.renderItems(data.items);
      document.getElementById("totalValue").textContent = `${(data.totalValue || 0).toLocaleString()} R$`;
    }
  }

  async loadInitialData() {
    console.log('📥 Loading initial data...');
    await Promise.all([this.loadStats(), this.loadItems()]);
  }

  async loadStats() {
    try {
      const res = await fetch('/api');
      const data = await res.json();
      console.log('Stats:', data);
      document.getElementById("friends").textContent = data.friends || 0;
      document.getElementById("followers").textContent = data.followers || 0;
      document.getElementById("following").textContent = data.following || 0;
    } catch (err) {
      console.error('Stats load failed:', err);
    }
  }

  async loadItems() {
    try {
      console.log('Loading items...');
      const res = await fetch('/api/items');
      const data = await res.json();
      console.log('Items data:', data);
      this.renderItems(data.items || []);
      document.getElementById("totalValue").textContent = `${(data.totalValue || 0).toLocaleString()} R$`;
    } catch (err) {
      console.error('Items load failed:', err);
      document.getElementById("itemsContainer").innerHTML = '<div style="padding:20px;color:#666">Loading items...</div>';
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items || items.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:#666;font-size:12px;text-align:center">No items equipped</div>';
      return;
    }
    container.innerHTML = items.map((item, i) => this.createItemCard(item, i)).join('');
  }

  getRarity(price) {
    if (price > 10000) return "legendary";
    if (price > 5000) return "epic";
    if (price > 1000) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item.price);
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/333/fff?text=?';this.onerror=null;" loading="lazy">
        <div class="item-name">${item.name || 'Unknown'}</div>
        <div class="item-price">${(item.price || 0).toLocaleString()} R$</div>
      </div>
    `;
  }

  addInteractions() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#00ff88';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
          btn.style.background = '';
        }, 2000);
      });
    };
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
