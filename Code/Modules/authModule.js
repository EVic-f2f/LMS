/**
 * Auth Module - Manages users, login, signup, and role access.
 */

const Auth = {
  USERS_KEY: "lmsUsers",
  CURRENT_USER_KEY: "lmsCurrentUser",
  defaultAdmin: {
    name: "Web Admin",
    email: "webadmin@lms.local",
    status: "Administrator",
    preferences: {
      autoLogin: true,
      notifications: true
    },
    password: "Admin@123",
    taughtClasses: [
      {
        id: "class_admin_math_001",
        name: "Advanced Mathematics",
        subject: "Mathematics",
        students: [],
        pendingRequests: [],
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      {
        id: "class_admin_science_001",
        name: "Physics Fundamentals",
        subject: "Physics",
        students: [],
        pendingRequests: [],
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ]
  },

  async hashPassword(password) {
    if (!password) return "";
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return password.split("").reduce((acc, char) => acc + char.charCodeAt(0).toString(16), "");
    }
  },

  async getUsers() {
    try {
      const response = await fetch(`/api/users`);
      if (!response.ok) throw new Error("Failed to fetch users");
      return await response.json();
    } catch (error) {
      console.error("API Error (GET users):", error);
      // Fallback to localStorage
      try {
        const data = localStorage.getItem(this.USERS_KEY);
        return data ? JSON.parse(data) : [];
      } catch (e) {
        console.warn("Auth read users error:", e);
        return [];
      }
    }
  },

  async saveUsers(users) {
    try {
      const response = await fetch(`/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(users)
      });
      if (!response.ok) throw new Error("Failed to save users");
      return await response.json();
    } catch (error) {
      console.error("API Error (POST users):", error);
      // Fallback to localStorage
      try {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        return true;
      } catch (e) {
        console.warn("Auth save users error:", e);
        return false;
      }
    }
  },

  getCurrentUser() {
    return Storage.getCurrentUser();
  },

  saveCurrentUser(user) {
    return Storage.saveCurrentUser(user);
  },

  clearCurrentUser() {
    return Storage.clearCurrentUser();
  },

  async ensureDefaultAdmin() {
    const users = await this.getUsers();
    const normalizedEmail = this.defaultAdmin.email.toLowerCase();
    const adminExists = users.some((user) => {
      return user.email && String(user.email).toLowerCase() === normalizedEmail;
    });
    if (!adminExists) {
      const passwordHash = await this.hashPassword(this.defaultAdmin.password);
      const adminUser = {
        name: this.defaultAdmin.name,
        email: this.defaultAdmin.email.toLowerCase(),
        status: this.defaultAdmin.status,
        preferences: this.defaultAdmin.preferences,
        passwordHash,
        taughtClasses: this.defaultAdmin.taughtClasses || [],
        createdAt: new Date().toISOString(),
        lastSignedIn: new Date().toISOString()
      };
      users.push(adminUser);
      await this.saveUsers(users);
    }
  },

  async findUser(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const users = await this.getUsers();
    let found = users.find((user) => user.email && String(user.email).toLowerCase() === normalizedEmail);
    if (!found || !found.passwordHash) {
      const localUsers = await this.getUsersLocal();
      found = localUsers.find((user) => user.email && String(user.email).toLowerCase() === normalizedEmail);
    }
    return found;
  },

  getAllowedStatuses() {
    const user = this.getCurrentUser();
    if (user && user.status === "Administrator") {
      return ["Student", "Teacher", "Administrator", "Guest"];
    }
    return ["Student", "Guest"];
  },

  isTeacherOrHigher(user = this.getCurrentUser()) {
    return user && (user.status === "Teacher" || user.status === "Administrator");
  },

  isAdministrator(user = this.getCurrentUser()) {
    return user && user.status === "Administrator";
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

    if (await this.findUser(email)) {
      throw new Error("An account with that email already exists.");
    }

    const allowedStatuses = this.getAllowedStatuses();
    const sanitizedStatus = allowedStatuses.includes(status) ? status : "Student";

    const passwordHash = await this.hashPassword(password);
    const newUser = {
      name,
      email,
      status: sanitizedStatus,
      preferences: {
        autoLogin: Boolean(preferences.autoLogin),
        notifications: Boolean(preferences.notifications)
      },
      passwordHash,
      createdAt: new Date().toISOString(),
      lastSignedIn: new Date().toISOString(),
      ...(sanitizedStatus === 'Student' && { enrolledClasses: [] }),
      ...((sanitizedStatus === 'Teacher' || sanitizedStatus === 'Administrator') && { taughtClasses: [] })
    };

    const users = await this.getUsers();
    users.push(newUser);
    await this.saveUsers(users);

    const publicUser = { ...newUser };
    delete publicUser.passwordHash;

    const currentUser = {
      name: publicUser.name,
      email: publicUser.email,
      status: publicUser.status,
      preferences: publicUser.preferences,
      lastSignedIn: new Date().toISOString(),
      enrolledClasses: newUser.enrolledClasses || [],
      taughtClasses: newUser.taughtClasses || []
    };

    this.saveCurrentUser(currentUser);
    return currentUser;
  },

  async getUsersLocal() {
    try {
      const data = localStorage.getItem(this.USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  },

  async login(email, password, remember = true) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const lookupEmail = normalizedEmail === "webadmin" || normalizedEmail === "admin" ? "webadmin@lms.local" : normalizedEmail;
    if (!lookupEmail || !password) {
      throw new Error("Email and password are required.");
    }

    let serverError = null;
    try {
      const response = await fetch(`/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lookupEmail, password })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        serverError = new Error(result.error || "Invalid email or password.");
        throw serverError;
      }

      const found = result.user;
      found.preferences = found.preferences || { autoLogin: true, notifications: true };

      const currentUser = {
        name: found.name,
        email: String(found.email).toLowerCase(),
        status: found.status,
        preferences: {
          autoLogin: Boolean(remember),
          notifications: Boolean(found.preferences.notifications)
        },
        lastSignedIn: found.lastSignedIn || new Date().toISOString(),
        enrolledClasses: found.enrolledClasses || [],
        taughtClasses: found.taughtClasses || []
      };

      this.saveCurrentUser(currentUser);
      return currentUser;
    } catch (error) {
      console.warn("Server auth failed, falling back to local user store:", error.message || error);
      const found = await this.findUser(lookupEmail);
      if (!found) {
        throw new Error(serverError?.message || "Email not found. Please sign up first.");
      }

      const passwordHash = await this.hashPassword(password);
      if (passwordHash !== found.passwordHash) {
        throw new Error("Invalid email or password.");
      }

      const users = await this.getUsers();
      const userIndex = users.findIndex((user) => user.email.toLowerCase() === lookupEmail);
      if (userIndex !== -1) {
        users[userIndex].lastSignedIn = new Date().toISOString();
        await this.saveUsers(users);
      }

      const currentUser = {
        name: found.name,
        email: found.email,
        status: found.status,
        preferences: {
          autoLogin: Boolean(remember),
          notifications: Boolean(found.preferences?.notifications)
        },
        lastSignedIn: userIndex !== -1 ? users[userIndex].lastSignedIn : found.lastSignedIn || new Date().toISOString(),
        enrolledClasses: found.enrolledClasses || [],
        taughtClasses: found.taughtClasses || []
      };

      this.saveCurrentUser(currentUser);
      return currentUser;
    }
  },

  signOut() {
    this.clearCurrentUser();
    if (typeof App !== "undefined") {
      App.currentAccount = null;
    }
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
      window.location.href = "sign-in.html";
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Auth;
}
