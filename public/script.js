class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.rotationX = 0;
    this.rotationY = 0;
    this.targetRotationX = 0;
    this.targetRotationY = 0;
    this.retryCount = 0;
    this.currentItemsHash = '';
    this.currentItems = [];
    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadAvatar3D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar3D');
    this.avatarCtx = canvas.getContext('2d');
    
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());
    
    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
    canvas.addEventListener('touchend', () => this.stopDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    document.body.style.cursor = 'grabbing';
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;
    
    this.targetRotationY += deltaX * 0.5;
    this.targetRotationX -= deltaY * 0.5;
    
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
    document.body.style.cursor = 'grab';
  }

  // 🔥 FIXED AVATAR 3D
  async loadAvatar3D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      console.log('Avatar loaded:', data.image);
      
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.onload = () => {
        console.log('✅ Avatar ready');
        this.animate3D();
      };
      this.avatarImg.onerror = () => {
        console.log('Avatar failed, using fallback');
        this.avatarImg.src = 'https://via.placeholder.com/200x200/00ff88/000000?text=👤';
        this.animate3D();
      };
      this.avatarImg.src = data.image;
    } catch (err) {
      console.error('Avatar load failed:', err);
      this.avatarImg = new Image();
      this.avatarImg.src = 'https://via.placeholder.com/200x200/00ff88/000000?text=👤';
      this.animate3D();
    }
  }

  animate3D() {
    const canvas = document.getElementById('avatar3D');
    
    const render = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth rotation
      this.rotationX += (this.targetRotationX - this.rotationX) * 0.12;
      this.rotationY += (this.targetRotationY - this.rotationY) * 0.12;
      
      if (!this.isDragging) {
        this.targetRotationY += 0.2;
      }
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      ctx.rotate(this.rotationY * 0.01);
      ctx.scale(1.15, 0.92);
      
      // Lighting
      const gradient = ctx.createRadialGradient(0, -20, 0, 0, 0, 120);
      gradient.addColorStop(0, 'rgba(0,255,255,0.5)');
      gradient.addColorStop(0.5, 'rgba(0,255,255,0.2)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-95, -95, 190, 190);
      
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 10;
      
      // Draw avatar
      if (this.avatarImg && this.avatarImg.complete) {
        ctx.globalAlpha = 0.2;
        ctx.drawImage(this.avatarImg, -92, -92, 184, 184);
        ctx.globalAlpha = 1;
        ctx.drawImage(this.avatarImg, -88, -88, 176, 176);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    };
    render();
  }

  // 🔥 WEBSOCKET
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
        this.updateLiveData(data);
      } catch (err) {
        console.error('WS error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket closed');
      document.getElementById('liveIndicator').textContent = '🔴';
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  // ✅ FIXED updateLiveData - BUG CORRECTED
  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends || 0);
      this.animate(document.getElementById("followers"), data.stats.followers || 0);
      this.animate(document.getElementById("following"), data.stats.following || 0);
    }
    
    if (data.items) {
      const newHash = this.hashItems(data.items);
      if (newHash !== this.currentItemsHash) {
        console.log('🔄 Items updated');
        this.currentItemsHash = newHash;
        this.renderItems(data.items);
        if (data.totalValue !== undefined) { // ✅ FIXED SYNTAX ERROR
          document.getElementById("totalValue").textContent = 
            `${data.totalValue.toLocaleString()} R$`;
        }
      }
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
  }

  hashItems(items) {
    return items.map(item => `${item.name || ''}-${item.price || 0}-${item.limited || false}`).join('|');
  }

  // ✅ FIXED fetchWithRetry
  async fetchWithRetry(url, retries = 5) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) return res;
      } catch (err) {
        console.log(`Fetch retry ${i+1}/${retries}:`, err.message);
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // ✅ FIXED loadStats
  async loadStats() {
    try {
      const res = await this.fetchWithRetry('/api');
      const data = await res.json();
      console.log('Stats loaded:', data);
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
    } catch (err) {
      console.error('Stats failed:', err);
      // Fallback demo numbers
      this.animate(document.getElementById("friends"), 42);
      this.animate(document.getElementById("followers"), 1337);
      this.animate(document.getElementById("following"), 69);
    }
  }

  // ✅ FIXED loadItems
  async loadItems() {
    const container = document.getElementById("itemsContainer");
    container.innerHTML = '<div style="display:flex;gap:10px"><div class="loading-smooth"></div>'.repeat(8);

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      console.log('Items loaded:', data.items?.length || 0);
      
      this.currentItemsHash = this.hashItems(data.items || []);
      this.renderItems(data.items || []);
      document.getElementById("totalValue").textContent = `${(data.totalValue || 0).toLocaleString()} R$`;
    } catch (err) {
      console.error('Items failed:', err);
      // Demo items fallback
      this.renderItems([{
        name: "Loading Items...",
        price: 999,
        image: "https://via.placeholder.com/90x70/00ff88/000?text=ITEMS",
        link: "#"
      }]);
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;font-size:12px">No items found</div>';
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
        ${index < 3 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">★</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/444/fff?text=?';this.onerror=null">
        <div class="item-name">${item.name || 'Item'}</div>
        <div class="item-price">${(item.price || 0).toLocaleString()} R$</div>
      </div>
    `;
  }

  animate(el, end) {
    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 1200;
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(start + (end - start) * ease);
      el.textContent = value.toLocaleString();
      
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  addInteractions() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        btn.textContent = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
        }, 1500);
      }).catch(() => alert('Copy failed'));
    };

    // Initial load complete
    setTimeout(() => {
      console.log('✅ Portfolio fully loaded');
      document.getElementById('liveIndicator').textContent = '🟢';
    }, 2000);
  }
}

// Global app
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
