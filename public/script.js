class PortfolioApp {
  constructor() {
    this.ws = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 2000;
    this.avatarImage = null;
    this.init();
  }

  init() {
    this.loadStats();
    this.loadAvatar3D();
    this.connectWebSocket();
    this.addInteractions();
    setInterval(() => this.loadStats(), 10000);
  }

  // 🔥 WEBSOCKET FIXED
  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.retryCount = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.updateLiveData(data);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      this.smartReconnect();
    };
  }

  smartReconnect() {
    if (this.retryCount < this.maxRetries) {
      setTimeout(() => {
        this.retryCount++;
        this.connectWebSocket();
      }, this.retryDelay * this.retryCount);
    }
  }

  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.stats.following);
    }
    
    if (data.items) {
      this.renderItems(data.items);
      document.getElementById("totalValue").textContent = 
        `${data.totalValue?.toLocaleString() || 0} R$`;
    }
  }

  // 🔥 ULTRA SMOOTH LOADING
  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(url, { 
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeout);
        
        if (res.ok) return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  // 🔥 STATS LOADING
  async loadStats() {
    try {
      const res = await this.fetchWithRetry('/api');
      const data = await res.json();
      
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
    } catch (err) {
      console.error('Stats load failed:', err);
    }
  }

  // 🔥 3D AVATAR FIXED
  async loadAvatar3D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      
      if (data.image) {
        this.avatarImage = data.image;
        this.render3DModel();
      }
    } catch (err) {
      console.error('Avatar failed:', err);
      // Fallback image
      this.avatarImage = 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
      this.render3DModel();
    }
  }

  render3DModel() {
    const canvas = document.getElementById('avatar3D');
    const ctx = canvas.getContext('2d');
    let rotationX = 0, rotationY = 0;
    let targetX = 0, targetY = 0;
    let time = 0;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      function animate() {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Mouse follow
        rotationX += (targetX * 0.3 - rotationX) * 0.1;
        rotationY += (targetY * 0.3 - rotationY) * 0.1;
        
        // Auto rotate
        rotationY += 0.5;
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotationY * 0.01);
        
        // 3D effect
        ctx.scale(1.1, 0.9);
        ctx.shadowColor = 'cyan';
        ctx.shadowBlur = 25;
        ctx.shadowOffsetX = 5;
        ctx.shadowOffsetY = 5;
        
        // Draw image
        ctx.drawImage(img, -85, -85, 170, 170);
        ctx.restore();
        
        time++;
        requestAnimationFrame(animate);
      }
      animate();
    };
    img.onerror = () => {
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'cyan';
      ctx.font = '20px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('Loading...', canvas.width/2, canvas.height/2);
    };
    img.src = this.avatarImage;
  }

  // 🔥 ITEMS RENDERING FIXED
  async loadItems() {
    const container = document.getElementById("itemsContainer");
    container.innerHTML = this.createSmoothLoading(8);

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      this.renderItems(data.items || []);
      document.getElementById("totalValue").textContent = 
        `${(data.totalValue || 0).toLocaleString()} R$`;
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="text-align:center;padding:20px;font-size:11px;color:#666">Loading items...</div>';
    }
  }

  createSmoothLoading(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<div class="loading-smooth"></div>';
    }
    return html;
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items || items.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;font-size:11px;color:#666">No items found</div>';
      return;
    }

    container.innerHTML = items.map((item, index) => this.createItemCard(item, index)).join('');
  }

  getRarity(price) {
    if (price > 10000) return "legendary";
    if (price > 5000) return "epic";
    if (price > 1000) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item.price);
    const equipped = index === 0 ? '<div class="equipped">ON</div>' : '';
    const limited = item.limited ? '<div class="limited">LIMITED</div>' : '';

    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link}', '_blank')">
        ${equipped}
        ${limited}
        <img src="${item.image || 'https://via.placeholder.com/90x70?text=?'}"
             onerror="this.src='https://via.placeholder.com/90x70?text=ERR'">
        <div class="item-name">${item.name || 'Unknown'}</div>
        <div class="item-price">${(item.price || 0).toLocaleString()} R$</div>
      </div>
    `;
  }

  // 🔥 NUMBER ANIMATION
  animate(el, end) {
    end = Number(end) || 0;
    let start = parseInt(el.textContent) || 0;
    const duration = 1200;
    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      
      const value = Math.floor(start + (end - start) * Math.min(progress / duration, 1));
      el.textContent = value.toLocaleString();
      
      if (progress < duration) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // 🔥 INTERACTIONS
  addInteractions() {
    // Copy button
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
      const btn = document.getElementById('copyBtn');
      btn.classList.add('copied');
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
      }, 2000);
    };

    // Mouse follow avatar
    document.addEventListener('mousemove', (e) => {
      const rect = document.getElementById('avatar3D').getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / 50;
      const y = (e.clientY - rect.top - rect.height / 2) / 50;
      this.targetX = x;
      this.targetY = y;
    });

    // Load items on start
    setTimeout(() => this.loadItems(), 500);
  }
}

// 🔥 INIT APP
document.addEventListener('DOMContentLoaded', () => {
  window.app = new PortfolioApp();
});
