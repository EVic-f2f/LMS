const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const storageFolder = path.join(__dirname, '..', 'Storage');
const dbPath = path.join(storageFolder, 'lms.db');

fs.mkdirSync(storageFolder, { recursive: true });

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS students (
    studentId TEXT PRIMARY KEY,
    student_name TEXT NOT NULL,
    grades TEXT NOT NULL DEFAULT '{}'
)`);

db.exec(`CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    preferences TEXT NOT NULL DEFAULT '{}',
    passwordHash TEXT,
    createdAt TEXT,
    lastSignedIn TEXT,
    enrolledClasses TEXT NOT NULL DEFAULT '[]',
    taughtClasses TEXT NOT NULL DEFAULT '[]'
)`);

function importStudents() {
    const jsonPath = path.join(storageFolder, 'Student.json');
    if (!fs.existsSync(jsonPath)) return 0;
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.student)) return 0;
    const students = parsed.student;

    const insert = db.prepare('INSERT OR REPLACE INTO students (studentId, student_name, grades) VALUES (?, ?, ?)');
    const tx = db.transaction((rows) => {
        // Optionally clear existing
        // db.prepare('DELETE FROM students').run();
        for (const s of rows) {
            insert.run(String(s.studentId || ''), String(s.student_name || ''), JSON.stringify(s.Grades || {}));
        }
    });

    tx(students);
    return students.length;
}

function importUsers() {
    const jsonPath = path.join(storageFolder, 'Users.json');
    if (!fs.existsSync(jsonPath)) return 0;
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) return 0;
    const users = parsed.users;

    const insert = db.prepare('INSERT OR REPLACE INTO users (email, name, status, preferences, passwordHash, createdAt, lastSignedIn, enrolledClasses, taughtClasses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const tx = db.transaction((rows) => {
        // db.prepare('DELETE FROM users').run();
        for (const u of rows) {
            insert.run(
                String(u.email || ''),
                String(u.name || ''),
                String(u.status || ''),
                JSON.stringify(u.preferences || {}),
                String(u.passwordHash || ''),
                String(u.createdAt || ''),
                String(u.lastSignedIn || ''),
                JSON.stringify(u.enrolledClasses || []),
                JSON.stringify(u.taughtClasses || [])
            );
        }
    });

    tx(users);
    return users.length;
}

try {
    const s = importStudents();
    const u = importUsers();
    console.log(`Imported ${s} students and ${u} users into ${dbPath}`);
    db.close();
} catch (err) {
    console.error('Import failed:', err);
    db.close();
    process.exit(1);
}
