class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.lastWheel = 0;
    this.currentItemsHash = '';
    this.currentItemsCount = 0;
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadAvatar2D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar2D');
    this.avatarCtx = canvas.getContext('2d');
    
    // Mouse wheel scroll for rotation
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY * 0.3;
      this.targetRotationY += delta;
    });
    
    // Touch scroll support
    let touchStartY = 0;
    canvas.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchmove', (e) => {
      const touchY = e.touches[0].clientY;
      const delta = (touchStartY - touchY) * 2;
      this.targetRotationY += delta;
      touchStartY = touchY;
      e.preventDefault();
    });
  }

  // 🔥 2D LIVE AVATAR WITH SCROLL ROTATION
  async loadAvatar2D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.onload = () => this.animate2D();
      this.avatarImg.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar load failed:', err);
      this.avatarImg = new Image();
      this.avatarImg.src = 'https://via.placeholder.com/200?text=ROBLOX';
      this.animate2D();
    }
  }

  animate2D() {
    const canvas = document.getElementById('avatar2D');
    
    function render() {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth rotation interpolation
      app.rotationY += (app.targetRotationY - app.rotationY) * 0.12;
      
      // Auto slow rotation
      app.targetRotationY += 0.2;
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      // 2D Rotation effect
      ctx.rotate(app.rotationY * 0.01);
      ctx.scale(1.05, 1.05);
      
      // Neon glow effect
      ctx.shadowColor = 'cyan';
      ctx.shadowBlur = 25;
      
      // Avatar lighting
      const gradient = ctx.createRadialGradient(0, -25, 0, 0, 0, 120);
      gradient.addColorStop(0, 'rgba(0,255,255,0.6)');
      gradient.addColorStop(0.4, 'rgba(0,255,255,0.2)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      // Draw avatar
      if (app.avatarImg.complete && app.avatarImg.naturalWidth > 0) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0,255,255,0.8)';
        ctx.drawImage(app.avatarImg, -85, -85, 170, 170);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    }
    render();
  }

  // 🔥 WEBSOCKET REAL-TIME UPDATE
  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ LIVE: WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
      this.retryCount = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.updateLiveData(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ LIVE: WebSocket disconnected');
      document.getElementById('liveIndicator').textContent = '🔴';
      this.smartReconnect();
    };
  }

  smartReconnect() {
    if (this.retryCount < 5) {
      setTimeout(() => {
        this.retryCount++;
        this.connectWebSocket();
      }, 2000 * this.retryCount);
    }
  }

  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.following);
    }
    
    // 🔥 SMART ITEMS UPDATE - ONLY IF CHANGED
    if (data.items) {
      const newHash = this.calculateItemsHash(data.items);
      const newCount = data.items.length;
      
      if (newHash !== this.currentItemsHash || newCount !== this.currentItemsCount) {
        console.log('🔄 Items changed - updating display');
        this.renderItems(data.items);
        this.currentItemsHash = newHash;
        this.currentItemsCount = newCount;
      }
      
      document.getElementById("totalValue").textContent = 
        `${data.totalValue?.toLocaleString() || 0} R$`;
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
  }

  calculateItemsHash(items) {
    return items.map(item => `${item.name}-${item.price}`).join('|');
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { 
          signal: AbortSignal.timeout(10000),
          cache: 'no-store'
        });
        if (res.ok) return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  async loadStats() {
    try {
      const res = await this.fetchWithRetry('/api');
      const data = await res.json();
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
    } catch (err) {
      console.error('Stats failed:', err);
    }
  }

  async loadItems() {
    const container = document.getElementById("itemsContainer");
    container.innerHTML = Array(8).fill().map(() => 
      '<div class="loading-smooth"></div>'
    ).join('');

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      
      // Calculate initial hash
      this.currentItemsHash = this.calculateItemsHash(data.items || []);
      this.currentItemsCount = data.items?.length || 0;
      
      this.renderItems(data.items || []);
      document.getElementById("totalValue").textContent = 
        `${(data.totalValue || 0).toLocaleString()} R$`;
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Loading...</div>';
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">No items equipped</div>';
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
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null">
        <div class="item-name">${item.name}</div>
        <div class="item-price">${(item.price || 0).toLocaleString()} R$</div>
      </div>
    `;
  }

  animate(el, end) {
    end = Number(end) || 0;
    let start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 1000;
    let startTime = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(start + (end - start) * easeProgress);
      el.textContent = value.toLocaleString();
      
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  addInteractions() {
    // Copy button
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        btn.classList.add('copied');
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
        }, 2000);
      });
    };

    // 🔥 NO AUTO REFRESH - Only WebSocket updates
    console.log('🚀 Portfolio loaded - Live updates via WebSocket only');
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
  document.getElementById('avatar2D').style.cursor = 'grab';
});
