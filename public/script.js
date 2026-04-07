class PortfolioApp {
  constructor() {
    this.lastStats = { friends: -1, followers: -1, following: -1 };
    this.lastItems = [];
    this.init();
  }

  init() {
    this.loadReal3DAvatar();
    this.loadStats();
    this.loadEquippedItems();
    this.addInteractions();
    this.connectWebSocket();
  }

  // 🔥 REAL ROBLOX 3D AVATAR - 360° Auto Rotate
  async loadReal3DAvatar() {
    const canvas = document.getElementById('avatar3D');
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 200;

    // Load Roblox avatar thumbnails untuk 360° effect
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    const images = [];
    
    for (let angle of angles) {
      try {
        const res = await fetch(`/api/avatar3d?angle=${angle}`);
        const data = await res.json();
        const img = new Image();
        img.src = data.image;
        images.push(img);
      } catch (e) {
        images.push(new Image());
      }
    }

    let rotation = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 3D projection
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * 0.01);
      
      // Lighting
      const gradient = ctx.createRadialGradient(0, -20, 0, 0, 0, 120);
      gradient.addColorStop(0, 'rgba(0,255,255,0.3)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      // Draw current frame
      const frame = Math.floor(rotation / 45) % 8;
      if (images[frame]?.complete) {
        ctx.shadowColor = 'cyan';
        ctx.shadowBlur = 15;
        ctx.drawImage(images[frame], -85, -85, 170, 170);
      }
      
      ctx.restore();
      rotation += 1;
      requestAnimationFrame(animate);
    }
    animate();
  }

  // 🔥 LOAD ALL EQUIPPED ITEMS
  async loadEquippedItems() {
    try {
      const res = await fetch('/api/equipped');
      const data = await res.json();
      
      if (JSON.stringify(data.items) !== JSON.stringify(this.lastItems)) {
        this.renderItems(data.items);
        this.lastItems = data.items;
      }
    } catch (err) {
      console.error('Equipped items failed:', err);
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
      <div class="item-card ${rarity}" onclick="window.open('${item.link}')">
        ${index < 3 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null">
        <div class="item-name">${item.name}</div>
      </div>
    `;
  }

  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
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

  animate(el, end) {
    end = Number(end) || 0;
    let start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    const duration = 800;
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

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      document.getElementById('liveIndicator').textContent = '🟢';
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.equipped) {
          if (JSON.stringify(data.equipped.items) !== JSON.stringify(this.lastItems)) {
            this.renderItems(data.equipped.items);
            this.lastItems = data.equipped.items;
          }
        }
        if (data.stats) {
          Object.keys(data.stats).forEach(key => {
            if (data.stats[key] !== this.lastStats[key]) {
              this.animate(document.getElementById(key), data.stats[key]);
              this.lastStats[key] = data.stats[key];
            }
          });
        }
      } catch (err) {}
    };

    ws.onclose = () => {
      document.getElementById('liveIndicator').textContent = '🔴';
    };
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
        }, 1500);
      });
    };

    // Auto refresh equipped items every 15s
    setInterval(() => this.loadEquippedItems(), 15000);
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
