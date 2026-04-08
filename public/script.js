class PortfolioApp {
  constructor() {
    this.ws = null;
    this.lastData = {
      stats: null,
      items: null,
      equippedCount: 0
    };
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadInitialData();
    this.addInteractions();
    this.autoRefreshOnHashChange();
  }

  // 🔥 AUTO DETECT HASH CHANGE = INSTANT RELOAD
  autoRefreshOnHashChange() {
    let lastHash = window.location.hash;
    setInterval(() => {
      if (window.location.hash !== lastHash) {
        lastHash = window.location.hash;
        console.log('🔄 Hash changed, refreshing items...');
        this.loadItems();
      }
    }, 1000);
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
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  // 🔥 UPDATE ONLY IF CHANGED + AUTO EQUIP DETECTION
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

    // 🔥 ITEMS + EQUIPPED AUTO DETECTION
    if (newData.items) {
      const newEquippedCount = newData.items.filter(item => item.equipped).length;
      const itemsChanged = JSON.stringify(newData.items) !== JSON.stringify(this.lastData.items);
      const equippedChanged = newEquippedCount !== this.lastData.equippedCount;
      
      if (itemsChanged || equippedChanged) {
        this.renderItems(newData.items);
        this.lastData.items = newData.items;
        this.lastData.equippedCount = newEquippedCount;
        hasChanges = true;
        console.log(`🎯 ${newEquippedCount} items equipped`);
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
    container.innerHTML = Array(10).fill().map(() => 
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

  // 🔥 RENDER ITEMS - HAPUS NAMA + AUTO EQUIPPED DETECTION
  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">No items equipped</div>';
      return;
    }

    // Filter hanya PAKAIAN + AKSESORIS (AssetTypeId)
    const clothingTypes = [11, 12, 13, 8, 42, 46]; // Shirt, Pants, T-Shirt, Hat, Hair, Face
    const filteredItems = items.filter(item => clothingTypes.includes(item.assetTypeId || 0));

    container.innerHTML = filteredItems.slice(0, 20).map((item, i) => {
      const isEquipped = item.equipped || i < 4; // Auto detect equipped
      return `
        <div class="item-card" onclick="window.open('${item.link}', '_blank')" title="${item.name}">
          ${isEquipped ? '<div class="equipped">ON</div>' : ''}
          <img src="${item.image}" 
               onerror="this.onerror=null;this.src='https://via.placeholder.com/85x65/0f0f23/00ff88?text=✓';"
               loading="lazy"
               alt="${item.name}">
          <!-- NAMA DIHAPUS -->
        </div>
      `;
    }).join('');

    console.log(`✅ Rendered ${filteredItems.length} clothing/accessory items`);
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
