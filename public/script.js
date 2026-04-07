class PortfolioApp {
  constructor() {
    this.ws = null;
    this.currentStats = { friends: -1, followers: -1, following: -1 };
    this.currentItemsHash = '';
    this.retryCount = 0;
    this.init();
  }

  init() {
    this.loadAvatar();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  // Simple avatar load - NO 3D
  async loadAvatar() {
    try {
      const res = await fetch('/api/avatar');
      const data = await res.json();
      const img = document.getElementById('avatarImg');
      img.src = data.image || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png';
    } catch (err) {
      console.error('Avatar load failed:', err);
    }
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
        this.updateLiveData(data);
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
      }, 2000 * this.retryCount);
    }
  }

  // 🔥 UPDATE ONLY IF DATA CHANGED
  updateLiveData(data) {
    // Update stats only if changed
    if (data.stats) {
      const statsChanged = 
        data.stats.friends !== this.currentStats.friends ||
        data.stats.followers !== this.currentStats.followers ||
        data.stats.following !== this.currentStats.following;
      
      if (statsChanged) {
        this.animate(document.getElementById("friends"), data.stats.friends);
        this.animate(document.getElementById("followers"), data.stats.followers);
        this.animate(document.getElementById("following"), data.stats.following);
        this.currentStats = { ...data.stats };
      }
    }
    
    // Update items only if changed
    if (data.items) {
      const itemsHash = JSON.stringify(data.items);
      if (itemsHash !== this.currentItemsHash && itemsHash !== '[]') {
        this.renderItems(data.items);
        this.currentItemsHash = itemsHash;
      }
    }
    
    document.getElementById('liveIndicator').textContent = '🟢';
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { 
          signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
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
      this.currentStats = { ...data };
    } catch (err) {
      console.error('Stats failed:', err);
    }
  }

  async loadItems() {
    const container = document.getElementById("itemsContainer");
    container.innerHTML = Array(8).fill().map(() => 
      '<div class="loading-smooth"></div>'
