/**
 * HD Module - Administrator dashboard for role management and account actions.
 */

const HD = {
  async render() {
    const container = document.getElementById('hd-content');
    if (!container) return;

    const currentUser = Auth.getCurrentUser();
    if (!Auth.isSchoolAdministrator(currentUser)) {
      container.innerHTML = '<p style="color: #d64541;">Access denied. HD is available to school administrators only.</p>';
      return;
    }

    container.innerHTML = '<p style="text-align: center; color: #999;">Loading admin dashboard...</p>';

    try {
      const users = await Auth.getUsers();
      container.innerHTML = this.buildDashboard(users, currentUser);
      this.attachActions(users, currentUser);
      this.loadJoinRequests(currentUser);
    } catch (error) {
      console.error('Error loading HD dashboard:', error);
      container.innerHTML = '<p style="color: #d64541;">Failed to load admin dashboard. Please refresh.</p>';
    }
  },

  buildDashboard(users, currentUser) {
    const globalAdmin = ["Administrator", "Admin"].includes(currentUser.status);
    const students = users.filter((user) => user.status === "Student").length;
    const teachers = users.filter((user) => user.status === "Teacher").length;
    const onlineUsers = users.filter((user) => this.isOnline(user.lastSignedIn)).length;
    const rows = users.map(user => {
      const online = this.isOnline(user.lastSignedIn);
      const statusOptions = Auth.getAllowedStatuses();
      const statusSelect = statusOptions.map(status => `
        <option value="${status}" ${status === user.status ? 'selected' : ''}>${status}</option>
      `).join('');
      const email = this.escapeHtml(user.email);

      return `
        <tr data-email="${email}" data-role="${this.escapeHtml(user.status)}">
          <td><span class="hd-user-name">${this.escapeHtml(user.name || "Unnamed user")}</span></td>
          <td>${email}</td>
          <td>
            <select class="hd-role-select" data-email="${email}" ${user.email === currentUser.email || !globalAdmin ? 'disabled' : ''}>
              ${statusSelect}
            </select>
          </td>
          <td>${this.escapeHtml(this.formatLastSignedIn(user.lastSignedIn))}</td>
          <td><span class="hd-presence ${online ? 'is-online' : ''}"><i></i>${online ? 'Recently active' : 'Not recently active'}</span></td>
          <td>
            <button class="hd-delete-button" data-email="${email}" ${user.email === currentUser.email || !globalAdmin ? 'disabled' : ''}>Remove</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="hd-page">
        <section class="hd-welcome-card">
          <div>
            <div class="section-eyebrow">SCHOOL WORKSPACE</div>
            <h2>Administration</h2>
            <p>Manage the people and requests connected to your school.</p>
          </div>
          <span class="hd-access-badge">${this.escapeHtml(currentUser.status)}</span>
        </section>
        <section class="hd-overview-grid" aria-label="Account overview">
          <article class="hd-overview-card"><span class="hd-overview-label">PEOPLE IN VIEW</span><strong>${users.length}</strong><small>Accounts available to you</small></article>
          <article class="hd-overview-card"><span class="hd-overview-label">STUDENTS</span><strong>${students}</strong><small>Student accounts</small></article>
          <article class="hd-overview-card"><span class="hd-overview-label">TEACHERS</span><strong>${teachers}</strong><small>Teacher accounts</small></article>
          <article class="hd-overview-card"><span class="hd-overview-label">RECENTLY ACTIVE</span><strong>${onlineUsers}</strong><small>Signed in within 10 minutes</small></article>
        </section>
        <section class="hd-directory-card">
          <div class="hd-section-tabs" role="tablist" aria-label="Administration sections">
            <button type="button" class="hd-section-tab active" data-section="hd-users" role="tab" aria-selected="true">People <span>${users.length}</span></button>
            <button type="button" class="hd-section-tab" data-section="hd-join-requests" role="tab" aria-selected="false">Join requests <span id="hd-request-count">—</span></button>
          </div>
          <div id="hd-users" class="hd-section-panel">
            <div class="hd-directory-heading">
              <div><h3>People</h3><p>Accounts associated with your school workspace.</p></div>
              <div class="hd-directory-filters">
                <label class="hd-search"><span class="sr-only">Search users</span><input id="hd-user-search" type="search" placeholder="Search name or email"></label>
                <label><span class="sr-only">Filter by role</span><select id="hd-role-filter"><option value="">All roles</option>${[...new Set(users.map((user) => user.status).filter(Boolean))].sort().map((status) => `<option value="${this.escapeHtml(status)}">${this.escapeHtml(status)}</option>`).join('')}</select></label>
              </div>
            </div>
            <div class="hd-table-wrap">
              <table class="hd-users-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last signed in</th><th>Activity</th><th>Action</th></tr></thead>
                <tbody>${rows || '<tr><td class="hd-empty-row" colspan="6">No user accounts found.</td></tr>'}</tbody>
              </table>
            </div>
            <p class="hd-directory-note">${globalAdmin ? "You can update roles and remove accounts." : "You can view accounts in your school. Contact a global administrator to change account roles."}</p>
          </div>
          <div id="hd-join-requests" class="hd-section-panel" style="display:none;">
            <div class="hd-directory-heading"><div><h3>Join requests</h3><p>Review requests from people asking to join your school.</p></div></div>
            <p class="hd-loading-state">Loading requests…</p>
          </div>
        </section>
      </div>
    `;
  },

  attachActions(users, currentUser) {
    document.querySelectorAll('.hd-section-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.hd-section-tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.hd-section-panel').forEach((panel) => { panel.style.display = 'none'; });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.hd-section-tab').forEach((item) => {
          if (item !== tab) item.setAttribute('aria-selected', 'false');
        });
        document.getElementById(tab.dataset.section).style.display = 'block';
      });
    });

    const search = document.getElementById('hd-user-search');
    const roleFilter = document.getElementById('hd-role-filter');
    const filterUsers = () => this.filterUsers(search?.value || '', roleFilter?.value || '');
    search?.addEventListener('input', filterUsers);
    roleFilter?.addEventListener('change', filterUsers);

    const selects = document.querySelectorAll('.hd-role-select');
    selects.forEach(select => {
      select.addEventListener('change', async (event) => {
        const email = event.target.dataset.email;
        const role = event.target.value;
        await this.changeRole(email, role, currentUser);
      });
    });

    const buttons = document.querySelectorAll('.hd-delete-button');
    buttons.forEach(button => {
      button.addEventListener('click', async (event) => {
        const email = event.target.dataset.email;
        await this.deleteUser(email, currentUser);
      });
    });
  },

  async loadJoinRequests(currentUser) {
    const container = document.getElementById('hd-join-requests');
    if (!container) return;

    try {
      const token = localStorage.getItem(Auth.SESSION_KEY);
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
      const schoolsResponse = await fetch(`/api/schools/for-user?email=${encodeURIComponent(currentUser.email)}`, {
        headers: authHeaders
      });
      const schoolsResult = await schoolsResponse.json();
      if (!schoolsResponse.ok || !schoolsResult.success) {
        throw new Error(schoolsResult.error || 'Failed to load your schools');
      }

      const schoolResults = await Promise.all((schoolsResult.schools || []).map(async (school) => {
        const response = await fetch(`/api/schools/join-requests?email=${encodeURIComponent(currentUser.email)}&schoolId=${encodeURIComponent(school.id)}`, {
          headers: authHeaders
        });
        const result = await response.json();
        if (response.status === 403) return [];
        if (!response.ok || !result.success) throw new Error(result.error || `Failed to load requests for ${school.name}`);
        return (result.requests || []).map((request) => ({ ...request, schoolId: school.id, schoolName: school.name }));
      }));
      const requests = schoolResults.flat();
      const requestCount = document.getElementById('hd-request-count');
      if (requestCount) requestCount.textContent = String(requests.length);

      if (!requests.length) {
        container.innerHTML = '<div class="hd-empty-state"><span class="empty-state-icon icon-mask icon-admin" aria-hidden="true"></span><h3>You’re all caught up</h3><p>There are no pending join requests for your school.</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="hd-table-wrap">
          <table class="hd-users-table">
            <thead><tr><th>School</th><th>Name</th><th>Email</th><th>Requested</th><th>Review</th></tr></thead>
            <tbody>${requests.map((request) => `
              <tr>
                <td>${this.escapeHtml(request.schoolName)}</td>
                <td>${this.escapeHtml(request.name)}</td>
                <td>${this.escapeHtml(request.email)}</td>
                <td>${this.escapeHtml(request.requestedAt || '—')}</td>
                <td class="hd-request-actions"><button class="hd-join-accept" data-email="${this.escapeHtml(request.email)}" data-school-id="${this.escapeHtml(request.schoolId)}">Accept</button><button class="hd-join-reject" data-email="${this.escapeHtml(request.email)}" data-school-id="${this.escapeHtml(request.schoolId)}">Decline</button></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;

      container.querySelectorAll('.hd-join-accept, .hd-join-reject').forEach((button) => {
        button.addEventListener('click', async () => {
          const decision = button.classList.contains('hd-join-accept') ? 'accept' : 'reject';
          try {
            const response = await fetch('/api/schools/join-requests/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({ email: currentUser.email, schoolId: button.dataset.schoolId, requesterEmail: button.dataset.email, decision })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Failed to process request');
            await this.loadJoinRequests(currentUser);
          } catch (error) {
            container.insertAdjacentHTML('afterbegin', `<p style="color:#d64541;">${this.escapeHtml(error.message)}</p>`);
          }
        });
      });
    } catch (error) {
      container.innerHTML = `<p style="color:#d64541;">${this.escapeHtml(error.message)}</p>`;
    }
  },

  escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  },

  filterUsers(searchTerm, role) {
    const normalizedSearch = String(searchTerm).trim().toLowerCase();
    document.querySelectorAll('.hd-users-table tbody tr[data-email]').forEach((row) => {
      const matchesSearch = !normalizedSearch || row.textContent.toLowerCase().includes(normalizedSearch);
      const matchesRole = !role || row.dataset.role === role;
      row.hidden = !matchesSearch || !matchesRole;
    });
  },

  formatLastSignedIn(timestamp) {
    if (!timestamp) return 'Never';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  },

  isOnline(timestamp) {
    if (!timestamp) return false;
    try {
      const last = new Date(timestamp).getTime();
      return Date.now() - last <= 1000 * 60 * 10;
    } catch {
      return false;
    }
  },

  async changeRole(email, role, currentUser) {
    if (!["Administrator", "Admin"].includes(currentUser.status)) {
      alert('Only global administrators may change account roles.');
      return;
    }

    try {
      await this.adminRequest('/api/admin/users/update', { email, status: role });
      alert(`Role for ${email} updated to ${role}.`);
      await this.render();
    } catch (error) {
      alert(error.message);
      await this.render();
    }
  },

  async deleteUser(email, currentUser) {
    if (!["Administrator", "Admin"].includes(currentUser.status)) {
      alert('Only Web Administrators may delete accounts.');
      return;
    }

    if (email === currentUser.email) {
      alert('You cannot delete your own administrator account from here.');
      return;
    }

    if (!confirm(`Delete account ${email}? This cannot be undone.`)) {
      return;
    }

    try {
      await this.adminRequest('/api/admin/users/delete', { email });
      alert(`Account ${email} has been deleted.`);
      await this.render();
    } catch (error) {
      alert(error.message);
    }
  },

  async adminRequest(url, payload) {
    const token = localStorage.getItem(Auth.SESSION_KEY);
    if (!token) throw new Error('Sign in again to manage users.');
    const currentUser = Auth.getCurrentUser();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(currentUser.school_id ? { 'X-School-Id': currentUser.school_id } : {})
      },
      body: JSON.stringify({
        ...payload,
        schoolId: (typeof App !== 'undefined' && App.currentSchoolId) || currentUser.school_id
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'The user action failed.');
    }
    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HD;
}
