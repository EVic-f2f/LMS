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
    const rows = users.map(user => {
      const online = this.isOnline(user.lastSignedIn);
      const statusOptions = Auth.getAllowedStatuses();
      const statusSelect = statusOptions.map(status => `
        <option value="${status}" ${status === user.status ? 'selected' : ''}>${status}</option>
      `).join('');

      return `
        <tr data-email="${user.email}">
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td>
            <select class="hd-role-select" data-email="${user.email}" ${user.email === currentUser.email ? 'disabled' : ''}>
              ${statusSelect}
            </select>
          </td>
          <td>${this.formatLastSignedIn(user.lastSignedIn)}</td>
          <td>${online ? '<span style="color:#27ae60;font-weight:700;">Online</span>' : '<span style="color:#7f8c8d;">Offline</span>'}</td>
          <td>
            <button class="hd-delete-button" data-email="${user.email}" ${user.email === currentUser.email ? 'disabled' : ''} style="padding: 8px 12px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer;">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:20px;">
        <div>
          <h3 style="margin:0;">HD Admin Control</h3>
          <p style="margin:8px 0 0;color:#666;">Change user roles, delete accounts, and see who is online.</p>
        </div>
      </div>
      <div class="hd-section-tabs" style="display:flex; gap:8px; margin-bottom:14px;">
        <button type="button" class="hd-section-tab active" data-section="hd-users">Users</button>
        <button type="button" class="hd-section-tab" data-section="hd-join-requests">Join Requests</button>
      </div>
      <div id="hd-users" class="hd-section-panel">
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; border:1px solid #dfe3e8;">
          <thead>
            <tr style="background:#f2f6fb; text-align:left;">
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Name</th>
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Email</th>
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Role</th>
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Last Signed In</th>
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Status</th>
              <th style="padding:12px; border-bottom:1px solid #dfe3e8;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      </div>
      <div id="hd-join-requests" class="hd-section-panel" style="display:none;">
        <p style="color:#666;">Loading join requests...</p>
      </div>
    `;
  },

  attachActions(users, currentUser) {
    document.querySelectorAll('.hd-section-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.hd-section-tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.hd-section-panel').forEach((panel) => { panel.style.display = 'none'; });
        tab.classList.add('active');
        document.getElementById(tab.dataset.section).style.display = 'block';
      });
    });

    const selects = document.querySelectorAll('.hd-role-select');
    selects.forEach(select => {
      select.addEventListener('change', async (event) => {
        const email = event.target.dataset.email;
        const role = event.target.value;
        await this.changeRole(email, role, users, currentUser);
      });
    });

    const buttons = document.querySelectorAll('.hd-delete-button');
    buttons.forEach(button => {
      button.addEventListener('click', async (event) => {
        const email = event.target.dataset.email;
        await this.deleteUser(email, users, currentUser);
      });
    });
  },

  async loadJoinRequests(currentUser) {
    const container = document.getElementById('hd-join-requests');
    if (!container) return;

    try {
      const schoolsResponse = await fetch(`/api/schools/for-user?email=${encodeURIComponent(currentUser.email)}`);
      const schoolsResult = await schoolsResponse.json();
      if (!schoolsResponse.ok || !schoolsResult.success) {
        throw new Error(schoolsResult.error || 'Failed to load your schools');
      }

      const schoolResults = await Promise.all((schoolsResult.schools || []).map(async (school) => {
        const response = await fetch(`/api/schools/join-requests?email=${encodeURIComponent(currentUser.email)}&schoolId=${encodeURIComponent(school.id)}`);
        const result = await response.json();
        if (response.status === 403) return [];
        if (!response.ok || !result.success) throw new Error(result.error || `Failed to load requests for ${school.name}`);
        return (result.requests || []).map((request) => ({ ...request, schoolId: school.id, schoolName: school.name }));
      }));
      const requests = schoolResults.flat();

      if (!requests.length) {
        container.innerHTML = '<p style="color:#666;">No pending join requests.</p>';
        return;
      }

      container.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th style="text-align:left; padding:10px;">School</th><th style="text-align:left; padding:10px;">Name</th><th style="text-align:left; padding:10px;">Email</th><th style="text-align:left; padding:10px;">Requested</th><th style="text-align:left; padding:10px;">Actions</th></tr></thead>
            <tbody>${requests.map((request) => `
              <tr>
                <td style="padding:10px; border-top:1px solid #e2e8ed;">${this.escapeHtml(request.schoolName)}</td>
                <td style="padding:10px; border-top:1px solid #e2e8ed;">${this.escapeHtml(request.name)}</td>
                <td style="padding:10px; border-top:1px solid #e2e8ed;">${this.escapeHtml(request.email)}</td>
                <td style="padding:10px; border-top:1px solid #e2e8ed;">${this.escapeHtml(request.requestedAt || '')}</td>
                <td style="padding:10px; border-top:1px solid #e2e8ed;"><button class="hd-join-accept" data-email="${this.escapeHtml(request.email)}" data-school-id="${this.escapeHtml(request.schoolId)}">Accept</button> <button class="hd-join-reject" data-email="${this.escapeHtml(request.email)}" data-school-id="${this.escapeHtml(request.schoolId)}">Reject</button></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;

      container.querySelectorAll('.hd-join-accept, .hd-join-reject').forEach((button) => {
        button.addEventListener('click', async () => {
          const decision = button.classList.contains('hd-join-accept') ? 'accept' : 'reject';
          try {
            const response = await fetch('/api/schools/join-requests/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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

  async changeRole(email, role, users, currentUser) {
    if (!Auth.isAdministrator(currentUser)) {
      alert('Only Web Administrators may change roles.');
      return;
    }

    const updatedUsers = users.map((user) => {
      if (user.email === email) {
        return { ...user, status: role };
      }
      return user;
    });

    await Auth.saveUsers(updatedUsers);
    alert(`Role for ${email} updated to ${role}.`);
    await this.render();
  },

  async deleteUser(email, users, currentUser) {
    if (!Auth.isAdministrator(currentUser)) {
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

    const remainingUsers = users.filter((user) => user.email !== email);
    await Auth.saveUsers(remainingUsers);
    alert(`Account ${email} has been deleted.`);
    await this.render();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HD;
}
