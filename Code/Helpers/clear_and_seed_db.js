const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..', '..');
const storageFolder = path.join(rootDir, 'Storage');
const databaseFolder = path.join(storageFolder, 'database');
const dbPath = path.join(databaseFolder, 'lms.db');

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

try {
  if (!fs.existsSync(databaseFolder)) fs.mkdirSync(databaseFolder, { recursive: true });

  if (fs.existsSync(dbPath)) {
    console.log('Removing existing DB:', dbPath);
    fs.unlinkSync(dbPath);
  }

  console.log('Creating new DB at', dbPath);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      studentId TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      grades TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      preferences TEXT NOT NULL DEFAULT '{}',
      passwordHash TEXT,
      createdAt TEXT,
      lastSignedIn TEXT,
      enrolledClasses TEXT NOT NULL DEFAULT '[]',
      taughtClasses TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // Seed single webadmin
  const email = 'webadmin@lms.local';
  const name = 'Web Admin';
  const status = 'Administrator';
  const preferences = JSON.stringify({ autoLogin: true, notifications: true });
  const password = 'Admin@123';
  const passwordHash = sha256(password);
  const createdAt = new Date().toISOString();
  const lastSignedIn = new Date().toISOString();
  const enrolledClasses = JSON.stringify([]);
  const taughtClasses = JSON.stringify([
    {
      id: 'class_admin_math_001',
      name: 'Advanced Mathematics',
      subject: 'Mathematics',
      students: [],
      pendingRequests: [],
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'class_admin_science_001',
      name: 'Physics Fundamentals',
      subject: 'Physics',
      students: [],
      pendingRequests: [],
      createdAt: '2024-01-01T00:00:00.000Z'
    }
  ]);

  const insert = db.prepare(`INSERT OR REPLACE INTO users (email, name, status, preferences, passwordHash, createdAt, lastSignedIn, enrolledClasses, taughtClasses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insert.run(email, name, status, preferences, passwordHash, createdAt, lastSignedIn, enrolledClasses, taughtClasses);

  console.log('Seeded user:', email, '(password: Admin@123)');
  db.close();
  process.exit(0);
} catch (err) {
  console.error('Failed to clear and seed DB:', err);
  process.exit(1);
}
