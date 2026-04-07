class PortfolioApp {
  constructor() {
    this.lastStats = { friends: -1, followers: -1, following: -1 };
    this.lastItemsHash = '';
    this.init();
  }

  init() {
    this.loadAvatar();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
    this.connectWebSocket();
  }

  // 🔥 LOAD AVATAR 3D DIRECT FROM ROBLOX
  async loadAvatar() {
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      document.getElementById('avatar3D').src = data.image;
    } catch (err) {
      console.error('Avatar load failed:', err);
      document.getElementById('avatar3D').src = 'https://thumbnails.roblox.com/v1/users/avatar?userIds=8941948601&size=420x420&format=Png&isCircular=false';
    }
  }

  // 🔥 SMART LOAD - ONLY IF CHANGED
  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
      // Only update if changed
      if (data.friends !== this.lastStats.friends) {
        this.animate(document.getElementById("friends"), data.friends);
        this.lastStats.friends = data.friends;
      }
      if (data.followers !== this.lastStats.followers) {
        this.animate(document.getElementById("followers"), data.followers);
        this.lastStats.followers = data.followers;
      }
      if (data.following !== this.lastStats.following) {
        this.animate(document.getElementById("following"), data.following);
        this.lastStats.following = data.following;
      }
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
      
      // Hash check - only update if changed
      const itemsHash = JSON.stringify(data.items.map(i => i.name + i.image));
      if (itemsHash !== this.lastItemsHash) {
        this.renderItems(data.items);
        this.lastItemsHash = itemsHash;
      }
      
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

  getRarity(itemName) {
    const name = itemName.toLowerCase();
    if (name.includes('legendary') || name.includes('dragon') || name.includes('golden')) return "legendary";
    if (name.includes('epic') || name.includes('shadow') || name.includes('neon')) return "epic";
    if (name.includes('rare') || name.includes('star') || name.includes('crystal')) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item.name);
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

  // 🔥 LIGHT WEBSOCKET - NO SPAM
  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stats) {
          Object.keys(data.stats).forEach(key => {
            if (data.stats[key] !== this.lastStats[key]) {
              this.animate(document.getElementById(key), data.stats[key]);
              this.lastStats[key] = data.stats[key];
            }
          });
        }
        if (data.items) {
          const itemsHash = JSON.stringify(data.items.map(i => i.name + i.image));
          if (itemsHash !== this.lastItemsHash) {
            this.renderItems(data.items);
            this.lastItemsHash = itemsHash;
          }
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      document.getElementById('liveIndicator').textContent = '🔴';
    };
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

    // Check for updates every 60s (lightweight)
    setInterval(() => {
      this.loadStats();
      this.loadItems();
    }, 60000);
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
