/**
 * Table Module - Handles table building and data collection
 */

const Table = {
  gradeFields: ["Test", "Test1", "Test2", "Test3", "Exam"],

  buildStudentTable(students) {
    const tbody = document.querySelector("#student-table tbody");
    if (!tbody) {
      console.warn("student-table tbody not found; skipping buildStudentTable");
      return;
    }
    tbody.innerHTML = "";


    students.forEach((student, index) => {
      const row = document.createElement("tr");
      row.dataset.studentId = student.studentId || String(index + 1);

      const nameCell = document.createElement("td");
      nameCell.className = "student-name";
      nameCell.contentEditable = true;
      nameCell.textContent = student.student_name || "";
      row.appendChild(nameCell);

      const grades = (student.Grades && typeof student.Grades === "object") ? student.Grades : {};
      this.gradeFields.forEach((field, idx) => {
        const cell = document.createElement("td");
        cell.className = "grade-cell";
        cell.contentEditable = true;
        cell.textContent = grades[field] || "";
        cell.dataset.field = field;
        cell.addEventListener("input", (e) => Validation.validateScore(e));
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });
  },

  collectTableData() {
    const rows = document.querySelectorAll("#student-table tbody tr");
    return Array.from(rows).map((row) => {
      const name = row.querySelector(".student-name").textContent.trim();
      const cells = row.querySelectorAll(".grade-cell");
      const grades = {};
      this.gradeFields.forEach((field, index) => {
        grades[field] = cells[index].textContent.trim();
      });

      return {
        studentId: row.dataset.studentId || "",
        student_name: name,
        Grades: grades
      };
    });
  },

  addRow() {
    const tbody = document.querySelector("#student-table tbody");
    const nextId = tbody.children.length + 1;
    const row = document.createElement("tr");
    row.dataset.studentId = String(nextId);

    const nameCell = document.createElement("td");
    nameCell.className = "student-name";
    nameCell.contentEditable = true;
    nameCell.textContent = "";
    row.appendChild(nameCell);

    this.gradeFields.forEach((field) => {
      const cell = document.createElement("td");
      cell.className = "grade-cell";
      cell.contentEditable = true;
      cell.textContent = "";
      cell.dataset.field = field;
      cell.addEventListener("input", (e) => Validation.validateScore(e));
      row.appendChild(cell);
    });

    tbody.appendChild(row);
  },

  deleteRow(row) {
    if (row) {
      row.remove();
    }
  },

  sortByColumn(columnIndex) {
    const tbody = document.querySelector("#student-table tbody");
    const rows = Array.from(tbody.rows);

    rows.sort((a, b) => {
      const aVal = a.cells[columnIndex].textContent.trim();
      const bVal = b.cells[columnIndex].textContent.trim();

      if (columnIndex === 0) {
        return aVal.localeCompare(bVal);
      } else {
        const aNum = parseFloat(aVal) || 0;
        const bNum = parseFloat(bVal) || 0;
        return bNum - aNum;
      }
    });

    rows.forEach(row => tbody.appendChild(row));
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Table;
}
