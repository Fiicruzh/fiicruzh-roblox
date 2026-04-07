class PortfolioApp {
  constructor() {
    this.ws = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.avatarMesh = null;
    this.loader = null;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.rotationY = 0;
    this.rotationX = 0;
    this.targetRotationY = 0;
    this.targetRotationX = 0;
    this.retryCount = 0;
    this.lastDataHash = '';
    this.init();
  }

  init() {
    this.setupThreeJS();
    this.loadRobloxAvatar();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  setupThreeJS() {
    const container = document.getElementById('avatarContainer');
    const canvas = document.getElementById('avatar3D');
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(2, 0.5, 2);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: canvas,
      alpha: true,
      antialias: true 
    });
    this.renderer.setSize(200, 200);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0x00ffff, 1);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
    
    const pointLight = new THREE.PointLight(0x00ffff, 0.5, 10);
    pointLight.position.set(-1, 1, 1);
    this.scene.add(pointLight);
    
    // GLTF Loader
    const { GLTFLoader } = THREE;
    this.loader = new GLTFLoader();
    
    // Auto rotation & render loop
    this.animate();
    
    // Mouse controls
    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());
    
    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.startDrag(e.touches[0]);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.drag(e.touches[0]);
    });
    canvas.addEventListener('touchend', () => {
      this.stopDrag();
    });
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  drag(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;
    
    this.targetRotationY += deltaX * 0.01;
    this.targetRotationX += deltaY * 0.01;
    
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    // Smooth rotation interpolation
    this.rotationY += (this.targetRotationY - this.rotationY) * 0.1;
    this.rotationX += (this.targetRotationX - this.rotationX) * 0.1;
    
    // Auto rotate when not dragging
    if (!this.isDragging) {
      this.targetRotationY += 0.003;
    }
    
    // Rotate avatar
    if (this.avatarMesh) {
      this.avatarMesh.rotation.y = this.rotationY;
      this.avatarMesh.rotation.x = Math.max(-Math.PI/4, Math.min(Math.PI/4, this.rotationX));
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  async loadRobloxAvatar() {
  try {
    const res = await this.fetchWithRetry('/api/avatar3d');
    const data = await res.json();
    
    if (data.gltfUrl) {
      // Try GLTF first
      this.loader.load(
        data.gltfUrl,
        (gltf) => {
          const model = gltf.scene;
          model.scale.set(2, 2, 2);
          model.position.y = -1;
          this.scene.add(model);
          this.avatarMesh = model;
          console.log('✅ Roblox GLTF loaded');
        },
        undefined,
        () => {
          console.log('❌ GLTF failed, using fallback');
          this.showFallbackAvatar();
        }
      );
    } else {
      this.showFallbackAvatar();
    }
  } catch (err) {
    console.error('Avatar load failed:', err);
    this.showFallbackAvatar();
  }
}

  // 🔥 WEBSOCKET REAL-TIME UPDATE (Smart - only on change)
  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ LIVE: WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
      this.retryCount = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.updateLiveData(data);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ LIVE: WebSocket disconnected');
      document.getElementById('liveIndicator').textContent = '🔴';
      this.smartReconnect();
    };
  }

  smartReconnect() {
    if (this.retryCount < 5) {
      setTimeout(() => {
        this.retryCount++;
        console.log(`🔄 Reconnecting... (${this.retryCount}/5)`);
        this.connectWebSocket();
      }, 2000 * Math.pow(1.5, this.retryCount));
    }
  }

  // Smart update - only if data changed
  updateLiveData(data) {
    const newHash = JSON.stringify(data);
    if (newHash === this.lastDataHash) return; // No change, skip update
    this.lastDataHash = newHash;

    if (data.stats) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.stats.following);
    }
    
    if (data.items) {
      this.renderItems(data.items);
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { 
          signal: AbortSignal.timeout(10000),
          cache: 'no-store'
        });
        if (res.ok) return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  async loadStats() {
    try {
      const res = await this.fetchWithRetry('/api');
      const data = await res.json();
      this.animate(document.getElementById("friends"), data.friends || 0);
      this.animate(document.getElementById("followers"), data.followers || 0);
      this.animate(document.getElementById("following"), data.following || 0);
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
      const res = await this.fetchWithRetry('/api/items');
      const data = await res.json();
      this.renderItems(data.items || []);
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

    container.innerHTML = items.map((item, i) => this.createItemCard(item, i)).join('');
  }

  getRarity(price) {
    if (price > 10000) return "legendary";
    if (price > 5000) return "epic";
    if (price > 1000) return "rare";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item.price);
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70?text=?';this.onerror=null" loading="lazy">
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
  }
}

// Global app instance
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
