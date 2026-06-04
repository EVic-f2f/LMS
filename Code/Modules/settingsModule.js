/**
 * Settings Module - Manages configuration settings from config.json
 */

const Settings = {
  config: {},

  async load() {
    try {
      const response = await fetch("../Code/config.json");
      this.config = await response.json();
      this.render();
    } catch (e) {
      console.error("Failed to load config:", e);
      document.getElementById("settings-content").innerHTML = "<p style='color: red;'>Failed to load settings</p>";
    }
  },

  render() {
    const container = document.getElementById("settings-content");
    container.innerHTML = "";

    const form = document.createElement("form");
    form.id = "settings-form";
    form.style.cssText = "display: grid; gap: 20px;";

    this.renderObject(this.config, form, "");

    const buttonGroup = document.createElement("div");
    buttonGroup.style.cssText = "display: flex; gap: 10px; margin-top: 20px;";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "💾 Save Settings";
    saveBtn.onclick = () => this.save();
    saveBtn.style.cssText = "padding: 12px 24px; background: linear-gradient(135deg, #27ae60 0%, #229954 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "🔄 Reload";
    resetBtn.onclick = () => this.load();
    resetBtn.style.cssText = "padding: 12px 24px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;";

    buttonGroup.appendChild(saveBtn);
    buttonGroup.appendChild(resetBtn);
    form.appendChild(buttonGroup);

    container.appendChild(form);
  },

  renderObject(obj, parent, prefix, depth = 0) {
    const indent = depth * 20;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Skip defaultStudents array
        if (key === "defaultStudents") {
          continue;
        }

        const value = obj[key];
        const fieldKey = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
          this.renderArray(value, parent, fieldKey, depth);
        } else if (value !== null && typeof value === "object") {
          this.renderSection(key, parent, depth);
          this.renderObject(value, parent, fieldKey, depth + 1);
        } else {
          this.renderField(key, value, fieldKey, parent, indent);
        }
      }
    }
  },

  renderSection(title, parent, depth) {
    const section = document.createElement("div");
    section.style.cssText = `margin-top: ${depth > 0 ? '15px' : '0'}; padding-top: 15px; border-top: 2px solid #ecf0f1;`;

    const heading = document.createElement("h4");
    heading.textContent = title.charAt(0).toUpperCase() + title.slice(1);
    heading.style.cssText = "color: #2c3e50; margin: 0 0 10px 0; font-size: 1em;";

    section.appendChild(heading);
    parent.appendChild(section);
  },

  renderField(label, value, key, parent, indent) {
    const group = document.createElement("div");
    group.style.cssText = `margin-left: ${indent}px; display: flex; flex-direction: column; gap: 5px;`;

    const labelEl = document.createElement("label");
    labelEl.textContent = label.charAt(0).toUpperCase() + label.slice(1).replace(/([A-Z])/g, ' $1');
    labelEl.style.cssText = "font-weight: 600; color: #2c3e50; font-size: 0.95em;";

    let input;
    if (typeof value === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value;
      input.dataset.key = key;
      input.style.cssText = "width: 20px; height: 20px; cursor: pointer;";
    } else if (typeof value === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.value = value;
      input.dataset.key = key;
      input.style.cssText = "padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-size: 0.95em;";
    } else if (typeof value === "string" && (value.includes("\n") || value.length > 50)) {
      input = document.createElement("textarea");
      input.value = value;
      input.dataset.key = key;
      input.rows = 3;
      input.style.cssText = "padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-size: 0.95em; font-family: monospace;";
    } else if (typeof value === "string" && this.isColorValue(value)) {
      // Color picker for color fields
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display: flex; gap: 10px; align-items: center;";

      input = document.createElement("input");
      input.type = "color";
      input.value = this.normalizeColor(value);
      input.dataset.key = key;
      input.style.cssText = "width: 50px; height: 40px; cursor: pointer; border: none; border-radius: 4px;";

      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.value = value;
      textInput.dataset.key = key;
      textInput.style.cssText = "flex: 1; padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-size: 0.95em; font-family: monospace;";

      // Sync color picker and text input
      input.addEventListener("input", (e) => {
        textInput.value = e.target.value;
      });
      textInput.addEventListener("input", (e) => {
        if (this.isColorValue(e.target.value)) {
          input.value = this.normalizeColor(e.target.value);
        }
      });

      wrapper.appendChild(input);
      wrapper.appendChild(textInput);

      group.appendChild(labelEl);
      group.appendChild(wrapper);
      parent.appendChild(group);
      return;
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.value = value;
      input.dataset.key = key;
      input.style.cssText = "padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px; font-size: 0.95em;";
    }

    group.appendChild(labelEl);
    group.appendChild(input);
    parent.appendChild(group);
  },

  isColorValue(str) {
    if (typeof str !== "string") return false;
    // Check if it's a hex color or RGB
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(str) || /^rgb/.test(str);
  },

  normalizeColor(str) {
    if (/^#/.test(str)) return str;
    if (/^rgb/.test(str)) {
      // Simple rgb to hex conversion (not perfect but works)
      const match = str.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]).toString(16).padStart(2, '0');
        const g = parseInt(match[1]).toString(16).padStart(2, '0');
        const b = parseInt(match[2]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    return "#000000";
  },

  renderArray(arr, parent, fieldKey, depth) {
    const section = document.createElement("div");
    section.style.cssText = `margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #3498db;`;

    const heading = document.createElement("h5");
    heading.textContent = fieldKey.split(".").pop();
    heading.style.cssText = "color: #2c3e50; margin: 0 0 10px 0;";
    section.appendChild(heading);

    arr.forEach((item, index) => {
      const itemDiv = document.createElement("div");
      itemDiv.style.cssText = "margin: 10px 0; padding: 10px; background: white; border-radius: 4px; border-left: 3px solid #3498db;";

      if (typeof item === "object" && item !== null) {
        const heading = document.createElement("h6");
        heading.textContent = `Item ${index + 1}`;
        heading.style.cssText = "color: #34495e; margin: 0 0 8px 0; font-size: 0.9em;";
        itemDiv.appendChild(heading);

        const subForm = document.createElement("form");
        subForm.style.cssText = "display: grid; gap: 10px;";
        this.renderObject(item, subForm, `${fieldKey}[${index}]`, depth + 1);
        itemDiv.appendChild(subForm);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.value = item;
        input.dataset.key = `${fieldKey}[${index}]`;
        input.style.cssText = "padding: 8px; border: 1px solid #bdc3c7; border-radius: 4px;";
        itemDiv.appendChild(input);
      }

      section.appendChild(itemDiv);
    });

    parent.appendChild(section);
  },

  getFormData() {
    const form = document.getElementById("settings-form");
    const inputs = form.querySelectorAll("input, textarea, select");
    const data = {};

    inputs.forEach((input) => {
      const key = input.dataset.key;
      if (!key) return;

      let value;
      if (input.type === "checkbox") {
        value = input.checked;
      } else if (input.type === "number") {
        value = parseFloat(input.value) || input.value;
      } else {
        value = input.value;
      }

      // Handle nested keys like "theme.primary"
      const keys = key.split(/[\.\[\]]/).filter(k => k);
      let current = data;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) {
          current[k] = isNaN(keys[i + 1]) ? {} : [];
        }
        current = current[k];
      }

      current[keys[keys.length - 1]] = value;
    });

    return data;
  },

  async save() {
    const settings = this.getFormData();

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        this.config = settings;
        alert("✓ Settings saved successfully! Reloading page...");
        // Auto-reload page after 1 second to apply changes
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert("✗ Failed to save settings to server");
      }
    } catch (e) {
      alert("✗ Error saving settings: " + e.message);
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Settings;
}
