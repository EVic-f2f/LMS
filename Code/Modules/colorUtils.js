const ColorUtils = {
  isColorValue(value) {
    const color = String(value || '').trim();
    if (!color) return false;
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      return CSS.supports('color', color);
    }
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)
      || /^(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\(/i.test(color)
      || /^(?:transparent|currentcolor)$/i.test(color);
  },

  toPickerColor(value) {
    const color = String(value || '').trim();
    if (!this.isColorValue(color)) return null;
    const hex = color.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      if (hex[1].length === 3 || hex[1].length === 4) {
        return `#${hex[1].slice(0, 3).split('').map((channel) => channel + channel).join('')}`;
      }
      return `#${hex[1].slice(0, 6)}`;
    }

    const rgb = color.match(/^rgba?\(\s*([\d.]+%?)[,\s]+([\d.]+%?)[,\s]+([\d.]+%?)/i);
    if (rgb) {
      const toHex = (channel) => {
        const numeric = Number.parseFloat(channel);
        const value8Bit = channel.endsWith('%') ? numeric * 2.55 : numeric;
        return Math.max(0, Math.min(255, Math.round(value8Bit))).toString(16).padStart(2, '0');
      };
      return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
    }
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    try {
      context.fillStyle = color;
    } catch (error) {
      return null;
    }
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    const toHex = (channel) => channel.toString(16).padStart(2, '0');
    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorUtils;
}
