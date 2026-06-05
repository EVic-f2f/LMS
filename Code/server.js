const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3").verbose();
const { exec } = require("child_process");
const os = require("os");

const PORT = process.env.PORT || 3000;
const rootDir = path.join(__dirname, "..", "");
const storageFolder = path.join(rootDir, "Storage");
const databaseFolder = path.join(storageFolder, "database");
const filesFolder = path.join(storageFolder, "files");
const storageFileName = "Student";
const usersFileName = "Users";
const dbPath = path.join(databaseFolder, "lms.db");

fs.mkdirSync(storageFolder, { recursive: true });
fs.mkdirSync(databaseFolder, { recursive: true });
fs.mkdirSync(filesFolder, { recursive: true });

const defaultStudents = [
    {
        studentId: "1",
        student_name: "Alice Johnson",
        Grades: { Test: "85", Test1: "90", Test2: "88", Test3: "92", Exam: "89" }
    },
    {
        studentId: "2",
        student_name: "Brian Smith",
        Grades: { Test: "78", Test1: "82", Test2: "80", Test3: "85", Exam: "83" }
    }
];

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});


function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}


async function getSingleValue(sql, params = []) {
    const rows = await allAsync(sql, params);
    return rows[0] && typeof rows[0].count !== "undefined" ? rows[0].count : 0;
}

async function initializeDatabase() {
    fs.mkdirSync(storageFolder, { recursive: true });
    fs.mkdirSync(databaseFolder, { recursive: true });


  await runAsync("PRAGMA journal_mode = WAL");
  await runAsync("PRAGMA foreign_keys = ON");

    await runAsync(
        `CREATE TABLE IF NOT EXISTS students (
            studentId TEXT PRIMARY KEY,
            student_name TEXT NOT NULL,
            grades TEXT NOT NULL DEFAULT '{}'
        )`
    );

    await runAsync(
        `CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            name TEXT,
            status TEXT,
            preferences TEXT NOT NULL DEFAULT '{}',
            passwordHash TEXT,
            createdAt TEXT,
            lastSignedIn TEXT,
            enrolledClasses TEXT NOT NULL DEFAULT '[]',
            taughtClasses TEXT NOT NULL DEFAULT '[]'
        )`
    );

    const studentCount = await getSingleValue("SELECT COUNT(*) AS count FROM students");
    const userCount = await getSingleValue("SELECT COUNT(*) AS count FROM users");

    if (studentCount === 0) {
        let initialStudents = defaultStudents;
        const jsonPath = path.join(storageFolder, `${storageFileName}.json`);
        if (fs.existsSync(jsonPath)) {
            try {
                const imported = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
                if (Array.isArray(imported.student) && imported.student.length) {
                    initialStudents = imported.student;
                }
            } catch (error) {
                console.warn("Could not import Student.json into SQLite:", error.message);
            }
        }
        await saveStudentData(initialStudents);
    }

    if (userCount === 0) {
        const jsonPath = path.join(storageFolder, `${usersFileName}.json`);
        if (fs.existsSync(jsonPath)) {
            try {
                const imported = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
                if (Array.isArray(imported.users) && imported.users.length) {
                    await saveUserData(imported.users);
                }
            } catch (error) {
                console.warn("Could not import Users.json into SQLite:", error.message);
            }
        }

        const postImportCount = await getSingleValue("SELECT COUNT(*) AS count FROM users");
        if (postImportCount === 0) {
            const adminPasswordHash = crypto.createHash("sha256").update("Admin@123").digest("hex");
            const defaultAdmin = [
                {
                    name: "Web Admin",
                    email: "webadmin@lms.local",
                    status: "Administrator",
                    preferences: { autoLogin: true, notifications: true },
                    passwordHash: adminPasswordHash,
                    createdAt: new Date().toISOString(),
                    lastSignedIn: new Date().toISOString(),
                    enrolledClasses: [],
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
                    ]
                }
            ];
            await saveUserData(defaultAdmin);
        }
    }
}

async function getStudentData() {
    const rows = await allAsync("SELECT * FROM students");
    return rows.map((row) => ({
        studentId: row.studentId,
        student_name: row.student_name,
        Grades: JSON.parse(row.grades || "{}")
    }));
}

async function saveStudentData(updatedStudents) {
    try {
        await runAsync("BEGIN TRANSACTION");
        await runAsync("DELETE FROM students");

        for (const student of updatedStudents) {
            await runAsync(
                "INSERT OR REPLACE INTO students (studentId, student_name, grades) VALUES (?, ?, ?)",
                [
                    String(student.studentId || ""),
                    String(student.student_name || ""),
                    JSON.stringify(student.Grades || {})
                ]
            );
        }

        await runAsync("COMMIT");
        return updatedStudents;
    } catch (error) {
        await runAsync("ROLLBACK");
        throw error;
    }
}

async function getUserData() {
    const rows = await allAsync("SELECT * FROM users");
    return rows.map((row) => ({
        email: row.email,
        name: row.name,
        status: row.status,
        preferences: JSON.parse(row.preferences || "{}"),
        passwordHash: row.passwordHash,
        createdAt: row.createdAt,
        lastSignedIn: row.lastSignedIn,
        enrolledClasses: JSON.parse(row.enrolledClasses || "[]"),
        taughtClasses: JSON.parse(row.taughtClasses || "[]")
    }));
}

async function saveUserData(updatedUsers) {
    try {
        await runAsync("BEGIN TRANSACTION");
        await runAsync("DELETE FROM users");

        for (const user of updatedUsers) {
            // Ensure passwordHash is never empty; use Admin@123 hash as fallback
            let passwordHash = String(user.passwordHash || "").trim();
            if (!passwordHash && (user.status === "Administrator" || user.status === "Teacher" || user.status === "Admin")) {
                passwordHash = crypto.createHash("sha256").update("Admin@123").digest("hex");
            }
            
            await runAsync(
                "INSERT OR REPLACE INTO users (email, name, status, preferences, passwordHash, createdAt, lastSignedIn, enrolledClasses, taughtClasses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    String(user.email || ""),
                    String(user.name || ""),
                    String(user.status || ""),
                    JSON.stringify(user.preferences || {}),
                    passwordHash,
                    String(user.createdAt || ""),
                    String(user.lastSignedIn || ""),
                    JSON.stringify(user.enrolledClasses || []),
                    JSON.stringify(user.taughtClasses || [])
                ]
            );
        }

        await runAsync("COMMIT");
        return updatedUsers;
    } catch (error) {
        await runAsync("ROLLBACK");
        throw error;
    }
}

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, data) {
    const body = JSON.stringify(data, null, 4);
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function sanitizeUserForClient(user) {
    if (!user || typeof user !== 'object') return null;
    const sanitized = {
        email: String(user.email || "").toLowerCase(),
        name: String(user.name || ""),
        status: String(user.status || "Student"),
        preferences: typeof user.preferences === 'object' ? user.preferences : {},
        createdAt: String(user.createdAt || ""),
        lastSignedIn: String(user.lastSignedIn || ""),
        enrolledClasses: Array.isArray(user.enrolledClasses) ? user.enrolledClasses : [],
        taughtClasses: Array.isArray(user.taughtClasses) ? user.taughtClasses : []
    };
    return sanitized;
}

function sendStaticFile(res, filePath) {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
            ".json": "application/json",
            ".mp4": "video/mp4",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif"
        }[ext] || "application/octet-stream";

        res.writeHead(200, { "Content-Type": contentType });
        res.end(content);
    });
}

function sanitizeFileName(filename) {
    if (typeof filename !== "string") {
        throw new Error("Filename must be a string");
    }
    const safeName = path.basename(filename);
    if (!safeName || safeName !== filename || safeName.includes("..") || safeName.includes("/") || safeName.includes("\\")) {
        throw new Error("Invalid filename");
    }
    return safeName;
}

function getFilePath(filename) {
    const cleanName = sanitizeFileName(filename);
    return path.join(filesFolder, cleanName);
}

function listStoredFiles() {
    return fs.readdirSync(filesFolder).filter((item) => {
        const itemPath = path.join(filesFolder, item);
        return fs.existsSync(itemPath) && fs.statSync(itemPath).isFile();
    });
}

function saveFileFromBase64(filename, base64Data) {
    const filePath = getFilePath(filename);
    const buffer = Buffer.from(base64Data || "", "base64");
    fs.writeFileSync(filePath, buffer);
    return { filename, size: buffer.length };
}

function readFileAsBase64(filename) {
    const filePath = getFilePath(filename);
    if (!fs.existsSync(filePath)) {
        throw new Error("File not found");
    }
    const fileBuffer = fs.readFileSync(filePath);
    return fileBuffer.toString("base64");
}

function deleteStoredFile(filename) {
    const filePath = getFilePath(filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/favicon.ico") {
        res.writeHead(204, { "Content-Type": "image/x-icon" });
        res.end();
        return;
    }

    if (url.pathname === "/api/students") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "GET") {
            getStudentData()
                .then((data) => sendJson(res, 200, data))
                .catch((err) => sendJson(res, 500, { success: false, error: err.message }));
            return;
        }

        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                try {
                    const updatedStudents = JSON.parse(body);
                    if (!Array.isArray(updatedStudents)) {
                        throw new Error("Expected an array of students");
                    }
                    saveStudentData(updatedStudents)
                        .then(() => sendJson(res, 200, { success: true }))
                        .catch((err) => sendJson(res, 500, { success: false, error: err.message }));
                } catch (err) {
                    sendJson(res, 400, { success: false, error: err.message });
                }
            });
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/auth/login") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", async () => {
                try {
                    const { email, password } = JSON.parse(body);
                    if (!email || !password) {
                        sendJson(res, 400, { success: false, error: "Email and password are required." });
                        return;
                    }

                    const normalizedEmail = String(email).trim().toLowerCase();
                    const users = await getUserData();
                    const user = users.find((item) => String(item.email).toLowerCase() === normalizedEmail);
                    if (!user) {
                        sendJson(res, 401, { success: false, error: "Invalid email or password." });
                        return;
                    }

                    const passwordHash = hashPassword(password);
                    if (passwordHash !== user.passwordHash) {
                        sendJson(res, 401, { success: false, error: "Invalid email or password." });
                        return;
                    }

                    const now = new Date().toISOString();
                    user.lastSignedIn = now;
                    await saveUserData(users);
                    sendJson(res, 200, { success: true, user: sanitizeUserForClient(user) });
                } catch (err) {
                    sendJson(res, 400, { success: false, error: err.message });
                }
            });
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/users") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "GET") {
            getUserData()
                .then((data) => sendJson(res, 200, data.map(sanitizeUserForClient)))
                .catch((err) => sendJson(res, 500, { success: false, error: err.message }));
            return;
        }

        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                try {
                    const updatedUsers = JSON.parse(body);
                    if (!Array.isArray(updatedUsers)) {
                        throw new Error("Expected an array of users");
                    }
                    saveUserData(updatedUsers)
                        .then(() => sendJson(res, 200, { success: true }))
                        .catch((err) => sendJson(res, 500, { success: false, error: err.message }));
                } catch (err) {
                    sendJson(res, 400, { success: false, error: err.message });
                }
            });
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/config") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                try {
                    const updatedConfig = JSON.parse(body);
                    const configPath = path.join(__dirname, "config.json");
                    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
                    sendJson(res, 200, { success: true, message: "Config saved" });
                } catch (err) {
                    sendJson(res, 400, { success: false, error: err.message });
                }
            });
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/files") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "GET") {
            const filename = url.searchParams.get("filename");
            const download = url.searchParams.get("download");
            if (filename && download === "true") {
                try {
                    const fileData = readFileAsBase64(filename);
                    sendJson(res, 200, { success: true, filename, fileData });
                } catch (err) {
                    sendJson(res, 404, { success: false, error: err.message });
                }
                return;
            }

            const files = listStoredFiles();
            sendJson(res, 200, { success: true, files });
            return;
        }

        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
                body += chunk.toString();
            });
            req.on("end", () => {
                try {
                    const payload = JSON.parse(body);
                    const { filename, fileData } = payload;
                    if (!filename || !fileData) {
                        throw new Error("Missing filename or fileData");
                    }
                    const result = saveFileFromBase64(filename, fileData);
                    sendJson(res, 200, { success: true, ...result });
                } catch (err) {
                    sendJson(res, 400, { success: false, error: err.message });
                }
            });
            return;
        }

        if (req.method === "DELETE") {
            const filename = url.searchParams.get("filename");
            if (!filename) {
                sendJson(res, 400, { success: false, error: "Missing filename" });
                return;
            }
            try {
                deleteStoredFile(filename);
                sendJson(res, 200, { success: true, filename });
            } catch (err) {
                sendJson(res, 500, { success: false, error: err.message });
            }
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    let filePath = path.join(rootDir, pathname === "/" ? "index.html" : pathname);
    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(rootDir, "web", pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
        if (fallbackPath.startsWith(rootDir) && fs.existsSync(fallbackPath)) {
            filePath = fallbackPath;
        }
    }

    if (fs.existsSync(filePath)) {
        sendStaticFile(res, filePath);
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    }

}

(async function startServer() {
    try {
        await initializeDatabase();
        const server = http.createServer(handleRequest);
        server.listen(PORT,"0.0.0.0", () => {
            console.log(`LMS server running at http://localhost:${PORT}`);
            console.log(`Use Ctrl+C to stop.`);
            
            // Auto-open browser
            const url = `http://localhost:${PORT}`;
            const platform = os.platform();
            
            setTimeout(() => {
                if (platform === "darwin") {
                    //exec(`open ${url}`, (err) => {
                        if (err) console.log("Browser could not auto-open. Navigate to " + url);
                    });
                } else if (platform === "win32") {
                    //exec(`start ${url}`, (err) => {
                        if (err) console.log("Browser could not auto-open. Navigate to " + url);
                    });
                } else {
                    //exec(`xdg-open ${url}`, (err) => {
                        if (err) console.log("Browser could not auto-open. Navigate to " + url);
                    });
                }
            }, 500);
        });
    } catch (error) {
        console.error("Failed to initialize LMS server:", error);
        process.exit(1);
    }
})();
