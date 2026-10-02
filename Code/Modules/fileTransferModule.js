/**
 * File Transfer Module - Upload and download files through the LMS backend.
 */

const FileTransferService = {
  getEndpoint() {
    return "/api/files";
  },

  getHeaders(classId) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error("Please sign in again before uploading or downloading files.");

    const headers = { Authorization: `Bearer ${token}` };
    const schoolId = (typeof App !== "undefined" && App.currentSchoolId) || Auth.getCurrentUser()?.school_id;
    if (schoolId) headers["X-School-Id"] = schoolId;
    if (classId) headers["X-Class-Id"] = classId;
    return headers;
  },

  async listFiles(classId) {
    try {
      const url = `${this.getEndpoint()}?list=true`;
      const response = await fetch(url, { method: "GET", headers: this.getHeaders(classId) });
      if (!response.ok) throw new Error("Failed to list files");
      const payload = await response.json();
      return payload.files || [];
    } catch (error) {
      console.error("FileTransferService.listFiles error:", error);
      throw error;
    }
  },

  async uploadFile(filename, fileData, classId) {
    try {
      const url = this.getEndpoint();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.getHeaders(classId),
          "Content-Type": fileData.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(filename)
        },
        body: fileData
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to upload file");
      }
      return await response.json();
    } catch (error) {
      console.error("FileTransferService.uploadFile error:", error);
      throw error;
    }
  },

  async uploadBrowserFile(file, targetName, classId) {
    if (!(file instanceof File)) {
      throw new Error("Expected a File object");
    }

    const filename = targetName || file.name;
    return this.uploadFile(filename, file, classId);
  },

  async downloadFile(filePath, classId) {
    try {
      const url = `${this.getEndpoint()}?path=${encodeURIComponent(filePath)}&download=true`;
      const response = await fetch(url, { method: "GET", headers: this.getHeaders(classId) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to download file");
      }
      return await response.blob();
    } catch (error) {
      console.error("FileTransferService.downloadFile error:", error);
      throw error;
    }
  },

  async deleteFile(filePath, classId) {
    try {
      const url = `${this.getEndpoint()}?path=${encodeURIComponent(filePath)}`;
      const response = await fetch(url, { method: "DELETE", headers: this.getHeaders(classId) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Failed to delete file");
      }
      return await response.json();
    } catch (error) {
      console.error("FileTransferService.deleteFile error:", error);
      throw error;
    }
  },

  async downloadFileBlob(filePath, classId) {
    return this.downloadFile(filePath, classId);
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FileTransferService;
}
