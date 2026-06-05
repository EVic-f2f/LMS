/**
 * LMS Main Application Controller
 * Orchestrates modules and handles app lifecycle
 */

const App = {
  config: {},
  currentAccount: null,

  async init() {
    await Auth.ensureDefaultAdmin();
    this.loadAccount();
    if (!this.currentAccount) {
      window.location.href = "sign-in.html";
      return;
    }

    // Load configuration from the server's own address
    try {
      const hostname = window.location.hostname;
      const port = window.location.port || 3000;
      const response = await fetch(`http://${hostname}:${port}/Code/config.json`);
      this.config = await response.json();
    } catch (e) {
      console.warn("Failed to load config, using defaults");
      this.config = {
        gradeFields: ["Test", "Test1", "Test2", "Test3", "Exam"],
        defaultStudents: []
      };
    }

    // Apply theme colors
    this.applyTheme();

    // Update sidebar and header branding
    this.updateSidebarInfo();

    // Initialize modules
    Table.gradeFields = this.config.gradeFields || Table.gradeFields;
    Validation.maxScores = Storage.getMaxScores();

    // Restrict access by role
    this.applyAccessControl();

    // Load student data
    this.load();

    // Setup event listeners
    this.setupEventListeners();

    // Initialize Classes module if available
    if (typeof Classes !== "undefined") {
      Classes.init();
    }

    // Set default tab
    document.querySelector('.tablinks[data-tab="Home"]')?.click();
  },

  applyTheme() {
    if (this.config.theme) {
      const theme = this.config.theme;
      const root = document.documentElement;
      
      if (theme.primary) root.style.setProperty('--primary', theme.primary);
      if (theme.secondary) root.style.setProperty('--secondary', theme.secondary);
      if (theme.accent) root.style.setProperty('--accent', theme.accent);
      if (theme.success) root.style.setProperty('--success', theme.success);
      if (theme.warning) root.style.setProperty('--warning', theme.warning);
      if (theme.background) root.style.setProperty('--background', theme.background);
      if (theme.text) root.style.setProperty('--text', theme.text);
    }
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

    const hdTab = document.querySelector('.tablinks[data-tab="HD"]');
    if (hdTab) {
      hdTab.style.display = Auth.isAdministrator(this.currentAccount) ? 'flex' : 'none';
    }

    const topbarMeta = document.querySelector('.topbar-meta');
    if (topbarMeta) {
      topbarMeta.textContent = this.currentAccount ? `${this.currentAccount.status}` : 'Guest';
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

  updateSidebarInfo() {
    const schoolName = this.config.schoolName || "Belmont Academy";
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
  },

  load() {
    // Try browser storage first
    const stored = Storage.getStudents();
    if (stored && Array.isArray(stored) && stored.length > 0) {
      Table.buildStudentTable(stored);
      return;
    }

    // Fallback to server
    API.getStudents()
      .then((students) => {
        Table.buildStudentTable(Array.isArray(students) ? students : this.config.defaultStudents);
      })
      .catch(() => {
        Table.buildStudentTable(this.config.defaultStudents);
      });
  },

  async save() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      alert("Only teachers and administrators can save grades.");
      return;
    }

    const students = Table.collectTableData();
    Storage.saveStudents(students);

    try {
      await API.saveStudents(students);
      UI.showSaveStatus("✓ Saved to browser and server", true);
    } catch (error) {
      UI.showSaveStatus("✓ Saved to browser (server unavailable)", true);
    }
  },

  addStudent() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      alert("Only teachers and administrators can add student grades.");
      return;
    }
    Table.addRow();
  },

  clearAllData() {
    if (!Auth.isTeacherOrHigher(this.currentAccount)) {
      alert("Only teachers and administrators can clear grade data.");
      return;
    }

    if (confirm("Are you sure you want to clear all student data? This cannot be undone.")) {
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

