class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;
    this.retryCount = 0;
    this.lastStats = { friends: 0, followers: 0, following: 0 };
    this.lastItems = [];
    this.init();
  }

  init() {
    this.setupAvatar();
    this.connectWebSocket();
    this.loadInitialData();
    this.addInteractions();
  }

  setupAvatar() {
    const canvas = document.getElementById('avatar3D');
    this.avatarCtx = canvas.getContext('2d');
    this.loadRealRobloxAvatar();
    this.animateAvatar();
  }

  async loadRealRobloxAvatar() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      this.avatarImg = new Image();
      this.avatarImg.crossOrigin = 'anonymous';
      this.avatarImg.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=8941948601&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar load failed:', err);
      this.avatarImg = new Image();
      this.avatarImg.src = 'https://www.roblox.com/headshot-thumbnail/image?userId=8941948601&width=420&height=420&format=png';
    }
  }

  animateAvatar() {
    const canvas = document.getElementById('avatar3D');
    let rotation = 0;

    function render() {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * 0.01);
      
      // Real Roblox 3D lighting effect
      const gradient = ctx.createRadialGradient(0, -30, 0, 0, 0, 100);
      gradient.addColorStop(0, 'rgba(0,255,255,0.4)');
      gradient.addColorStop(0.5, 'rgba(0,255,255,0.1)');
      gradient.addColorStop(1, 'transparent');
      
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;
      
      if (app.avatarImg && app.avatarImg.complete) {
        ctx.drawImage(app.avatarImg, -85, -85, 170, 170);
      }
      
      ctx.restore();
      rotation += 0.5;
      requestAnimationFrame(render);
    }
    render();
  }

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
      this.retryCount = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.updateOnlyIfChanged(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      document.getElementById('liveIndicator').textContent = '🔴';
      this.smartReconnect();
    };
  }

  smartReconnect() {
    if (this.retryCount < 5) {
      setTimeout(() => {
        this.retryCount++;
        this.connectWebSocket();
      }, 3000);
    }
  }

  // ✅ UPDATE ONLY IF CHANGED - NO SPAM
  updateOnlyIfChanged(data) {
    if (data.stats) {
      const statsChanged = 
        data.stats.friends !== this.lastStats.friends ||
        data.stats.followers !== this.lastStats.followers ||
        data.stats.following !== this.lastStats.following;
      
      if (statsChanged) {
        this.animate(document.getElementById("friends"), data.stats.friends);
        this.animate(document.getElementById("followers"), data.stats.followers);
        this.animate(document.getElementById("following"), data.stats.following);
        this.lastStats = { ...data.stats };
      }
    }
    
    if (data.items && JSON.stringify(data.items) !== JSON.stringify(this.lastItems)) {
      this.renderItems(data.items);
      this.lastItems = [...data.items];
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

  async loadInitialData() {
    await Promise.all([
      this.loadStats(),
      this.loadItems()
    ]);
  }

  async loadStats() {
    try {
      const res = await this.fetchWithRetry('/api');
      const data = await res.json();
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
      this.lastStats = { ...data };
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
      this.lastItems = [...data.items];
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">Loading items...</div>';
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

  getRarity(item) {
    if (item.limited || item.IsLimited || item.IsLimitedUnique) return "legendary";
    if (item.name.toLowerCase().includes('epic') || item.name.toLowerCase().includes('legendary')) return "epic";
    if (item.name.toLowerCase().includes('rare') || item.name.toLowerCase().includes('uncommon')) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item);
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/333/fff?text=?';this.onerror=null" loading="lazy">
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
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
