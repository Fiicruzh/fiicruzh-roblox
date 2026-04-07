class RobloxPortfolio {
  constructor() {
    this.currentUserId = null;
    this.ws = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.init3D();
    await this.loadDefaultUser();
    this.connectWebSocket();
  }

  setupEventListeners() {
    // Search button
    document.getElementById('searchBtn').onclick = (e) => this.searchUser(e);
    document.getElementById('usernameInput').onkeypress = (e) => {
      if (e.key === 'Enter') this.searchUser(e);
    };

    // Copy username
    document.getElementById('copyBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText('NSSxFiiCruzh | @dapaarowr4');
    });
  }

  async searchUser(e) {
    e.preventDefault();
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) return;

    const btn = document.getElementById('searchBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;

    try {
      this.currentUserId = await this.usernameToUserId(username);
      if (this.currentUserId) {
        await this.loadAllData();
      } else {
        alert('Username tidak ditemukan!');
      }
    } catch (err) {
      console.error('Search error:', err);
      alert('Gagal mencari user!');
    } finally {
      btn.innerHTML = '<i class="fas fa-search"></i> Search';
      btn.disabled = false;
    }
  }

  async usernameToUserId(username) {
    try {
      const res = await this.fetchWithRetry(`https://users.roblox.com/v1/usernames/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
      });
      return res.data?.[0]?.id || null;
    } catch {
      return null;
    }
  }

  async loadDefaultUser() {
    this.currentUserId = 8941948601; // FiiCruzh default
    document.getElementById('usernameInput').value = 'FiiCruzh';
    await this.loadAllData();
  }

  async loadAllData() {
    await Promise.all([
      this.loadStats(),
      this.loadItems(),
      this.loadAvatar3D()
    ]);
  }

  async fetchWithRetry(url, options = {}, retries = this.maxRetries) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);
      return res;
    } catch (err) {
      if (retries > 0) {
        this.retryCount++;
        await new Promise(r => setTimeout(r, 1000 * (6 - this.retryCount)));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw err;
    }
  }

  async loadStats() {
    try {
      const [friends, followers, following] = await Promise.all([
        this.fetchWithRetry(`https://friends.roblox.com/v1/users/${this.currentUserId}/friends/count`).then(r => r.json()),
        this.fetchWithRetry(`https://friends.roblox.com/v1/users/${this.currentUser
