const SchoolUpdates = {
  async load() {
    const list = document.getElementById("school-updates-list");
    const editor = document.getElementById("school-updates-editor");
    const user = Auth.getCurrentUser();
    if (!list || !editor || !user) return;

    const canManage = user.status === "School Administrator";
    this.renderEditor(editor, canManage);
    list.textContent = "Loading school updates…";

    try {
      const token = localStorage.getItem(Auth.SESSION_KEY);
      if (!token) throw new Error("Sign in to view school updates.");
      const schoolId = App.currentSchoolId || user.school_id;
      const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
      const response = await fetch(`/api/schools/announcements${query}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Could not load school updates.");
      }

      this.renderAnnouncements(list, result.announcements || [], canManage);
    } catch (error) {
      list.textContent = error.message || "Could not load school updates.";
    }
  },

  renderEditor(container, canManage) {
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
      <div class="school-update-form-actions">
        <p class="school-update-status" role="status" aria-live="polite"></p>
        <button class="app-primary-button" type="submit">Publish update</button>
        <button class="app-secondary-button" type="button" data-cancel-edit hidden>Cancel edit</button>
      </div>
    `;
    form.addEventListener("submit", (event) => this.save(event, form));
    form.querySelector("[data-cancel-edit]").addEventListener("click", () => this.resetEditor(form));
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
      category.textContent = announcement.category;
      const published = document.createElement("time");
      published.dateTime = announcement.created_at || "";
      published.textContent = this.formatDate(announcement.created_at);
      heading.append(category, published);

      const title = document.createElement("h3");
      title.textContent = announcement.title;
      const content = document.createElement("p");
      content.textContent = announcement.content;
      card.append(heading, title, content);

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

  async save(event, form) {
    event.preventDefault();
    const status = form.querySelector(".school-update-status");
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const id = form.dataset.editingId;
    const schoolId = App.currentSchoolId || Auth.getCurrentUser()?.school_id;
    submit.disabled = true;
    status.textContent = "Saving…";

    try {
      await this.write({
        action: id ? "update" : "create",
        ...(id ? { id } : {}),
        schoolId,
        category: data.get("category"),
        title: data.get("title"),
        content: data.get("content")
      });
      await this.load();
    } catch (error) {
      status.textContent = error.message || "Could not save this update.";
      submit.disabled = false;
    }
  },

  editAnnouncement(announcement) {
    const form = document.querySelector(".school-update-form");
    if (!form) return;
    form.dataset.editingId = announcement.id;
    form.elements.category.value = announcement.category;
    form.elements.title.value = announcement.title;
    form.elements.content.value = announcement.content;
    form.querySelector('[type="submit"]').textContent = "Save update";
    form.querySelector("[data-cancel-edit]").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    form.elements.title.focus();
  },

  async deleteAnnouncement(id) {
    if (!confirm("Delete this school update? This cannot be undone.")) return;
    try {
      await this.write({
        action: "delete",
        id,
        schoolId: App.currentSchoolId || Auth.getCurrentUser()?.school_id
      });
      await this.load();
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
    form.reset();
    delete form.dataset.editingId;
    form.querySelector('[type="submit"]').textContent = "Publish update";
    form.querySelector("[data-cancel-edit]").hidden = true;
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
