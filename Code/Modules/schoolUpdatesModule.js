const SchoolUpdates = {
  imageUrls: new Set(),
  loadRequestId: 0,

  async load() {
    const list = document.getElementById("school-updates-list");
    const editor = document.getElementById("school-updates-editor");
    const user = Auth.getCurrentUser();
    if (!list || !editor || !user) return;

    const requestId = ++this.loadRequestId;
    const canManage = user.status === "School Administrator";
    const schoolId = App.currentSchoolId || user.school_id;
    this.clearImageUrls();
    this.renderEditor(editor, canManage);
    list.textContent = "Loading school updates…";

    try {
      const token = localStorage.getItem(Auth.SESSION_KEY);
      if (!token) throw new Error("Sign in to view school updates.");
      const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
      const response = await fetch(`/api/schools/announcements${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not load school updates.");
      }

      if (requestId !== this.loadRequestId) return;
      const announcements = result.announcements || [];
      this.renderAnnouncements(list, announcements, canManage);
      await this.loadAnnouncementImages(list, schoolId, requestId);
    } catch (error) {
      if (requestId === this.loadRequestId) list.textContent = error.message || "Could not load school updates.";
    }
  },

  renderEditor(container, canManage) {
    const existingForm = container.querySelector(".school-update-form");
    if (existingForm) this.clearEditorPreview(existingForm);
    container.replaceChildren();
    if (!canManage) return;

    const form = document.createElement("form");
    form.className = "school-update-form";
    form.innerHTML = `
      <label>
        <span>Category</span>
        <select name="category">
          <option value="news">News</option>
          <option value="announcement">Announcement</option>
          <option value="event">Event</option>
          <option value="alert">Alert</option>
        </select>
      </label>
      <label>
        <span>Title</span>
        <input name="title" type="text" maxlength="150" required>
      </label>
      <label>
        <span>Update</span>
        <textarea name="content" rows="3" maxlength="4000" required></textarea>
      </label>
      <div class="school-update-image-field">
        <label>
          <span>Image (optional)</span>
          <input name="image" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif">
        </label>
        <div class="school-update-image-preview" data-image-preview hidden>
          <img alt="Selected school update image">
          <span data-image-preview-label></span>
        </div>
        <label class="school-update-remove-image" data-remove-image-wrap hidden>
          <input name="removeImage" type="checkbox">
          <span>Remove the current image</span>
        </label>
      </div>
      <div class="school-update-form-actions">
        <p class="school-update-status" role="status" aria-live="polite"></p>
        <button class="app-primary-button" type="submit">Publish update</button>
        <button class="app-secondary-button" type="button" data-cancel-edit hidden>Cancel edit</button>
      </div>
    `;
    form.addEventListener("submit", (event) => this.save(event, form));
    form.querySelector("[data-cancel-edit]").addEventListener("click", () => this.resetEditor(form));
    form.elements.image.addEventListener("change", () => this.previewSelectedImage(form));
    form.elements.removeImage.addEventListener("change", () => {
      if (form.elements.removeImage.checked) this.clearEditorPreview(form);
      else if (form.dataset.editingImagePath) this.loadEditorImage(form, form.dataset.editingImagePath);
    });
    container.appendChild(form);
  },

  renderAnnouncements(container, announcements, canManage) {
    container.replaceChildren();
    if (!announcements.length) {
      const empty = document.createElement("p");
      empty.className = "school-updates-empty";
      empty.textContent = "No school updates have been posted yet.";
      container.appendChild(empty);
      return;
    }

    announcements.forEach((announcement) => {
      const card = document.createElement("article");
      card.className = "school-update-card";

      const heading = document.createElement("div");
      heading.className = "school-update-heading";
      const category = document.createElement("span");
      category.className = `school-update-category is-${announcement.category}`;
      if (announcement.category === "news" || announcement.category === "alert") {
        const categoryIcon = document.createElement("span");
        categoryIcon.className = `icon-mask ${announcement.category === "alert" ? "icon-alert" : "icon-news"}`;
        categoryIcon.setAttribute("aria-hidden", "true");
        category.appendChild(categoryIcon);
      }
      const categoryLabel = document.createElement("span");
      categoryLabel.textContent = announcement.category;
      category.appendChild(categoryLabel);
      const published = document.createElement("time");
      published.dateTime = announcement.created_at || "";
      published.textContent = this.formatDate(announcement.created_at);
      heading.append(category, published);

      const title = document.createElement("h3");
      title.textContent = announcement.title;
      const content = document.createElement("p");
      content.textContent = announcement.content;
      card.append(heading);
      if (announcement.image_path) {
        const imageSlot = document.createElement("div");
        imageSlot.className = "school-update-image-slot";
        imageSlot.dataset.imagePath = announcement.image_path;
        imageSlot.dataset.imageTitle = announcement.title;
        imageSlot.textContent = "Loading image…";
        card.appendChild(imageSlot);
      }
      card.append(title, content);

      if (canManage) {
        const actions = document.createElement("div");
        actions.className = "school-update-actions";
        const edit = document.createElement("button");
        edit.className = "app-secondary-button";
        edit.type = "button";
        edit.textContent = "Edit";
        edit.addEventListener("click", () => this.editAnnouncement(announcement));
        const remove = document.createElement("button");
        remove.className = "app-secondary-button school-update-delete";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => this.deleteAnnouncement(announcement.id));
        actions.append(edit, remove);
        card.appendChild(actions);
      }
      container.appendChild(card);
    });
  },

  clearImageUrls() {
    this.imageUrls.forEach((url) => URL.revokeObjectURL(url));
    this.imageUrls.clear();
  },

  async loadAnnouncementImages(container, schoolId, requestId) {
    const slots = Array.from(container.querySelectorAll(".school-update-image-slot"));
    await Promise.all(slots.map(async (slot) => {
      try {
        const blob = await this.getAnnouncementImage(slot.dataset.imagePath, schoolId);
        const url = URL.createObjectURL(blob);
        if (!slot.isConnected || requestId !== this.loadRequestId) {
          URL.revokeObjectURL(url);
          return;
        }
        const image = document.createElement("img");
        image.className = "school-update-image";
        image.src = url;
        image.alt = slot.dataset.imageTitle ? `Image for ${slot.dataset.imageTitle}` : "School update image";
        slot.replaceWith(image);
        this.imageUrls.add(url);
      } catch (error) {
        if (!slot.isConnected || requestId !== this.loadRequestId) return;
        slot.classList.add("is-error");
        slot.textContent = "Image unavailable.";
        console.warn("Could not load a school update image:", error.message);
      }
    }));
  },

  async getAnnouncementImage(imagePath, schoolId) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error("Sign in again to view school update images.");
    const query = new URLSearchParams({ path: imagePath, schoolId: String(schoolId || "") });
    const response = await fetch(`/api/schools/announcements/images?${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-School-Id": schoolId || ""
      }
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Could not load this school update image.");
    }
    return response.blob();
  },

  async uploadAnnouncementImage(file, schoolId) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error("Sign in again to upload an image.");
    const response = await fetch("/api/schools/announcements/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type,
        "X-School-Id": schoolId
      },
      body: file
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Could not upload this image.");
    }
    return result.imagePath;
  },

  async deleteAnnouncementImage(imagePath, schoolId) {
    if (!imagePath) return;
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error("Sign in again to remove this image.");
    const response = await fetch("/api/schools/announcements/images", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-School-Id": schoolId
      },
      body: JSON.stringify({ imagePath, schoolId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Could not remove the previous image.");
    }
  },

  clearEditorPreview(form) {
    if (form.dataset.previewObjectUrl) URL.revokeObjectURL(form.dataset.previewObjectUrl);
    delete form.dataset.previewObjectUrl;
    const preview = form.querySelector("[data-image-preview]");
    if (preview) {
      preview.hidden = true;
      preview.querySelector("img").removeAttribute("src");
      preview.querySelector("[data-image-preview-label]").textContent = "";
    }
  },

  previewSelectedImage(form) {
    const file = form.elements.image.files?.[0];
    const status = form.querySelector(".school-update-status");
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];
    if (!file) {
      if (form.dataset.editingImagePath && !form.elements.removeImage.checked) {
        this.loadEditorImage(form, form.dataset.editingImagePath);
      } else {
        this.clearEditorPreview(form);
      }
      return;
    }
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.clearEditorPreview(form);
      status.textContent = "Choose a JPEG, PNG, GIF, WebP, or AVIF image up to 10 MB.";
      form.elements.image.value = "";
      if (form.dataset.editingImagePath && !form.elements.removeImage.checked) {
        this.loadEditorImage(form, form.dataset.editingImagePath);
      }
      return;
    }

    this.clearEditorPreview(form);
    form.elements.removeImage.checked = false;
    form.querySelector("[data-remove-image-wrap]").hidden = true;
    const url = URL.createObjectURL(file);
    form.dataset.previewObjectUrl = url;
    const preview = form.querySelector("[data-image-preview]");
    preview.querySelector("img").src = url;
    preview.querySelector("[data-image-preview-label]").textContent = file.name;
    preview.hidden = false;
    status.textContent = "";
  },

  async loadEditorImage(form, imagePath) {
    this.clearEditorPreview(form);
    const schoolId = App.currentSchoolId || Auth.getCurrentUser()?.school_id;
    try {
      const blob = await this.getAnnouncementImage(imagePath, schoolId);
      if (!form.isConnected || form.dataset.editingImagePath !== imagePath || form.elements.image.files?.length) return;
      const url = URL.createObjectURL(blob);
      form.dataset.previewObjectUrl = url;
      const preview = form.querySelector("[data-image-preview]");
      preview.querySelector("img").src = url;
      preview.querySelector("[data-image-preview-label]").textContent = "Current image";
      preview.hidden = false;
      form.querySelector("[data-remove-image-wrap]").hidden = false;
    } catch (error) {
      const status = form.querySelector(".school-update-status");
      if (status) status.textContent = error.message || "Could not load the current image.";
    }
  },

  async save(event, form) {
    event.preventDefault();
    const status = form.querySelector(".school-update-status");
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const id = form.dataset.editingId;
    const schoolId = App.currentSchoolId || Auth.getCurrentUser()?.school_id;
    const oldImagePath = form.dataset.editingImagePath || null;
    const selectedImage = data.get("image");
    let imagePath = form.elements.removeImage.checked ? null : oldImagePath;
    let uploadedImagePath = null;
    submit.disabled = true;
    status.textContent = "Saving…";

    try {
      if (selectedImage instanceof File && selectedImage.size > 0) {
        if (selectedImage.size > 10 * 1024 * 1024) {
          throw new Error("School update images must be 10 MB or smaller.");
        }
        uploadedImagePath = await this.uploadAnnouncementImage(selectedImage, schoolId);
        imagePath = uploadedImagePath;
      }
      await this.write({
        action: id ? "update" : "create",
        ...(id ? { id } : {}),
        schoolId,
        category: data.get("category"),
        title: data.get("title"),
        content: data.get("content"),
        imagePath
      });
    } catch (error) {
      let cleanupMessage = "";
      if (uploadedImagePath) {
        try {
          await this.deleteAnnouncementImage(uploadedImagePath, schoolId);
        } catch (cleanupError) {
          console.error("Could not remove an unused school update image:", cleanupError);
          cleanupMessage = ` The uploaded image also could not be removed: ${cleanupError.message}`;
        }
      }
      status.textContent = `${error.message || "Could not save this update."}${cleanupMessage}`;
      submit.disabled = false;
      return;
    }

    let cleanupWarning = "";
    if (oldImagePath && oldImagePath !== imagePath) {
      try {
        await this.deleteAnnouncementImage(oldImagePath, schoolId);
      } catch (error) {
        console.error("The update was saved, but its previous image could not be removed:", error);
        cleanupWarning = `Update saved, but the previous image could not be removed: ${error.message}`;
      }
    }
    await this.load();
    if (cleanupWarning) {
      const currentStatus = document.querySelector(".school-update-status");
      if (currentStatus) currentStatus.textContent = cleanupWarning;
    }
  },

  editAnnouncement(announcement) {
    const form = document.querySelector(".school-update-form");
    if (!form) return;
    this.clearEditorPreview(form);
    form.dataset.editingId = announcement.id;
    form.dataset.editingImagePath = announcement.image_path || "";
    form.elements.category.value = announcement.category;
    form.elements.title.value = announcement.title;
    form.elements.content.value = announcement.content;
    form.elements.removeImage.checked = false;
    form.querySelector("[data-remove-image-wrap]").hidden = !announcement.image_path;
    form.querySelector('[type="submit"]').textContent = "Save update";
    form.querySelector("[data-cancel-edit]").hidden = false;
    if (announcement.image_path) this.loadEditorImage(form, announcement.image_path);
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    form.elements.title.focus();
  },

  async deleteAnnouncement(id) {
    if (!await AppDialogs.confirm("Delete this school update? This cannot be undone.", {
      title: "Delete school update",
      confirmText: "Delete update",
      danger: true
    })) return;
    try {
      const schoolId = App.currentSchoolId || Auth.getCurrentUser()?.school_id;
      const result = await this.write({
        action: "delete",
        id,
        schoolId
      });
      await this.load();
      if (result.imagePath) {
        try {
          await this.deleteAnnouncementImage(result.imagePath, schoolId);
        } catch (error) {
          const status = document.querySelector(".school-update-status");
          if (status) status.textContent = `Update deleted, but its image could not be removed: ${error.message}`;
        }
      }
    } catch (error) {
      const status = document.querySelector(".school-update-status");
      if (status) status.textContent = error.message || "Could not delete this update.";
    }
  },

  async write(payload) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error("Sign in again to manage school updates.");
    const response = await fetch("/api/schools/announcements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Could not save school update.");
    }
    return result;
  },

  resetEditor(form) {
    this.clearEditorPreview(form);
    form.reset();
    delete form.dataset.editingId;
    delete form.dataset.editingImagePath;
    form.querySelector('[type="submit"]').textContent = "Publish update";
    form.querySelector("[data-cancel-edit]").hidden = true;
    form.querySelector("[data-remove-image-wrap]").hidden = true;
    form.querySelector(".school-update-status").textContent = "";
  },

  formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Recently posted";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SchoolUpdates;
}
