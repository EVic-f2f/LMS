/**
 * Shared VIC loading screen with the particle and rotating-ring animation.
 */

const IntroVideo = {
  overlay: null,
  canvas: null,
  context: null,
  particles: [],
  animationFrame: null,
  finishTimer: null,
  hideTimer: null,
  initialized: false,
  mouse: { x: null, y: null, radius: 130 },

  init() {
    if (this.initialized) {
      this.showOverlay();
      return;
    }

    this.initialized = true;
    this.createOverlay();
    this.setupParticleCanvas();
    this.showOverlay();

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1500 : 4200;
    this.finishTimer = window.setTimeout(() => this.finish(), duration);
  },

  createOverlay() {
    let overlay = document.getElementById("vic-loading-screen");
    const oldOverlay = document.getElementById("intro-video-overlay");
    if (oldOverlay) oldOverlay.remove();

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "vic-loading-screen";
      overlay.className = "vic-loading-screen";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-label", "Loading VIC systems");
      overlay.innerHTML = `
        <canvas id="vic-particle-canvas" class="vic-particle-canvas"></canvas>
        <div class="vic-loader-container">
          <div class="vic-ring-wrapper">
            <div class="vic-loader-circle"></div>
            <div class="vic-loader-line-mask"><div class="vic-loader-line"></div></div>
            <div class="vic-logo" aria-label="VIC systems">
              <span class="vic-logo-main">VIC</span><span class="vic-logo-sub">systems</span>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    this.overlay = overlay;
    this.canvas = overlay.querySelector("#vic-particle-canvas");
  },

  showOverlay() {
    if (!this.overlay) return;
    this.overlay.classList.remove("hidden");
    this.overlay.classList.remove("is-fading");
  },

  finish() {
    if (this.finishTimer) {
      window.clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    if (!this.overlay) return;
    if (this.overlay.classList.contains("is-fading")) return;

    this.overlay.classList.add("is-fading");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lingerDelay = reducedMotion ? 150 : 1750;
    this.hideTimer = window.setTimeout(() => {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.overlay.classList.add("hidden");
      this.overlay.classList.remove("is-fading");
      this.hideTimer = null;
    }, lingerDelay);
  },

  setupParticleCanvas() {
    if (!this.canvas) return;
    this.context = this.canvas.getContext("2d");
    this.bindMouseEvents();
    window.addEventListener("resize", () => this.resize());
    this.resize();
  },

  bindMouseEvents() {
    window.addEventListener("mousemove", (event) => {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    });
    window.addEventListener("mouseleave", () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
  },

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.particles = [];
    const count = Math.floor((this.width * this.height) / 14000);
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 1.6 + 1
      });
    }
    if (!this.animationFrame) this.animate();
  },

  animate() {
    if (!this.context) return;
    this.context.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i];

      if (this.mouse.x !== null && this.mouse.y !== null) {
        const dx = particle.x - this.mouse.x;
        const dy = particle.y - this.mouse.y;
        const distance = Math.hypot(dx, dy);
        if (distance < this.mouse.radius && distance > 0) {
          const force = (this.mouse.radius - distance) / this.mouse.radius;
          particle.x += (dx / distance) * force * 2.2;
          particle.y += (dy / distance) * force * 2.2;
        }
      }

      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0 || particle.x > this.width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > this.height) particle.vy *= -1;

      this.context.beginPath();
      this.context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.context.fillStyle = "rgba(100, 116, 139, 0.45)";
      this.context.fill();

      for (let j = i + 1; j < this.particles.length; j += 1) {
        const other = this.particles[j];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        if (distance < 115) {
          this.context.beginPath();
          this.context.moveTo(particle.x, particle.y);
          this.context.lineTo(other.x, other.y);
          this.context.strokeStyle = `rgba(100, 116, 139, ${(1 - distance / 115) * 0.18})`;
          this.context.lineWidth = 0.8;
          this.context.stroke();
        }
      }

      if (this.mouse.x !== null && this.mouse.y !== null) {
        const mouseDistance = Math.hypot(particle.x - this.mouse.x, particle.y - this.mouse.y);
        if (mouseDistance < 150) {
          this.context.beginPath();
          this.context.moveTo(particle.x, particle.y);
          this.context.lineTo(this.mouse.x, this.mouse.y);
          this.context.strokeStyle = `rgba(71, 85, 105, ${(1 - mouseDistance / 150) * 0.25})`;
          this.context.lineWidth = 0.9;
          this.context.stroke();
        }
      }
    }

    this.animationFrame = requestAnimationFrame(() => this.animate());
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => IntroVideo.init(), { once: true });
} else {
  IntroVideo.init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = IntroVideo;
}
