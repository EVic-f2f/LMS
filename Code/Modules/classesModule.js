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
      AppDialogs.alert("Only teachers and administrators can perform this action.");
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
    const renderCard = (classInfo, enrolled) => `
      <article class="classes-card">
        <div class="classes-card-heading">
          <span class="classes-card-icon icon-mask icon-classes" aria-hidden="true"></span>
          <span class="classes-subject">${this.escapeHtml(classInfo.subject || 'Class')}</span>
        </div>
        <h4>${this.escapeHtml(classInfo.name)}</h4>
        <p class="classes-card-teacher">Teacher <strong>${this.escapeHtml(classInfo.teacher?.name || 'Unknown')}</strong></p>
        <div class="classes-card-meta">
          <span><strong>${Number(classInfo.studentCount) || 0}</strong> students</span>
          ${enrolled ? `<span class="classes-id">ID ${this.escapeHtml(classInfo.id)}</span>` : ''}
        </div>
        ${enrolled
          ? `<button type="button" class="app-primary-button" onclick="Classes.openClassDetail('${this.escapeHtml(classInfo.id)}')">Open class</button>`
          : `<button type="button" class="app-secondary-button" onclick="Classes.requestJoinClass('${this.escapeHtml(classInfo.id)}')" ${classInfo.hasPendingRequest ? 'disabled' : ''}>${classInfo.hasPendingRequest ? 'Request pending' : 'Request to join'}</button>`}
      </article>
    `;

    content.innerHTML = `
      <div class="classes-page">
        <section class="classes-hero">
          <div>
            <div class="section-eyebrow">LEARNING SPACE</div>
            <h2>Welcome, ${this.escapeHtml(user.name || 'student')}</h2>
            <p>Your classes, grades, and shared learning resources in one place.</p>
          </div>
          <span class="classes-hero-mark icon-mask icon-classes" aria-hidden="true"></span>
        </section>
        <div class="classes-summary">
          <article><span>ENROLLED</span><strong>${enrolledClasses.length}</strong><small>Classes you can open</small></article>
          <article><span>AVAILABLE</span><strong>${availableClasses.length}</strong><small>Classes at your school</small></article>
        </div>
        <section class="classes-section">
          <div class="classes-section-heading">
            <div><div class="section-eyebrow">YOUR LEARNING</div><h3>My classes</h3></div>
            <span class="classes-count">${enrolledClasses.length}</span>
          </div>
          <div class="classes-grid">
            ${enrolledClasses.length
              ? enrolledClasses.map((classInfo) => renderCard(classInfo, true)).join('')
              : '<p class="classes-empty">You are not enrolled in any classes yet.</p>'}
          </div>
        </section>
        <section class="classes-section">
          <div class="classes-section-heading">
            <div><div class="section-eyebrow">DISCOVER</div><h3>Find a class</h3></div>
            <span class="classes-count">${availableClasses.length}</span>
          </div>
          <div class="classes-grid">
            ${availableClasses.length
              ? availableClasses.map((classInfo) => renderCard(classInfo, false)).join('')
              : '<p class="classes-empty">There are no other classes available right now.</p>'}
          </div>
        </section>
      </div>
    `;
  },

  async renderTeacherView(content, currentUser, classes) {
    const studentCount = classes.reduce((total, classInfo) => total + (Number(classInfo.studentCount) || 0), 0);
    const pendingCount = classes.reduce((total, classInfo) => total + (classInfo.pendingRequests?.length || 0), 0);
    const classCards = classes.map((classInfo) => `
      <article class="classes-card">
        <div class="classes-card-heading">
          <span class="classes-card-icon icon-mask icon-classes" aria-hidden="true"></span>
          <span class="classes-subject">${this.escapeHtml(classInfo.subject || 'Class')}</span>
        </div>
        <h4>${this.escapeHtml(classInfo.name)}</h4>
        <p class="classes-card-teacher">Teacher <strong>${this.escapeHtml(classInfo.teacher?.name || currentUser.name || 'You')}</strong></p>
        <div class="classes-card-meta">
          <span><strong>${Number(classInfo.studentCount) || 0}</strong> students</span>
          <span class="classes-id">ID ${this.escapeHtml(classInfo.id)}</span>
        </div>
        <button type="button" class="app-primary-button" onclick="Classes.openClassDetail('${this.escapeHtml(classInfo.id)}')">Manage class</button>
        ${classInfo.pendingRequests?.length ? `
          <details class="classes-requests">
            <summary>${classInfo.pendingRequests.length} pending request${classInfo.pendingRequests.length === 1 ? '' : 's'}</summary>
            <div class="classes-request-list">
              ${classInfo.pendingRequests.map((request) => `
                <div class="classes-request-row">
                  <span>${this.escapeHtml(request.studentName || request.studentEmail)}</span>
                  <div>
                    <button type="button" class="app-secondary-button" onclick="Classes.acceptRequest('${this.escapeHtml(classInfo.id)}', '${this.escapeHtml(request.id)}')">Accept</button>
                    <button type="button" class="app-secondary-button" onclick="Classes.rejectRequest('${this.escapeHtml(classInfo.id)}', '${this.escapeHtml(request.id)}')">Reject</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </details>
        ` : ''}
      </article>
    `).join('');

    content.innerHTML = `
      <div class="classes-page">
        <section class="classes-hero">
          <div>
            <div class="section-eyebrow">TEACHING SPACE</div>
            <h2>Your classes, ${this.escapeHtml(currentUser.name || 'teacher')}</h2>
            <p>Manage your classes, review enrollment requests, and share resources.</p>
          </div>
          <button type="button" class="app-primary-button" onclick="Classes.createNewClass()">Create a class</button>
        </section>
        <div class="classes-summary">
          <article><span>YOUR CLASSES</span><strong>${classes.length}</strong><small>Classes you manage</small></article>
          <article><span>STUDENTS</span><strong>${studentCount}</strong><small>Across your classes</small></article>
          <article><span>REQUESTS</span><strong>${pendingCount}</strong><small>Waiting for review</small></article>
        </div>
        <section class="classes-section">
          <div class="classes-section-heading">
            <div><div class="section-eyebrow">CLASSROOMS</div><h3>My classes</h3></div>
            <span class="classes-count">${classes.length}</span>
          </div>
          <div class="classes-grid">
            ${classes.length ? classCards : '<p class="classes-empty">You are not teaching any classes yet. Create one to get started.</p>'}
          </div>
        </section>
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
      <section class="class-detail-hero">
        <div class="class-detail-heading">
          <button type="button" class="app-secondary-button class-back-button" onclick="Classes.goBackToClasses()">Back to classes</button>
          <div class="section-eyebrow">CLASS WORKSPACE</div>
          <h2>${this.escapeHtml(classInfo.name)}</h2>
          <p>${this.escapeHtml(classInfo.subject || 'Class')} <span aria-hidden="true">·</span> Taught by ${this.escapeHtml(teacher.name)}</p>
        </div>
        <div class="class-detail-meta">
          <span><small>STUDENTS</small><strong>${enrolledStudents.length}</strong></span>
          <span><small>CLASS ID</small><strong>${this.escapeHtml(classInfo.id)}</strong></span>
        </div>
      </section>
    `;

    const tabBar = `
      <div class="class-workspace-tabs" role="tablist" aria-label="Class workspace">
        <button type="button" onclick="Classes.switchClassTab('grades')" class="class-tab-btn active" data-tab="grades" role="tab" aria-selected="true">Grades</button>
        <button type="button" onclick="Classes.switchClassTab('classwork')" class="class-tab-btn" data-tab="classwork" role="tab" aria-selected="false">Files &amp; resources</button>
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
                  <td contenteditable="true" class="grade-cell" data-field="${this.escapeHtml(field)}" aria-label="${this.escapeHtml(`${student.name} ${field}`)}">${this.escapeHtml(studentGrades[field] ?? '')}</td>
                `).join('')}
              </tr>
            `;
          }).join('')
        : '';

      const gradesTabContent = `
        <section id="class-tab-grades" class="class-tab-content">
          <div class="class-detail-card">
            <div class="class-detail-section-heading">
              <div><div class="section-eyebrow">ASSESSMENT</div><h3>Student grades</h3></div>
              <span class="classes-count">${enrolledStudents.length}</span>
            </div>
            ${enrolledStudents.length > 0 ? `
              <div class="class-table-wrap">
                <table id="class-grades-table" class="class-grade-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      ${Table.gradeFields.map(field => `<th>${this.escapeHtml(field)}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
              <div class="class-detail-actions">
                <button type="button" onclick="Classes.saveClassGrades()" class="app-primary-button">Save grades</button>
              </div>
            ` : '<p class="class-detail-empty">No students are currently enrolled in this class.</p>'}
          </div>
        </section>
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
        <tr><th>${this.escapeHtml(field)}</th><td>${this.escapeHtml(studentGrades[field] ?? '')}</td></tr>
      `).join('');
      const hasGrades = Table.gradeFields.some((field) =>
        studentGrades[field] !== undefined && studentGrades[field] !== null && String(studentGrades[field]).trim() !== ''
      );
      content.innerHTML = `
        ${header}
        ${tabBar}
        <section id="class-tab-grades" class="class-tab-content">
          <div class="class-detail-card">
            <div class="class-detail-section-heading">
              <div><div class="section-eyebrow">ASSESSMENT</div><h3>Your grades</h3></div>
            </div>
            ${hasGrades ? `
              <div class="class-table-wrap">
                <table class="class-grade-table student-grades-table">
                  <thead><tr><th>Assessment</th><th>Grade</th></tr></thead>
                  <tbody>${gradeRows}</tbody>
                </table>
              </div>
            ` : '<p class="class-detail-empty">Your grades will appear here.</p>'}
          </div>
        </section>
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
      <section id="class-tab-classwork" class="class-tab-content" hidden>
        <div class="class-detail-card">
          <div class="class-detail-section-heading">
            <div><div class="section-eyebrow">SHARED MATERIALS</div><h3>Files &amp; resources</h3></div>
            ${canUpload ? `
              <div class="class-upload-controls">
                <input id="classwork-upload-input" type="file" multiple hidden>
                <button id="classwork-upload-button" type="button" class="app-primary-button">Upload files</button>
              </div>
            ` : ''}
          </div>
          <p id="classwork-upload-status" class="class-upload-status" aria-live="polite"></p>
          <div id="classwork-files-list" class="class-file-list" aria-live="polite">
            <p class="class-detail-empty">Loading files…</p>
          </div>
        </div>
      </section>
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
        container.innerHTML = '<p class="class-detail-empty">No files have been uploaded to this class yet.</p>';
        return;
      }

      const list = document.createElement('ul');
      list.className = 'class-file-list-items';
      files.forEach((file) => {
        const item = document.createElement('li');
        item.className = 'class-file-row';
        const info = document.createElement('div');
        info.className = 'class-file-info';
        const name = document.createElement('strong');
        name.textContent = file.filename;
        const metadata = document.createElement('small');
        metadata.textContent = `${this.formatFileSize(file.size)} · ${file.mimeType || 'File'}`;
        info.append(name, metadata);
        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'class-file-actions';
        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.className = 'app-secondary-button';
        previewButton.textContent = 'Preview';
        previewButton.addEventListener('click', () => this.previewClassFile(file));
        actions.appendChild(previewButton);

        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'app-secondary-button';
        downloadButton.textContent = 'Download';
        downloadButton.addEventListener('click', () => this.downloadClassFile(file.path, file.filename));
        actions.appendChild(downloadButton);
        item.appendChild(actions);
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

  async previewClassFile(file) {
    const dialog = document.getElementById('file-preview-dialog');
    const title = document.getElementById('file-preview-title');
    const content = document.getElementById('file-preview-content');
    const downloadLink = document.getElementById('file-preview-download');
    const status = document.getElementById('classwork-upload-status');
    if (!dialog || !title || !content || !downloadLink) return;

    if (dialog.dataset.objectUrl) URL.revokeObjectURL(dialog.dataset.objectUrl);
    delete dialog.dataset.objectUrl;
    title.textContent = file.filename;
    content.innerHTML = '<p class="file-preview-message">Loading preview…</p>';
    downloadLink.removeAttribute('href');
    downloadLink.removeAttribute('download');
    downloadLink.hidden = true;
    if (!dialog.dataset.cleanupAttached) {
      dialog.addEventListener('close', () => {
        if (dialog.dataset.objectUrl) URL.revokeObjectURL(dialog.dataset.objectUrl);
        delete dialog.dataset.objectUrl;
      });
      dialog.dataset.cleanupAttached = 'true';
      document.getElementById('file-preview-close')?.addEventListener('click', () => dialog.close());
    }

    const previewRequestId = (this.filePreviewRequestId || 0) + 1;
    this.filePreviewRequestId = previewRequestId;
    dialog.showModal();
    try {
      const blob = await FileTransferService.downloadFileBlob(file.path, this.selectedClassId);
      if (!dialog.open || this.filePreviewRequestId !== previewRequestId) return;

      const extension = String(file.filename || '').split('.').pop().toLowerCase();
      const typeByExtension = {
        avif: 'image/avif',
        bmp: 'image/bmp',
        csv: 'text/csv',
        gif: 'image/gif',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg',
        json: 'application/json',
        md: 'text/markdown',
        mp3: 'audio/mpeg',
        mp4: 'video/mp4',
        ogg: 'audio/ogg',
        png: 'image/png',
        pdf: 'application/pdf',
        svg: 'image/svg+xml',
        txt: 'text/plain',
        wav: 'audio/wav',
        webm: 'video/webm',
        webp: 'image/webp',
        xml: 'application/xml',
        yaml: 'text/yaml',
        yml: 'text/yaml'
      };
      const suppliedType = String(file.mimeType || blob.type || '').toLowerCase();
      const mimeType = suppliedType && suppliedType !== 'application/octet-stream'
        ? suppliedType
        : typeByExtension[extension] || suppliedType || 'application/octet-stream';
      const objectUrl = URL.createObjectURL(blob);
      dialog.dataset.objectUrl = objectUrl;
      downloadLink.href = objectUrl;
      downloadLink.download = file.filename;
      downloadLink.hidden = false;
      content.replaceChildren();

      if (mimeType.startsWith('image/')) {
        const image = document.createElement('img');
        image.className = 'file-preview-image';
        image.src = objectUrl;
        image.alt = file.filename;
        content.appendChild(image);
      } else if (mimeType === 'application/pdf' || extension === 'pdf') {
        const frame = document.createElement('iframe');
        frame.className = 'file-preview-frame';
        frame.src = objectUrl;
        frame.title = `${file.filename} preview`;
        content.appendChild(frame);
      } else if (mimeType.startsWith('video/')) {
        const video = document.createElement('video');
        video.className = 'file-preview-media';
        video.controls = true;
        video.src = objectUrl;
        content.appendChild(video);
      } else if (mimeType.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.className = 'file-preview-media';
        audio.controls = true;
        audio.src = objectUrl;
        content.appendChild(audio);
      } else if (mimeType.startsWith('text/') || mimeType === 'application/json' || ['csv', 'json', 'md', 'txt', 'xml', 'yaml', 'yml'].includes(extension)) {
        const text = await blob.slice(0, 512 * 1024).text();
        if (!dialog.open || this.filePreviewRequestId !== previewRequestId) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const pre = document.createElement('pre');
        pre.className = 'file-preview-text';
        pre.textContent = text;
        if (blob.size > 512 * 1024) pre.textContent += '\n\nPreview truncated at 512 KB.';
        content.appendChild(pre);
      } else {
        const message = document.createElement('p');
        message.className = 'file-preview-message';
        message.textContent = 'A preview is not available for this file type. Download it to open it.';
        content.appendChild(message);
      }
    } catch (error) {
      if (!dialog.open || this.filePreviewRequestId !== previewRequestId) return;
      content.textContent = error.message || 'Unable to load this file preview.';
      if (status) status.textContent = error.message || 'Unable to load this file preview.';
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

    const allTabs = content.querySelectorAll('.class-tab-content');
    allTabs.forEach((tab) => {
      tab.hidden = tab.id !== `class-tab-${tabName}`;
    });
    const selectedTab = content.querySelector(`#class-tab-${tabName}`);
    if (selectedTab) selectedTab.hidden = false;
    if (tabName === 'classwork') this.loadClassFiles(this.selectedClassId);

    const allButtons = content.querySelectorAll('.class-tab-btn');
    allButtons.forEach(btn => {
      const active = btn.dataset.tab === tabName;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
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
      await AppDialogs.alert('Class grades saved successfully.', { title: 'Grades saved' });
      await this.renderClassDetail();
    } catch (error) {
      console.error('Error saving class grades:', error);
      await AppDialogs.alert(error.message || 'Error saving class grades. Please try again.', {
        title: 'Could not save grades',
        danger: true
      });
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
      await AppDialogs.alert('Request sent! The teacher will review your request.', { title: 'Request sent' });
      await this.render();

    } catch (error) {
      console.error('Error requesting to join class:', error);
      await AppDialogs.alert(error.message || 'Error sending request. Please try again.', {
        title: 'Could not send request',
        danger: true
      });
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
      await AppDialogs.alert('Student accepted into class!', { title: 'Student added' });
      await this.render();

    } catch (error) {
      console.error('Error accepting request:', error);
      await AppDialogs.alert(error.message || 'Error accepting request. Please try again.', {
        title: 'Could not accept request',
        danger: true
      });
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
      await AppDialogs.alert('Request rejected.', { title: 'Request rejected' });
      await this.render();

    } catch (error) {
      console.error('Error rejecting request:', error);
      await AppDialogs.alert(error.message || 'Error rejecting request. Please try again.', {
        title: 'Could not reject request',
        danger: true
      });
    }
  },

  async createNewClass() {
    const currentUser = Auth.getCurrentUser();
    if (!this.ensureTeacherAccess(currentUser)) {
      return;
    }
    const className = await AppDialogs.prompt('Enter a name for your new class.', {
      title: 'Create a class',
      inputLabel: 'Class name',
      placeholder: 'For example, Biology 10'
    });
    if (!className || !className.trim()) return;

    const subject = await AppDialogs.prompt('What subject does this class teach?', {
      title: 'Set class subject',
      inputLabel: 'Subject',
      placeholder: 'For example, Biology'
    });
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
      await AppDialogs.alert('Class created successfully!', { title: 'Class created' });
      await this.render();

    } catch (error) {
      console.error('Error creating class:', error);
      await AppDialogs.alert(error.message || 'Error creating class. Please try again.', {
        title: 'Could not create class',
        danger: true
      });
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Classes;
}
