/**
 * Settings Module - Manages configuration settings from config.json
 */

const Settings = {
  config: {},

  async load() {
    try {
      const currentUser = (typeof App !== "undefined" && App.currentAccount) ? App.currentAccount : null;
      const email = currentUser?.email;

      if (!email) throw new Error("No signed-in user");

      const url = `/api/schools/by-user?email=${encodeURIComponent(email)}`;

      const response = await fetch(url);
      const json = await response.json();

      if (response.ok && json?.config_json) {
        this.config = json.config_json;
      } else {
        const fallback = await fetch("/Code/config.json");
        this.config = await fallback.json();
      }
      if (typeof App !== "undefined") {
        App.config = this.config;
        App.applyTheme();
        App.updateSidebarInfo();
      }
      this.render();
    } catch (e) {

      console.error("Failed to load config:", e);
      const container = document.getElementById("settings-content");
      if (container) {
        container.innerHTML = `<p style='color: red;'>Failed to load settings: ${this.escapeHtml(e.message)}</p>`;
      }
    }
  },

  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  },

  render() {
    const container = document.getElementById("settings-content");
    if (!container) return;
    const config = this.config || {};
    const theme = config.theme || {};
    const fields = Array.isArray(config.gradeFields) ? config.gradeFields : [];

    container.innerHTML = `
      <div class="settings-page">
        <nav class="settings-tabs" aria-label="Settings sections">
          <button type="button" class="settings-tab active" data-settings-tab="info">Info</button>
          <button type="button" class="settings-tab" data-settings-tab="theme">Theme</button>
          <button type="button" class="settings-tab" data-settings-tab="fields">Fields</button>
          <button type="button" class="settings-tab" data-settings-tab="apis">APIs</button>
        </nav>
        <form id="settings-form" class="settings-form">
          <section class="settings-panel active" data-settings-panel="info">
            <h3>School Information</h3>
            ${this.settingInput("School Name", "schoolName", config.schoolName || "")}
            ${this.settingInput("Location", "location", config.location || "")}
          </section>
          <section class="settings-panel" data-settings-panel="theme">
            <h3>School Theme</h3>
            <p class="settings-help">These colors apply to this school's LMS.</p>
            <div class="settings-color-grid">
              ${["primary", "secondary", "accent", "success", "warning", "background", "text"].map((key) => this.settingColor(key, theme[key] || "")).join("")}
            </div>
          </section>
          <section class="settings-panel" data-settings-panel="fields">
            <h3>Grade Fields</h3>
            <p class="settings-help">Use one field per line.</p>
            <textarea class="settings-input settings-fields-input" data-setting-key="gradeFields" rows="8">${this.escapeHtml(fields.join("\\n"))}</textarea>
          </section>
          <section class="settings-panel" data-settings-panel="apis">
            <h3>APIs</h3>
            ${this.settingInput("Student API Endpoint", "apiEndpoint", config.apiEndpoint || "")}
          </section>
          <div class="settings-actions">
            <button type="button" class="settings-save" id="settings-save">Save Settings</button>
            <button type="button" class="settings-reload" id="settings-reload">Reload</button>
          </div>
        </form>
      </div>`;

    container.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        container.querySelectorAll(".settings-tab").forEach((item) => item.classList.remove("active"));
        container.querySelectorAll(".settings-panel").forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
        container.querySelector(`[data-settings-panel="${tab.dataset.settingsTab}"]`)?.classList.add("active");
      });
    });
    container.querySelectorAll("[data-theme-key]").forEach((colorInput) => {
      colorInput.addEventListener("input", () => {
        const textInput = container.querySelector(`[data-theme-text-key="${colorInput.dataset.themeKey}"]`);
        if (textInput) textInput.value = colorInput.value;
      });
    });
    container.querySelector("#settings-save").onclick = () => this.save();
    container.querySelector("#settings-reload").onclick = () => this.load();
  },

  settingInput(label, key, value) {
    return `<label class="settings-field"><span>${label}</span><input class="settings-input" type="text" data-setting-key="${key}" value="${this.escapeHtml(value)}"></label>`;
  },

  settingColor(key, value) {
    const normalized = this.isColorValue(value) ? this.normalizeColor(value) : "#000000";
    return `<label class="settings-color-field"><span>${key}</span><input class="settings-color" type="color" data-theme-key="${key}" value="${normalized}"><input class="settings-input" type="text" data-theme-text-key="${key}" value="${this.escapeHtml(value)}"></label>`;
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
    const settings = JSON.parse(JSON.stringify(this.config || {}));
    const form = document.getElementById("settings-form");
    form.querySelectorAll("[data-setting-key]").forEach((input) => {
      const key = input.dataset.settingKey;
      settings[key] = key === "gradeFields"
        ? input.value.split("\\n").map((value) => value.trim()).filter(Boolean)
        : input.value;
    });
    settings.theme = { ...(settings.theme || {}) };
    form.querySelectorAll("[data-theme-text-key]").forEach((input) => {
      settings.theme[input.dataset.themeTextKey] = input.value.trim();
    });

    try {
      const currentUser = (typeof App !== "undefined" && App.currentAccount) ? App.currentAccount : null;
      const email = currentUser?.email;


      if (!email) {
        alert("✗ No signed-in user found. Please sign in again.");
        return;
      }

      const url = "/api/schools/update-config";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, schoolId: App.currentSchoolId, config_json: settings })
      });



      if (response.ok) {
        this.config = settings;
        App.config = settings;
        App.applyTheme();
        App.updateSidebarInfo();
        this.render();
        alert("Settings saved successfully.");
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
