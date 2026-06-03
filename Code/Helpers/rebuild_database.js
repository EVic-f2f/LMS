const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const storageFolder = path.join(__dirname, '..', 'Storage');
const databaseFolder = path.join(storageFolder, 'database');
const dbPath = path.join(databaseFolder, 'lms.db');

fs.mkdirSync(databaseFolder, { recursive: true });

for (const file of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

const now = new Date().toISOString();
const adminHash = crypto.createHash('sha256').update('Admin@123').digest('hex');
const teacherHash = crypto.createHash('sha256').update('Teacher@123').digest('hex');
const studentHash = crypto.createHash('sha256').update('Student@123').digest('hex');

const users = [
  {
    name: 'Web Admin',
    email: 'webadmin@lms.local',
    status: 'Administrator',
    preferences: { autoLogin: true, notifications: true },
    passwordHash: adminHash,
    createdAt: now,
    lastSignedIn: now,
    enrolledClasses: [],
    taughtClasses: [
      {
        id: 'class_admin_math_001',
        name: 'Advanced Mathematics',
        subject: 'Mathematics',
        students: ['mare.l@test.com', 'guess.m@local.lms'],
        pendingRequests: [],
        createdAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'class_admin_science_001',
        name: 'Physics Fundamentals',
        subject: 'Physics',
        students: ['mare.l@test.com', 'guess.m@local.lms'],
        pendingRequests: [],
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ]
  },
  {
    name: 'Teacher One',
    email: 'teacher@lms.local',
    status: 'Teacher',
    preferences: { autoLogin: true, notifications: true },
    passwordHash: teacherHash,
    createdAt: now,
    lastSignedIn: now,
    enrolledClasses: [],
    taughtClasses: [
      {
        id: 'class_admin_math_001',
        name: 'Advanced Mathematics',
        subject: 'Mathematics',
        students: ['mare.l@test.com', 'guess.m@local.lms'],
        pendingRequests: [],
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ]
  },
  {
    name: 'Maren Luthor',
    email: 'mare.l@test.com',
    status: 'Student',
    preferences: { autoLogin: true, notifications: true },
    passwordHash: studentHash,
    createdAt: now,
    lastSignedIn: now,
    enrolledClasses: ['class_admin_math_001', 'class_admin_science_001'],
    taughtClasses: []
  },
  {
    name: 'Guess Me',
    email: 'guess.m@local.lms',
    status: 'Student',
    preferences: { autoLogin: true, notifications: true },
    passwordHash: studentHash,
    createdAt: now,
    lastSignedIn: now,
    enrolledClasses: ['class_admin_math_001', 'class_admin_science_001'],
    taughtClasses: []
  }
];

for (let i = 1; i <= 8; i += 1) {
  users.push({
    name: `Test Student ${i}`,
    email: `test.student.${i}@lms.local`,
    status: 'Student',
    preferences: { autoLogin: true, notifications: true },
    passwordHash: studentHash,
    createdAt: now,
    lastSignedIn: now,
    enrolledClasses: [],
    taughtClasses: []
  });
}

const students = [
  {
    studentId: '1',
    student_name: 'hh',
    Grades: { Testtt: '', Test1: '66', Test2: '77', Test3: '79', Exam: '79' }
  },
  {
    studentId: '2',
    student_name: 'ryfb',
    Grades: { Testtt: '', Test1: '68', Test2: '58', Test3: '59', Exam: '69' }
  },
  {
    studentId: '3',
    student_name: 'Tyrone Marker',
    Grades: { Testtt: '28', Test1: '79', Test2: '100', Test3: '30', Exam: '73' }
  }
];

const insertUser = db.prepare(
  'INSERT OR REPLACE INTO users (email, name, status, preferences, passwordHash, createdAt, lastSignedIn, enrolledClasses, taughtClasses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertStudent = db.prepare(
  'INSERT OR REPLACE INTO students (studentId, student_name, grades) VALUES (?, ?, ?)'
);

const userTx = db.transaction((rows) => {
  for (const user of rows) {
    insertUser.run(
      String(user.email || ''),
      String(user.name || ''),
      String(user.status || ''),
      JSON.stringify(user.preferences || {}),
      String(user.passwordHash || ''),
      String(user.createdAt || ''),
      String(user.lastSignedIn || ''),
      JSON.stringify(user.enrolledClasses || []),
      JSON.stringify(user.taughtClasses || [])
    );
  }
});

const studentTx = db.transaction((rows) => {
  for (const student of rows) {
    insertStudent.run(String(student.studentId || ''), String(student.student_name || ''), JSON.stringify(student.Grades || {}));
  }
});

userTx(users);
studentTx(students);

db.close();

const userJsonPath = path.join(storageFolder, 'Users.json');
const studentJsonPath = path.join(storageFolder, 'Student.json');
fs.writeFileSync(userJsonPath, JSON.stringify({ users }, null, 4));
fs.writeFileSync(studentJsonPath, JSON.stringify({ student: students }, null, 4));

console.log(`Rebuilt database at ${dbPath}`);
console.log(`Seeded ${users.length} users and ${students.length} student records.`);
console.log('Admin login: webadmin@lms.local / Admin@123');
console.log('Teacher login: teacher@lms.local / Teacher@123');
console.log('Student login: mare.l@test.com / Student@123');
