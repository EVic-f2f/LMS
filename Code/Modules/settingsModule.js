/**
 * Settings Module - Manages configuration settings from config.json
 */

const ThemeColorUtils = typeof module !== "undefined" && module.exports
  ? require("./colorUtils.js")
  : ColorUtils;

const Settings = {
  config: {},
  activeTab: "info",

  async load() {
    try {
      const currentUser = (typeof App !== "undefined" && App.currentAccount) ? App.currentAccount : null;
      const email = currentUser?.email;

      if (!email) throw new Error("No signed-in user");

      const schoolQuery = App.currentSchoolId
        ? `&schoolId=${encodeURIComponent(App.currentSchoolId)}`
        : "";
      const url = `/api/schools/by-user?email=${encodeURIComponent(email)}${schoolQuery}`;
      const token = localStorage.getItem(Auth.SESSION_KEY);

      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const json = await response.json();

      if (response.ok && json?.config_json) {
        this.config = {
          ...json.config_json,
          ...(!json.config_json.schoolName && json.school?.name ? { schoolName: json.school.name } : {})
        };
        App.currentSchoolId = json.school?.id || App.currentSchoolId;
      } else {
        throw new Error(json?.error || "Unable to load settings for the selected school.");
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
    const schoolName = config.schoolName || App.currentSchoolName || "School settings";
    const location = config.location || "Location not set";
    const previewColors = ["primary", "secondary", "accent", "background"].map((key) => {
      const color = this.isColorValue(theme[key]) ? this.normalizeColor(theme[key]) : "#d8d8d8";
      return `<span class="settings-preview-swatch" style="--swatch-color:${this.escapeHtml(color)}" title="${key}"></span>`;
    }).join("");

    container.innerHTML = `
      <div class="settings-page">
        <section class="settings-overview-card">
          <div class="settings-overview-copy">
            <div class="section-eyebrow">WORKSPACE CONFIGURATION</div>
            <h2>${this.escapeHtml(schoolName)}</h2>
            <p>${this.escapeHtml(location)} <span aria-hidden="true">·</span> ${fields.length} grade fields configured</p>
          </div>
          <div class="settings-theme-preview" aria-label="Current school theme">
            <span class="settings-theme-label">CURRENT THEME</span>
            <div class="settings-preview-swatches">${previewColors}</div>
          </div>
        </section>
        <div class="settings-intro">
          <div><div class="section-eyebrow">PREFERENCES</div><h2>School settings</h2></div>
          <p>Manage your school's identity, colors, grade fields, and API connection.</p>
        </div>
        <nav class="settings-tabs" aria-label="Settings sections">
          <button type="button" class="settings-tab ${this.activeTab === "info" ? "active" : ""}" data-settings-tab="info">School info</button>
          <button type="button" class="settings-tab ${this.activeTab === "theme" ? "active" : ""}" data-settings-tab="theme">Theme</button>
          <button type="button" class="settings-tab ${this.activeTab === "fields" ? "active" : ""}" data-settings-tab="fields">Grade fields</button>
          <button type="button" class="settings-tab ${this.activeTab === "apis" ? "active" : ""}" data-settings-tab="apis">API</button>
        </nav>
        <form id="settings-form" class="settings-form">
          <section class="settings-panel ${this.activeTab === "info" ? "active" : ""}" data-settings-panel="info">
            <div class="settings-panel-heading"><h3>School information</h3><p>These details appear across your school workspace.</p></div>
            ${this.settingInput("School Name", "schoolName", config.schoolName || "")}
            ${this.settingInput("Location", "location", config.location || "")}
          </section>
          <section class="settings-panel ${this.activeTab === "theme" ? "active" : ""}" data-settings-panel="theme">
            <div class="settings-panel-heading"><h3>School theme</h3>
            <p class="settings-help">These colors apply to this school's LMS.</p>
            </div>
            <div class="settings-color-grid">
              ${["primary", "secondary", "accent", "success", "warning", "background", "text"].map((key) => this.settingColor(key, theme[key] || "")).join("")}
            </div>
          </section>
          <section class="settings-panel ${this.activeTab === "fields" ? "active" : ""}" data-settings-panel="fields">
            <div class="settings-panel-heading"><h3>Grade fields</h3>
            <p class="settings-help">Use one field per line.</p>
            </div>
            <textarea class="settings-input settings-fields-input" data-setting-key="gradeFields" rows="8">${this.escapeHtml(fields.join("\n"))}</textarea>
          </section>
          <section class="settings-panel ${this.activeTab === "apis" ? "active" : ""}" data-settings-panel="apis">
            <div class="settings-panel-heading"><h3>API connection</h3><p>Configure the endpoint used by connected school services.</p></div>
            ${this.settingInput("Student API Endpoint", "apiEndpoint", config.apiEndpoint || "")}
          </section>
          <div class="settings-actions">
            <div id="settings-save-status" class="settings-save-status" role="status" aria-live="polite"></div>
            <div class="settings-action-buttons">
              <button type="button" class="settings-save app-primary-button" id="settings-save">Save changes</button>
              <button type="button" class="settings-reload app-secondary-button" id="settings-reload">Reload</button>
            </div>
          </div>
        </form>
      </div>`;

    container.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        container.querySelectorAll(".settings-tab").forEach((item) => item.classList.remove("active"));
        container.querySelectorAll(".settings-panel").forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
          this.activeTab = tab.dataset.settingsTab;
          container.querySelector(`[data-settings-panel="${tab.dataset.settingsTab}"]`)?.classList.add("active");
      });
    });
    container.querySelectorAll("[data-theme-key]").forEach((colorInput) => {
      colorInput.addEventListener("input", () => {
        const textInput = container.querySelector(`[data-theme-text-key="${colorInput.dataset.themeKey}"]`);
        if (textInput) textInput.value = colorInput.value;
      });
    });
    container.querySelectorAll(".settings-color-field").forEach((field) => {
      const colorInput = field.querySelector("[data-theme-key]");
      const textInput = field.querySelector("[data-theme-text-key]");
      textInput?.addEventListener("input", () => {
        const pickerColor = ThemeColorUtils.toPickerColor(textInput.value);
        if (pickerColor) colorInput.value = pickerColor;
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
    return ThemeColorUtils.isColorValue(str);
  },

  normalizeColor(str) {
    return ThemeColorUtils.toPickerColor(str) || "#000000";
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
      if (key === "gradeFields") {
        settings[key] = input.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      } else {
        settings[key] = key === "schoolName" ? input.value.trim() : input.value;
      }
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
      const token = localStorage.getItem(Auth.SESSION_KEY);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email, schoolId: App.currentSchoolId, config_json: settings })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to save settings to server.");
      }

      this.config = settings;
      App.config = settings;
      if (settings.schoolName?.trim()) App.currentSchoolName = settings.schoolName.trim();
      App.applyTheme();
      App.updateSidebarInfo();
      this.render();
      const status = document.getElementById("settings-save-status");
      if (status) {
        status.textContent = "Changes saved.";
        status.classList.add("is-success");
      }
    } catch (e) {
      console.error("Failed to save school settings:", e);
      const status = document.getElementById("settings-save-status");
      if (status) {
        status.textContent = `Could not save changes: ${e.message}`;
        status.classList.add("is-error");
      }
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Settings;
}
