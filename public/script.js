class PortfolioApp {
  constructor() {
    this.ws = null;
    this.currentStats = { friends: -1, followers: -1, following: -1 };
    this.currentItemsHash = '';
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.loadAvatar();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  // Simple avatar load - NO 3D
  async loadAvatar() {
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      const img = document.getElementById('avatarImg');
      img.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar load failed:', err);
    }
  }

  // 🔥 WEBSOCKET - UPDATE ONLY IF CHANGED
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
        this.updateLiveData(data);
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
      }, 2000 * this.retryCount);
    }
  }

  // 🔥 UPDATE ONLY IF DATA CHANGED
  updateLiveData(data) {
    // Update stats only if changed
    if (data.stats) {
      const statsChanged = 
        data.stats.friends !== this.currentStats.friends ||
        data.stats.followers !== this.currentStats.followers ||
        data.stats.following !== this.currentStats.following;
      
      if (statsChanged) {
        this.animate(document.getElementById("friends"), data.stats.friends);
        this.animate(document.getElementById("followers"), data.stats.followers);
        this.animate(document.getElementById("following"), data.stats.following);
        this.currentStats = { ...data.stats };
      }
    }
    
    // Update items only if changed
    if (data.items) {
      const itemsHash = JSON.stringify(data.items);
      if (itemsHash !== this.currentItemsHash && itemsHash !== '[]') {
        this.renderItems(data.items);
        this.currentItemsHash = itemsHash;
      }
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(url, { 
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
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
      this.currentStats = { ...data };
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
      const itemsHash = JSON.stringify(data.items || []);
      this.currentItemsHash = itemsHash;
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
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/333/ccc?text=?';this.onerror=null;" loading="lazy">
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
      }).catch(() => {
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = 'NSSxFiiCruzh | @dapaarowr4';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      });
    };
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
