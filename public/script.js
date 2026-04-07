class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    
    // 2D ROBLOX SMOOTH ROTATION
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.rotationSpeed = 0.08;
    this.autoRotateSpeed = 0.3;
    
    // ✅ SMART ITEMS TRACKING - NO CONSTANT REFRESH
    this.currentItemsHash = '';
    this.lastItemsUpdate = 0;
    this.itemsCheckInterval = null;
    
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadAvatar2D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItemsSmart();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar2D');
    this.avatarCtx = canvas.getContext('2d');
    
    // Drag events - ULTRA SMOOTH 360°
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());
    
    // Touch support - Mobile smooth scroll
    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.drag(e.touches[0]);
    });
    canvas.addEventListener('touchend', () => this.stopDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    document.body.style.cursor = 'grabbing';
    this.autoRotateSpeed = 0;
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.lastX;
    this.targetRotationY += deltaX * 0.8;
    
    this.lastX = e.clientX;
  }

  stopDrag() {
    this.isDragging = false;
    document.body.style.cursor = 'grab';
    this.autoRotateSpeed = 0.3;
  }

  // 🔥 3D ROBLOX AVATAR .glb LOADER
async loadAvatar3D() {
  try {
    const res = await this.fetchWithRetry('/api/avatar3d');
    const data = await res.json();
    
    if (data.glb) {
      // Load GLB dengan Three.js atau model-viewer
      this.loadGLBModel(data.glb);
    } else {
      // Fallback 2D
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.onload = () => this.animate2D();
      this.avatarImg.src = data.fallback || 'https://via.placeholder.com/200?text=ROBLOX';
      this.animate2D();
    }
  } catch (err) {
    console.error('3D Avatar failed:', err);
    // Fallback
    this.avatarImg = new Image();
    this.avatarImg.src = 'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=' + USER_ID + '&size=420x420&format=Png';
    this.animate2D();
  }
}

// Tambahkan CDN Three.js di HTML untuk 3D
// <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>
// <script src="https://cdn.jsdelivr.net/npm/three@0.158.0/examples/js/loaders/GLTFLoader.js"></script>

  // 🔥 WEBSOCKET - CHANGE DETECTION
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
    
    // ✅ SMART ITEMS - Only update if changed
    if (data.items && data.itemsHash !== this.currentItemsHash) {
      this.currentItemsHash = data.itemsHash;
      this.renderItems(data.items);
      document.getElementById("totalValue").textContent = 
        `${data.totalValue?.toLocaleString() || 0} R$`;
      this.lastItemsUpdate = Date.now();
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

  // ✅ SMART ITEMS - Only refresh when changed
  async loadItemsSmart() {
    const container = document.getElementById("itemsContainer");
    
    // Show loading only first time
    if (!this.currentItemsHash) {
      container.innerHTML = Array(8).fill().map(() => 
        '<div class="loading-smooth"></div>'
      ).join('');
    }

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      
      // Only update if items actually changed
      if (data.itemsHash !== this.currentItemsHash) {
        this.currentItemsHash = data.itemsHash;
        this.renderItems(data.items || []);
        document.getElementById("totalValue").textContent = 
          `${(data.totalValue || 0).toLocaleString()} R$`;
        this.lastItemsUpdate = Date.now();
      }
    } catch (err) {
      console.error('Items failed:', err);
      if (!this.currentItemsHash) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Loading...</div>';
      }
    }
    
    // Smart check interval - only when needed
    if (this.itemsCheckInterval) clearInterval(this.itemsCheckInterval);
    this.itemsCheckInterval = setInterval(() => this.checkItemsUpdate(), 45000); // 45s smart check
  }

  async checkItemsUpdate() {
    try {
      const res = await this.fetchWithRetry('/api/items?checkOnly=true');
      const data = await res.json();
      
      if (data.itemsHash !== this.currentItemsHash) {
        console.log('🔄 ITEMS CHANGED - Updating...');
        this.currentItemsHash = data.itemsHash;
        await this.loadItemsSmart();
      }
    } catch (err) {
      console.error('Items check failed:', err);
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
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null" loading="lazy">
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
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
  document.getElementById('avatar2D').style.cursor = 'grab';
});
