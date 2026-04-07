class PortfolioApp {
  constructor() {
    this.lastItems = [];
    this.lastStats = { friends: -1, followers: -1, following: -1 };
    this.init();
  }

  async init() {
    await Promise.all([
      this.loadReal3DAvatar(),
      this.loadEquippedItems(),
      this.loadStats()
    ]);
    this.addInteractions();
    this.connectWebSocket();
  }

  // 🔥 REAL 3D AVATAR - 360° Canvas Rotation
  async loadReal3DAvatar() {
    const canvas = document.createElement('canvas');
    canvas.id = 'avatar3D';
    canvas.width = 200;
    canvas.height = 200;
    canvas.className = 'avatar-canvas';
    document.querySelector('.avatar-box').appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let rotation = 0;
    let images = [];

    // Load 8 angles untuk 3D effect
    for (let i = 0; i < 8; i++) {
      try {
        const res = await fetch(`/api/avatar`);
        const data = await res.json();
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = data.image;
        images[i] = img;
      } catch {
        images[i] = new Image();
        images[i].src = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=8941948601&size=420x420&format=Png`;
      }
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth 3D rotation
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * 0.02) + Math.sin(rotation * 0.01) * 0.1);
      
      // Dynamic lighting
      const gradient = ctx.createRadialGradient(0, -25, 0, 0, 0, 100);
      gradient.addColorStop(0, 'rgba(0,255,255,0.4)');
      gradient.addColorStop(0.6, 'rgba(0,255,255,0.1)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      // Shadow & glow
      ctx.shadowColor = 'rgba(0,255,255,0.6)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 8;
      
      // Draw current frame
      const frame = Math.floor(rotation / 45) % 8;
      if (images[frame]?.complete && images[frame].naturalWidth > 0) {
        ctx.drawImage(images[frame], -90, -90, 180, 180);
      }
      
      ctx.restore();
      rotation += 1.2;
      requestAnimationFrame(animate);
    }
    animate();
  }

  // 🔥 LOAD ALL EQUIPPED ITEMS WITH RARITY
  async loadEquippedItems() {
    try {
      const res = await fetch('/api/equipped');
      const data = await res.json();
      
      if (JSON.stringify(data.items) !== JSON.stringify(this.lastItems)) {
        this.renderItems(data.items || []);
        this.lastItems = data.items;
        document.getElementById('liveIndicator').textContent = '🟢';
      }
    } catch (err) {
      console.error('Items load error:', err);
    }
  }

  renderItems(items) {
    const container = document.getElementById('itemsContainer');
    if (!items.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:12px">No items equipped</div>';
      return;
    }

    container.innerHTML = items.map((item, index) => {
      const rarity = this.getRarity(item.name);
      return `
        <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
          ${index < 4 ? '<div class="equipped">ON</div>' : ''}
          ${item.limited ? '<div class="limited">★ LIMITED</div>' : ''}
          <img src="${item.image}" 
               onerror="this.src='https://via.placeholder.com/90x70/222/fff?text=ROBLOX';this.onerror=null;"
               loading="lazy">
          <div class="item-name">${item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name}</div>
        </div>
      `;
    }).join('');
  }

  getRarity(name) {
    const lower = name.toLowerCase();
    if (lower.includes('legendary') || lower.includes('dragon') || lower.includes('golden')) return 'legendary';
    if (lower.includes('epic') || lower.includes('shadow') || lower.includes('neon')) return 'epic';
    if (lower.includes('rare') || lower.includes('star') || lower.includes('crystal')) return 'rare';
    return '';
  }

  async loadStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      
      // Smooth counter animation
      this.animateCounter('friends', data.friends || 0);
      this.animateCounter('followers', data.followers || 0);
      this.animateCounter('following', data.following || 0);
      
      this.lastStats = data;
    } catch (err) {
      console.error('Stats error:', err);
    }
  }

  animateCounter(id, target) {
    const el = document.getElementById(id);
    const current = parseInt(el.textContent.replace(/,/g, '')) || 0;
    if (Math.abs(target - current) < 10) {
      el.textContent = target.toLocaleString();
      return;
    }

    let startTime = null;
    const duration = 1200;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.floor(current + (target - current) * eased);
      
      el.textContent = value.toLocaleString();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  // 🔥 OPTIMIZED WEBSOCKET
  connectWebSocket() {
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/websocket`);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        document.getElementById('liveIndicator').textContent = '🟢';
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.equipped && JSON.stringify(data.equipped.items) !== JSON.stringify(this.lastItems)) {
            this.renderItems(data.equipped.items);
            this.lastItems = data.equipped.items;
          }
          if (data.stats) {
            Object.entries(data.stats).forEach(([key, value]) => {
              if (this.lastStats[key] !== value) {
                this.animateCounter(key, value);
                this.lastStats[key] = value;
              }
            });
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      ws.onclose = () => {
        document.getElementById('liveIndicator').textContent = '🔴';
        // Auto reconnect
        setTimeout(() => this.connectWebSocket(), 5000);
      };
    } catch (e) {
      console.error('WebSocket init failed:', e);
    }
  }

  addInteractions() {
    // Copy button with feedback
    const copyBtn = document.getElementById('copyBtn');
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '✅ Copied!';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
        }, 2000);
      } catch {
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = 'NSSxFiiCruzh | @dapaarowr4';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    };

    // Auto refresh
    setInterval(() => {
      this.loadEquippedItems();
      this.loadStats();
    }, 25000); // 25s
  }
}

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PortfolioApp());
} else {
  new PortfolioApp();
}
