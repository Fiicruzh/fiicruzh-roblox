class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarImg = null;
    this.isDragging = false;
    this.lastX = 0;
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.velocityY = 0;
    this.autoRotate = 0.4;
    this.init();
  }

  init() {
    console.log('🚀 Starting...');
    this.setup3DCanvas();
    this.loadAvatar();
    this.connectWebSocket();
    this.loadData();
    this.copyBtn();
  }

  setup3DCanvas() {
    const canvas = document.getElementById('avatar3D');
    canvas.width = 400;
    canvas.height = 400;
    
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      canvas.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const deltaX = e.clientX - this.lastX;
      this.velocityY = deltaX * 0.3;
      this.targetRotationY += deltaX * 0.5;
      this.lastX = e.clientX;
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      canvas.style.cursor = 'grab';
    });
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      this.lastX = e.touches[0].clientX;
    });
    document.addEventListener('touchmove', (e) => {
      if (!this.isDragging) return;
      e.preventDefault();
      const deltaX = e.touches[0].clientX - this.lastX;
      this.velocityY = deltaX * 0.3;
      this.targetRotationY += deltaX * 0.5;
      this.lastX = e.touches[0].clientX;
    });
    document.addEventListener('touchend', () => this.isDragging = false);
    
    this.animate3D(canvas);
  }

  loadAvatar() {
    fetch('/api/avatar')
      .then(res => res.json())
      .then(data => {
        console.log('Avatar:', data);
        this.avatarImg = new Image();
        this.avatarImg.crossOrigin = 'anonymous';
        this.avatarImg.src = data.image;
      })
      .catch(err => {
        console.error('Avatar fallback');
        this.avatarImg = new Image();
        this.avatarImg.src = `https://www.roblox.com/headshot-thumbnail/image?userId=${USER_ID}&width=420&height=420&format=png`;
      });
  }

  animate3D(canvas) {
    const ctx = canvas.getContext('2d');
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth rotation
      if (!this.isDragging) {
        this.velocityY *= 0.94;
        this.targetRotationY += this.velocityY + this.autoRotate;
      }
      this.rotationY += (this.targetRotationY - this.rotationY) * 0.12;
      
      // 3D Transform
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(this.rotationY * 0.008);
      
      // Glow lighting
      const gradient = ctx.createRadialGradient(0, -60, 0, 0, 0, 180);
      gradient.addColorStop(0, 'rgba(0,255,255,0.7)');
      gradient.addColorStop(0.6, 'rgba(0,255,255,0.2)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(-110, -110, 220, 220);
      
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 35;
      ctx.shadowOffsetX = 20;
      ctx.shadowOffsetY = 20;
      
      // Avatar
      if (this.avatarImg?.complete) {
        ctx.shadowColor = 'cyan';
        ctx.shadowBlur = 25;
        ctx.drawImage(this.avatarImg, -100, -100, 200, 200);
      }
      
      ctx.restore();
      requestAnimationFrame(render);
    };
    render();
  }

  connectWebSocket() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`);
    
    ws.onopen = () => {
      console.log('✅ WebSocket OK');
      document.getElementById('liveIndicator').textContent = '🟢';
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WS:', data);
      
      if (data.stats) {
        document.getElementById('friends').textContent = data.stats.friends || 0;
        document.getElementById('followers').textContent = data.stats.followers || 0;
        document.getElementById('following').textContent = data.following || 0;
      }
      
      if (data.items) {
        this.renderItems(data.items);
      }
    };
  }

  async loadData() {
    // Stats
    fetch('/api').then(res => res.json()).then(data => {
      document.getElementById('friends').textContent = data.friends || 0;
      document.getElementById('followers').textContent = data.followers || 0;
      document.getElementById('following').textContent = data.following || 0;
    });
    
    // Items
    fetch('/api/items').then(res => res.json()).then(data => {
      this.renderItems(data.items || []);
    });
  }

  renderItems(items) {
    const container = document.getElementById('itemsContainer');
    if (!items.length) {
      container.innerHTML = '<div style="padding:20px;color:#888;font-size:12px;text-align:center">No items equipped</div>';
      return;
    }
    
    container.innerHTML = items.map((item, i) => `
      <div class="item-card" onclick="window.open('${item.link}', '_blank')">
        ${i === 0 ? '<div class="equipped">ACTIVE</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/222/fff?text=?';">
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');
  }

  copyBtn() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4').then(() => {
        const btn = document.getElementById('copyBtn');
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#00ff88';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-user"></i> NSSxFiiCruzh | @dapaarowr4';
          btn.style.background = '';
        }, 1500);
      });
    };
  }
}

const app = new PortfolioApp();
