/*
  Seeds 15 Student test accounts by calling the running LMS API.
  Usage: node seedTestAccounts.js
*/

(async () => {
  const hostname = 'localhost';
  const port = 3000;

  const password = 'test123';
  const accounts = [];

  for (let i = 1; i <= 15; i++) {
    accounts.push({
      name: `Test Student ${i}`,
      email: `test.student.${i}@lms.local`,
      status: 'Student',
      password,
      confirmPassword: password,
      preferences: { autoLogin: true, notifications: true }
    });
  }

  // IMPORTANT: server endpoint /api/users expects an ARRAY.
  // It also DELETES FROM users before inserting what you send.
  // Therefore, this script should only be used for fresh/local seeding.
  const res = await fetch(`http://${hostname}:${port}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(accounts)
  });

  let text = '';
  try {
    text = await res.text();
  } catch {}

  console.log(`Seed POST /api/users -> HTTP ${res.status}`);
  if (text) console.log(text.slice(0, 500));

  console.log('\nDone. Login info:');
  for (const a of accounts) {
    console.log(`- ${a.email} / ${password}`);
  }
})();

