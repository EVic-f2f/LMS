/**
 * Classes Module - Manages class enrollment and teacher-student relationships
 */

const Classes = {
  selectedClassId: null,
  selectedTeacherEmail: null,

  escapeHtml(value) {
    return String(value || "").replace(/[&<>"'`=\/]/g, (char) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
        '/': '&#x2F;'
      }[char];
    });
  },

  validateGradeValue(value) {
    const cleaned = String(value || "").trim();
    if (cleaned === "") return "";
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) return "";
    if (numeric < 0) return "0";
    if (numeric > 100) return "100";
    return String(Math.round(numeric));
  },

  ensureTeacherAccess(user) {
    if (!Auth.isTeacherOrHigher(user)) {
      alert("Only teachers and administrators can perform this action.");
      return false;
    }
    return true;
  },

  async init() {
    // Initialize the module (add any setup if needed)
  },

  async render() {
    const content = document.getElementById('classes-content');
    if (!content) {
      console.error('classes-content element not found');
      return;
    }

    const currentUser = Auth.getCurrentUser();
    if (!currentUser) {
      content.innerHTML = '<p style="color: red;">Please sign in to view classes.</p>';
      return;
    }

    content.innerHTML = '<p style="text-align: center; color: #999;">Loading classes...</p>';

    try {
      if (Auth.isTeacherOrHigher(currentUser)) {
        await this.renderTeacherView(content, currentUser);
      } else {
        await this.renderStudentView(content, currentUser);
      }
    } catch (error) {
      console.error('Error loading classes:', error);
      content.innerHTML = '<p style="color: red;">Error loading classes. Please try again.</p>';
    }
  },

  async renderStudentView(content, user) {
    const users = await Auth.getUsers();
    const teachers = users.filter(u => u.status === 'Teacher' || u.status === 'Administrator');

    const enrolledClassesHtml = user.enrolledClasses && user.enrolledClasses.length > 0
      ? user.enrolledClasses.map(classId => {
          const teacher = teachers.find(t => t.taughtClasses && t.taughtClasses.some(c => c.id === classId));
          const classInfo = teacher ? teacher.taughtClasses.find(c => c.id === classId) : null;
          return `
            <div class="class-card themed-panel">
              <div>
                  <strong>${this.escapeHtml(classInfo ? classInfo.name : 'Unknown Class')}</strong>
              </div>
              <div class="muted" style="display:flex; flex-wrap:wrap; gap: 12px; font-size: 0.95em;">
                  <span><strong>Teacher:</strong> ${this.escapeHtml(teacher ? teacher.name : 'Unknown')}</span>
                  <span><strong>Class ID:</strong> ${this.escapeHtml(classId)}</span>
                <span><strong>Students:</strong> ${classInfo && classInfo.students ? classInfo.students.length : 0}</span>
              </div>
                <div class="class-actions"><button onclick="Classes.openClassDetail(${JSON.stringify(classId)}, ${JSON.stringify(teacher ? teacher.email : '')})" class="btn-primary">Open Class</button></div>
            </div>
          `;
        }).join('')
      : '<p>You are not enrolled in any classes yet.</p>';

    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h4>📚 My Classes</h4>
        <div id="student-classes-list">
          ${enrolledClassesHtml}
        </div>
      </div>

      <div>
        <h4>🔍 Find a Class</h4>
        <div id="available-teachers">
          ${teachers.map(teacher => `
            <div class="teacher-card themed-panel">
              <h5>${this.escapeHtml(teacher.name)}</h5>
              <p><strong>Classes:</strong></p>
              <ul>
                ${teacher.taughtClasses && teacher.taughtClasses.length > 0
                  ? teacher.taughtClasses.map(classInfo => {
                      const isEnrolled = user.enrolledClasses && user.enrolledClasses.includes(classInfo.id);
                      const hasPendingRequest = classInfo.pendingRequests && classInfo.pendingRequests.some(r => r.studentEmail === user.email);
                      let buttonText = 'Request to Join';
                      let buttonDisabled = false;
                      let bgColor = '#3498db';
                      if (isEnrolled) {
                        buttonText = 'Already Enrolled';
                        buttonDisabled = true;
                        bgColor = '#95a5a6';
                      } else if (hasPendingRequest) {
                        buttonText = 'Request Pending';
                        buttonDisabled = true;
                        bgColor = '#f39c12';
                      }
                      return `
                        <li style="margin-bottom: 10px; display:flex; align-items:center; justify-content:space-between; gap: 10px;">
                              <span class="muted">${this.escapeHtml(classInfo.name)} (${this.escapeHtml(classInfo.subject)})</span>
                              <button onclick="Classes.requestJoinClass(${JSON.stringify(teacher.email)}, ${JSON.stringify(classInfo.id)})" class="${buttonDisabled ? 'btn-secondary' : 'btn-primary'}" ${buttonDisabled ? 'disabled' : ''}>
                            ${buttonText}
                          </button>
                        </li>
                      `;
                    }).join('')
                  : '<li>No classes available</li>'
                }
              </ul>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  async renderTeacherView(content, user) {
    const users = await Auth.getUsers();
    const students = users.filter(u => u.status === 'Student');

    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h4>👨‍🏫 My Classes</h4>
        <button onclick="Classes.createNewClass()" class="btn-secondary" style="margin-bottom: 15px;">+ Create New Class</button>
        <div id="teacher-classes-list">
          ${user.taughtClasses && user.taughtClasses.length > 0
            ? user.taughtClasses.map(classInfo => `
                <div class="class-card themed-panel">
                  <div><strong>${classInfo.name} (${classInfo.subject})</strong></div>
                  <div class="muted" style="display:flex; flex-wrap:wrap; gap: 12px; font-size: 0.95em;">
                    <span><strong>Class ID:</strong> ${classInfo.id}</span>
                    <span><strong>Students:</strong> ${classInfo.students ? classInfo.students.length : 0}</span>
                    <span><strong>Teacher:</strong> ${user.name}</span>
                  </div>
                  <div class="class-actions">
                    <button onclick="Classes.openClassDetail(${JSON.stringify(classInfo.id)}, ${JSON.stringify(user.email)})" class="btn-primary">Manage Class</button>
                  </div>

                  ${classInfo.pendingRequests && classInfo.pendingRequests.length > 0 ? `
                    <div style="margin-top: 10px;">
                      <h6>📝 Pending Requests:</h6>
                      <ul>
                        ${classInfo.pendingRequests.map(request => {
                          const student = students.find(s => s.email === request.studentEmail);
                          return `
                            <li style="display: flex; justify-content: space-between; align-items: center; margin: 5px 0;">
                              <span>${student ? student.name : request.studentEmail}</span>
                              <div>
                                <button onclick="Classes.acceptRequest(${JSON.stringify(classInfo.id)}, ${JSON.stringify(request.studentEmail)})" class="btn-secondary" style="margin-right:5px;">Accept</button>
                                <button onclick="Classes.rejectRequest(${JSON.stringify(classInfo.id)}, ${JSON.stringify(request.studentEmail)})" class="btn-primary">Reject</button>
                              </div>
                            </li>
                          `;
                        }).join('')}
                      </ul>
                    </div>
                  ` : ''}
                </div>
              `).join('')
            : '<p>You are not teaching any classes yet.</p>'
          }
        </div>
      </div>
    `;
  },

  async openClassDetail(classId, teacherEmail) {
    this.selectedClassId = classId;
    this.selectedTeacherEmail = teacherEmail;
    UI.openTab(null, 'ClassDetail');
    await this.renderClassDetail();
  },

  async renderClassDetail() {
    const content = document.getElementById('class-detail-content');
    if (!content) {
      console.error('class-detail-content element not found');
      return;
    }

    const currentUser = Auth.getCurrentUser();
    if (!currentUser) {
      content.innerHTML = '<p style="color: red;">Please sign in to view class details.</p>';
      return;
    }

    const users = await Auth.getUsers();
    const teacher = users.find(u => u.email === this.selectedTeacherEmail);
    const classInfo = teacher?.taughtClasses?.find(c => c.id === this.selectedClassId);

    if (!classInfo || !teacher) {
      content.innerHTML = '<p style="color: red;">Unable to locate the selected class.</p>';
      return;
    }

    const enrolledStudents = (classInfo.students || [])
      .map(email => users.find(u => u.email === email))
      .filter(Boolean);

    const header = `
      <div class="themed-panel" style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom: 20px; flex-wrap: wrap;">
        <div>
          <div style="font-size:1.1em; font-weight:700; margin-bottom:8px;">${this.escapeHtml(classInfo.name)}</div>
          <div class="muted" style="font-size:0.95em;">
            <span style="margin-right:16px;"><strong>Teacher:</strong> ${this.escapeHtml(teacher.name)}</span>
            <span style="margin-right:16px;"><strong>Class ID:</strong> ${classInfo.id}</span>
            <span><strong>Students:</strong> ${enrolledStudents.length}</span>
          </div>
        </div>
        <button onclick="Classes.goBackToClasses()" class="btn-secondary">Back to Classes</button>
      </div>
    `;

    const tabBar = `
      <div class="class-tab-bar">
        <button onclick="Classes.switchClassTab('grades')" class="class-tab-btn active" data-tab="grades">📊 Grades</button>
        <button onclick="Classes.switchClassTab('classwork')" class="class-tab-btn" data-tab="classwork">📋 Class Work</button>
      </div>
    `;

    if (Auth.isTeacherOrHigher(currentUser)) {
      const rows = enrolledStudents.length > 0
        ? enrolledStudents.map(student => {
            const studentGrades = (classInfo.studentGrades && classInfo.studentGrades[student.email]) || {};
            return `
              <tr data-email="${student.email}">
                    <td>${this.escapeHtml(student.name)}</td>
                ${Table.gradeFields.map(field => `
                  <td contenteditable="true" class="grade-cell" data-field="${field}" style="min-width: 80px; padding: 10px; border: 1px solid rgba(0,0,0,0.06);">${studentGrades[field] || ''}</td>
                `).join('')}
              </tr>
            `;
          }).join('')
        : '';

      const gradesTabContent = `
        <div id="class-tab-grades" class="class-tab-content" style="display: block;">
          <div class="themed-panel" style="margin-bottom:20px;">
            <h4 style="margin-top:0;">Enrolled Students & Grades</h4>
            ${enrolledStudents.length > 0 ? `
              <div style="overflow-x:auto;">
                <table id="class-grades-table" style="width:100%; border-collapse: collapse; text-align:left;">
                  <thead>
                    <tr>
                      <th style="border-bottom:1px solid rgba(0,0,0,0.06); padding: 12px;">Student</th>
                      ${Table.gradeFields.map(field => `<th style="border-bottom:1px solid rgba(0,0,0,0.06); padding: 12px;">${field}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </div>
              <button onclick="Classes.saveClassGrades()" class="btn-secondary" style="margin-top: 16px;">Save Class Grades</button>
            ` : '<p class="muted">No students are currently enrolled in this class.</p>'}
          </div>
        </div>
      `;

      const classworkTabContent = `
        <div id="class-tab-classwork" class="class-tab-content" style="display: none;">
          <div class="themed-panel">
            <h4 style="margin-top:0;">Class Work & Assignments</h4>
            <p class="muted" style="margin-bottom:0;">No class work assigned yet.</p>
          </div>
        </div>
      `;

      content.innerHTML = `
        ${header}
        ${tabBar}
        ${gradesTabContent}
        ${classworkTabContent}
      `;

      const gradeCells = content.querySelectorAll('#class-grades-table .grade-cell');
      gradeCells.forEach(cell => cell.addEventListener('input', (event) => Validation.validateScore(event)));
    } else {
      content.innerHTML = `
        ${header}
        ${tabBar}
        <div id="class-tab-grades" class="class-tab-content" style="display: block;">
          <div class="themed-panel">
            <h4 style="margin-top:0;">Your Grades</h4>
            <p class="muted" style="margin-bottom:0;">Your grades will appear here.</p>
          </div>
        </div>
        <div id="class-tab-classwork" class="class-tab-content" style="display: none;">
          <div class="themed-panel">
            <h4 style="margin-top:0;">Class Work & Assignments</h4>
            <p class="muted" style="margin-bottom:0;">Class work and assignments will appear here.</p>
          </div>
        </div>
      `;
    }
  },

  switchClassTab(tabName) {
    const content = document.getElementById('class-detail-content');
    if (!content) return;

    // Hide all tabs
    const allTabs = content.querySelectorAll('.class-tab-content');
    allTabs.forEach(tab => tab.style.display = 'none');

    // Show selected tab
    const selectedTab = content.querySelector(`#class-tab-${tabName}`);
    if (selectedTab) {
      selectedTab.style.display = 'block';
    }

    // Update tab buttons
    const allButtons = content.querySelectorAll('.class-tab-btn');
    allButtons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.style.borderBottom = '3px solid #3498db';
        btn.style.color = '#3498db';
      } else {
        btn.style.borderBottom = '3px solid transparent';
        btn.style.color = '#999';
      }
    });
  },
  

  async saveClassGrades() {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    const content = document.getElementById('class-detail-content');
    if (!content) return;

    const table = content.querySelector('#class-grades-table');
    if (!table) return;

    const users = await Auth.getUsers();
    const teacher = users.find(u => u.email === this.selectedTeacherEmail);
    const classInfo = teacher?.taughtClasses?.find(c => c.id === this.selectedClassId);
    if (!classInfo || !teacher) {
      alert('Unable to locate class to save grades.');
      return;
    }

    const studentGrades = {};
    table.querySelectorAll('tbody tr').forEach(row => {
      const email = row.dataset.email;
      if (!email) return;
      studentGrades[email] = {};
      row.querySelectorAll('[data-field]').forEach(cell => {
        const field = cell.dataset.field;
        studentGrades[email][field] = this.validateGradeValue(cell.textContent);
      });
    });

    classInfo.studentGrades = studentGrades;
    await Auth.saveUsers(users);
    alert('Class grades saved successfully.');
    await this.renderClassDetail();
  },

  goBackToClasses() {
    this.selectedClassId = null;
    this.selectedTeacherEmail = null;
    UI.openTab(null, 'Classes');
    this.render();
  },

  async requestJoinClass(teacherEmail, classId) {
    const currentUser = Auth.getCurrentUser();
    if (!currentUser) return;

    try {
      const users = await Auth.getUsers();
      const teacherIndex = users.findIndex(u => u.email === teacherEmail);

      if (teacherIndex === -1) {
        alert('Teacher not found.');
        return;
      }

      const teacher = users[teacherIndex];
      if (!teacher.taughtClasses) teacher.taughtClasses = [];

      const classInfo = teacher.taughtClasses.find(c => c.id === classId);
      if (!classInfo) {
        alert('Class not found.');
        return;
      }

      // Check if already enrolled
      if (classInfo.students && classInfo.students.includes(currentUser.email)) {
        alert('You are already enrolled in this class.');
        return;
      }

      // Check if request already pending
      if (classInfo.pendingRequests && classInfo.pendingRequests.some(r => r.studentEmail === currentUser.email)) {
        alert('You have already requested to join this class.');
        return;
      }

      // Add pending request
      if (!classInfo.pendingRequests) classInfo.pendingRequests = [];
      classInfo.pendingRequests.push({
        studentEmail: currentUser.email,
        requestedAt: new Date().toISOString()
      });

      await Auth.saveUsers(users);
      alert('Request sent! The teacher will review your request.');
      await this.render(); // Refresh the view with await

    } catch (error) {
      console.error('Error requesting to join class:', error);
      alert('Error sending request. Please try again.');
    }
  },

  async acceptRequest(classId, studentEmail) {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    if (!currentUser) return;

    try {
      const users = await Auth.getUsers();
      const teacherIndex = users.findIndex(u => u.email === currentUser.email);

      if (teacherIndex === -1) return;

      const teacher = users[teacherIndex];
      const classInfo = teacher.taughtClasses.find(c => c.id === classId);

      if (!classInfo || !classInfo.pendingRequests) return;

      // Remove from pending requests
      classInfo.pendingRequests = classInfo.pendingRequests.filter(r => r.studentEmail !== studentEmail);

      // Add to enrolled students
      if (!classInfo.students) classInfo.students = [];
      if (!classInfo.students.includes(studentEmail)) {
        classInfo.students.push(studentEmail);
      }

      // Add class to student's enrolled classes
      const studentIndex = users.findIndex(u => u.email === studentEmail);
      if (studentIndex !== -1) {
        const student = users[studentIndex];
        if (!student.enrolledClasses) student.enrolledClasses = [];
        if (!student.enrolledClasses.includes(classId)) {
          student.enrolledClasses.push(classId);
        }
      }

      await Auth.saveUsers(users);
      alert('Student accepted into class!');
      await this.render(); // Refresh the view with await

    } catch (error) {
      console.error('Error accepting request:', error);
      alert('Error accepting request. Please try again.');
    }
  },

  async rejectRequest(classId, studentEmail) {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    if (!currentUser) return;

    try {
      const users = await Auth.getUsers();
      const teacherIndex = users.findIndex(u => u.email === currentUser.email);

      if (teacherIndex === -1) return;

      const teacher = users[teacherIndex];
      const classInfo = teacher.taughtClasses.find(c => c.id === classId);

      if (!classInfo || !classInfo.pendingRequests) return;

      // Remove from pending requests
      classInfo.pendingRequests = classInfo.pendingRequests.filter(r => r.studentEmail !== studentEmail);

      await Auth.saveUsers(users);
      alert('Request rejected.');
      await this.render(); // Refresh the view with await

    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Error rejecting request. Please try again.');
    }
  },

  async createNewClass() {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    const className = prompt('Enter class name:');
    if (!className || !className.trim()) return;

    const subject = prompt('Enter subject:');
    if (!subject || !subject.trim()) return;

    if (!currentUser) return;

    try {
      const users = await Auth.getUsers();
      const teacherIndex = users.findIndex(u => u.email === currentUser.email);

      if (teacherIndex === -1) return;

      const teacher = users[teacherIndex];
      if (!teacher.taughtClasses) teacher.taughtClasses = [];

      const classId = `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      teacher.taughtClasses.push({
        id: classId,
        name: className.trim(),
        subject: subject.trim(),
        students: [],
        pendingRequests: [],
        createdAt: new Date().toISOString()
      });

      await Auth.saveUsers(users);
      alert('Class created successfully!');
      await this.render(); // Refresh the view with await

    } catch (error) {
      console.error('Error creating class:', error);
      alert('Error creating class. Please try again.');
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Classes;
}
