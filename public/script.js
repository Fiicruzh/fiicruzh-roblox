class PortfolioApp {
  constructor() {
    this.ws = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 2000;
    this.init();
  }

  init() {
    this.connectWebSocket();
    this.loadStats();
    this.loadAvatar3D();
    this.animateNumbers();
    this.addInteractions();
    setInterval(() => this.loadStats(), 10000);
  }

  // 🔥 WEBSOCKET LIVE UPDATE
  connectWebSocket() {
    this.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.retryCount = 0;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.updateLiveData(data);
    };

    this.ws.onclose = () => {
      console.log('❌ WebSocket disconnected, retrying...');
      this.smartReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  smartReconnect() {
    if (this.retryCount < this.maxRetries) {
      setTimeout(() => {
        this.retryCount++;
        this.connectWebSocket();
      }, this.retryDelay * this.retryCount);
    }
  }

  updateLiveData(data) {
    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.stats.following);
    }
    
    if (data.items) {
      this.renderItems(data.items);
      document.getElementById("totalValue").textContent = `${data.totalValue.toLocaleString()} R$`;
    }
  }

  // 🔥 3D AVATAR
  async loadAvatar3D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      
      if (data.image) {
        this.render3DModel(data.image);
      }
    } catch (err) {
      console.log('Avatar 3D failed:', err);
    }
  }

  render3DModel(imageUrl) {
    const canvas = document.getElementById('avatar3D');
    const ctx = canvas.getContext('2d');
    let rotationX = 0, rotationY = 0;
    let mouseX = 0, mouseY = 0;

    function draw3D() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 3D Transform
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotationY * 0.01);
      ctx.scale(1, 0.8 + Math.sin(Date.now() * 0.005) * 0.1);
      ctx.rotate(rotationX * 0.01);
      
      // Gradient shadow
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 80);
      gradient.addColorStop(0, 'rgba(0,255,255,0.3)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(-90, -90, 180, 180);
      
      // Load and draw image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.save();
        ctx.shadowColor = 'cyan';
        ctx.shadowBlur = 20;
        ctx.drawImage(img, -80, -80, 160, 160);
        ctx.restore();
        ctx.restore();
        requestAnimationFrame(draw3D);
      };
      img.src = imageUrl;
      
      rotationX += (mouseY * 0.3 - rotationX) * 
