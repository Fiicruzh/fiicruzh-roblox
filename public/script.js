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

  async loadAvatar3D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.onload = () => this.animate3D();
      this.avatarImg.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar load failed:', err);
      this.avatarImg = new Image();
      this.avatarImg.src = 'https://via.placeholder.com/200?text=ROBLOX';
      this.animate3D();
    }
  }

  animate3D() {
    const canvas = document.getElementById('avatar3D');
    
    function render() {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      app.rotationX += (app.targetRotationX - app.rotationX) * 0.1;
      app.rotationY += (app.targetRotationY - app.rotationY) * 0.1;
      
      if (!app.isDragging) {
        app.targetRotationY += 0.3;
      }
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(app.rotationY * 0.01);
      ctx.scale(1.1, 0.95);
      
      const gradient = ctx.createRadialGradient(0, -30, 0, 0, 0, 100);
      gradient.addColorStop(0, 'rgba(0,255,255,0.4)');
      gradient.addColorStop(0.5, 'rgba(0,255,255,0.1)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 10;
      
      if (app.avatarImg?.complete) {
        ctx.drawImage(app.avatarImg, -85, -85, 170, 170);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    }
    render();
  }

  // 🔥 FIXED: WebSocket - Better reconnection + complete data handling
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
        console.log('📡 Live update received:', data);
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

    this.ws.onerror = (err) => {
      console.log('WebSocket error:', err);
    };
  }

  smartReconnect() {
    if (this.retryCount < 5) {
      setTimeout(() => {
        this.retryCount++;
        console.log(`🔄 Reconnecting WebSocket... (${this.retryCount}/5)`);
        this.connectWebSocket();
      }, 2000 * this.retryCount);
    }
  }

  // 🔥 FIXED: Complete data update - Handle all data types
  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends || 0);
      this.animate(document.getElementById("followers"), data.stats.followers || 0);
      this.animate(document.getElementById("following"), data.stats.following || 0);
    }
    
    if (data.items !== undefined) {
      this.renderItems(Array.isArray(data.items) ? data.items : []);
    }
    
    if (data.totalValue !== undefined) {
      document.getElementById("totalValue").textContent = 
        `${(data.totalValue || 0).toLocaleString()} R$`;
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
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
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null" loading="lazy">
        <div class="item-name">${item.name || 'Unknown'}</div>
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
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = 'NSSxFiiCruzh | @dapaarowr4';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      });
    };

    // Auto refresh every 30s
    setInterval(() => {
      this.loadItems();
      this.loadStats();
    }, 30000);
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
  document.getElementById('avatar3D').style.cursor = 'grab';
});
