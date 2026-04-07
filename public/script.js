class PortfolioApp {
  constructor() {
    this.ws = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.mesh = null;
    this.isDragging = false;
    this.rotationY = 0;
    this.targetRotationY = 0;
    this.init();
  }

  init() {
    this.setup3D();
    this.connectWS();
    this.copyBtn();
    this.loadData();
  }

  setup3D() {
    const canvas = document.getElementById('avatar3D');
    const container = document.getElementById('avatarContainer');

    // Scene
    this.scene = new THREE.Scene();
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.z = 3;
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      alpha: true, 
      antialias: true 
    });
    this.renderer.setSize(200, 200);
    
    // Lights
    this.scene.add(new THREE.AmbientLight(0x404040));
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    this.scene.add(light);

    // Avatar model (ROBLOX HEAD)
    const geometry = new THREE.SphereGeometry(0.8, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x00ffff,
      shininess: 100 
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 0.2;
    this.scene.add(this.mesh);

    // Animate
    this.animate();
    
    // Drag
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.targetRotationY += e.movementX * 0.01;
      }
    });
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      canvas.style.cursor = 'grab';
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    // Smooth rotation
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    if (!this.isDragging) this.targetRotationY += 0.005;
    
    this.mesh.rotation.y = this.rotationY;
    this.renderer.render(this.scene, this.camera);
  }

  async loadData() {
    try {
      const [statsRes, itemsRes] = await Promise.all([
        fetch('/api'),
        fetch('/api/items')
      ]);
      
      const stats = await statsRes.json();
      const itemsData = await itemsRes.json();
      
      // Update stats
      this.animateNumber('friends', stats.friends);
      this.animateNumber('followers', stats.followers);
      this.animateNumber('following', stats.following);
      
      // Update items
      this.renderItems(itemsData.items);
      
    } catch (err) {
      console.error('Load error:', err);
    }
  }

  connectWS() {
    const ws = new WebSocket(`${location.protocol === 'wss:' ? 'wss' : 'ws'}://${location.host}/websocket`);
    this.ws = ws;
    
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.stats) {
        this.animateNumber('friends', data.stats.friends);
        this.animateNumber('followers', data.stats.followers);
        this.animateNumber('following', data.stats.following);
      }
      if (data.items) this.renderItems(data.items);
    };
  }

  animateNumber(id, target) {
    const el = document.getElementById(id);
    let start = parseInt(el.textContent) || 0;
    const duration = 800;
    let startTime = null;
    
    const step = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      el.textContent = Math.floor(start + (target - start) * progress).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  renderItems(items) {
    const container = document.getElementById('itemsContainer');
    if (!items || items.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:#666;font-size:12px">No items</div>';
      return;
    }
    
    container.innerHTML = items.map((item, i) => `
      <div class="item-card" onclick="window.open('${item.link}')">
        ${i === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">★</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?'">
        <div class="item-name">${item.name}</div>
      </div>
    `).join('');
  }

  copyBtn() {
    document.getElementById('copyBtn').onclick = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✅ Copied!';
      btn.style.background = '#00ff88';
      setTimeout(() => {
        btn.textContent = 'NSSxFiiCruzh | @dapaarowr4';
        btn.style.background = '';
      }, 1500);
    };
  }
}

new PortfolioApp();
