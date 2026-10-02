const VicTheme = {
  async load() {
    try {
      const response = await fetch('/api/vic-theme');
      if (!response.ok) return;
      this.apply(await response.json());
    } catch (error) {
      console.warn('VIC theme could not be loaded:', error.message);
    }
  },

  apply(theme) {
    const root = document.documentElement;
    Object.entries(theme || {}).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        root.style.setProperty(`--vic-${key}`, value);
      }
    });
  }
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => VicTheme.load());
}
