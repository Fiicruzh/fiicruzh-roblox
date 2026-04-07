class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarImg = null;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.velocityY = 0;
    this.lastItemsHash = '';
    this.lastStatsHash = '';
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.setupAvatar2D();
    this.loadAvatar2D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  // 🔥 2D ROBLOX AVATAR - SMOOTH 360° SCROLL (KIRI KANAN DEPAN BELAKANG)
  setupAvatar2D() {
    const container = document.getElementById('avatar2DContainer');
    const avatar = document.getElementById('avatar2D');

    // Mouse drag
    container.addEventListener('mousedown', (e) => this.startDrag(e));
    container.addEventListener('mousemove', (e) => this.drag(e));
    container.addEventListener('mouseup', () => this.stopDrag());
    container.addEventListener('mouseleave', () => this.stopDrag());

    // Touch support
    container.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    container.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
    container.addEventListener('touchend', () => this.stopDrag());

    // 🔥 MOUSE WHEEL SMOOTH SCROLL (KIRI KANAN)
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetRotationY += e.deltaY * 0.5;
      this.velocityY = e.deltaY * 0.3;
    });

    // Smooth physics animation loop
    const animate = () => {
      // Ultra smooth interpolation
      this.rotationY += (this.targetRotationY - this.rotationY) * 0.15;
      this.velocityY *= 0.94; // Friction
      this.targetRotationY += this.velocityY;

      // Normalize rotation (360° loop)
      this.rotationY = ((this.rotationY % 360) + 360) % 360;

      // Apply smooth 3D rotation
      avatar.style.transform = `rotateY(${this.rotationY}deg) scale(1.05)`;

      requestAnimationFrame(animate);
    };
    animate();
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    container.classList.add('dragging');
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.lastX;
    this.targetRotationY += deltaX * 1.2;
    this.lastX = e.clientX;
  }

  stopDrag() {
    this.isDragging = false;
    container.classList.remove('dragging');
  }

  // 🔥 LOAD 2D ROBLOX AVATAR
  async loadAvatar2D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      const avatar = document.getElementById('avatar2D');
      avatar.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
      avatar.onerror = () => {
        avatar.src = 'https://via.placeholder.com/200?text=ROBLOX';
      };
    } catch (err) {
      console.error('Avatar load failed:', err);
    }
  }

  // 🔥 WEBSOCKET - SMART UPDATE ONLY WHEN CHANGED
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

  // 🔥 SMART UPDATE - ONLY WHEN DATA CHANGED
  updateLiveData(data) {
    if (data.stats) {
      const statsHash = JSON.stringify(data.stats);
      if (statsHash !== this.lastStatsHash) {
        this.animate(document.getElementById("friends"), data.stats.friends);
        this.animate(document.getElementById("followers"), data.stats.followers);
        this.animate(document.getElementById("following"), data.stats.following);
        this.lastStatsHash = statsHash;
      }
    }
    
    if (data.items) {
      const itemsHash = JSON.stringify(data.items.map(i => i.id || i.name));
      if (itemsHash !== this.lastItemsHash) {
        this.renderItems(data.items);
        document.getElementById("totalValue").textContent = 
          `${data.totalValue?.toLocaleString() || 0} R$`;
        this.lastItemsHash = itemsHash;
      }
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

  // 🔥 SMART ITEMS LOAD - ONLY REFRESH WHEN CHANGED
  async loadItems() {
    const container = document.getElementById("itemsContainer");
    
    // Show loading only first time
    if (!container.children.length) {
      container.innerHTML = Array(8).fill().map(() => 
        '<div class="loading-smooth"></div>'
      ).join('');
    }

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      
      // Only update if items changed
      const itemsHash = JSON.stringify(data.items.map(i => i.id || i.name));
      if (itemsHash !== this.lastItemsHash) {
        this.renderItems(data.items || []);
        document.getElementById("totalValue").textContent = 
          `${(data.totalValue || 0).toLocaleString()} R$`;
        this.lastItemsHash = itemsHash;
      }
    } catch (err) {
      console.error('Items failed:', err);
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

    // 🔥 SMART REFRESH - ONLY WHEN NEEDED (every 60s instead of 30s)
    setInterval(() => {
      this.loadItems();
      this.loadStats();
    }, 60000);
  }
}

// Global app instance
let app;
let container; // Fix for drag functions

document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
  container = document.getElementById('avatar2DContainer');
  container.style.cursor = 'grab';
});
