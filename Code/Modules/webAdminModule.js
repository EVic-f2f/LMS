(() => {
  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem('lmsCurrentUser') || 'null');
    } catch (error) {
      console.error('Could not read the signed-in account.', error);
      return null;
    }
  };

  const admin = getCurrentUser();
  const token = localStorage.getItem('lmsSessionToken');
  const status = document.getElementById('monitor-status');
  const identity = document.getElementById('admin-identity');
  const query = document.getElementById('monitor-search');
  const schoolsBody = document.getElementById('school-results');
  const usersBody = document.getElementById('user-results');
  const schoolSettingsNav = document.getElementById('school-settings-nav');
  const schoolThemeFields = document.getElementById('school-theme-fields');
  const vicThemeFields = document.getElementById('vic-theme-fields');
  const roleOptions = ['Student', 'Teacher', 'School Administrator', 'Administrator', 'Admin', 'Guest'];
  const schoolThemeKeys = ['primary', 'secondary', 'accent', 'success', 'warning', 'background', 'text'];
  const vicThemeKeys = ['primary', 'secondary', 'accent', 'background', 'surface', 'text'];
  let selectedSchool = null;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.classList.toggle('is-success', !isError);
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...options.headers,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) {
      throw new Error(json.error || `Request failed (${response.status}).`);
    }
    return json;
  }

  function createButton(label, className = 'app-secondary-button') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    return element;
  }

  function renderTableMessage(body, colSpan, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = colSpan;
    cell.textContent = message;
    row.appendChild(cell);
    body.replaceChildren(row);
  }

  function updateSummary(schools, users) {
    document.getElementById('school-count').textContent = String(schools.length);
    document.getElementById('user-count').textContent = String(users.length);
    document.getElementById('search-count').textContent = String(schools.length + users.length);
    document.getElementById('search-summary').textContent = query.value.trim()
      ? 'Matching results'
      : 'All schools and users';
  }

  function renderSchools(schools) {
    schoolsBody.replaceChildren();
    if (!schools.length) {
      renderTableMessage(schoolsBody, 4, 'No schools match this search.');
      return;
    }

    schools.forEach((school) => {
      const row = document.createElement('tr');
      [school.name, school.id, school.creator ? `${school.creator.name || 'Unnamed'} (${school.creator.email || ''})` : 'No linked creator']
        .forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value || '';
          row.appendChild(cell);
        });
      const actionCell = document.createElement('td');
      const editButton = createButton('Open settings');
      editButton.addEventListener('click', () => openSchoolSettings(school));
      actionCell.appendChild(editButton);
      row.appendChild(actionCell);
      schoolsBody.appendChild(row);
    });
  }

  function renderUsers(users) {
    usersBody.replaceChildren();
    if (!users.length) {
      renderTableMessage(usersBody, 5, 'No users match this search.');
      return;
    }

    users.forEach((user) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      nameCell.textContent = user.name || 'Unnamed user';
      row.appendChild(nameCell);

      const emailCell = document.createElement('td');
      emailCell.textContent = user.email || '';
      row.appendChild(emailCell);

      const roleCell = document.createElement('td');
      const select = document.createElement('select');
      roleOptions.forEach((role) => select.appendChild(new Option(role, role, false, role === user.status)));
      const isCurrentAdmin = String(user.email || '').toLowerCase() === String(admin.email || '').toLowerCase();
      select.disabled = isCurrentAdmin;
      select.addEventListener('change', async () => {
        const previousRole = user.status;
        select.disabled = true;
        try {
          await request('/api/admin/users/update', {
            method: 'POST',
            body: JSON.stringify({ email: user.email, status: select.value })
          });
          user.status = select.value;
          setStatus(`Role updated for ${user.email}.`);
        } catch (error) {
          select.value = previousRole;
          setStatus(error.message, true);
        } finally {
          select.disabled = isCurrentAdmin;
        }
      });
      roleCell.appendChild(select);
      row.appendChild(roleCell);

      const schoolCell = document.createElement('td');
      schoolCell.textContent = user.school_id || 'Unassigned';
      row.appendChild(schoolCell);

      const actionCell = document.createElement('td');
      const removeButton = createButton('Remove');
      removeButton.disabled = isCurrentAdmin;
      removeButton.addEventListener('click', async () => {
        if (!window.confirm(`Remove ${user.email}? This cannot be undone.`)) return;
        removeButton.disabled = true;
        try {
          await request('/api/admin/users/delete', {
            method: 'POST',
            body: JSON.stringify({ email: user.email })
          });
          try {
            await loadDirectory();
            setStatus(`Account removed: ${user.email}.`);
          } catch (error) {
            setStatus(`Account removed, but the directory could not be refreshed: ${error.message}`, true);
          }
        } catch (error) {
          removeButton.disabled = false;
          setStatus(error.message, true);
        }
      });
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);
      usersBody.appendChild(row);
    });
  }

  async function loadDirectory() {
    const search = encodeURIComponent(query.value.trim());
    const data = await request(`/api/admin/search?q=${search}`);
    const schools = data.schools || [];
    const users = data.users || [];
    renderSchools(schools);
    renderUsers(users);
    updateSummary(schools, users);
    setStatus(`${schools.length} schools and ${users.length} user accounts found.`);
  }

  function renderColorFields(container, keys, values, dataAttribute) {
    container.replaceChildren();
    keys.forEach((key) => {
      const label = document.createElement('label');
      label.appendChild(document.createTextNode(key));
      const controls = document.createElement('span');
      controls.className = 'monitor-color-control';
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'monitor-color-picker';
      picker.setAttribute('aria-label', `Choose ${key} color`);
      picker.value = ColorUtils.toPickerColor(values[key]) || '#000000';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'monitor-color-value';
      input.autocomplete = 'off';
      input.placeholder = 'CSS color (hex, rgb, hsl, name…)';
      input.value = values[key] || '';
      input.dataset[dataAttribute] = key;
      picker.addEventListener('input', () => {
        input.value = picker.value;
      });
      input.addEventListener('input', () => {
        const pickerColor = ColorUtils.toPickerColor(input.value);
        if (pickerColor) picker.value = pickerColor;
      });
      controls.append(picker, input);
      label.appendChild(controls);
      container.appendChild(label);
    });
  }

  function switchTab(tabName) {
    if (tabName === 'school-settings' && !selectedSchool) return;
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== tabName;
    });
    document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
      const active = tab.dataset.adminTab === tabName;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    const activeTab = document.querySelector(`[data-admin-tab="${tabName}"]`);
    document.getElementById('admin-page-title').textContent =
      activeTab?.querySelector('.btn-text')?.textContent || 'Administration';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSchoolSettings(school, config) {
    document.getElementById('school-settings-title').textContent = school.name || 'School settings';
    document.getElementById('school-name').value = config.schoolName || school.name || '';
    document.getElementById('school-location').value = config.location || '';
    document.getElementById('school-api-endpoint').value = config.apiEndpoint || '';
    document.getElementById('school-grade-fields').value =
      Array.isArray(config.gradeFields) ? config.gradeFields.join('\n') : '';
    renderColorFields(schoolThemeFields, schoolThemeKeys, config.theme || {}, 'schoolThemeKey');
  }

  async function openSchoolSettings(school) {
    setStatus(`Loading settings for ${school.name}…`);
    try {
      const data = await request(`/api/admin/schools/config?schoolId=${encodeURIComponent(school.id)}`);
      selectedSchool = { ...school, ...data.school, config_json: data.config_json || {} };
      schoolSettingsNav.hidden = false;
      renderSchoolSettings(selectedSchool, selectedSchool.config_json);
      switchTab('school-settings');
      setStatus(`Editing ${selectedSchool.name}.`);
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  async function saveSchoolSettings() {
    if (!selectedSchool) return;
    const saveButton = document.getElementById('save-school-settings');
    const schoolName = document.getElementById('school-name').value.trim();
    if (!schoolName) {
      setStatus('School name is required.', true);
      return;
    }
    const theme = {};
    schoolThemeFields.querySelectorAll('[data-school-theme-key]').forEach((input) => {
      const value = input.value.trim();
      if (value) theme[input.dataset.schoolThemeKey] = value;
    });
    const config = {
      ...selectedSchool.config_json,
      schoolName,
      location: document.getElementById('school-location').value.trim(),
      apiEndpoint: document.getElementById('school-api-endpoint').value.trim(),
      gradeFields: document.getElementById('school-grade-fields').value
        .split(/\r?\n/)
        .map((field) => field.trim())
        .filter(Boolean),
      theme
    };

    saveButton.disabled = true;
    try {
      await request('/api/admin/schools/update', {
        method: 'POST',
        body: JSON.stringify({ schoolId: selectedSchool.id, config_json: config })
      });
      selectedSchool = { ...selectedSchool, name: schoolName, config_json: config };
      document.getElementById('school-settings-title').textContent = schoolName;
      try {
        await loadDirectory();
        setStatus(`Settings saved for ${schoolName}.`);
      } catch (error) {
        setStatus(`Settings saved, but the directory could not be refreshed: ${error.message}`, true);
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteSchool() {
    if (!selectedSchool) return;
    const confirmedName = window.prompt(`Permanently delete "${selectedSchool.name}"?\nType the school name to confirm.`);
    if (confirmedName === null) return;
    if (confirmedName.trim() !== selectedSchool.name.trim()) {
      setStatus('School name did not match; nothing was deleted.', true);
      return;
    }

    const deleteButton = document.getElementById('delete-school');
    deleteButton.disabled = true;
    try {
      await request('/api/admin/schools/delete', {
        method: 'POST',
        body: JSON.stringify({ schoolId: selectedSchool.id, confirmName: confirmedName.trim() })
      });
      const deletedName = selectedSchool.name;
      selectedSchool = null;
      schoolSettingsNav.hidden = true;
      switchTab('schools');
      try {
        await loadDirectory();
        setStatus(`School deleted: ${deletedName}.`);
      } catch (error) {
        setStatus(`School deleted, but the directory could not be refreshed: ${error.message}`, true);
      }
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      deleteButton.disabled = false;
    }
  }

  async function loadVicTheme() {
    const response = await fetch('/api/vic-theme');
    const theme = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(theme.error || 'Could not load the VIC theme.');
    renderColorFields(vicThemeFields, vicThemeKeys, theme, 'vicThemeKey');
  }

  async function saveVicTheme() {
    const saveButton = document.getElementById('save-vic-theme');
    const theme = {};
    vicThemeFields.querySelectorAll('[data-vic-theme-key]').forEach((input) => {
      const value = input.value.trim();
      if (value) theme[input.dataset.vicThemeKey] = value;
    });
    saveButton.disabled = true;
    try {
      await request('/api/admin/vic-theme', {
        method: 'POST',
        body: JSON.stringify({ theme })
      });
      if (typeof VicTheme !== 'undefined') {
        VicTheme.apply(theme);
        vicThemeKeys.forEach((key) => {
          if (!theme[key]) document.documentElement.style.removeProperty(`--vic-${key}`);
        });
      }
      setStatus('VIC Home theme saved.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  }

  function initializeNavigation() {
    document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        switchTab(tab.dataset.adminTab);
      });
    });
    document.querySelectorAll('[data-go-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.goTab));
    });
    const sidebar = document.querySelector('.sidebar');
    sidebar.addEventListener('mouseenter', () => document.body.classList.add('sidebar-expanded'));
    sidebar.addEventListener('mouseleave', () => document.body.classList.remove('sidebar-expanded'));
  }

  initializeNavigation();
  document.getElementById('monitor-search-button').addEventListener('click', () => {
    loadDirectory().catch((error) => setStatus(error.message, true));
  });
  query.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadDirectory().catch((error) => setStatus(error.message, true));
  });
  document.getElementById('save-school-settings').addEventListener('click', saveSchoolSettings);
  document.getElementById('delete-school').addEventListener('click', deleteSchool);
  document.getElementById('save-vic-theme').addEventListener('click', saveVicTheme);

  if (!admin?.email || !['Administrator', 'Admin'].includes(admin.status) || !token) {
    setStatus('Sign in with a global administrator account to open Web Administrator.', true);
    identity.textContent = 'Access restricted';
    renderTableMessage(schoolsBody, 4, 'Global administrator access is required.');
    renderTableMessage(usersBody, 5, 'Global administrator access is required.');
    return;
  }

  identity.textContent = admin.name || admin.email;
  loadDirectory().catch((error) => setStatus(error.message, true));
  loadVicTheme().catch((error) => setStatus(error.message, true));
})();
