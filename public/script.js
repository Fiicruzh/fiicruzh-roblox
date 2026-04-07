class PortfolioApp {
  constructor() {
    this.ws = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.avatarTexture = null;
    this.mesh = null;
    this.lastData = {};
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.initThreeJS();
    this.loadAvatar3D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  // 🔥 THREE.JS 3D AVATAR
  initThreeJS() {
    const container = document.getElementById('avatarContainer');
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 2);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    this.renderer.setSize(180, 180);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);
    
    // Sphere geometry for avatar
    const geometry = new THREE.SphereGeometry(0.8, 64, 64);
    
    // Material with custom shader for lighting
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 100,
      specular: 0x111111
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    this.scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0x00ffff, 1, 10);
    pointLight.position.set(2, 2, 2);
    this.scene.add(pointLight);
    
    // Auto rotation
    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    if (this.mesh && this.avatarTexture) {
      this.mesh.rotation.y += 0.01;
      this.mesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.1;
    }
    
    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  async loadAvatar3D() {
    try {
      const res = await this.fetchWithRetry('/api/avatar');
      const data = await res.json();
      
      if (data.image) {
        this.avatarTexture = new THREE.TextureLoader().load(data.image, 
          (texture) => {
            if (this.mesh) {
              this.mesh.material.map = texture;
              this.mesh.material.needsUpdate = true;
            }
          },
          undefined,
          () => {
            console.error('Avatar texture failed to load');
          }
        );
      }
    } catch (err) {
      console.error('Avatar load failed:', err);
    }
  }

  // 🔥 WEBSOCKET - UPDATE ONLY ON CHANGE
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
        this.connectWebSocket();
      }, 2000 * this.retryCount);
    }
  }

  // 🔥 SMART UPDATE - ONLY IF CHANGED
  updateLiveData(data) {
    // Update stats only if changed
    if (data.stats && (
      data.stats.friends !== this.lastData.friends ||
      data.stats.followers !== this.lastData.followers ||
      data.stats.following !== this.lastData.following
    )) {
      this.animate(document.getElementById("friends"), data.stats.friends);
      this.animate(document.getElementById("followers"), data.stats.followers);
      this.animate(document.getElementById("following"), data.stats.following);
      this.lastData.friends = data.stats.friends;
      this.lastData.followers = data.stats.followers;
      this.lastData.following = data.stats.following;
    }
    
    // Update items only if changed
    if (data.items && JSON.stringify(data.items) !== JSON.stringify(this.lastData.items)) {
      this.renderItems(data.items);
      this.lastData.items = data.items;
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
      this.lastData.friends = data.friends || 0;
      this.lastData.followers = data.followers || 0;
      this.lastData.following = data.following || 0;
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
      this.lastData.items = data.items || [];
    } catch (err) {
      console.error('Items failed:', err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px">Loading...</div>';
    }
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");
    if (!items?.length) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:#666;font-size:12px;width:100%;flex-shrink:0">No items equipped</div>';
      return;
    }

    container.innerHTML = items.map((item, i) => this.createItemCard(item, i)).join('');
  }

  getRarity(item) {
    if (item.limited) return "legendary";
    return "";
  }

  createItemCard(item, index) {
    const rarity = this.getRarity(item);
    return `
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/333/fff?text=?';this.onerror=null" loading="lazy">
        <div class="item-name" title="${item.name}">${item.name}</div>
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
