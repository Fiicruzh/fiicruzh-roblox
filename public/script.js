class PortfolioApp {
  constructor() {
    this.ws = null;
    this.lastData = {
      stats: null,
      items: null
    };
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadInitialData();
    this.addInteractions();
  }

  // 🔥 SMART WEBSOCKET - NO SPAM
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
        this.updateIfChanged(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      document.getElementById('liveIndicator').textContent = '🔴';
      // Auto reconnect after 5s
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  // 🔥 UPDATE ONLY IF CHANGED
  updateIfChanged(newData) {
    let hasChanges = false;

    // Stats check
    if (newData.stats) {
      const statsChanged = JSON.stringify(newData.stats) !== JSON.stringify(this.lastData.stats);
      if (statsChanged) {
        this.animate(document.getElementById("friends"), newData.stats.friends || 0);
        this.animate(document.getElementById("followers"), newData.stats.followers || 0);
        this.animate(document.getElementById("following"), newData.stats.following || 0);
        this.lastData.stats = newData.stats;
        hasChanges = true;
      }
    }

    // Items check
    if (newData.items) {
      const itemsChanged = JSON.stringify(newData.items) !== JSON.stringify(this.lastData.items);
      if (itemsChanged) {
        this.renderItems(newData.items);
        this.lastData.items = newData.items;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      document.getElementById('liveIndicator').textContent = '🟢';
      console.log('✅ Data updated');
    }
  }

  async loadInitialData() {
    // Load avatar
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      document.getElementById('avatarImg').src = data.image || 'https://via.placeholder.com/180?text=ROBLOX';
    } catch (err) {
      console.error('Avatar load failed');
    }

    // Load stats
    this.loadStats();

    // Load items
    this.loadItems();
  }

  async loadStats() {
    try {
      const res = await fetch('/api');
      const data = await res.json();
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
      this.lastData.stats = data;
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
      const res = await fetch('/api/items');
      const data = await res.json();
      this.renderItems(data.items || []);
      this.lastData.items = data.items;
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">Loading...</div>';
    }
  }

  renderItems(items) {
  const container = document.getElementById("itemsContainer");
  if (!items?.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">No items equipped</div>';
    return;
  }

  container.innerHTML = items.map((item, i) => `
    <div class="item-card" onclick="window.open('${item.link}', '_blank')">
      ${i < 3 ? '<div class="equipped">ON</div>' : ''}
      <img src="${item.image}" 
           onerror="this.src='https://via.placeholder.com/90x70/333/fff?text=?'; this.onerror=null"
           loading="lazy"
           alt="${item.name}">
      <div class="item-name">${item.name}</div>
    </div>
  `).join('');
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

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
