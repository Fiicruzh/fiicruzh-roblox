class PortfolioApp {
  constructor() {
    this.ws = null;
    this.avatarCtx = null;
    this.avatarImg = null;

    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.rotationX = 0;
    this.rotationY = 0;

    this.velocityX = 0;
    this.velocityY = 0;

    this.targetRotationX = 0;
    this.targetRotationY = 0;

    this.prevItemsHash = "";

    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadAvatar3D();
    this.connectWebSocket();
    this.loadStats();
    this.loadItems();
    this.addInteractions();
  }

  setupCanvas() {
    const canvas = document.getElementById('avatar3D');
    this.avatarCtx = canvas.getContext('2d');

    canvas.addEventListener('mousedown', (e) => this.startDrag(e));
    canvas.addEventListener('mousemove', (e) => this.drag(e));
    canvas.addEventListener('mouseup', () => this.stopDrag());
    canvas.addEventListener('mouseleave', () => this.stopDrag());

    canvas.addEventListener('touchstart', (e) => this.startDrag(e.touches[0]));
    canvas.addEventListener('touchmove', (e) => this.drag(e.touches[0]));
    canvas.addEventListener('touchend', () => this.stopDrag());
  }

  startDrag(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  drag(e) {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;

    this.velocityY = dx * 0.2;
    this.velocityX = dy * 0.2;

    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  stopDrag() {
    this.isDragging = false;
  }

  async loadAvatar3D() {
    const res = await fetch('/api/avatar');
    const data = await res.json();

    this.avatarImg = new Image();
    this.avatarImg.src = data.image;

    this.animate3D();
  }

  animate3D() {
    const canvas = document.getElementById('avatar3D');

    const render = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // inertia smooth
      this.rotationX += this.velocityX;
      this.rotationY += this.velocityY;

      this.velocityX *= 0.95;
      this.velocityY *= 0.95;

      if (!this.isDragging) {
        this.rotationY += 0.1; // auto spin smooth
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);

      const scale = 1 + Math.sin(this.rotationX * 0.01) * 0.05;
      ctx.scale(scale, scale);

      ctx.rotate(this.rotationY * 0.01);

      if (this.avatarImg.complete) {
        ctx.drawImage(this.avatarImg, -85, -85, 170, 170);
      }

      ctx.restore();

      requestAnimationFrame(render);
    };

    render();
  }

  connectWebSocket() {
    const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.items) {
        this.smartUpdateItems(data.items, data.totalValue);
      }

      if (data.stats) {
        this.animate(document.getElementById("friends"), data.stats.friends);
        this.animate(document.getElementById("followers"), data.stats.followers);
        this.animate(document.getElementById("following"), data.stats.following);
      }
    };
  }

  // 🔥 ONLY UPDATE IF CHANGED
  smartUpdateItems(items, totalValue) {
    const hash = JSON.stringify(items);

    if (hash === this.prevItemsHash) return;

    this.prevItemsHash = hash;

    this.renderItems(items);
    document.getElementById("totalValue").textContent =
      `${(totalValue || 0).toLocaleString()} R$`;
  }

  async loadStats() {
    const res = await fetch('/api');
    const data = await res.json();

    this.animate(document.getElementById("friends"), data.friends);
    this.animate(document.getElementById("followers"), data.followers);
    this.animate(document.getElementById("following"), data.following);
  }

  async loadItems() {
    const res = await fetch('/api/items');
    const data = await res.json();

    this.smartUpdateItems(data.items, data.totalValue);
  }

  renderItems(items) {
    const container = document.getElementById("itemsContainer");

    container.innerHTML = items.map(item => `
      <div class="item-card">
        <img src="${item.image}">
        <div class="item-name">${item.name}</div>
        <div class="item-price">${item.price} R$</div>
      </div>
    `).join('');
  }

  animate(el, end) {
    el.textContent = Number(end).toLocaleString();
  }

  addInteractions() {
    setInterval(() => {
      this.loadItems();
      this.loadStats();
    }, 30000);
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new PortfolioApp();
});
