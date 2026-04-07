class PortfolioApp {
  constructor() {
    this.ws = null;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.friction = 0.94;
    this.lastItemsCount = 0;
    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadEverything();
    this.connectWebSocket();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar3D');
    canvas.width = 200;
    canvas.height = 200;
    
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());
    
    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
    canvas.addEventListener('touchend', () => this.stopDrag());
  }

  async loadEverything() {
    await Promise.all([
      this.loadStats(),
      this.loadAvatar3D(),
      this.loadItems()
    ]);
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.velocityX *= 0.5;
    document.body.style.cursor = 'grabbing';
  }

  drag(e) {
    if (!this.isDragging) return;
    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;
    this.targetRotationY += deltaX * 0.8;
    this.targetRotationX -= deltaY * 0.6;
    this.velocityX = deltaX * 0.4;
    this.velocityY = deltaY * 0.3;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
    document.body.style.cursor = 'grab';
  }

  async loadAvatar3D() {
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      
      const canvas = document.getElementById('avatar3D');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = 200;
        canvas.height = 200;
        this.animate3D(img, ctx, canvas);
      };
      img.onerror = () => {
        img.src = 'https://via.placeholder.com/200x200/0f1429/ffffff?text=ROBLOX';
        this.animate3D(img, ctx, canvas);
      };
      img.src = data.image;
    } catch (err) {
      console.error('Avatar failed:', err);
      this.startPlaceholderAnimation();
    }
  }

  animate3D(img, ctx, canvas) {
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (!this.isDragging) {
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;
        this.targetRotationY += this.velocityX;
        this.targetRotationX += this.velocityY;
      }
      
      this.rotationX += (this.targetRotationX - this.rotationX) * 0.12;
      this.rotationY += (this.targetRotationY - this.rotationY) * 0.12;
      
      this.rotationX = Math.max(-30, Math.min(30, this.rotationX));
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(this.rotationY * 0.01);
      ctx.scale(1.1, 0.95);
      
      // Lighting
      const gradient = ctx.createRadialGradient(0, -30, 0, 0, 0, 100);
      gradient.addColorStop(0, 'rgba(0,255,255,0.4)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 8;
      ctx.shadowOffsetY = 8;
      
      ctx.drawImage(img, -85, -85, 170, 170);
      ctx.restore();
      
      requestAnimationFrame(() => render());
    };
    render();
  }

  startPlaceholderAnimation() {
    const canvas = document.getElementById('avatar3D');
    const ctx = canvas.getContext('2d');
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#0f3460';
      ctx.font = '16px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('ROBLOX', 100, 105);
      requestAnimationFrame(render);
    };
    render();
  }

  async loadStats() {
    try {
      const res = await fetch('/api');
      const data = await res.json();
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
    } catch (err) {
      console.error('Stats load failed');
    }
  }

  async loadItems() {
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      this.renderItems(data.items || []);
    } catch (err) {
      console.error('Items load failed');
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">No items equipped</div>';
      return;
    }
    container.innerHTML = items.map((item, i) => this.createItemCard(item, i)).join('');
  }

  createItemCard(item, index) {
    const rarity = item.price > 1000 ? (item.price > 5000 ? 'legendary' : 'epic') : 'rare';
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link}')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null">
        <div class="item-name">${item.name}</div>
      </div>
    `;
  }

  animate(el, end) {
    let start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 1000;
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const value = Math.floor(start + (end - start) * progress);
      el.textContent = value.toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      document.getElementById('liveIndicator').textContent = '🟢';
    };
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stats) {
          this.animate(document.getElementById("friends"), data.stats.friends);
          this.animate(document.getElementById("followers"), data.stats.followers);
          this.animate(document.getElementById("following"), data.stats.following);
        }
        if (data.items && data.itemsCount !== this.lastItemsCount) {
          this.renderItems(data.items);
          this.lastItemsCount = data.itemsCount;
        }
      } catch (err) {}
    };
  }

  addInteractions() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = '✅ Copied!';
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
