/**
 * API Module - Handles all server communication
 */

const API = {
  endpoint: "/api/students",

  setEndpoint(url) {
    this.endpoint = url;
  },

  getEndpoint() {
    return this.endpoint;
  },

  async getStudents() {
    try {
      const url = this.getEndpoint();
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch students");
      return await response.json();
    } catch (error) {
      console.error("API Error (GET):", error);
      throw error;
    }
  },

  async saveStudents(students) {
    try {
      const url = this.getEndpoint();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(students)
      });
      if (!response.ok) throw new Error("Failed to save students");
      return await response.json();
    } catch (error) {
      console.error("API Error (POST):", error);
      throw error;
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = API;
}
