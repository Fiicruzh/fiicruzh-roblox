class PortfolioApp {
  constructor() {
    this.ws = null;
    this.lastData = { stats: {}, items: [] };
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.initThreeJS();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  // 🎮 THREE.JS 3D AVATAR
  initThreeJS() {
    const container = document.getElementById('avatarContainer');
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    
    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.z = 3;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(180, 180);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // Avatar texture
    this.loadAvatarTexture(scene, renderer, camera);
    
    // Auto rotation
    let rotationY = 0;
    function animate() {
      requestAnimationFrame(animate);
      rotationY += 0.008;
      scene.rotation.y = rotationY;
      renderer.render(scene, camera);
    }
    animate();

    // Responsive
    window.addEventListener('resize', () => {
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      renderer.setSize(180, 180);
    });
  }

  loadAvatarTexture(scene, renderer, camera) {
    fetch('/api/avatar')
      .then(res => res.json())
      .then(data => {
        if (data.image) {
          const texture = new THREE.TextureLoader().load(data.image);
          const geometry = new THREE.SphereGeometry(1, 32, 32);
          const material = new THREE.MeshPhongMaterial({ 
            map: texture,
            shininess: 100
          });
          const sphere = new THREE.Mesh(geometry, material);
          sphere.scale.x = 1.2;
          scene.add(sphere);

          // Lighting
          const light = new THREE.DirectionalLight(0xffffff, 1);
          light.position.set(1, 1, 1);
          scene.add(light);
          scene.add(new THREE.AmbientLight(0x404040));
        } else {
          this.createFallbackAvatar(scene);
        }
      })
      .catch(() => {
        this.createFallbackAvatar(scene);
      });
  }

  createFallbackAvatar(scene) {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x00ffff,
      shininess: 100,
      emissive: 0x002222
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.scale.x = 1.2;
    scene.add(sphere);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040));
  }

  // 🔥 WEBSOCKET - UPDATE ONLY IF CHANGED
  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/websocket`;
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      document.getElementById('liveIndicator').textContent = '🟢';
      this.retryCount = 0;
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
      this.smartReconnect();
    };
  }

  smartReconnect() {
    if (this.retryCount < 5) {
      setTimeout(() => {
        this.retryCount++;
        this.connectWebSocket();
      }, 2000 * Math.pow(1.5, this.retryCount));
    }
  }

  // ✅ UPDATE ONLY IF CHANGED - NO SPAM
  updateIfChanged(newData) {
    let hasChanges = false;

    // Check stats changes
    if (newData.stats) {
      const statsChanged = 
        newData.stats.friends !== this.lastData.stats.friends ||
        newData.stats.followers !== this.lastData.stats.followers ||
        newData.stats.following !== this.lastData.stats.following;
      
      if (statsChanged) {
        this.animate(document.getElementById("friends"), newData.stats.friends);
        this.animate(document.getElementById("followers"), newData.stats.followers);
        this.animate(document.getElementById("following"), newData.stats.following);
        hasChanges = true;
      }
      this.lastData.stats = newData.stats;
    }

    // Check items changes
    if (newData.items && JSON.stringify(newData.items) !== JSON.stringify(this.lastData.items)) {
      this.renderItems(newData.items);
      hasChanges = true;
      this.lastData.items = newData.items;
    }

    if (hasChanges) {
      document.getElementById('liveIndicator').textContent = '🟢';
    }
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
      this.lastData.stats = data;
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
      <div class="item-card ${rarity}" onclick="window.open('${item.link || '#'}', '_blank')">
        ${index === 0 ? '<div class="equipped">ON</div>' : ''}
        ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
        <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90x70/111/0ff?text=?';this.onerror=null" loading="lazy">
        <div class="item-name">${item.name}</div>
      </div>
    `;
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
