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
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  updateIfChanged(newData) {
    let hasChanges = false;

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
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      document.getElementById('avatarImg').src = data.image || 'https://via.placeholder.com/180?text=ROBLOX';
    } catch (err) {
      console.error('Avatar load failed');
    }

    this.loadStats();
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
    container.innerHTML = '<div class="loading-smooth" style="grid-column: 1 / -1;"></div>';

    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      this.renderItems(data.items || {});
      this.lastData.items = data.items;
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px;grid-column:1/-1">Loading...</div>';
    }
  }

  renderItems(categorizedItems) {
    const container = document.getElementById("itemsContainer");
    
    if (!categorizedItems || Object.keys(categorizedItems).length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;padding:20px;text-align:center;color:#666;font-size:12px">
          No items equipped
        </div>
      `;
      return;
    }

    // Fixed categories order
    const categoryOrder = {
      pakaian: ['atasan', 'pakaian luar', 'bawahan', 'sepatu', 'kemeja klasik', 'kaus klasik'],
      aksesoris: ['kepala', 'wajah', 'leher', 'belakang', 'pinggang', 'bahu', 'depan', 'perlengkapan']
    };

    let html = '';

    // Pakaian (6 slots)
    categoryOrder.pakaian.forEach(cat => {
      const item = categorizedItems.pakaian?.[cat];
      if (item) {
        html += `
          <div class="item-category equipped" onclick="window.open('${item.link}', '_blank')">
            <img src="${item.image}" 
                 onerror="this.onerror=null;this.src='https://via.placeholder.com/70x60/0f0f23/00ff88?text=✓';">
          </div>
        `;
      } else {
        html += '<div class="item-category empty"><div>-</div></div>';
      }
    });

    // Aksesoris (8 slots)
    categoryOrder.aksesoris.forEach(cat => {
      const item = categorizedItems.aksesoris?.[cat];
      if (item) {
        html += `
          <div class="item-category equipped" onclick="window.open('${item.link}', '_blank')">
            <img src="${item.image}" 
                 onerror="this.onerror=null;this.src='https://via.placeholder.com/70x60/0f0f23/00ff88?text=✓';">
          </div>
        `;
      } else {
        html += '<div class="item-category empty"><div>-</div></div>';
      }
    });

    container.innerHTML = html;
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
      navigator.clipboard.writeText('@dapaarowr4').then(() => {
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
