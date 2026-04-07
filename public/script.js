class PortfolioApp {
  constructor() {
    this.prevItemsHash = "";
    this.rotationY = 0;
    this.velocity = 0;
    this.isDragging = false;
    this.lastX = 0;

    this.init();
  }

  init() {
    this.setupCanvas();
    this.loadAvatar();
    this.connectWS();
    this.loadItems();
    this.loadStats();
  }

  setupCanvas() {
    const canvas = document.getElementById("avatar3D");

    canvas.onmousedown = (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
    };

    canvas.onmousemove = (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastX;
      this.velocity = dx * 0.3;
      this.lastX = e.clientX;
    };

    canvas.onmouseup = () => this.isDragging = false;
  }

  async loadAvatar() {
    const res = await fetch("/api/avatar");
    const data = await res.json();

    this.img = new Image();
    this.img.src = data.image;

    this.animate();
  }

  animate() {
    const canvas = document.getElementById("avatar3D");
    const ctx = canvas.getContext("2d");

    const loop = () => {
      ctx.clearRect(0,0,200,200);

      this.rotationY += this.velocity;
      this.velocity *= 0.95;

      if (!this.isDragging) this.rotationY += 0.1;

      ctx.save();
      ctx.translate(100,100);
      ctx.rotate(this.rotationY * 0.01);

      if (this.img.complete) {
        ctx.drawImage(this.img, -80, -80, 160, 160);
      }

      ctx.restore();
      requestAnimationFrame(loop);
    };

    loop();
  }

  connectWS() {
    const ws = new WebSocket(`ws://${location.host}`);

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.items) {
        this.smartUpdate(data.items, data.totalValue);
      }

      if (data.stats) {
        document.getElementById("friends").textContent = data.stats.friends;
        document.getElementById("followers").textContent = data.stats.followers;
        document.getElementById("following").textContent = data.stats.following;
      }
    };
  }

  smartUpdate(items, total) {
    const hash = JSON.stringify(items);
    if (hash === this.prevItemsHash) return;

    this.prevItemsHash = hash;

    document.getElementById("itemsContainer").innerHTML =
      items.map(i => `
        <div class="item-card">
          <img src="${i.image}">
          <div>${i.name}</div>
          <div>${i.price} R$</div>
        </div>
      `).join("");

    document.getElementById("totalValue").textContent =
      total.toLocaleString() + " R$";
  }

  async loadItems() {
    const res = await fetch("/api/items");
    const data = await res.json();
    this.smartUpdate(data.items, data.totalValue);
  }

  async loadStats() {
    const res = await fetch("/api");
    const data = await res.json();

    document.getElementById("friends").textContent = data.friends;
    document.getElementById("followers").textContent = data.followers;
    document.getElementById("following").textContent = data.following;
  }
}

new PortfolioApp();
