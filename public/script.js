class RobloxTracker {
  constructor() {
    this.USER_ID = 8941948601;
    this.currentUserId = this.USER_ID;
    this.ws = null;
    this.totalValue = 0;
    this.init();
  }

  init() {
    this.loadAll();
    this.setupControls();
    this.connectWS();
    this.init3DAvatar();
  }

  setupControls() {
    // Ctrl+U = Toggle Username Search
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        const input = document.getElementById('usernameInputContainer');
        input.classList.toggle('show');
        if (input.classList.contains('show')) {
          document.getElementById('usernameInput').focus();
        }
      }
    });

    // Username Search
    document.getElementById('usernameInput').addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const username = e.target.value.trim();
        if (username) {
          await this.searchUser(username);
        }
      }
    });

    // Copy Username
    window.copyUsername = () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
      const btn = document.getElementById('copyBtn');
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 2000);
    };
  }

  async searchUser(username) {
    try {
      const res = await this.smartFetch(`https://users.roblox.com/v1/usernames/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      const data = await res.json();
      this.currentUserId = data.data?.[0]?.id || this.USER_ID;
      this.loadAll();
      document.getElementById('usernameInputContainer').classList.remove('show');
    } catch (e) {
      console.error('User not found');
    }
  }

  async smartFetch(url, options, retries = 5) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      
      if (!res.ok && retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return this.smartFetch(url, options, retries - 1);
      }
      
      return res;
    } catch (e) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 2000));
        return this.smartFetch(url, options, retries - 1);
      }
      throw e;
    }
  }

  async loadAll() {
    await Promise.all([
      this.loadStats(),
      this.loadItems(),
      this.loadAvatar()
    ]);
  }

  async loadStats() {
    try {
      const [friends, followers, following] = await Promise.all([
        this.smartFetch(`https://friends.roblox.com/v1/users/${this.currentUserId}/friends/count`).then(r => r.json()),
        this.smartFetch(`https://friends.roblox.com/v1/users/${this.currentUserId}/followers/count`).then(r => r.json()),
        this.smartFetch(`https://friends.roblox.com/v1/users/${this.currentUserId}/followings/count`).then(r => r.json())
      ]);

      this.animateNumber('friends', friends.count || 0);
      this.animateNumber('followers', followers.count || 0);
      this.animateNumber('following', following.count || 0);
    } catch (e) {
      this.animateNumber('friends', 0);
      this.animateNumber('followers', 0);
      this.animateNumber('following', 0);
    }
  }

  animateNumber(id, end) {
    const el = document.getElementById(id);
    let start = 0;
    const duration = 1200;
    let startTime = null;

    const step = (t) => {
      if (!startTime) startTime = t;
      const progress = t - startTime;
      const value = Math.floor((progress / duration) * end);
      el.innerText = value > end ? end : value;
      if (progress < duration) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async loadItems() {
    const container = document.getElementById('itemsContainer');
    this.showSkeleton(container);

    try {
      const wear = await this.smartFetch(`https://avatar.roblox.com/v1/users/${this.currentUserId}/currently-wearing`).then(r => r.json());
      const ids = wear.assetIds || [];

      if (ids.length === 0) {
        this.renderItems([], container);
        return;
      }

      const [thumbsRes, details] = await Promise.all([
        this.smartFetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids.join(',')}&size=150x150&format=Png`).then(r => r.json()),
        Promise.all(ids.map(id => this.smartFetch(`https://economy.roblox.com/v2/assets/${id}/details`).then(r => r.json()).catch(() => ({}))))
      ]);

      const items = ids.map((id, i) => {
        const detail = details[i];
        const thumb = thumbsRes.data?.find(t => t.targetId == id);
        return {
          name: detail.Name || 'Unknown',
          price: detail.PriceInRobux || 0,
          limited: detail.IsLimited || detail.IsLimitedUnique || false,
          image: thumb?.imageUrl || 'https://via.placeholder.com/150?text=No+Image',
          link: `https://www.roblox.com/catalog/${id}`
        };
      });

      this.totalValue = items.reduce((sum, item) => sum + item.price, 0);
      document.getElementById('totalValue').innerText = `$${this.totalValue.toLocaleString()}`;
      document.getElementById('totalValueStat').style.display = 'block';

      this.renderItems(items, container);
    } catch (e) {
      container.innerHTML = '<div style="font-size:11px;color:#666;text-align:center;padding:20px;">⚠️ Gagal load items</div>';
    }
  }

  showSkeleton(container) {
    container.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      container.appendChild(sk);
    }
  }

  renderItems(items, container) {
    container.innerHTML = '';
    const displayItems = items.length ? items.slice(0, 20) : [
      {name:'No Items', price:0, image:'https://via.placeholder.com/90?text=No+Items', link:'#', limited:false}
    ];
    
    displayItems.forEach((item, i) => {
      const card = this.createItemCard(item, i === 0);
      container.appendChild(card);
    });
  }

  createItemCard(item, isEquipped) {
    const rarity = this.getRarity(item.price);
    const div = document.createElement('div');
    div.className = `item-card ${rarity}`;
    div.innerHTML = `
      ${isEquipped ? '<div class="equipped">ON</div>' : ''}
      ${item.limited ? '<div class="limited">LIMITED</div>' : ''}
      <img src="${item.image}" onerror="this.src='https://via.placeholder.com/90?text=?';">
      <div class="item-name">${item.name}</div>
      <div class="item-price">${item.price.toLocaleString()} R$</div>
    `;
    div.onclick = () => window.open(item.link, '_blank');
    return div;
  }

  getRarity(price) {
    if (price > 10000) return 'legendary';
    if (price > 5000) return 'epic';
    if (price > 1000) return 'rare';
    return 'normal';
  }

  async loadAvatar() {
    try {
      const res = await this.smartFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${this.currentUserId}&size=420x420&format=Png&isCircular=false`);
      const data = await res.json();
      const img = document.getElementById('avatar');
      img.src = data.data?.[
