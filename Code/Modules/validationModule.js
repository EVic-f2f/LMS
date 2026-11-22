/**
 * Validation Module - Handles input validation and constraints
 */

const Validation = {
  maxScores: {},

  setMaxScores(scores) {
    this.maxScores = scores;
  },

  validateScore(event) {
    const cell = event.target;
    const field = cell.dataset.field;
    const max = this.maxScores[field];

    if (max !== undefined) {
      const value = parseFloat(cell.textContent);
      if (!isNaN(value) && value > max) {
        cell.textContent = max.toString();
      } else if (isNaN(value) && cell.textContent.trim() !== "") {
        cell.textContent = "";
      }
    } else {
      const value = cell.textContent.trim();
      if (value !== "" && isNaN(parseFloat(value))) {
        cell.textContent = "";
      }
    }
  },

  async setMaxScore(columnIndex, field) {
    const max = await AppDialogs.prompt(`Enter max score for ${field}:`, {
      title: 'Set maximum score',
      inputLabel: 'Maximum score',
      placeholder: 'For example, 100'
    });
    const numMax = parseFloat(max);
    if (!isNaN(numMax) && numMax > 0) {
      this.maxScores[field] = numMax;
      Storage.saveMaxScores(this.maxScores);

      document.querySelectorAll(`[data-field="${field}"]`).forEach(cell => {
        const value = parseFloat(cell.textContent);
        if (!isNaN(value) && value > numMax) {
          cell.textContent = numMax.toString();
        }
      });

      return true;
    }
    return false;
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Validation;
}
