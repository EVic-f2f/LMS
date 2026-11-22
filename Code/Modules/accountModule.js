/**
 * Account Module - Handles sign-in, account preferences, and auto-login.
 */

const Account = {
  defaultStatus: "Student",
  statuses: ["Student", "Teacher", "School Administrator", "Administrator", "Guest"],
  account: null,

  load() {
    this.account = Auth.getCurrentUser();
    return this.account;
  },

  signIn(profile) {
    const now = new Date().toISOString();
    this.account = {
      name: profile.name.trim(),
      email: profile.email.trim().toLowerCase(),
      status: profile.status || this.defaultStatus,
      preferences: {
        autoLogin: profile.preferences?.autoLogin ?? true,
        notifications: profile.preferences?.notifications ?? true
      },
      lastSignedIn: now
    };

    Storage.saveAccount(this.account);
    if (typeof App !== "undefined") App.currentAccount = this.account;
    return this.account;
  },

  signOut() {
    Auth.signOut();
    this.account = null;
    if (typeof App !== "undefined") App.currentAccount = null;
    this.render();
  },

  render() {
    const container = document.getElementById("account-content");
    if (!container) return;

    this.load();
    if (!this.account) {
      window.location.href = "sign-in.html";
      return;
    }

    container.innerHTML = "";
    this.renderProfile(container);
  },

  renderSignInForm(container) {
    const message = document.createElement("p");
    message.textContent = "Sign in to save your account preferences locally and auto-login on return.";
    message.style.color = "#555";
    message.style.marginBottom = "20px";

    const form = document.createElement("form");
    form.id = "sign-in-form";
    form.style.cssText = "display: grid; gap: 16px;";
    form.onsubmit = (event) => {
      event.preventDefault();
      this.handleSignIn(form);
    };

    form.appendChild(this.createField("Full Name", "text", "", "name"));
    form.appendChild(this.createField("Email Address", "email", "", "email"));
    form.appendChild(this.createSelectField("Role", this.statuses, this.defaultStatus, "status"));
    form.appendChild(this.createCheckboxField("Receive grade notifications", true, "notifications"));
    form.appendChild(this.createCheckboxField("Keep me signed in on this device", true, "autoLogin"));

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Sign In";
    button.style.cssText = "padding: 14px 20px; border: none; border-radius: 8px; background: var(--primary); color: white; font-weight: 700; cursor: pointer;";

    form.appendChild(button);

    container.appendChild(message);
    container.appendChild(form);
  },

  renderProfile(container) {
    const fullName = this.escapeHtml(this.account.name || "LMS member");
    const email = this.escapeHtml(this.account.email || "");
    const role = this.escapeHtml(this.account.status || this.defaultStatus);
    const signedIn = this.escapeHtml(this.formatLastSignedIn(this.account.lastSignedIn));
    const profileCard = document.createElement("section");
    profileCard.className = "account-profile-card";
    profileCard.innerHTML = `
      <div class="account-profile-heading">
        <div class="account-avatar icon-mask icon-account" aria-hidden="true"></div>
        <div class="account-profile-name">
          <div class="section-eyebrow">YOUR PROFILE</div>
          <h2>${fullName}</h2>
          <span class="account-role-chip">${role}</span>
        </div>
      </div>
      <div class="account-detail-grid">
        <div class="account-detail"><span>EMAIL ADDRESS</span><strong>${email}</strong></div>
        <div class="account-detail"><span>ACCOUNT TYPE</span><strong>${role}</strong></div>
        <div class="account-detail"><span>LAST SIGN IN</span><strong>${signedIn}</strong></div>
      </div>
      <p class="account-profile-note">Your name, email, and account role are managed by your account. Contact your school administrator if they need to be changed.</p>`;
    container.appendChild(profileCard);

    const actions = document.createElement("section");
    actions.className = "account-settings-card";
    actions.innerHTML = `
      <div class="section-heading">
        <div><div class="section-eyebrow">ACCOUNT ACTIONS</div><h2>Manage your session</h2></div>
      </div>
      <p class="account-card-description">Your role and profile information are read from your signed-in account. Sign out to end this session on this device.</p>`;
    const actionButtons = document.createElement("div");
    actionButtons.className = "account-actions";
    const workspaceLink = document.createElement("a");
    workspaceLink.className = "app-secondary-button";
    workspaceLink.href = "main.html";
    workspaceLink.textContent = "Open school workspace";
    actionButtons.appendChild(workspaceLink);
    const homeLink = document.createElement("a");
    homeLink.className = "app-secondary-button";
    homeLink.href = "vic-home.html";
    homeLink.textContent = "Open VIC Home";
    actionButtons.appendChild(homeLink);
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.className = "app-primary-button";
    signOut.textContent = "Sign out";
    signOut.onclick = () => this.signOut();
    actionButtons.appendChild(signOut);
    actions.appendChild(actionButtons);
    container.appendChild(actions);
  },

  escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  },

  createField(labelText, type, value, name) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:grid; gap: 6px;";

    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.color = "#2c3e50";
    label.style.fontWeight = "600";

    const input = document.createElement("input");
    input.type = type;
    input.name = name;
    input.value = value || "";
    input.required = true;
    input.style.cssText = "width:100%; padding: 12px 14px; border: 1px solid #ccd6e0; border-radius: 8px; font-size: 14px;";

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  },

  createSelectField(labelText, options, selectedValue, name) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:grid; gap: 6px;";

    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.color = "#2c3e50";
    label.style.fontWeight = "600";

    const select = document.createElement("select");
    select.name = name;
    select.style.cssText = "width:100%; padding: 12px 14px; border: 1px solid #ccd6e0; border-radius: 8px; font-size: 14px;";

    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      if (option === selectedValue) item.selected = true;
      select.appendChild(item);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  },

  createCheckboxField(labelText, checked, name) {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = "display:flex; align-items:center; gap: 12px; padding: 12px 14px; background:#fff; border:1px solid #ccd6e0; border-radius:10px; cursor:pointer;";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.checked = Boolean(checked);
    input.style.cssText = "width: 18px; height: 18px;";

    const span = document.createElement("span");
    span.textContent = labelText;
    span.style.color = "#2c3e50";

    wrapper.appendChild(input);
    wrapper.appendChild(span);
    return wrapper;
  },

  createReadOnlyField(labelText, value) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:grid; gap: 6px;";

    const label = document.createElement("div");
    label.textContent = labelText;
    label.style.color = "#718096";
    label.style.fontSize = "0.9em";

    const valueBox = document.createElement("div");
    valueBox.textContent = value;
    valueBox.style.cssText = "padding: 12px 14px; background: white; border: 1px solid #dfe7ed; border-radius: 10px; color: #1f2937;";

    wrapper.appendChild(label);
    wrapper.appendChild(valueBox);
    return wrapper;
  },

  handleSignIn(form) {
    const data = new FormData(form);
    const profile = {
      name: data.get("name")?.toString() || "",
      email: data.get("email")?.toString() || "",
      status: data.get("status")?.toString() || this.defaultStatus,
      preferences: {
        notifications: data.get("notifications") === "on",
        autoLogin: data.get("autoLogin") === "on"
      }
    };

    if (!profile.name || !profile.email) {
      this.showMessage(form, "Please enter both name and email.", false);
      return;
    }

    this.signIn(profile);
    this.render();
    const savedForm = document.getElementById("account-profile-form") || form;
    this.showMessage(savedForm, "Signed in successfully. Your account is saved locally.", true);
  },

  handleProfileSave(form) {
    const data = new FormData(form);
    const selectedStatus = data.get("status")?.toString() || this.account.status;
    const allowedStatuses = Auth.getAllowedStatuses();
    const status = allowedStatuses.includes(selectedStatus) ? selectedStatus : this.account.status;

    const profile = {
      name: data.get("name")?.toString() || this.account.name,
      email: data.get("email")?.toString() || this.account.email,
      status,
      preferences: {
        notifications: data.get("notifications") === "on",
        autoLogin: data.get("autoLogin") === "on"
      }
    };

    if (!profile.name || !profile.email) {
      this.showMessage(form, "Name and email cannot be empty.", false);
      return;
    }

    profile.lastSignedIn = this.account.lastSignedIn;
    this.signIn(profile);
    this.render();
    const savedForm = document.getElementById("account-profile-form") || form;
    this.showMessage(savedForm, "Profile saved. Your settings are up to date.", true);
  },

  showMessage(container, message, isSuccess = true) {
    let status = container.querySelector(".account-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "account-status";
      status.style.cssText = "padding: 10px 14px; border-radius: 10px; margin-top: 12px; font-weight: 600;";
      container.appendChild(status);
    }

    status.textContent = message;
    status.style.background = isSuccess ? "#e6fffa" : "#ffe6e6";
    status.style.color = isSuccess ? "#065f46" : "#9b2c2c";

    setTimeout(() => {
      if (status.parentNode) {
        status.remove();
      }
    }, 4000);
  },

  formatLastSignedIn(timestamp) {
    if (!timestamp) return "Never";
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Account;
}
