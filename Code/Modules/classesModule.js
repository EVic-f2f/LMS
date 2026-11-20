/**
 * Classes Module - Manages class enrollment and teacher-student relationships
 */

const Classes = {
  selectedClassId: null,

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

  async apiRequest(endpoint, { method = 'GET', body } = {}) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error('Sign in again to manage classes.');
    const headers = { Authorization: `Bearer ${token}` };
    const schoolId = (typeof App !== 'undefined' && App.currentSchoolId) || Auth.getCurrentUser()?.school_id;
    if (schoolId) headers['X-School-Id'] = schoolId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(endpoint, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) })
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('The server returned an invalid response.');
    }
    if (!response.ok) throw new Error(result.error || 'Class request failed.');
    return result;
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
      const classes = await this.apiRequest('/api/classes');
      if (Auth.isTeacherOrHigher(currentUser)) {
        await this.renderTeacherView(content, currentUser, classes);
      } else {
        await this.renderStudentView(content, currentUser, classes);
      }
    } catch (error) {
      console.error('Error loading classes:', error);
      content.innerHTML = `<p style="color:red;">${this.escapeHtml(error.message || 'Error loading classes. Please try again.')}</p>`;
    }
  },

  async renderStudentView(content, user, classes) {
    const enrolledClasses = classes.filter((classInfo) => classInfo.isEnrolled);
    const availableClasses = classes.filter((classInfo) => !classInfo.isEnrolled);
    const enrolledClassesHtml = enrolledClasses.length
      ? enrolledClasses.map((classInfo) => `
          <div class="class-card themed-panel">
            <div><strong>${this.escapeHtml(classInfo.name)}</strong></div>
            <div class="muted" style="display:flex; flex-wrap:wrap; gap:12px; font-size:0.95em;">
              <span><strong>Teacher:</strong> ${this.escapeHtml(classInfo.teacher?.name || 'Unknown')}</span>
              <span><strong>Class ID:</strong> ${this.escapeHtml(classInfo.id)}</span>
              <span><strong>Students:</strong> ${classInfo.studentCount}</span>
            </div>
            <div class="class-actions">
              <button onclick="Classes.openClassDetail('${this.escapeHtml(classInfo.id)}')" class="btn-primary">Open Class</button>
            </div>
          </div>
        `).join('')
      : '<p>You are not enrolled in any classes yet.</p>';
    const availableClassesHtml = availableClasses.length
      ? availableClasses.map((classInfo) => {
          const buttonText = classInfo.hasPendingRequest ? 'Request Pending' : 'Request to Join';
          return `
            <div class="class-card themed-panel">
              <div><strong>${this.escapeHtml(classInfo.name)}</strong> (${this.escapeHtml(classInfo.subject)})</div>
              <div class="muted"><strong>Teacher:</strong> ${this.escapeHtml(classInfo.teacher?.name || 'Unknown')}</div>
              <button onclick="Classes.requestJoinClass('${this.escapeHtml(classInfo.id)}')" class="${classInfo.hasPendingRequest ? 'btn-secondary' : 'btn-primary'}" ${classInfo.hasPendingRequest ? 'disabled' : ''}>
                ${buttonText}
              </button>
            </div>
          `;
        }).join('')
      : '<p>No other classes are available.</p>';

    content.innerHTML = `
      <div style="margin-bottom:20px;">
        <h4>My Classes</h4>
        <div id="student-classes-list">${enrolledClassesHtml}</div>
      </div>
      <div>
        <h4>Find a Class</h4>
        <div id="available-classes">${availableClassesHtml}</div>
      </div>
    `;
  },

  async renderTeacherView(content, currentUser, classes) {
    content.innerHTML = `
      <div style="margin-bottom:20px;">
        <h4>My Classes</h4>
        <button onclick="Classes.createNewClass()" class="btn-secondary" style="margin-bottom:15px;">+ Create New Class</button>
        <div id="teacher-classes-list">
          ${classes.length
            ? classes.map((classInfo) => `
                <div class="class-card themed-panel">
                  <div><strong>${this.escapeHtml(classInfo.name)} (${this.escapeHtml(classInfo.subject)})</strong></div>
                  <div class="muted" style="display:flex; flex-wrap:wrap; gap:12px; font-size:0.95em;">
                    <span><strong>Class ID:</strong> ${this.escapeHtml(classInfo.id)}</span>
                    <span><strong>Students:</strong> ${classInfo.studentCount}</span>
                    <span><strong>Teacher:</strong> ${this.escapeHtml(classInfo.teacher?.name || currentUser.name)}</span>
                  </div>
                  <div class="class-actions">
                    <button onclick="Classes.openClassDetail('${this.escapeHtml(classInfo.id)}')" class="btn-primary">Manage Class</button>
                  </div>
                  ${classInfo.pendingRequests?.length ? `
                    <div style="margin-top:10px;">
                      <h6>Pending Requests:</h6>
                      <ul>
                        ${classInfo.pendingRequests.map((request) => `
                          <li style="display:flex; justify-content:space-between; align-items:center; margin:5px 0;">
                            <span>${this.escapeHtml(request.studentName || request.studentEmail)}</span>
                            <div>
                              <button onclick="Classes.acceptRequest('${this.escapeHtml(classInfo.id)}', '${this.escapeHtml(request.id)}')" class="btn-secondary" style="margin-right:5px;">Accept</button>
                              <button onclick="Classes.rejectRequest('${this.escapeHtml(classInfo.id)}', '${this.escapeHtml(request.id)}')" class="btn-primary">Reject</button>
                            </div>
                          </li>
                        `).join('')}
                      </ul>
                    </div>
                  ` : ''}
                </div>
              `).join('')
            : '<p>You are not teaching any classes yet.</p>'}
        </div>
      </div>
    `;
  },

  async openClassDetail(classId) {
    this.selectedClassId = classId;
    UI.openTab(null, 'ClassDetail');

    const content = document.getElementById('class-detail-content');
    if (content) content.innerHTML = '<p class="muted">Loading class details...</p>';

    try {
      await this.renderClassDetail();
    } catch (e) {
      console.error('openClassDetail error:', e);
      if (content) content.innerHTML = `<p style="color:red;">${this.escapeHtml(e.message || 'Failed to load class details.')}</p>`;
    }
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

    const classInfo = await this.apiRequest(`/api/classes/${encodeURIComponent(this.selectedClassId)}`);
    const teacher = classInfo.teacher || { name: 'Unknown' };
    const enrolledStudents = classInfo.students || [];

    const header = `
      <div class="themed-panel" style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom: 20px; flex-wrap: wrap;">
        <div>
          <div style="font-size:1.1em; font-weight:700; margin-bottom:8px;">${this.escapeHtml(classInfo.name)}</div>
          <div class="muted" style="font-size:0.95em;">
            <span style="margin-right:16px;"><strong>Teacher:</strong> ${this.escapeHtml(teacher.name)}</span>
            <span style="margin-right:16px;"><strong>Class ID:</strong> ${this.escapeHtml(classInfo.id)}</span>
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
    const classworkTabContent = this.renderClassworkTab(currentUser);

    if (Auth.isTeacherOrHigher(currentUser)) {
      const rows = enrolledStudents.length > 0
        ? enrolledStudents.map(student => {
            const studentGrades = (classInfo.studentGrades && classInfo.studentGrades[String(student.email).toLowerCase()]) || {};
            return `
              <tr data-email="${this.escapeHtml(student.email)}">
                    <td>${this.escapeHtml(student.name)}</td>
                ${Table.gradeFields.map(field => `
                  <td contenteditable="true" class="grade-cell" data-field="${this.escapeHtml(field)}" style="min-width: 80px; padding: 10px; border: 1px solid rgba(0,0,0,0.06);">${this.escapeHtml(studentGrades[field] ?? '')}</td>
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
                        ${Table.gradeFields.map(field => `<th style="border-bottom:1px solid rgba(0,0,0,0.06); padding: 12px;">${this.escapeHtml(field)}</th>`).join('')}
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

      content.innerHTML = `
        ${header}
        ${tabBar}
        ${gradesTabContent}
        ${classworkTabContent}
      `;

      const gradeCells = content.querySelectorAll('#class-grades-table .grade-cell');
      gradeCells.forEach(cell => cell.addEventListener('input', (event) => Validation.validateScore(event)));
    } else {
      const allGrades = classInfo.studentGrades || {};
      const emailKey = Object.keys(allGrades).find((email) =>
        String(email).toLowerCase() === String(currentUser.email).toLowerCase()
      );
      const studentGrades = emailKey ? allGrades[emailKey] : {};
      const gradeRows = Table.gradeFields.map((field) => `
        <tr>
          <th>${this.escapeHtml(field)}</th>
          <td>${this.escapeHtml(studentGrades[field] ?? '')}</td>
        </tr>
      `).join('');
      const hasGrades = Table.gradeFields.some((field) =>
        studentGrades[field] !== undefined && studentGrades[field] !== null && String(studentGrades[field]).trim() !== ''
      );
      content.innerHTML = `
        ${header}
        ${tabBar}
        <div id="class-tab-grades" class="class-tab-content" style="display: block;">
          <div class="themed-panel">
            <h4 style="margin-top:0;">Your Grades</h4>
            ${hasGrades ? `<table class="student-grades-table"><thead><tr><th>Field</th><th>Grade</th></tr></thead><tbody>${gradeRows}</tbody></table>` : '<p class="muted" style="margin-bottom:0;">Your grades will appear here.</p>'}
          </div>
        </div>
        ${classworkTabContent}
      `;
    }

    const uploadInput = content.querySelector('#classwork-upload-input');
    const uploadButton = content.querySelector('#classwork-upload-button');
    uploadButton?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', () => this.uploadClassFiles(uploadInput.files));
  },

  renderClassworkTab(user) {
    const canUpload = Auth.isTeacherOrHigher(user);
    return `
      <div id="class-tab-classwork" class="class-tab-content" style="display:none;">
        <div class="themed-panel">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
            <h4 style="margin:0;">Class Work & Resources</h4>
            ${canUpload ? `
              <div>
                <input id="classwork-upload-input" type="file" multiple style="display:none;">
                <button id="classwork-upload-button" type="button" class="btn-primary">Upload files</button>
              </div>
            ` : ''}
          </div>
          <p id="classwork-upload-status" class="muted" aria-live="polite" style="margin:10px 0;"></p>
          <div id="classwork-files-list" class="muted">Loading files...</div>
        </div>
      </div>
    `;
  },

  async loadClassFiles(classId) {
    const container = document.getElementById('classwork-files-list');
    if (!container || !classId || typeof FileTransferService === 'undefined') return;

    try {
      const files = await FileTransferService.listFiles(classId);
      if (!container.isConnected || classId !== this.selectedClassId) return;
      container.replaceChildren();

      if (!files.length) {
        container.textContent = 'No files uploaded yet.';
        return;
      }

      const list = document.createElement('ul');
      list.style.cssText = 'list-style:none; padding:0; margin:0;';
      files.forEach((file) => {
        const item = document.createElement('li');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-top:1px solid rgba(0,0,0,0.08);';

        const name = document.createElement('span');
        name.textContent = `${file.filename} (${this.formatFileSize(file.size)})`;
        item.appendChild(name);

        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'btn-secondary';
        downloadButton.textContent = 'Download';
        downloadButton.addEventListener('click', () => this.downloadClassFile(file.path, file.filename));
        item.appendChild(downloadButton);
        list.appendChild(item);
      });
      container.appendChild(list);
    } catch (error) {
      if (!container.isConnected || classId !== this.selectedClassId) return;
      container.textContent = error.message || 'Unable to load class files.';
    }
  },

  async uploadClassFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const input = document.getElementById('classwork-upload-input');
    const button = document.getElementById('classwork-upload-button');
    const status = document.getElementById('classwork-upload-status');
    if (!this.ensureTeacherAccess(Auth.getCurrentUser())) return;

    if (files.some((file) => file.size > 50 * 1024 * 1024)) {
      if (status) status.textContent = 'Each file must be 50 MB or smaller.';
      if (input) input.value = '';
      return;
    }

    if (button) button.disabled = true;
    if (status) status.textContent = `Uploading ${files.length} file${files.length === 1 ? '' : 's'}...`;
    try {
      for (const file of files) {
        await FileTransferService.uploadBrowserFile(file, file.name, this.selectedClassId);
      }
      if (status) status.textContent = `${files.length} file${files.length === 1 ? '' : 's'} uploaded.`;
      await this.loadClassFiles(this.selectedClassId);
    } catch (error) {
      if (status) status.textContent = error.message || 'Upload failed.';
    } finally {
      if (button) button.disabled = false;
      if (input) input.value = '';
    }
  },

  async downloadClassFile(filePath, filename) {
    try {
      const blob = await FileTransferService.downloadFileBlob(filePath, this.selectedClassId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      const status = document.getElementById('classwork-upload-status');
      if (status) status.textContent = error.message || 'Download failed.';
    }
  },

  formatFileSize(size) {
    const bytes = Number(size) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    if (tabName === 'classwork') this.loadClassFiles(this.selectedClassId);

    // Update tab buttons
    const allButtons = content.querySelectorAll('.class-tab-btn');
    allButtons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
        btn.style.borderBottom = '3px solid #3498db';
        btn.style.color = '#3498db';
      } else {
        btn.classList.remove('active');
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

    const saveButton = content.querySelector('button[onclick="Classes.saveClassGrades()"]');
    if (saveButton) saveButton.disabled = true;
    try {
      await this.apiRequest(`/api/classes/${encodeURIComponent(this.selectedClassId)}/grades`, {
        method: 'PUT',
        body: { studentGrades }
      });
      alert('Class grades saved successfully.');
      await this.renderClassDetail();
    } catch (error) {
      console.error('Error saving class grades:', error);
      alert(error.message || 'Error saving class grades. Please try again.');
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  },

  goBackToClasses() {
    this.selectedClassId = null;
    UI.openTab(null, 'Classes');
    this.render();
  },

  async requestJoinClass(classId) {
    const currentUser = Auth.getCurrentUser();
    if (!currentUser) return;

    try {
      await this.apiRequest(`/api/classes/${encodeURIComponent(classId)}/join-requests`, {
        method: 'POST',
        body: {}
      });
      alert('Request sent! The teacher will review your request.');
      await this.render();

    } catch (error) {
      console.error('Error requesting to join class:', error);
      alert(error.message || 'Error sending request. Please try again.');
    }
  },

  async acceptRequest(classId, requestId) {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    if (!currentUser) return;

    try {
      await this.apiRequest(`/api/classes/${encodeURIComponent(classId)}/join-requests/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        body: { action: 'accept' }
      });
      alert('Student accepted into class!');
      await this.render();

    } catch (error) {
      console.error('Error accepting request:', error);
      alert(error.message || 'Error accepting request. Please try again.');
    }
  },

  async rejectRequest(classId, requestId) {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    if (!currentUser) return;

    try {
      await this.apiRequest(`/api/classes/${encodeURIComponent(classId)}/join-requests/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        body: { action: 'reject' }
      });
      alert('Request rejected.');
      await this.render();

    } catch (error) {
      console.error('Error rejecting request:', error);
      alert(error.message || 'Error rejecting request. Please try again.');
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
      await this.apiRequest('/api/classes', {
        method: 'POST',
        body: {
          name: className.trim(),
          subject: subject.trim(),
          schoolId: (typeof App !== 'undefined' && App.currentSchoolId) || currentUser.school_id
        }
      });
      alert('Class created successfully!');
      await this.render();

    } catch (error) {
      console.error('Error creating class:', error);
      alert(error.message || 'Error creating class. Please try again.');
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Classes;
}
