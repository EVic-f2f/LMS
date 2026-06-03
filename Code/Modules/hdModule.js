/**
 * HD Module - Administrator dashboard for role management and account actions.
 */

const HD = {
  async render() {
    const container = document.getElementById('hd-content');
    if (!container) return;

    const currentUser = Auth.getCurrentUser();
    if (!Auth.isAdministrator(currentUser)) {
      container.innerHTML = '<p style="color: #d64541;">Access denied. HD is available to administrators only.</p>';
      return;
    }

    container.innerHTML = '<p style="text-align: center; color: #999;">Loading admin dashboard...</p>';

    try {
      const users = await Auth.getUsers();
      container.innerHTML = this.buildDashboard(users, currentUser);
      this.attachActions(users, currentUser);
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
    `;
  },

  attachActions(users, currentUser) {
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
      alert('Only administrators may change roles.');
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
      alert('Only administrators may delete accounts.');
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
