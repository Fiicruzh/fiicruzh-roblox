class PortfolioApp {
  constructor() {
    this.ws = null;
    this.lastStats = { friends: 0, followers: 0, following: 0 };
    this.lastItems = [];
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadStats();
    this.loadAvatar();
    this.addInteractions();
  }

  // 🔥 CHANGE DETECTION - NO AUTO REFRESH
  hasDataChanged(newData, oldData) {
    if (!newData || !oldData) return true;
    
    if (newData.stats) {
      return newData.stats.friends !== this.lastStats.friends ||
             newData.stats.followers !== this.lastStats.followers ||
             newData.stats.following !== this.lastStats.following;
    }
    
    if (newData.items) {
      return JSON.stringify(newData.items) !== JSON.stringify(this.lastItems);
    }
    
    return false;
  }

  // 🔥 SIMPLE AVATAR
  async loadAvatar() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      const img = document.getElementById('avatarImg');
      img.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
      img.onerror = () => img.src = 'https://via.placeholder.com/180?text=ROBLOX';
    } catch (err) {
      console.error('Avatar failed:', err);
    }
  }

  // 🔥 WEBSOCKET - UPDATE ONLY ON CHANGE
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
        if (this.hasDataChanged(data, this.lastStats) || this.hasDataChanged(data, this.lastItems)) {
          this.updateLiveData(data);
        }
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
      }, 3000 * this.retryCount);
    }
  }

  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends || 0);
      this.animate(document.getElementById("followers"), data.stats.followers || 0);
      this.animate(document.getElementById("following"), data.stats.following || 0);
      
      this.lastStats = {
        friends: data.stats.friends || 0,
        followers: data.stats.followers || 0,
        following: data.stats.following || 0
      };
    }
    
    if (data.items) {
      this.renderItems(data.items || []);
      this.lastItems = data.items || [];
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
      this.lastStats = data;
    } catch (err) {
      console.error('Stats failed:', err);
    }
  }

  async loadItems() {
    const container = document.getElementById("itemsContainer");
    container.innerHTML = Array(12).fill().map(() => 
      '<div class="loading-smooth"></div>'
    ).join('');

    try {
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      this.renderItems(data.items || []);
      this.lastItems = data.items || [];
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">Loading items...</div>';
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px;min-width:300px">No items equipped</div>';
      return;
    }

    container.innerHTML = items.map((item, i) => this.createItemCard(item, i)).join('');
  }

  getRarity(item) {
    // FIXED: Use item data instead of price
    if (item.limited || item.name?.toLowerCase().includes('limited')) return "legendary";
    if (item.name?.toLowerCase().includes('epic') || item.name?.toLowerCase().includes('legendary')) return "epic";
    if (item.name?.toLowerCase().includes('rare') || item.name?.toLowerCase().includes('uncommon')) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item);
    const name = item.name?.replace(/[\$\$]/g, '') || 'Unknown Item';
    
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        <img src="${item.image}" 
             onerror="this.src='https://via.placeholder.com/85x55/333/ccc?text=Item';this.onerror=null"
             loading="lazy">
        <div class="item-name">${name}</div>
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

    // Manual refresh button (hidden)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        this.loadStats();
        this.loadItems();
      }
    });
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
