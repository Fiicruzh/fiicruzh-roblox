class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarImg = null;
    this.lastStats = { friends: -1, followers: -1, following: -1 };
    this.lastItems = null;
    this.init();
  }

  async init() {
    this.updateStatus('🟡 Initializing...', '⚪');
    await this.setupAvatar();
    this.connectWebSocket();
    await this.loadAllData();
    this.addInteractions();
  }

  async setupAvatar() {
    const canvas = document.getElementById('avatar3D');
    const ctx = canvas.getContext('2d');
    
    // Default Roblox avatar langsung
    this.avatarImg = new Image();
    this.avatarImg.crossOrigin = 'anonymous';
    this.avatarImg.onload = () => {
      document.getElementById('avatarStatus').textContent = '✅ Avatar loaded';
      this.animateAvatar(ctx);
    };
    this.avatarImg.onerror = () => {
      document.getElementById('avatarStatus').textContent = '🔄 Retrying...';
      this.loadRealAvatarFallback();
    };
    
    this.avatarImg.src = `https://tr.rbxcdn.com/HEADSHOT-THUMBNAIL?userId=8941948601&width=420&height=420&format=png`;
  }

  async loadRealAvatarFallback() {
    try {
      const res = await fetch('/api/avatar', { cache: 'no-cache' });
      const data = await res.json();
      this.avatarImg.src = data.image;
    } catch (e) {
      console.log('Using default avatar');
    }
  }

  animateAvatar(ctx) {
    let rotation = 0;
    const canvas = document.getElementById('avatar3D');

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * 0.008));
      
      // 3D lighting
      const gradient = ctx.createRadialGradient(0, -25, 0, 0, 0, 120);
      gradient.addColorStop(0, 'rgba(0,255,255,0.5)');
      gradient.addColorStop(0.6, 'rgba(0,255,255,0.2)');
      gradient.addColorStop(1, 'transparent');
      
      ctx.shadowColor = 'rgba(0,255,255,0.3)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      
      if (app.avatarImg.complete) {
        ctx.drawImage(app.avatarImg, -90, -90, 180, 180);
      }
      
      ctx.restore();
      rotation += 1;
      requestAnimationFrame(render);
    }
    render();
  }

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket OK');
      this.updateStatus('🟢 Live', '🟢');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleUpdate(data);
      } catch (e) {
        console.error('WS error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('🔄 WS reconnecting...');
      this.updateStatus('🔄 Reconnecting...', '🔴');
      setTimeout(() => this.connectWebSocket(), 2000);
    };
  }

  async loadAllData() {
    this.updateStatus('📊 Loading data...', '⚪');
    
    await Promise.allSettled([
      this.loadStats(),
      this.loadItems()
    ]);
    
    this.updateStatus('✅ All loaded', '🟢');
  }

  async loadStats() {
    try {
      const res = await fetch('/api', { cache: 'no-cache' });
      const data = await res.json();
      
      document.getElementById('friends').textContent = data.friends?.toLocaleString() || '0';
      document.getElementById('followers').textContent = data.followers?.toLocaleString() || '0';
      document.getElementById('following').textContent = data.following?.toLocaleString() || '0';
      
      document.getElementById('friendsLabel').textContent = 'Koneksi';
      document.getElementById('followersLabel').textContent = 'Pengikut';
      document.getElementById('followingLabel').textContent = 'Mengikuti';
      
      this.lastStats = data;
    } catch (e) {
      console.error('Stats error:', e);
      this.setStatsError();
    }
  }

  async loadItems() {
    try {
      const res = await fetch('/api/items', { cache: 'no-cache' });
      const data = await res.json();
      this.renderItems(data.items || []);
    } catch (e) {
      console.error('Items error:', e);
      document.getElementById('itemsContainer').innerHTML = 
        '<div class="error-msg">Failed to load items</div>';
    }
  }

  handleUpdate(data) {
    if (data.stats && (
      data.stats.friends !== this.lastStats.friends ||
      data.stats.followers !== this.lastStats.followers ||
      data.stats.following !== this.lastStats.following
    )) {
      this.animateNumber('friends', data.stats.friends || 0);
      this.animateNumber('followers', data.stats.followers || 0);
      this.animateNumber('following', data.stats.following || 0);
      this.lastStats = data.stats;
    }
    
    if (data.items && JSON.stringify(data.items) !== JSON.stringify(this.lastItems)) {
      this.renderItems(data.items);
      this.lastItems = data.items;
    }
  }

  renderItems(items) {
    const container = document.getElementById('itemsContainer');
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="no-items">No items equipped</div>';
      return;
    }

    container.innerHTML = items.map((item, i) => `
      <div class="item-card ${this.getRarity(item)}" onclick="window.open('${item.link}', '_blank')">
        ${i === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">★</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/222/aaa?text=?'" loading="lazy">
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');
  }

  getRarity(item) {
    if (item.limited) return 'legendary';
    return '';
  }

  animateNumber(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent.replace(/,/g, '')) || 0;
    let progress = 0;
    
    const animate = () => {
      progress += 0.1;
      const value = Math.floor(start + (target - start) * progress);
      el.textContent = value.toLocaleString();
      
      if (progress < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  setStatsError() {
    document.getElementById('friends').textContent = '0';
    document.getElementById('followers').textContent = '0';
    document.getElementById('following').textContent = '0';
  }

  updateStatus(text, indicator) {
    document.getElementById('avatarStatus').textContent = text;
    document.getElementById('liveIndicator').textContent = indicator;
  }

  addInteractions() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        const original = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = original;
          btn.classList.remove('copied');
        }, 1500);
      });
    };
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
