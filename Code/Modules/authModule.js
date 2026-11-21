/**
 * Auth Module - Manages users, login, signup, and role access.
 */

const Auth = {
  USERS_KEY: "lmsUsers",
  CURRENT_USER_KEY: "lmsCurrentUser",
  SESSION_KEY: "lmsSessionToken",
  withoutLegacyClassFields(user) {
    if (!user || typeof user !== "object") return user;
    const sanitized = { ...user };
    delete sanitized.enrolledClasses;
    delete sanitized.taughtClasses;
    return sanitized;
  },

  async getUsers() {
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = localStorage.getItem(this.SESSION_KEY);
      if (!token) throw new Error("Sign in to view user accounts.");
      const headers = { Authorization: `Bearer ${token}` };
      const schoolId = (typeof App !== "undefined" && App.currentSchoolId) || this.getCurrentUser()?.school_id;
      if (schoolId) headers["X-School-Id"] = schoolId;
      const response = await fetch("/api/admin/users", { headers, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Failed to fetch users");
      if (!Array.isArray(result)) throw new Error("The server returned an invalid user list.");
      return result.map((user) => this.withoutLegacyClassFields(user));
    } catch (error) {
      console.error("API Error (GET users):", error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  getCurrentUser() {
    const user = Storage.getCurrentUser();
    if (!user || typeof user !== "object") return user;
    const hasLegacyClassFields = Object.prototype.hasOwnProperty.call(user, "enrolledClasses")
      || Object.prototype.hasOwnProperty.call(user, "taughtClasses");
    const sanitized = this.withoutLegacyClassFields(user);
    if (hasLegacyClassFields) this.saveCurrentUser(sanitized);
    return sanitized;
  },

  saveCurrentUser(user) {
    return Storage.saveCurrentUser(this.withoutLegacyClassFields(user));
  },

  clearCurrentUser() {
    return Storage.clearCurrentUser();
  },

  getAllowedStatuses() {
    const user = this.getCurrentUser();
    if (user && ["Administrator", "Admin"].includes(user.status)) {
      return ["Student", "Teacher", "School Administrator", "Administrator", "Admin", "Guest"];
    }
    if (user && user.status === "School Administrator") {
      return ["Student", "Teacher", "Guest"];
    }
    return ["Student", "Guest"];
  },

  isTeacherOrHigher(user = this.getCurrentUser()) {
    return user && ["Teacher", "School Administrator", "Administrator", "Admin"].includes(user.status);
  },

  isAdministrator(user = this.getCurrentUser()) {
    return user && ["Administrator", "Admin"].includes(user.status);
  },

  isSchoolAdministrator(user = this.getCurrentUser()) {
    return user && ["School Administrator", "Administrator", "Admin"].includes(user.status);
  },

  async registerUser(profile) {
    const email = String(profile.email || "").trim().toLowerCase();
    const name = String(profile.name || "").trim();
    const password = String(profile.password || "");
    const status = String(profile.status || "Student");
    const preferences = profile.preferences || { autoLogin: true, notifications: true };

    if (!email || !password || !name) {
      throw new Error("Name, email, and password are required.");
    }

    const allowedStatuses = this.getAllowedStatuses();
    const sanitizedStatus = allowedStatuses.includes(status) ? status : "Student";

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        status: sanitizedStatus,
        preferences: {
          autoLogin: Boolean(preferences.autoLogin),
          notifications: Boolean(preferences.notifications)
        }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Failed to create account.");
    }
    if (result.token) localStorage.setItem(this.SESSION_KEY, result.token);
    const publicUser = this.withoutLegacyClassFields(result.user);
    const currentUser = {
      name: publicUser.name,
      email: publicUser.email,
      status: publicUser.status,
      preferences: publicUser.preferences,
      school_id: publicUser.school_id || null,
      lastSignedIn: publicUser.lastSignedIn || new Date().toISOString()
    };

    this.saveCurrentUser(currentUser);
    return currentUser;
  },

  async login(email, password, remember = true) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error("Email and password are required.");
    }

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Invalid email or password.");
    }

    const found = result.user;
    found.preferences = found.preferences || { autoLogin: true, notifications: true };
    if (result.token) localStorage.setItem(this.SESSION_KEY, result.token);

    const currentUser = {
      name: found.name,
      email: String(found.email).toLowerCase(),
      status: found.status,
      school_id: found.school_id || null,
      preferences: {
        autoLogin: Boolean(remember),
        notifications: Boolean(found.preferences.notifications)
      },
      lastSignedIn: found.lastSignedIn || new Date().toISOString()
    };

    this.saveCurrentUser(currentUser);
    return currentUser;
  },

  signOut() {

    this.clearCurrentUser();
    localStorage.removeItem(this.SESSION_KEY);
    if (typeof App !== "undefined") {
      App.stopRealtimeUpdates?.();
      App.currentAccount = null;
    }
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
      window.location.href = "sign-in.html";
    }
  },
  async createOrAssignSchoolForUser({ schoolName }) {
    // Creates a school + assigns it to the user's record.
    // This is used during sign-up.
    const currentUser = this.getCurrentUser();
    if (!currentUser?.email) {
      throw new Error("No signed-in user to assign school.");
    }
    const url = "/api/schools/create-and-assign";
    const token = localStorage.getItem(this.SESSION_KEY);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ schoolName })
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json?.error || "Failed to create/assign school.");
    }

    return await res.json().catch(() => ({}));
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Auth;
}

