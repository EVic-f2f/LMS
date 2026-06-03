document.addEventListener("DOMContentLoaded", async () => {
  await Auth.ensureDefaultAdmin();

  const currentUser = Auth.getCurrentUser();
  const page = window.location.pathname.split("/").pop();

  if (currentUser && (page === "sign-in.html" || page === "sign-up.html")) {
    window.location.href = "index.html";
    return;
  }

  if (page === "sign-in.html") {
    const form = document.getElementById("sign-in-form");
    const message = document.getElementById("sign-in-message");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      const email = form.email.value.trim();
      const password = form.password.value;
      const remember = form.remember.checked;

      try {
        const user = await Auth.login(email, password, remember);
        Auth.saveCurrentUser(user);
        window.location.href = "index.html";
      } catch (err) {
        message.textContent = err.message;
        message.style.color = "#c0392b";
      }
    });
  }

  if (page === "sign-up.html") {
    const form = document.getElementById("sign-up-form");
    const message = document.getElementById("sign-up-message");
    const statusSelect = document.getElementById("status");
    if (!form || !statusSelect) return;

    const allowedStatuses = Auth.getAllowedStatuses();
    statusSelect.innerHTML = allowedStatuses
      .map((status) => `<option value=\"${status}\">${status}</option>`)
      .join("");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";

      const profile = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value,
        confirmPassword: form.confirmPassword.value,
        status: form.status.value,
        preferences: {
          notifications: form.notifications.checked,
          autoLogin: form.remember.checked
        }
      };

      if (profile.password !== profile.confirmPassword) {
        message.textContent = "Passwords do not match.";
        message.style.color = "#c0392b";
        return;
      }

      try {
        const user = await Auth.registerUser(profile);
        Auth.saveCurrentUser(user);
        window.location.href = "index.html";
      } catch (err) {
        message.textContent = err.message;
        message.style.color = "#c0392b";
      }
    });
  }
});
