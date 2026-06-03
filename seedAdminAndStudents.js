/*
  Seeds:
  - 15 Student test accounts
  - 1 Administrator account

  Usage:
    node seedAdminAndStudents.js

  This uses POST /api/users which TRUNCATES (DELETE FROM users) then inserts
  exactly the array you send. Therefore we send BOTH students + admin
  in ONE request to avoid deleting users again.
*/

(async () => {
  const hostname = "localhost";
  const port = 3000;

  const studentPassword = "test123";
  // Passwords used by signup/register logic in authModule.
  // The server stores passwordHash, createdAt, lastSignedIn.
  // We must compute passwordHash (SHA-256 -> hex) the same way as authModule.js.
  const adminPassword = "Admin@123";

  async function hashPassword(password) {
    if (!password) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const accounts = [];
  const nowIso = new Date().toISOString();

  // Admin
  accounts.push({
    name: "Web Admin",
    email: "webadmin@lms.local",
    status: "Administrator",
    passwordHash: await hashPassword(adminPassword),
    preferences: { autoLogin: true, notifications: true },
    taughtClasses: [
      {
        id: "class_admin_math_001",
        name: "Advanced Mathematics",
        subject: "Mathematics",
        students: [],
        pendingRequests: [],
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      {
        id: "class_admin_science_001",
        name: "Physics Fundamentals",
        subject: "Physics",
        students: [],
        pendingRequests: [],
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    createdAt: nowIso,
    lastSignedIn: nowIso,
    enrolledClasses: []
  });

  // Students
  for (let i = 1; i <= 15; i++) {
    const email = `test.student.${i}@lms.local`;
    accounts.push({
      name: `Test Student ${i}`,
      email,
      status: "Student",
      passwordHash: await hashPassword(studentPassword),
      preferences: { autoLogin: true, notifications: true },
      enrolledClasses: [],
      taughtClasses: [],
      createdAt: nowIso,
      lastSignedIn: nowIso
    });
  }


  const res = await fetch(`http://${hostname}:${port}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accounts)
  });

  let text = "";
  try {
    text = await res.text();
  } catch {}

  console.log(`Seed POST /api/users -> HTTP ${res.status}`);
  if (text) console.log(text.slice(0, 500));

  console.log("\nLogin info:");
  console.log(`Admin: webadmin@lms.local / ${adminPassword}`);
  console.log(`Password for students: ${studentPassword}`);
  for (let i = 1; i <= 15; i++) {
    console.log(`- test.student.${i}@lms.local / ${studentPassword}`);
  }
})();

