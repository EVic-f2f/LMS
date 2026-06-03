/**
 * UI Module - Handles all user interface interactions
 */

const UI = {
  selectedRow: null,
  selectedColumn: -1,

  openTab(evt, tabName) {
    const normalizedTabName = tabName === "Student" ? "Classes" : tabName;

    if (normalizedTabName === "Settings" && !Auth.isTeacherOrHigher()) {
      alert("Only teachers and administrators can access Settings.");
      return;
    }

    if (normalizedTabName === "HD" && !Auth.isAdministrator()) {
      alert("Only administrators can access HD.");
      return;
    }

    const tabcontent = document.querySelectorAll(".tabcontent");
    tabcontent.forEach(tab => tab.style.display = "none");

    const tablinks = document.querySelectorAll(".tablinks");
    tablinks.forEach(link => link.classList.remove("active"));

    const targetTab = document.getElementById(normalizedTabName);
    if (targetTab) {
      targetTab.style.display = "block";
    }

    let activeButton = evt && evt.currentTarget ? evt.currentTarget : document.querySelector(`.tablinks[data-tab="${normalizedTabName}"]`);
    if (!activeButton && normalizedTabName === "ClassDetail") {
      activeButton = document.querySelector(`.tablinks[data-tab="Classes"]`);
    }
    if (activeButton) {
      activeButton.classList.add("active");
    }

    const titleLabel = document.getElementById("tab-title");
    if (titleLabel) {
      const titles = {
        Home: "Home",
        Classes: "Classes",
        ClassDetail: "Class Details",
        Student: "Student Grades",
        Account: "Account",
        Settings: "Settings",
        HD: "HD"
      };
      titleLabel.textContent = titles[tabName] || tabName;
    }

    // Render content for specific tabs
    if ((tabName === "Classes" || tabName === "Student") && typeof Classes !== "undefined") {
      setTimeout(() => Classes.render(), 100);
    }
    if (tabName === "ClassDetail" && typeof Classes !== "undefined") {
      setTimeout(() => Classes.renderClassDetail(), 100);
    }
    if (tabName === "HD" && typeof HD !== "undefined") {
      setTimeout(() => HD.render(), 100);
    }
  },

  showContextMenu(event, target) {
    event.preventDefault();
    const menu = document.getElementById("context-menu");
    const menuList = document.getElementById("context-menu-list");
    menuList.innerHTML = "";

    if (target.tagName === "TR" && target.closest("tbody")) {
      this.selectedRow = target;
      const li = document.createElement("li");
      li.textContent = "🗑️ Delete Student";
      li.onclick = () => this.deleteRow();
      menuList.appendChild(li);
    } else if (target.tagName === "TH") {
      const thIndex = Array.from(target.parentNode.children).indexOf(target);
      this.selectedColumn = thIndex;

      const liOrder = document.createElement("li");
      liOrder.textContent = "📊 Order";
      liOrder.onclick = () => this.sortColumn();
      menuList.appendChild(liOrder);

      if (thIndex > 0) {
        const liMax = document.createElement("li");
        liMax.textContent = "⚙️ Set Max Score";
        liMax.onclick = () => this.setMaxScorePrompt();
        menuList.appendChild(liMax);
      }
    }

    menu.style.left = event.pageX + "px";
    menu.style.top = event.pageY + "px";
    menu.style.display = "block";
  },

  hideContextMenu() {
    const menu = document.getElementById("context-menu");
    menu.style.display = "none";
    this.selectedRow = null;
    this.selectedColumn = -1;
  },

  deleteRow() {
    if (this.selectedRow) {
      Table.deleteRow(this.selectedRow);
      this.hideContextMenu();
      App.save();
    }
  },

  sortColumn() {
    if (this.selectedColumn >= 0) {
      Table.sortByColumn(this.selectedColumn);
      this.hideContextMenu();
    }
  },

  setMaxScorePrompt() {
    if (this.selectedColumn > 0) {
      const field = Table.gradeFields[this.selectedColumn - 1];
      Validation.setMaxScore(this.selectedColumn, field);
    }
    this.hideContextMenu();
  },

  showSaveStatus(message, isSuccess) {
    const status = document.getElementById("save-status");
    status.textContent = message;
    status.style.color = isSuccess ? "#2a7" : "#c00";
    status.style.display = "inline";
    setTimeout(() => {
      status.style.display = "none";
    }, 3000);
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = UI;
}
