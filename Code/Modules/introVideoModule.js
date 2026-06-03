/**
 * Intro Video Module - plays a launch video for 5 seconds, pauses for site load, then resumes.
 */

const IntroVideo = {
  overlay: null,
  video: null,
  pausedAtFive: false,
  loadComplete: false,
  pauseTimer: null,

  init() {
    this.overlay = document.getElementById("intro-video-overlay");
    this.video = document.getElementById("intro-video");
    if (!this.overlay || !this.video) {
      return;
    }

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = "auto";

    this.setupEvents();
    this.showOverlay();
    this.startPlayback();

    if (document.readyState === "complete") {
      this.onSiteReady();
    } else {
      window.addEventListener("load", () => this.onSiteReady(), { once: true });
    }
  },

  showOverlay() {
    this.overlay.classList.remove("hidden");
  },

  startPlayback() {
    this.video.currentTime = 0;
    this.video.load();
    const promise = this.video.play();
    if (promise && promise.catch) {
      promise.catch(() => {
        // Silent fail for autoplay policies; video will still show if playable.
      });
    }

    this.pauseTimer = window.setTimeout(() => {
      this.pauseForLoad();
    }, 5000);
  },

  pauseForLoad() {
    if (!this.video) {
      return;
    }

    if (!this.video.paused) {
      this.video.pause();
    }

    if (this.video.currentTime < 5) {
      this.video.currentTime = 5;
    }

    this.pausedAtFive = true;
    if (this.loadComplete) {
      this.resumeAfterLoad();
    }
  },

  onSiteReady() {
    this.loadComplete = true;
    if (this.pausedAtFive) {
      this.resumeAfterLoad();
    }
  },

  resumeAfterLoad() {
    if (!this.video) {
      return;
    }

    if (this.video.ended) {
      this.finish();
      return;
    }

    const promise = this.video.play();
    if (promise && promise.catch) {
      promise.catch(() => {
        // Some browsers may still refuse autoplay; keep overlay visible until user interacts.
      });
    }
  },

  finish() {
    if (!this.overlay) {
      return;
    }

    this.overlay.classList.add("hidden");
  },

  setupEvents() {
    if (!this.video) {
      return;
    }

    this.video.addEventListener("ended", () => {
      this.finish();
    });

    this.video.addEventListener("error", () => {
      this.finish();
    });
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = IntroVideo;
}
