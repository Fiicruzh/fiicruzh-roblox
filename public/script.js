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
    this.velocityX = 0;
    this.velocityY = 0;
    this.friction = 0.94; // Roblox-style inertia
    this.retryCount = 0;
    
    // ✅ ITEM TRACKING - NO REFRESH UNTIL CHANGED
    this.lastItemsHash = '';
    this.lastItemsCount = 0;
    
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
    
    // 🔥 ROBLOX-STYLE DRAG WITH INERTIA (KIRI KANAN DEPAN BELAKANG)
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());
    
    // Touch support untuk mobile
    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
    canvas.addEventListener('touchend', () => this.stopDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.velocityX *= 0.5; // Reset velocity saat drag
    this.velocityY *= 0.5;
    document.body.style.cursor = 'grabbing';
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.lastX;
    const deltaY = e.clientY - this.lastY;
    
    // Smooth Roblox-style rotation
    this.targetRotationY += deltaX * 0.8;
    this.targetRotationX -= deltaY * 0.6;
    
    // Build velocity untuk inertia
    this.velocityX = deltaX * 0.4;
    this.velocityY = deltaY * 0.3;
    
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
    document.body.style.cursor = 'grab';
  }

  // 🔥 ULTRA SMOOTH 3D AVATAR RENDER (ROBLOX STYLE)
  animate3D() {
    const canvas = document.getElementById('avatar3D');
    
    const render = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 🔥 SMOOTH INERTIA + AUTO ROTATE
      if (this.isDragging) {
        this.rotationX += (this.targetRotationX - this.rotationX) * 0.15;
        this.rotationY += (this.targetRotationY - this.rotationY) * 0.15;
      } else {
        // Apply velocity dengan friction (ROBLOX physics)
        this.velocityX *= this.friction;
        this.velocityY *= this.friction;
        this.targetRotationY += this.velocityX;
        this.targetRotationX += this.velocityY;
        
        // Lerp ke target
        this.rotationX += (this.targetRotationX - this.rotationX) * 0.12;
        this.rotationY += (this.targetRotationY - this.rotationY) * 0.12;
        
        // Auto rotate halus saat idle
        this.targetRotationY += 0.2;
      }
      
      // Limit rotation
      this.rotationX = Math.max(-30, Math.min(30, this.rotationX));
      this.rotationY = this.rotationY % 360;
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      
      // 🔥 3D TRANSFORMASI ROBLOX
      ctx.rotate(this.rotationY * 0.01);
      ctx.scale(1.15, 0.92);
      ctx.translate(0, Math.sin(Date.now() * 0.001) * 2); // Micro bobble
      
      // Dynamic lighting
      const gradient = ctx.createRadialGradient(0, -40, 0, 0, 0, 120);
      gradient.addColorStop(0, 'rgba(0,255,255,0.5)');
      gradient.addColorStop(0.4, 'rgba(0,255,255,0.15)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-95, -95, 190, 190);
      
      // Shadow dengan depth
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetX = 12;
      ctx.shadowOffsetY = 12;
      
      // Draw avatar image
      if (this.avatarImg && this.avatarImg.complete) {
        ctx.drawImage(this.avatarImg, -88, -88, 176, 176);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    };
    render();
  }

  // 🔥 WEBSOCKET - NO SPAM
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
      }, 3000 * this.retryCount);
    }
  }

  // ✅ UPDATE HANYA KALAU BERUBAH
  updateLiveData(data) {
    // Update stats
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.stats.following);
    }
    
    // ✅ ITEMS - ONLY UPDATE IF CHANGED
    if (data.items && data.items.length !== this.lastItemsCount) {
      this.renderItems(data.items);
      this.lastItemsCount = data.items.length;
      this.lastItemsHash = JSON.stringify(data.items.map(i => i.name));
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

  // ✅ LOAD ITEMS - ONLY IF CHANGED
  async loadItems() {
    const container = document.getElementById("itemsContainer");
    
    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      
      // Hash check untuk detect perubahan
      const currentHash = JSON.stringify(data.items.map(i => i.name));
      
      if (currentHash !== this.lastItemsHash || data.items.length !== this.lastItemsCount) {
        this.renderItems(data.items || []);
        this.lastItemsHash = currentHash;
        this.lastItemsCount = data.items.length;
      }
      
    } catch (err) {
      console.error('Items failed:', err);
      if (container.children.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Loading...</div>';
      }
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

    // ✅ NO AUTO REFRESH - ONLY WEBSOCKET UPDATES
    // Items hanya update via WebSocket kalau ada perubahan
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
  document.getElementById('avatar3D').style.cursor = 'grab';
});
