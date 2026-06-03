/**
 * Storage Module - Handles browser localStorage and server persistence
 */

const Storage = {
  STUDENT_KEY: "lmsStudentGrades",
  MAX_SCORES_KEY: "lmsMaxScores",
  USERS_KEY: "lmsUsers",
  CURRENT_USER_KEY: "lmsCurrentUser",

  getStudents() {
    try {
      const data = localStorage.getItem(this.STUDENT_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn("Storage read error:", e);
      return null;
    }
  },

  saveStudents(students) {
    try {
      localStorage.setItem(this.STUDENT_KEY, JSON.stringify(students));
      return true;
    } catch (e) {
      console.warn("Storage write error:", e);
      return false;
    }
  },

  getMaxScores() {
    try {
      const data = localStorage.getItem(this.MAX_SCORES_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.warn("Max scores read error:", e);
      return {};
    }
  },

  saveMaxScores(maxScores) {
    try {
      localStorage.setItem(this.MAX_SCORES_KEY, JSON.stringify(maxScores));
      return true;
    } catch (e) {
      console.warn("Max scores write error:", e);
      return false;
    }
  },

  getUsers() {
    try {
      const data = localStorage.getItem(this.USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn("Users read error:", e);
      return [];
    }
  },

  saveUsers(users) {
    try {
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
      return true;
    } catch (e) {
      console.warn("Users write error:", e);
      return false;
    }
  },

  getCurrentUser() {
    try {
      const data = localStorage.getItem(this.CURRENT_USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn("Current user read error:", e);
      return null;
    }
  },

  saveCurrentUser(user) {
    try {
      localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(user));
      return true;
    } catch (e) {
      console.warn("Current user write error:", e);
      return false;
    }
  },

  clearCurrentUser() {
    try {
      localStorage.removeItem(this.CURRENT_USER_KEY);
      return true;
    } catch (e) {
      console.warn("Current user clear error:", e);
      return false;
    }
  },

  getAccount() {
    return this.getCurrentUser();
  },

  saveAccount(account) {
    return this.saveCurrentUser(account);
  },

  clearAccount() {
    return this.clearCurrentUser();
  },

  clear() {
    try {
      localStorage.removeItem(this.STUDENT_KEY);
      localStorage.removeItem(this.MAX_SCORES_KEY);
      return true;
    } catch (e) {
      console.warn("Storage clear error:", e);
      return false;
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Storage;
}
