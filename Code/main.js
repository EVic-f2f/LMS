/**
 * LMS Main Application Controller
 * Orchestrates modules and handles app lifecycle
 */

const App = {
  config: {},
  currentAccount: null,
  currentSchoolId: null,
  currentSchoolName: null,
  refreshInProgress: false,
  pendingRealtimeRefresh: false,
  realtimeController: null,
  clockTimer: null,

  async init() {
    this.loadAccount();
    if (!this.currentAccount) {
      window.location.href = "sign-in.html";
      return;
    }

    // Load configuration from Supabase (per user school), with fallback to local Code/config.json
    try {
      if (this.currentAccount?.email) {
        const requestedSchoolId = new URLSearchParams(window.location.search).get("schoolId");
        const schoolQuery = requestedSchoolId ? `&schoolId=${encodeURIComponent(requestedSchoolId)}` : "";
        const url = `/api/schools/by-user?email=${encodeURIComponent(this.currentAccount.email)}${schoolQuery}`;
        const token = localStorage.getItem(Auth.SESSION_KEY);
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const json = await response.json();

        if (response.ok && json?.config_json) {
          this.config = json.config_json;
          this.currentSchoolId = json.school?.id || requestedSchoolId || null;
          this.updateBrandingFromSchool(json.school);
        } else {
          throw new Error("No school config from Supabase");
        }
      } else {
        throw new Error("No currentAccount email");
      }
    } catch (e) {
      console.warn("Failed to load Supabase config, using local defaults");
      try {
        const response = await fetch("/Code/config.json");
        this.config = await response.json();
      } catch {
        this.config = {
          gradeFields: ["Test", "Test1", "Test2", "Test3", "Exam"],
          defaultStudents: []
        };
      }
    }

    // Apply theme colors
    this.applyTheme();


    // Update sidebar and header branding
    this.updateSidebarInfo();
    this.startClock();

    // Initialize modules
    Table.gradeFields = this.config.gradeFields || Table.gradeFields;
    Validation.maxScores = Storage.getMaxScores();

    // Restrict access by role
    this.applyAccessControl();

    // Setup event listeners
    this.setupEventListeners();
    this.startRealtimeUpdates();

    // Initialize Classes module if available
    if (typeof Classes !== "undefined") {
      Classes.init();
    }
    this.renderHomeDashboard();
    if (typeof SchoolUpdates !== "undefined") {
      SchoolUpdates.load();
    }

    // Open a requested tab from public-page links, otherwise default to Home.
    const requestedTab = window.location.hash.slice(1);
    const requestedTabButton = document.querySelector(`.tablinks[data-tab="${requestedTab}"]`);
    const homeTabButton = document.querySelector('.tablinks[data-tab="Home"]');
    (requestedTabButton || homeTabButton)?.click();
  },

  applyTheme() {
    const theme = this.config.theme || {};
    const root = document.body;
    const properties = {
      primary: "--primary",
      secondary: "--secondary",
      accent: "--accent",
      success: "--success",
      warning: "--warning",
      background: "--background",
      text: "--text"
    };

    Object.entries(properties).forEach(([key, property]) => {
      const value = typeof theme[key] === "string" ? theme[key].trim() : "";
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    });
  },

  startClock() {
    const timeElement = document.getElementById("lms-clock-time");
    const dateElement = document.getElementById("lms-clock-date");
    if (!timeElement || !dateElement) return;

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    const updateClock = () => {
      const now = new Date();
      timeElement.dateTime = now.toISOString();
      timeElement.textContent = timeFormatter.format(now);
      dateElement.textContent = dateFormatter.format(now);
    };

    clearInterval(this.clockTimer);
    updateClock();
    this.clockTimer = setInterval(updateClock, 1000);
  },

  setupEventListeners() {
    // Context menu--gobbly goobly woooooo
    document.addEventListener("contextmenu", (event) => {
      const target = event.target;
      if (target.closest("#student-table")) {
        UI.showContextMenu(event, target);
      }
    });

    // Hide context menu on click--gagagee gagagaoooooo
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".context-menu")) {
        UI.hideContextMenu();
      }
    });

    // Load Settings when Settings tab is clicked -- skibbidi skibbidii skibbidiii
    const settingsTabBtn = document.querySelector('.tablinks[data-tab="Settings"]');
    if (settingsTabBtn) {
      settingsTabBtn.addEventListener("click", () => {
        setTimeout(() => Settings.load(), 100);
      });
    }

    const accountTabBtn = document.querySelector('.tablinks[data-tab="Account"]');
    if (accountTabBtn) {
      accountTabBtn.addEventListener("click", () => {
        setTimeout(() => this.renderAccountContent(), 100);
      });
    }

    const classesTabBtn = document.querySelector('.tablinks[data-tab="Classes"]');
    if (classesTabBtn) {
      classesTabBtn.addEventListener("click", () => {
        setTimeout(() => this.renderClassesContent(), 100);
      });
    }

    const hdTabBtn = document.querySelector('.tablinks[data-tab="HD"]');
    if (hdTabBtn) {
      hdTabBtn.addEventListener("click", () => {
        setTimeout(() => HD.render(), 100);
      });
    }

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.addEventListener('mouseenter', () => document.body.classList.add('sidebar-expanded'));
      sidebar.addEventListener('mouseleave', () => document.body.classList.remove('sidebar-expanded'));
    }
  },

  startRealtimeUpdates() {
    this.realtimeController?.abort();
    this.realtimeController = new AbortController();
    this.connectRealtimeUpdates(this.realtimeController.signal);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.refreshActiveView();
    });
    window.addEventListener("pageshow", () => this.refreshActiveView());
    document.addEventListener("focusout", () => {
      if (this.pendingRealtimeRefresh) setTimeout(() => this.refreshActiveView(), 0);
    });
  },

  stopRealtimeUpdates() {
    this.realtimeController?.abort();
    this.realtimeController = null;
  },

  async connectRealtimeUpdates(signal) {
    let retryDelay = 1000;
    while (!signal.aborted) {
      try {
        const token = localStorage.getItem(Auth.SESSION_KEY);
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };
        if (this.currentSchoolId) headers["X-School-Id"] = this.currentSchoolId;
        const response = await fetch("/api/events", { headers, signal });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || `Live updates failed (${response.status}).`);
        }
        if (!response.body) throw new Error("Live updates are not supported by this browser.");

        retryDelay = 1000;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split(/\r?\n\r?\n/);
          buffer = messages.pop() || "";
          for (const message of messages) {
            if (message.split(/\r?\n/).some((line) => line === "event: update")) {
              this.refreshActiveView();
            }
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        console.warn("Live update connection interrupted; reconnecting.", error.message || error);
      }

      await new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, retryDelay);
        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          resolve();
        }, { once: true });
      });
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
  },

  async refreshActiveView() {
    if (document.hidden || this.refreshInProgress || !Auth.getCurrentUser()) return;

    const activeElement = document.activeElement;
    if (activeElement?.matches("input, textarea, select, [contenteditable='true']")) {
      this.pendingRealtimeRefresh = true;
      return;
    }
    this.pendingRealtimeRefresh = false;

    this.refreshInProgress = true;
    try {
      switch (UI.currentTab) {
        case "Home":
          await Promise.all([
            this.renderHomeDashboard(),
            typeof SchoolUpdates !== "undefined" ? SchoolUpdates.load() : Promise.resolve()
          ]);
          break;
        case "Classes":
          await Classes.render();
          break;
        case "ClassDetail":
          {
          const activeClassTab = document.querySelector("#class-detail-content .class-tab-btn.active")?.dataset.tab;
          await Classes.renderClassDetail();
          if (activeClassTab) Classes.switchClassTab(activeClassTab);
          break;
          }
        case "HD":
          {
          const activeHdSection = document.querySelector(".hd-section-tab.active")?.dataset.section;
          await HD.render();
          if (activeHdSection) {
            document.querySelector(`.hd-section-tab[data-section="${activeHdSection}"]`)?.click();
          }
          break;
          }
        case "Settings":
          await Settings.load();
          break;
        case "Account":
          this.renderAccountContent();
          break;
      }
    } catch (error) {
      console.error("Automatic view refresh failed:", error);
    } finally {
      this.refreshInProgress = false;
    }
  },

  applyAccessControl() {
    const canEdit = Auth.isTeacherOrHigher(this.currentAccount);
    const classesTab = document.querySelector('.tablinks[data-tab="Classes"]');
    const settingsTab = document.querySelector('.tablinks[data-tab="Settings"]');

    if (classesTab) {
      classesTab.style.display = 'flex';
    }
    if (settingsTab) {
      settingsTab.style.display = canEdit ? 'flex' : 'none';
    }
    const quickSettings = document.querySelector('[data-quick-settings]');
    if (quickSettings) {
      quickSettings.style.display = canEdit ? 'flex' : 'none';
    }

    const hdTab = document.querySelector('.tablinks[data-tab="HD"]');
    if (hdTab) {
      hdTab.style.display = Auth.isSchoolAdministrator(this.currentAccount) ? 'flex' : 'none';
    }

    const topbarMeta = document.querySelector('.topbar-meta');
    if (topbarMeta) {
      topbarMeta.textContent = this.currentAccount ? this.currentAccount.status : '';
    }
    const headingUser = document.getElementById('page-heading-user');
    if (headingUser && this.currentAccount) {
      headingUser.innerHTML = `<span class="user-status-dot"></span><span>${Classes.escapeHtml(this.currentAccount.name || this.currentAccount.email)}</span>`;
    }
  },

  async renderHomeDashboard() {
    const currentUser = this.currentAccount || Auth.getCurrentUser();
    const classesContainer = document.getElementById('home-classes');
    if (!currentUser || !classesContainer) return;

    const firstName = String(currentUser.name || '').trim().split(/\s+/)[0] || 'there';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const welcome = document.getElementById('home-welcome');
    const intro = document.getElementById('home-intro');
    if (welcome) welcome.textContent = `${greeting}, ${firstName}`;
    if (intro) intro.textContent = `${this.currentSchoolName || this.config.schoolName || 'Your school'} · ${currentUser.status || 'Member'} workspace`;

    try {
      const classes = await Classes.apiRequest('/api/classes');
      const myClasses = currentUser.status === "Student"
        ? classes.filter((item) => item.isEnrolled)
        : classes;
      const studentCount = myClasses.reduce((total, item) => total + Number(item.studentCount || 0), 0);
      const pendingRequestCount = myClasses.reduce((total, item) => total + (item.pendingRequests || []).length, 0);
      const classCount = document.getElementById('home-class-count');
      const studentCountEl = document.getElementById('home-student-count');
      const requestCount = document.getElementById('home-request-count');
      const requestLabel = document.getElementById('home-request-label');
      const canReviewRequests = ["Teacher", "School Administrator", "Administrator", "Admin"].includes(currentUser.status);
      if (classCount) classCount.textContent = String(myClasses.length);
      if (studentCountEl) studentCountEl.textContent = String(studentCount);
      if (requestLabel) requestLabel.textContent = canReviewRequests ? "PENDING REQUESTS" : "ACCOUNT ROLE";
      if (requestCount) requestCount.textContent = canReviewRequests ? String(pendingRequestCount) : currentUser.status;

      if (!myClasses.length) {
        classesContainer.innerHTML = `
          <div class="empty-state">
            <span class="empty-state-icon icon-mask icon-classes" aria-hidden="true"></span>
            <strong>No classes to show yet</strong>
            <p>Your classes will appear here when you join one or create a class.</p>
            <button type="button" class="text-action" onclick="UI.openTab(null, 'Classes')">Explore classes <span class="icon-mask icon-chevron-right" aria-hidden="true"></span></button>
          </div>`;
        return;
      }

      classesContainer.innerHTML = myClasses.slice(0, 4).map((classInfo) => `
        <button type="button" class="home-class-card" onclick="Classes.openClassDetail('${Classes.escapeHtml(classInfo.id)}')">
          <span class="class-mark icon-mask icon-classes" aria-hidden="true"></span>
          <span class="home-class-copy">
            <strong>${Classes.escapeHtml(classInfo.name || 'Untitled class')}</strong>
            <small>${Classes.escapeHtml(classInfo.subject || 'Class workspace')} · ${Number(classInfo.studentCount || 0)} students</small>
          </span>
          <span class="quick-link-arrow icon-mask icon-chevron-right" aria-hidden="true"></span>
        </button>`).join('');
    } catch (error) {
      console.error('Unable to load home dashboard classes:', error);
      classesContainer.innerHTML = `
        <div class="empty-state empty-state-error">
          <strong>Classes could not be loaded</strong>
          <p>${Classes.escapeHtml(error.message || 'Check your connection and try again.')}</p>
          <button type="button" class="text-action" onclick="App.renderHomeDashboard()">Try again <span class="icon-mask icon-chevron-right" aria-hidden="true"></span></button>
        </div>`;
    }
  },

  renderAccountContent() {
    if (typeof Account !== "undefined") {
      Account.render();
    }
  },

  renderClassesContent() {
    if (typeof Classes !== "undefined") {
      Classes.render();
    }
  },

  loadAccount() {
    this.currentAccount = Auth.getCurrentUser();
    if (this.currentAccount) {
      console.info(`Auto-logged in as ${this.currentAccount.email}`);
    }
  },

  updateBrandingFromSchool(school) {
    if (!school) return;
    if (school.name) this.currentSchoolName = school.name;

    if (school.logo_url) {
      const img = document.querySelector('.sidebar-logo img');
      if (img) img.src = school.logo_url;
    }

    if (school.name) {
      // update both sidebar and topbar branding
      const sidebarName = document.getElementById("sidebar-school-name");
      if (sidebarName) sidebarName.textContent = school.name;
      const topbarBrand = document.querySelector(".topbar-brand");
      if (topbarBrand) topbarBrand.textContent = school.name;
      const topbarSchoolName = document.getElementById("topbar-school-name");
      if (topbarSchoolName) topbarSchoolName.textContent = school.name;
    }
  },

  updateSidebarInfo() {
    const schoolName = this.currentSchoolName || this.config.schoolName || "Your School";


    const sidebarName = document.getElementById("sidebar-school-name");
    if (sidebarName) {
      sidebarName.textContent = schoolName;
    }

    const sidebarStatus = document.getElementById("sidebar-user-status");
    if (sidebarStatus) {
      sidebarStatus.textContent = this.currentAccount
        ? `Signed in as ${this.currentAccount.name}`
        : "Not signed in";
    }

    const topbarBrand = document.querySelector(".topbar-brand");
    if (topbarBrand) {
      topbarBrand.textContent = schoolName;
    }
    const topbarSchoolName = document.getElementById("topbar-school-name");
    if (topbarSchoolName) topbarSchoolName.textContent = schoolName;
    const homeWelcome = document.getElementById("home-welcome");
    if (homeWelcome) homeWelcome.textContent = `Welcome to ${schoolName} LMS`;
    document.title = `${schoolName} LMS`;
  },

  async save() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      AppDialogs.alert("Only teachers and administrators can save grades.");
      return;
    }

    const students = Table.collectTableData();
    Storage.saveStudents(students);

    try {
      await API.saveStudents(students);
      UI.showSaveStatus("Saved to browser and server", true);
    } catch (error) {
      UI.showSaveStatus("Saved to browser (server unavailable)", true);
    }
  },

  addStudent() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      AppDialogs.alert("Only teachers and administrators can add student grades.");
      return;
    }
    Table.addRow();
  },

  async clearAllData() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      AppDialogs.alert("Only teachers and administrators can clear grade data.");
      return;
    }

    if (await AppDialogs.confirm("Are you sure you want to clear all student data? This cannot be undone.", {
      title: "Clear student data",
      confirmText: "Clear data",
      danger: true
    })) {
      Storage.clear();
      Validation.maxScores = {};
      Table.buildStudentTable([]);
      UI.showSaveStatus("All data cleared", true);
    }
  }
};

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  if (typeof IntroVideo !== "undefined" && IntroVideo.init) {
    IntroVideo.init();
  }
  // sidebar hover expands/collapses layout for quick access
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.addEventListener('mouseenter', () => document.body.classList.add('sidebar-expanded'));
    sidebar.addEventListener('mouseleave', () => document.body.classList.remove('sidebar-expanded'));
  }

  App.init();
});

