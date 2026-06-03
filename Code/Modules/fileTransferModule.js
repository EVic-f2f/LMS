/**
 * File Transfer Module - Upload and download files through the LMS backend.
 */

const FileTransferService = {
  getEndpoint() {
    const hostname = window.location.hostname;
    const port = window.location.port || 3000;
    return `http://${hostname}:${port}/api/files`;
  },

  async listFiles() {
    try {
      const url = `${this.getEndpoint()}?list=true`;
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) throw new Error("Failed to list files");
      const payload = await response.json();
      return payload.files || [];
    } catch (error) {
      console.error("FileTransferService.listFiles error:", error);
      throw error;
    }
  },

  async uploadFile(filename, base64Data) {
    try {
      const url = this.getEndpoint();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, fileData: base64Data })
      });
      if (!response.ok) throw new Error("Failed to upload file");
      return await response.json();
    } catch (error) {
      console.error("FileTransferService.uploadFile error:", error);
      throw error;
    }
  },

  async uploadBrowserFile(file, targetName) {
    if (!(file instanceof File)) {
      throw new Error("Expected a File object");
    }

    const filename = targetName || file.name;
    const base64Data = await this._fileToBase64(file);
    const normalized = base64Data.split(",")[1] || base64Data;
    return this.uploadFile(filename, normalized);
  },

  async downloadFile(filename) {
    try {
      const url = `${this.getEndpoint()}?filename=${encodeURIComponent(filename)}&download=true`;
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) throw new Error("Failed to download file");
      return await response.json();
    } catch (error) {
      console.error("FileTransferService.downloadFile error:", error);
      throw error;
    }
  },

  async deleteFile(filename) {
    try {
      const url = `${this.getEndpoint()}?filename=${encodeURIComponent(filename)}`;
      const response = await fetch(url, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete file");
      return await response.json();
    } catch (error) {
      console.error("FileTransferService.deleteFile error:", error);
      throw error;
    }
  },

  async downloadFileBlob(filename) {
    const payload = await this.downloadFile(filename);
    if (!payload || !payload.fileData) {
      throw new Error("No file data received");
    }

    const binary = atob(payload.fileData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: payload.mimeType || "application/octet-stream" });
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("File reading failed"));
      reader.readAsDataURL(file);
    });
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = FileTransferService;
}
