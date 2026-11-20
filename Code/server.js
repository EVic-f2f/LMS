const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { isDeepStrictEqual } = require("util");
const { legacyIdToUuid } = require("./Helpers/normalized_data_utils");


const { createClient } = require("@supabase/supabase-js");


const PORT = process.env.PORT || 3000;

const rootDir = path.join(__dirname, "..", "");

const storageFolder = path.join(rootDir, "Storage");
const filesFolder = path.join(storageFolder, "files");
const vicThemePath = path.join(__dirname, "vic-theme.json");

fs.mkdirSync(storageFolder, { recursive: true });
fs.mkdirSync(filesFolder, { recursive: true });




const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "classwork-files";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;


function getSupabaseClientOrNull() {
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !key) return null;
    return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false }
  });
}


const supabase = getSupabaseClientOrNull();
const realtimeClients = new Set();

function requireSupabase() {
  if (!supabase) {
        throw new Error("Supabase env vars missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).");
  }
  return supabase;
}

function getVicTheme() {
    if (!fs.existsSync(vicThemePath)) return {};
    return JSON.parse(fs.readFileSync(vicThemePath, "utf8"));
}

async function requireAdministrator(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Missing administrator email");

    const { data, error } = await supabase
        .from("users")
        .select("email, status")
        .ilike("email", normalizedEmail)
        .maybeSingle();

    if (error) throw error;
    if (!data || !["Administrator", "Admin"].includes(String(data.status))) {
        const error = new Error("Administrator access required");
        error.statusCode = 403;
        throw error;
    }
    return data;
}






async function initializeDatabase() {
    // Only ensure local folders exist. Users are stored in Supabase now.
    fs.mkdirSync(storageFolder, { recursive: true });
    fs.mkdirSync(filesFolder, { recursive: true });
}

async function getPagedRows(queryFactory, orderColumns = []) {
    const pageSize = 500;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        let query = queryFactory();
        for (const column of orderColumns) {
            query = query.order(column, { ascending: true });
        }
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

async function getAllRows(table, columns, orderColumns) {
    return getPagedRows(() => supabase.from(table).select(columns), orderColumns);
}

async function getUserData() {
    // Service role bypasses RLS; requires SUPABASE_SERVICE_ROLE_KEY.
    requireSupabase();
    const rows = await getAllRows(
        "users",
        "id, email, name, status, preferences, passwordHash, school_id, createdAt, lastSignedIn",
        ["id"]
    );
    return rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        status: row.status,
        preferences: row.preferences || {},
        passwordHash: row.passwordHash,
        school_id: row.school_id || null,
        createdAt: row.createdAt,
        lastSignedIn: row.lastSignedIn
    }));
}


async function saveUserData(updatedUsers) {
    const existingRows = await getAllRows(
        "users",
        "email, name, status, preferences, passwordHash, school_id, createdAt, lastSignedIn",
        ["email"]
    );
    const existingByEmail = new Map(existingRows.map((row) => [String(row.email).toLowerCase(), row]));

    for (const user of updatedUsers) {
        const passwordHash = String(user.passwordHash || "").trim();
        const record = {
            email: String(user.email || ""),
            name: String(user.name || ""),
            status: String(user.status || ""),
            preferences: user.preferences || {},
            school_id: user.school_id || null,
            createdAt: String(user.createdAt || ""),
            lastSignedIn: String(user.lastSignedIn || "")
        };
        if (passwordHash) record.passwordHash = passwordHash;

        const existing = existingByEmail.get(record.email.toLowerCase());
        if (!existing) {
            const { error } = await supabase.from("users").insert({
                ...record,
                // Keep legacy columns empty for schema compatibility; class data lives in normalized tables.
                enrolledClasses: [],
                taughtClasses: []
            });
            if (error) throw error;
            continue;
        }

        const changed = Object.entries(record).some(([key, value]) => !isDeepStrictEqual(existing[key], value));
        if (!changed) continue;

        const { error } = await supabase.from("users").update(record).eq("email", existing.email);
        if (error) throw error;
    }

    return updatedUsers;
}

function httpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function getAuthenticatedUser(req) {
    const email = getSessionEmail(req);
    const { data: user, error } = await requireSupabase()
        .from("users")
        .select("id, email, name, status, school_id")
        .ilike("email", email)
        .maybeSingle();
    if (error) throw error;
    if (!user) throw httpError("User account not found.", 401);
    return user;
}

async function getAuthorizedSchoolId(req, user, requestedSchoolId) {
    let schoolId = String(requestedSchoolId || req.headers["x-school-id"] || user.school_id || "").trim();
    if (!schoolId) {
        const { data: membership, error } = await requireSupabase()
            .from("school_memberships")
            .select("school_id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("school_id", { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) throw error;
        schoolId = String(membership?.school_id || "");
    }
    if (!schoolId) throw httpError("Join a school before using classes.", 403);

    if (String(user.school_id || "") !== schoolId) {
        const { data: membership, error } = await requireSupabase()
            .from("school_memberships")
            .select("school_id")
            .eq("user_id", user.id)
            .eq("school_id", schoolId)
            .eq("status", "active")
            .maybeSingle();
        if (error) throw error;
        if (!membership) throw httpError("You do not have access to this school.", 403);
    }
    return schoolId;
}

async function readJsonBody(req) {
    const buffer = await readRequestBuffer(req, 2 * 1024 * 1024);
    try {
        return JSON.parse(buffer.toString("utf8") || "{}");
    } catch {
        throw httpError("Invalid JSON request body.", 400);
    }
}

async function listClassesForUser(user, schoolId) {
    const isStudent = String(user.status) === "Student";
    const isAdministrator = ["Admin", "Administrator", "School Administrator"].includes(String(user.status));
    const classRows = await getPagedRows(() => {
        let query = requireSupabase()
            .from("classes")
            .select("id, school_id, name, subject, created_by, created_at")
            .eq("school_id", schoolId);
        if (!isStudent && !isAdministrator) query = query.eq("created_by", user.id);
        return query;
    }, ["id"]);
    const classIds = classRows.map((classRow) => classRow.id);
    if (!classIds.length) return [];

    const [members, requests] = await Promise.all([
        getPagedRows(
            () => requireSupabase().from("class_members").select("class_id, user_id, role").in("class_id", classIds),
            ["class_id", "user_id"]
        ),
        getPagedRows(() => {
            let query = requireSupabase()
                .from("class_join_requests")
                .select("id, class_id, student_id, status, requested_at")
                .in("class_id", classIds);
            if (isStudent) query = query.eq("student_id", user.id);
            else query = query.eq("status", "pending");
            return query;
        }, ["class_id", "requested_at"])
    ]);

    const userIds = [...new Set([
        ...classRows.map((classRow) => String(classRow.created_by)),
        ...members.map((member) => String(member.user_id)),
        ...requests.map((request) => String(request.student_id))
    ])];
    const relatedUsers = userIds.length
        ? await getPagedRows(
            () => requireSupabase().from("users").select("id, email, name, status").in("id", userIds),
            ["id"]
        )
        : [];
    const usersById = new Map(relatedUsers.map((relatedUser) => [String(relatedUser.id), relatedUser]));
    const membersByClass = new Map();
    for (const member of members) {
        const classId = String(member.class_id);
        if (!membersByClass.has(classId)) membersByClass.set(classId, []);
        membersByClass.get(classId).push(member);
    }
    const requestsByClass = new Map();
    for (const request of requests) {
        const classId = String(request.class_id);
        if (!requestsByClass.has(classId)) requestsByClass.set(classId, []);
        requestsByClass.get(classId).push(request);
    }

    return classRows.map((classRow) => {
        const classId = String(classRow.id);
        const classMembers = membersByClass.get(classId) || [];
        const classRequests = requestsByClass.get(classId) || [];
        const teacher = usersById.get(String(classRow.created_by));
        return {
            id: classRow.id,
            school_id: classRow.school_id,
            name: classRow.name,
            subject: classRow.subject || "",
            createdAt: classRow.created_at,
            teacher: teacher ? { email: teacher.email, name: teacher.name } : null,
            studentCount: classMembers.filter((member) => String(member.role).toLowerCase() === "student").length,
            isEnrolled: classMembers.some((member) =>
                String(member.user_id) === String(user.id) && String(member.role).toLowerCase() === "student"
            ),
            hasPendingRequest: classRequests.some((request) =>
                String(request.student_id) === String(user.id) && request.status === "pending"
            ),
            pendingRequests: isStudent ? [] : classRequests
                .filter((request) => request.status === "pending")
                .map((request) => {
                    const student = usersById.get(String(request.student_id));
                    return {
                        id: request.id,
                        studentEmail: student?.email || "",
                        studentName: student?.name || student?.email || "Student",
                        requestedAt: request.requested_at
                    };
                })
        };
    });
}

async function getClassDetails(classRow, viewer) {
    const [members, classwork] = await Promise.all([
        getPagedRows(
            () => requireSupabase().from("class_members").select("user_id, role").eq("class_id", classRow.id),
            ["user_id"]
        ),
        getPagedRows(
            () => requireSupabase().from("classwork").select("id, title").eq("class_id", classRow.id),
            ["title", "id"]
        )
    ]);
    const isOwner = String(classRow.created_by) === String(viewer.id);
    const isAdministrator = ["Admin", "Administrator", "School Administrator"].includes(String(viewer.status));
    const canManage = isOwner || isAdministrator;
    const viewerMembership = members.find((member) => String(member.user_id) === String(viewer.id));
    if (!canManage && !viewerMembership) throw httpError("You do not have access to this class.", 403);

    const requestQuery = () => {
        let query = requireSupabase()
            .from("class_join_requests")
            .select("id, student_id, status, requested_at")
            .eq("class_id", classRow.id);
        query = query.eq("status", "pending");
        if (!canManage) query = query.eq("student_id", viewer.id);
        return query;
    };
    const [requests, grades] = await Promise.all([
        getPagedRows(requestQuery, ["requested_at", "id"]),
        classwork.length
            ? getPagedRows(() => {
                let query = requireSupabase()
                    .from("grades")
                    .select("classwork_id, student_id, score")
                    .in("classwork_id", classwork.map((item) => item.id));
                if (!canManage) query = query.eq("student_id", viewer.id);
                return query;
            }, ["student_id", "classwork_id"])
            : Promise.resolve([])
    ]);

    const userIds = [...new Set([
        String(classRow.created_by),
        ...members.map((member) => String(member.user_id)),
        ...requests.map((request) => String(request.student_id))
    ])];
    const relatedUsers = await getPagedRows(
        () => requireSupabase().from("users").select("id, email, name, status").in("id", userIds),
        ["id"]
    );
    const usersById = new Map(relatedUsers.map((user) => [String(user.id), user]));
    const teacher = usersById.get(String(classRow.created_by));
    const studentGrades = {};
    const classworkById = new Map(classwork.map((item) => [String(item.id), item]));
    for (const grade of grades) {
        const student = usersById.get(String(grade.student_id));
        const work = classworkById.get(String(grade.classwork_id));
        if (!student?.email || !work?.title) continue;
        const email = String(student.email).toLowerCase();
        if (!studentGrades[email]) studentGrades[email] = {};
        studentGrades[email][work.title] = grade.score === null || grade.score === undefined ? "" : String(grade.score);
    }

    return {
        id: classRow.id,
        school_id: classRow.school_id,
        name: classRow.name,
        subject: classRow.subject || "",
        createdAt: classRow.created_at,
        teacher: teacher ? { id: teacher.id, email: teacher.email, name: teacher.name } : null,
        students: members
            .filter((member) => String(member.role).toLowerCase() === "student")
            .map((member) => usersById.get(String(member.user_id)))
            .filter(Boolean)
            .map((student) => ({ id: student.id, email: student.email, name: student.name })),
        pendingRequests: canManage ? requests.filter((request) => request.status === "pending").map((request) => {
            const student = usersById.get(String(request.student_id));
            return { id: request.id, studentEmail: student?.email || "", studentName: student?.name || "Student", requestedAt: request.requested_at };
        }) : [],
        isEnrolled: Boolean(viewerMembership && String(viewerMembership.role).toLowerCase() === "student"),
        studentGrades
    };
}


function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-File-Name, X-School-Id, X-Class-Id");
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

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error("Set SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY to enable signed sessions.");
    return secret;
}

function createSessionToken(email) {
    const encodedClaims = Buffer.from(JSON.stringify({
        email: String(email).toLowerCase(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
    })).toString("base64url");
    const signature = crypto.createHmac("sha256", getSessionSecret()).update(encodedClaims).digest("base64url");
    return `${encodedClaims}.${signature}`;
}

function getSessionEmail(req) {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const [encodedClaims, signature, extra] = token.split(".");
    if (!encodedClaims || !signature || extra) {
        const error = new Error("Sign in to access file storage.");
        error.statusCode = 401;
        throw error;
    }

    const expected = crypto.createHmac("sha256", getSessionSecret()).update(encodedClaims).digest();
    let supplied;
    try {
        supplied = Buffer.from(signature, "base64url");
    } catch {
        supplied = Buffer.alloc(0);
    }
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
        const error = new Error("Invalid sign-in session.");
        error.statusCode = 401;
        throw error;
    }

    try {
        const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
        if (!claims.email || claims.expiresAt < Date.now()) throw new Error("Expired session");
        return String(claims.email).toLowerCase();
    } catch {
        const error = new Error("Sign in again to access file storage.");
        error.statusCode = 401;
        throw error;
    }
}

async function getStorageScope(req) {
    const user = await getAuthenticatedUser(req);
    const schoolId = await getAuthorizedSchoolId(req, user, req.headers["x-school-id"]);

    const classId = String(req.headers["x-class-id"] || "").trim();
    const isAdministrator = ["Admin", "Administrator", "School Administrator"].includes(String(user.status));
    if (!classId) {
        return { user, schoolId, prefix: `schools/${schoolId}/users/${user.id}`, canWrite: true };
    }
    if (!isUuid(classId)) throw httpError("Invalid class identifier.", 400);

    const [{ data: classRow, error: classError }, { data: membership, error: membershipError }] = await Promise.all([
        supabase.from("classes").select("id, school_id, created_by").eq("id", classId).maybeSingle(),
        supabase.from("class_members").select("class_id, role").eq("class_id", classId).eq("user_id", user.id).maybeSingle()
    ]);
    if (classError) throw classError;
    if (membershipError) throw membershipError;
    if (!classRow || String(classRow.school_id) !== String(schoolId)) {
        const error = new Error("Class not found in this school.");
        error.statusCode = 404;
        throw error;
    }

    const ownsClass = String(classRow.created_by) === String(user.id);
    const isMember = Boolean(membership);
    if (!ownsClass && !isMember && !isAdministrator) {
        const error = new Error("You do not have access to this class.");
        error.statusCode = 403;
        throw error;
    }
    if (req.method === "POST" && !ownsClass && !isAdministrator) {
        const error = new Error("Only the class teacher or a school administrator can upload class files.");
        error.statusCode = 403;
        throw error;
    }
    if (req.method === "DELETE" && !ownsClass && !isAdministrator) {
        const error = new Error("Only the class teacher or a school administrator can delete class files.");
        error.statusCode = 403;
        throw error;
    }

    return {
        user,
        schoolId,
        prefix: `schools/${schoolId}/classes/${classId}`,
        canWrite: ownsClass || isAdministrator
    };
}

function readRequestBuffer(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let exceeded = false;
        req.on("data", (chunk) => {
            if (exceeded) return;
            size += chunk.length;
            if (size > maxBytes) {
                exceeded = true;
                const error = new Error(`Files must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`);
                error.statusCode = 413;
                reject(error);
                req.resume();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (!exceeded) resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

function getSchoolMembershipRole(status) {
    const roleMap = {
        Student: "student",
        Teacher: "teacher",
        "School Administrator": "school_admin",
        Administrator: "administrator",
        Admin: "administrator"
    };
    return roleMap[String(status || "")] || null;
}

function sanitizeUserForClient(user) {
    if (!user || typeof user !== 'object') return null;
    const sanitized = {
        email: String(user.email || "").toLowerCase(),
        name: String(user.name || ""),
        status: String(user.status || "Student"),
        school_id: user.school_id || null,
        preferences: typeof user.preferences === 'object' ? user.preferences : {},
        createdAt: String(user.createdAt || ""),
        lastSignedIn: String(user.lastSignedIn || "")
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

        const headers = { "Content-Type": contentType };
        if (ext === ".html" || ext === ".js") headers["Cache-Control"] = "no-cache, must-revalidate";
        res.writeHead(200, headers);
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

function broadcastRealtimeChange(change) {
    const row = change.new && Object.keys(change.new).length ? change.new : (change.old || {});
    const schoolId = row.school_id || (change.table === "schools" ? row.id : null);
    for (const client of realtimeClients) {
        if (!schoolId || String(client.schoolId) === String(schoolId)) {
            client.response.write("event: update\ndata: {}\n\n");
        }
    }
}

function initializeRealtime() {
    if (!supabase) return;
    const tables = [
        "users",
        "schools",
        "school_memberships",
        "school_join_requests",
        "classes",
        "class_members",
        "class_join_requests",
        "classwork",
        "grades",
        "school_settings",
        "school_themes"
    ];
    let channel = supabase.channel("lms-live-updates");
    tables.forEach((table) => {
        channel = channel.on("postgres_changes", {
            event: "*",
            schema: "public",
            table
        }, broadcastRealtimeChange);
    });
    channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(`Supabase Realtime subscription status: ${status}`);
        } else if (status === "SUBSCRIBED") {
            console.log("Supabase Realtime connected.");
        }
    });
}

function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/favicon.ico") {
        res.writeHead(204, { "Content-Type": "image/x-icon" });
        res.end();
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
                    sendJson(res, 200, {
                        success: true,
                        user: sanitizeUserForClient(user),
                        token: createSessionToken(user.email)
                    });
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

    const classApiMatch = pathname === "/api/classes"
        || /^\/api\/classes\/[^/]+(?:\/join-requests(?:\/[^/]+\/respond)?|\/grades)?$/.test(pathname);
    if (classApiMatch) {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        (async () => {
            const segments = pathname.split("/").filter(Boolean);
            if (req.method === "GET" && segments.length === 2) {
                const user = await getAuthenticatedUser(req);
                const schoolId = await getAuthorizedSchoolId(req, user, url.searchParams.get("schoolId"));
                sendJson(res, 200, await listClassesForUser(user, schoolId));
                return;
            }

            if (req.method === "POST" && segments.length === 2) {
                const user = await getAuthenticatedUser(req);
                if (!["Teacher", "School Administrator", "Administrator", "Admin"].includes(String(user.status))) {
                    throw httpError("Only teachers and administrators can create classes.", 403);
                }
                const body = await readJsonBody(req);
                const name = String(body.name || "").trim();
                const subject = String(body.subject || "").trim();
                if (!name || !subject) throw httpError("Class name and subject are required.", 400);
                if (name.length > 120 || subject.length > 120) throw httpError("Class name and subject must be 120 characters or fewer.", 400);
                const schoolId = await getAuthorizedSchoolId(req, user, body.schoolId);
                const classId = crypto.randomUUID();
                const supabaseClient = requireSupabase();
                const { error: classError } = await supabaseClient.from("classes").insert({
                    id: classId,
                    school_id: schoolId,
                    name,
                    subject,
                    created_by: user.id
                });
                if (classError) throw classError;
                const { error: memberError } = await supabaseClient.from("class_members").upsert(
                    { class_id: classId, user_id: user.id, role: "teacher" },
                    { onConflict: "class_id,user_id" }
                );
                if (memberError) {
                    const { error: cleanupError } = await supabaseClient.from("classes").delete().eq("id", classId);
                    if (cleanupError) console.error("Could not remove class after membership creation failed:", cleanupError.message);
                    throw memberError;
                }
                sendJson(res, 201, { success: true, id: classId });
                return;
            }

            if (segments.length < 3) throw httpError("Method not allowed.", 405);
            const classId = segments[2];
            if (!isUuid(classId)) throw httpError("Invalid class identifier.", 400);
            const supabaseClient = requireSupabase();
            const user = await getAuthenticatedUser(req);
            const { data: classRow, error: classError } = await supabaseClient
                .from("classes")
                .select("id, school_id, name, subject, created_by, created_at")
                .eq("id", classId)
                .maybeSingle();
            if (classError) throw classError;
            if (!classRow) throw httpError("Class not found.", 404);
            await getAuthorizedSchoolId(req, user, classRow.school_id);

            if (req.method === "GET" && segments.length === 3) {
                sendJson(res, 200, await getClassDetails(classRow, user));
                return;
            }

            if (req.method === "POST" && segments.length === 4 && segments[3] === "join-requests") {
                if (String(user.status) !== "Student") throw httpError("Only students can request to join a class.", 403);
                const { data: existingMember, error: memberCheckError } = await supabaseClient
                    .from("class_members")
                    .select("class_id")
                    .eq("class_id", classId)
                    .eq("user_id", user.id)
                    .maybeSingle();
                if (memberCheckError) throw memberCheckError;
                if (existingMember) throw httpError("You are already enrolled in this class.", 409);

                const { data: pendingRequest, error: requestCheckError } = await supabaseClient
                    .from("class_join_requests")
                    .select("id")
                    .eq("class_id", classId)
                    .eq("student_id", user.id)
                    .eq("status", "pending")
                    .maybeSingle();
                if (requestCheckError) throw requestCheckError;
                if (pendingRequest) throw httpError("You already have a pending request for this class.", 409);

                const { error: insertError } = await supabaseClient.from("class_join_requests").insert({
                    class_id: classId,
                    student_id: user.id,
                    status: "pending"
                });
                if (insertError) {
                    if (insertError.code === "23505") throw httpError("You already have a pending request for this class.", 409);
                    throw insertError;
                }
                sendJson(res, 201, { success: true });
                return;
            }

            if (req.method === "POST" && segments.length === 6 && segments[3] === "join-requests" && segments[5] === "respond") {
                const body = await readJsonBody(req);
                const action = String(body.action || "").toLowerCase();
                if (action !== "accept" && action !== "reject") throw httpError("Choose accept or reject.", 400);
                const isOwner = String(classRow.created_by) === String(user.id);
                const isAdministrator = ["Admin", "Administrator", "School Administrator"].includes(String(user.status));
                if (!isOwner && !isAdministrator) throw httpError("Only the class teacher or a school administrator can review requests.", 403);

                const requestId = segments[4];
                if (!isUuid(requestId)) throw httpError("Invalid join request identifier.", 400);
                const { data: joinRequest, error: requestError } = await supabaseClient
                    .from("class_join_requests")
                    .select("id, student_id, status")
                    .eq("id", requestId)
                    .eq("class_id", classId)
                    .eq("status", "pending")
                    .maybeSingle();
                if (requestError) throw requestError;
                if (!joinRequest) throw httpError("Pending join request not found.", 404);

                const { data: updatedRequest, error: updateError } = await supabaseClient
                    .from("class_join_requests")
                    .update({
                        status: action === "accept" ? "accepted" : "rejected",
                        reviewed_at: new Date().toISOString(),
                        reviewed_by: user.id
                    })
                    .eq("id", joinRequest.id)
                    .eq("status", "pending")
                    .select("id")
                    .maybeSingle();
                if (updateError) throw updateError;
                if (!updatedRequest) throw httpError("This join request has already been reviewed.", 409);

                if (action === "accept") {
                    const { error: memberError } = await supabaseClient.from("class_members").upsert(
                        { class_id: classId, user_id: joinRequest.student_id, role: "student" },
                        { onConflict: "class_id,user_id" }
                    );
                    if (memberError) {
                        const { error: rollbackError } = await supabaseClient
                            .from("class_join_requests")
                            .update({ status: "pending", reviewed_at: null, reviewed_by: null })
                            .eq("id", joinRequest.id)
                            .eq("status", "accepted");
                        if (rollbackError) console.error("Could not reopen join request after enrollment failed:", rollbackError.message);
                        throw memberError;
                    }
                }
                sendJson(res, 200, { success: true });
                return;
            }

            if (req.method === "PUT" && segments.length === 4 && segments[3] === "grades") {
                const isOwner = String(classRow.created_by) === String(user.id);
                const isAdministrator = ["Admin", "Administrator", "School Administrator"].includes(String(user.status));
                if (!isOwner && !isAdministrator) throw httpError("Only the class teacher or a school administrator can save grades.", 403);

                const body = await readJsonBody(req);
                const studentGrades = body.studentGrades;
                if (!studentGrades || typeof studentGrades !== "object" || Array.isArray(studentGrades)) {
                    throw httpError("Student grades must be an object.", 400);
                }
                const fields = [...new Set(Object.keys(studentGrades).flatMap((email) =>
                    studentGrades[email] && typeof studentGrades[email] === "object"
                        ? Object.keys(studentGrades[email])
                        : []
                ))];
                if (fields.some((field) => !field.trim() || field.length > 120)) {
                    throw httpError("Grade field names must be 1 to 120 characters.", 400);
                }
                const [members, existingWork] = await Promise.all([
                    getPagedRows(
                        () => supabaseClient.from("class_members").select("user_id, role").eq("class_id", classId),
                        ["user_id"]
                    ),
                    getPagedRows(
                        () => supabaseClient.from("classwork").select("id, title").eq("class_id", classId),
                        ["title", "id"]
                    )
                ]);
                const enrolledIds = new Set((members || [])
                    .filter((member) => String(member.role).toLowerCase() === "student")
                    .map((member) => String(member.user_id)));
                const students = enrolledIds.size
                    ? await getPagedRows(
                        () => supabaseClient.from("users").select("id, email").in("id", [...enrolledIds]),
                        ["id"]
                    )
                    : [];
                const studentsByEmail = new Map((students || []).map((student) => [String(student.email).toLowerCase(), student]));
                const workByTitle = new Map((existingWork || []).map((work) => [String(work.title), work]));
                const workRows = [];
                for (const field of fields) {
                    if (!workByTitle.has(field)) {
                        const work = {
                            id: legacyIdToUuid(`${classId}:grade:${field}`),
                            class_id: classId,
                            title: field,
                            description: "Grade field",
                            created_by: user.id
                        };
                        workByTitle.set(field, work);
                        workRows.push(work);
                    }
                }
                if (workRows.length) {
                    const { error } = await supabaseClient.from("classwork").upsert(workRows, { onConflict: "id" });
                    if (error) throw error;
                }

                const studentIds = [...studentsByEmail.values()]
                    .filter((student) => enrolledIds.has(String(student.id)))
                    .map((student) => student.id);
                const workIds = [...workByTitle.values()].map((work) => work.id);
                const existingGrades = studentIds.length && workIds.length
                    ? await getPagedRows(
                        () => supabaseClient.from("grades")
                            .select("id, classwork_id, student_id")
                            .in("classwork_id", workIds)
                            .in("student_id", studentIds),
                        ["classwork_id", "student_id"]
                    )
                    : [];
                const existingGradeIds = new Map(existingGrades.map((grade) => [
                    `${grade.classwork_id}:${grade.student_id}`,
                    grade.id
                ]));
                const gradeRows = [];
                const updatedAt = new Date().toISOString();
                for (const [emailKey, gradesByField] of Object.entries(studentGrades)) {
                    const student = studentsByEmail.get(String(emailKey).trim().toLowerCase());
                    if (!student || !enrolledIds.has(String(student.id))) {
                        throw httpError(`Student ${emailKey} is not enrolled in this class.`, 400);
                    }
                    if (!gradesByField || typeof gradesByField !== "object" || Array.isArray(gradesByField)) {
                        throw httpError(`Grades for ${emailKey} must be an object.`, 400);
                    }
                    for (const [field, rawScore] of Object.entries(gradesByField)) {
                        const cleanedScore = String(rawScore ?? "").trim();
                        const score = cleanedScore === "" ? null : Number(cleanedScore);
                        if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
                            throw httpError(`Grade for ${emailKey} in ${field} must be between 0 and 100.`, 400);
                        }
                        const work = workByTitle.get(field);
                        if (!work) throw httpError(`Unknown grade field: ${field}.`, 400);
                        const gradeKey = `${work.id}:${student.id}`;
                        gradeRows.push({
                            id: existingGradeIds.get(gradeKey) || legacyIdToUuid(`${work.id}:student:${student.id}`),
                            classwork_id: work.id,
                            student_id: student.id,
                            score,
                            updated_at: updatedAt
                        });
                    }
                }
                if (gradeRows.length) {
                    const { error } = await supabaseClient.from("grades").upsert(gradeRows, { onConflict: "id" });
                    if (error) throw error;
                }
                sendJson(res, 200, { success: true });
                return;
            }

            throw httpError("Method not allowed.", 405);
        })().catch((error) => {
            console.error("Class API request failed:", error);
            sendJson(res, error.statusCode || 500, { success: false, error: error.message || "Class request failed." });
        });
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
            // Back-compat endpoint (local config.json). Supabase-backed config should be used via /api/schools/update-config.
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

    if (url.pathname === "/api/vic-theme") {
        setCorsHeaders(res);
        if (req.method === "GET") {
            try {
                sendJson(res, 200, getVicTheme());
            } catch (err) {
                sendJson(res, 500, { success: false, error: err.message });
            }
            return;
        }
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/admin/vic-theme") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    const payload = JSON.parse(body || "{}");
                    await requireAdministrator(payload.adminEmail);
                    const allowedKeys = ["primary", "secondary", "accent", "background", "surface", "text"];
                    const theme = {};
                    allowedKeys.forEach((key) => {
                        if (typeof payload.theme?.[key] === "string" && payload.theme[key].trim()) {
                            theme[key] = payload.theme[key].trim();
                        }
                    });
                    fs.writeFileSync(vicThemePath, JSON.stringify(theme, null, 2));
                    sendJson(res, 200, { success: true, theme });
                } catch (err) {
                    sendJson(res, err.statusCode || 500, { success: false, error: err.message });
                }
            });
            return;
        }
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    // --- Supabase-backed school config (theme/logo) ---


    if (url.pathname === "/api/schools/by-user") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "GET") {
            (async () => {
                const email = url.searchParams.get("email");
                if (!email) {
                    sendJson(res, 400, { success: false, error: "Missing email query param" });
                    return;
                }

                try {
                    const normalizedEmail = String(email).trim().toLowerCase();

                    // Resolve the requested membership, preserving legacy school_id support.
                    requireSupabase();
                    const { data: userRows, error: userErr } = await supabase
                        .from("users")
                        .select("id, school_id, status")
                        .ilike("email", normalizedEmail)
                        .maybeSingle();

                    if (userErr) throw userErr;
                    if (!userRows) {
                        sendJson(res, 404, { success: false, error: "User not found" });
                        return;
                    }

                    const requestedSchoolId = url.searchParams.get("schoolId");
                    let schoolId = requestedSchoolId || userRows.school_id;
                    if (requestedSchoolId && String(requestedSchoolId) !== String(userRows.school_id)) {
                        const { data: membership, error: membershipError } = await supabase
                            .from("school_memberships")
                            .select("school_id, status")
                            .eq("user_id", userRows.id)
                            .eq("school_id", requestedSchoolId)
                            .maybeSingle();
                        if (membershipError) throw membershipError;
                        if (!membership || membership.status !== "active") {
                            sendJson(res, 403, { success: false, error: "You do not belong to this school" });
                            return;
                        }
                        schoolId = membership.school_id;
                    } else if (!schoolId) {
                        const { data: membership, error: membershipError } = await supabase
                            .from("school_memberships")
                            .select("school_id")
                            .eq("user_id", userRows.id)
                            .eq("status", "active")
                            .limit(1)
                            .maybeSingle();
                        if (membershipError) throw membershipError;
                        schoolId = membership?.school_id;
                    }
                    if (!schoolId) {
                        sendJson(res, 404, { success: false, error: "User has no school membership" });
                        return;
                    }

                    // 2) Fetch school config
                    const { data: schoolRow, error: schoolErr } = await supabase
                        .from("schools")
                        .select("id, name, logo_url, config_json")
                        .eq("id", schoolId)
                        .maybeSingle();

                    if (schoolErr) throw schoolErr;
                    if (!schoolRow) {
                        sendJson(res, 404, { success: false, error: "School not found" });
                        return;
                    }

                    sendJson(res, 200, {
                        success: true,
                        school: {
                            id: schoolRow.id,
                            name: schoolRow.name,
                            logo_url: schoolRow.logo_url
                        },
                        config_json: schoolRow.config_json || {}
                    });
                    return;
                } catch (err) {
                    sendJson(res, 500, { success: false, error: err.message });
                    return;
                }
            })();
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/schools/for-user") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method === "GET") {
            (async () => {
                try {
                    requireSupabase();
                    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
                    if (!email) {
                        sendJson(res, 400, { success: false, error: "Missing email query param" });
                        return;
                    }
                    const { data: user, error: userError } = await supabase
                        .from("users")
                        .select("id, school_id")
                        .ilike("email", email)
                        .maybeSingle();
                    if (userError) throw userError;
                    if (!user) {
                        sendJson(res, 404, { success: false, error: "User not found" });
                        return;
                    }

                    const schoolIds = new Set();
                    if (user.school_id) schoolIds.add(String(user.school_id));
                    const { data: memberships, error: membershipsError } = await supabase
                        .from("school_memberships")
                        .select("school_id, role, status")
                        .eq("user_id", user.id)
                        .eq("status", "active");
                    if (membershipsError) throw membershipsError;
                    (memberships || []).forEach((membership) => schoolIds.add(String(membership.school_id)));

                    if (!schoolIds.size) {
                        sendJson(res, 200, { success: true, schools: [] });
                        return;
                    }
                    const { data: schools, error: schoolsError } = await supabase
                        .from("schools")
                        .select("id, name, logo_url")
                        .in("id", [...schoolIds])
                        .order("name");
                    if (schoolsError) throw schoolsError;
                    sendJson(res, 200, { success: true, schools: schools || [] });
                } catch (err) {
                    sendJson(res, 500, { success: false, error: err.message });
                }
            })();
            return;
        }
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/schools/list") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method === "GET") {
            (async () => {
                try {
                    requireSupabase();
                    const { data, error } = await supabase.from("schools").select("id, name").order("name");
                    if (error) throw error;
                    sendJson(res, 200, { success: true, schools: data || [] });
                } catch (err) {
                    sendJson(res, 500, { success: false, error: err.message });
                }
            })();
            return;
        }
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/schools/request-join") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    requireSupabase();
                    const payload = JSON.parse(body || "{}");
                    const email = String(payload.email || "").trim().toLowerCase();
                    const schoolId = String(payload.schoolId || "").trim();
                    if (!email || !schoolId) {
                        sendJson(res, 400, { success: false, error: "Email and schoolId are required" });
                        return;
                    }

                    const { data: user, error: userError } = await supabase.from("users").select("id, email, name, status, school_id").ilike("email", email).maybeSingle();
                    if (userError) throw userError;
                    if (!user) {
                        sendJson(res, 404, { success: false, error: "User not found. Sign in first." });
                        return;
                    }
                    const membershipRole = getSchoolMembershipRole(user.status);
                    if (!membershipRole) {
                        sendJson(res, 400, { success: false, error: "Guest accounts cannot join a school" });
                        return;
                    }
                    const isAdmin = ["Administrator", "Admin", "School Administrator"].includes(String(user.status));
                    const { data: activeMemberships, error: membershipsError } = await supabase
                        .from("school_memberships")
                        .select("school_id")
                        .eq("user_id", user.id)
                        .eq("status", "active");
                    if (membershipsError) throw membershipsError;
                    if ((user.school_id || activeMemberships?.length) && !isAdmin) {
                        sendJson(res, 400, { success: false, error: "You already belong to a school" });
                        return;
                    }

                    const { data: school, error: schoolError } = await supabase.from("schools").select("id, config_json").eq("id", schoolId).maybeSingle();
                    if (schoolError) throw schoolError;
                    if (!school) {
                        sendJson(res, 404, { success: false, error: "School not found" });
                        return;
                    }

                    if (isAdmin) {
                        const { error: membershipError } = await supabase
                            .from("school_memberships")
                            .upsert({
                                user_id: user.id,
                                school_id: school.id,
                                role: membershipRole,
                                status: "active"
                            }, { onConflict: "user_id,school_id" });
                        if (membershipError) throw membershipError;
                        if (!user.school_id) {
                            const { error: legacyUpdateError } = await supabase
                                .from("users")
                                .update({ school_id: school.id })
                                .eq("id", user.id);
                            if (legacyUpdateError) throw legacyUpdateError;
                        }
                        sendJson(res, 200, { success: true, joined: true, school_id: school.id });
                        return;
                    }

                    const config = school.config_json || {};
                    const legacyRequests = Array.isArray(config.joinRequests) ? config.joinRequests : [];
                    if (legacyRequests.some((request) => request.email === email && request.status === "pending")) {
                        sendJson(res, 400, { success: false, error: "Join request already pending" });
                        return;
                    }
                    const { data: existingRequest, error: existingRequestError } = await supabase
                        .from("school_join_requests")
                        .select("id")
                        .eq("user_id", user.id)
                        .eq("school_id", school.id)
                        .eq("status", "pending")
                        .limit(1)
                        .maybeSingle();
                    if (existingRequestError) throw existingRequestError;
                    if (existingRequest) {
                        sendJson(res, 400, { success: false, error: "Join request already pending" });
                        return;
                    }
                    const { error: insertRequestError } = await supabase
                        .from("school_join_requests")
                        .insert({ user_id: user.id, school_id: school.id, status: "pending" });
                    if (insertRequestError) throw insertRequestError;
                    sendJson(res, 200, { success: true });
                } catch (err) {
                    sendJson(res, 500, { success: false, error: err.message });
                }
            });
            return;
        }
        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/schools/join-requests" || url.pathname === "/api/schools/join-requests/respond") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== (url.pathname.endsWith("/respond") ? "POST" : "GET")) {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
        }

        const handleRequests = async (payload) => {
            requireSupabase();
            const approverEmail = String(payload.email || "").trim().toLowerCase();
            const { data: approver, error: approverError } = await supabase.from("users").select("id, email, status, school_id").ilike("email", approverEmail).maybeSingle();
            if (approverError) throw approverError;
            if (!approver || !["School Administrator", "Administrator", "Admin"].includes(String(approver.status))) {
                const error = new Error("School Administrator access required");
                error.statusCode = 403;
                throw error;
            }

            const requestedSchoolId = String(payload.schoolId || "").trim();
            let schoolId = requestedSchoolId || approver.school_id;
            if (requestedSchoolId && String(requestedSchoolId) !== String(approver.school_id)) {
                const { data: membership, error: membershipError } = await supabase
                    .from("school_memberships")
                    .select("school_id, role, status")
                    .eq("user_id", approver.id)
                    .eq("school_id", requestedSchoolId)
                    .eq("status", "active")
                    .maybeSingle();
                if (membershipError) throw membershipError;
                if (!membership || !["school_admin", "administrator"].includes(String(membership.role))) {
                    const error = new Error("School Administrator access required for this school");
                    error.statusCode = 403;
                    throw error;
                }
                schoolId = membership.school_id;
            }
            if (!schoolId) {
                const { data: membership, error: membershipError } = await supabase
                    .from("school_memberships")
                    .select("school_id")
                    .eq("user_id", approver.id)
                    .eq("status", "active")
                    .in("role", ["school_admin", "administrator"])
                    .limit(1)
                    .maybeSingle();
                if (membershipError) throw membershipError;
                schoolId = membership?.school_id;
            }
            if (!schoolId) {
                const error = new Error("No administered school is selected");
                error.statusCode = 400;
                throw error;
            }

            const { data: school, error: schoolError } = await supabase.from("schools").select("id, config_json").eq("id", schoolId).maybeSingle();
            if (schoolError) throw schoolError;
            if (!school) throw new Error("School not found");
            const config = school.config_json || {};
            const legacyRequests = Array.isArray(config.joinRequests) ? config.joinRequests : [];
            const { data: normalizedRows, error: normalizedError } = await supabase
                .from("school_join_requests")
                .select("id, user_id, status")
                .eq("school_id", school.id)
                .eq("status", "pending");
            if (normalizedError) throw normalizedError;

            const requesterIds = [...new Set((normalizedRows || []).map((request) => request.user_id))];
            const requestersById = new Map();
            if (requesterIds.length) {
                const { data: requesters, error: requestersError } = await supabase
                    .from("users")
                    .select("id, email, name")
                    .in("id", requesterIds);
                if (requestersError) throw requestersError;
                (requesters || []).forEach((requester) => requestersById.set(String(requester.id), requester));
            }
            const normalizedRequests = (normalizedRows || []).map((request) => {
                const requester = requestersById.get(String(request.user_id));
                return requester ? {
                    email: requester.email,
                    name: requester.name || requester.email,
                    status: request.status,
                    source: "normalized",
                    requestId: request.id
                } : null;
            }).filter(Boolean);
            const pendingRequests = new Map();
            legacyRequests.filter((request) => request.status === "pending").forEach((request) => {
                pendingRequests.set(String(request.email).toLowerCase(), { ...request, source: "legacy" });
            });
            normalizedRequests.forEach((request) => {
                const key = String(request.email).toLowerCase();
                if (!pendingRequests.has(key)) pendingRequests.set(key, request);
            });

            if (url.pathname.endsWith("/respond")) {
                const requesterEmail = String(payload.requesterEmail || "").trim().toLowerCase();
                const decision = payload.decision === "accept" ? "accepted" : payload.decision === "reject" ? "rejected" : "";
                const legacyRequest = legacyRequests.find((item) => String(item.email).toLowerCase() === requesterEmail && item.status === "pending");
                const pendingNormalizedRequest = normalizedRequests.find((item) => String(item.email).toLowerCase() === requesterEmail);
                if ((!legacyRequest && !pendingNormalizedRequest) || !decision) throw new Error("Pending request not found");
                if (legacyRequest) {
                    legacyRequest.status = decision;
                    legacyRequest.resolvedAt = new Date().toISOString();
                }
                if (decision === "accepted") {
                    const { data: requester, error: requesterError } = await supabase
                        .from("users")
                        .select("id, status, school_id")
                        .ilike("email", requesterEmail)
                        .maybeSingle();
                    if (requesterError) throw requesterError;
                    if (!requester) throw new Error("Requesting user not found");
                    const membershipRole = getSchoolMembershipRole(requester.status);
                    if (!membershipRole) throw new Error("Guest accounts cannot join a school");
                    const requesterIsAdmin = ["Administrator", "Admin", "School Administrator"].includes(String(requester.status));
                    if (!requesterIsAdmin) {
                        const { data: existingMemberships, error: existingMembershipsError } = await supabase
                            .from("school_memberships")
                            .select("school_id")
                            .eq("user_id", requester.id)
                            .eq("status", "active");
                        if (existingMembershipsError) throw existingMembershipsError;
                        if ((requester.school_id && String(requester.school_id) !== String(school.id)) || existingMemberships?.some((membership) => String(membership.school_id) !== String(school.id))) {
                            throw new Error("This user already belongs to another school");
                        }
                    }
                    const { error: membershipError } = await supabase
                        .from("school_memberships")
                        .upsert({
                            user_id: requester.id,
                            school_id: school.id,
                            role: membershipRole,
                            status: "active"
                        }, { onConflict: "user_id,school_id" });
                    if (membershipError) throw membershipError;
                    if (!requester.school_id) {
                        const { error: assignError } = await supabase.from("users").update({ school_id: school.id }).eq("id", requester.id);
                        if (assignError) throw assignError;
                    }
                }
                if (pendingNormalizedRequest) {
                    const { error: updateNormalizedError } = await supabase
                        .from("school_join_requests")
                        .update({ status: decision, reviewed_by: approver.id })
                        .eq("id", pendingNormalizedRequest.requestId);
                    if (updateNormalizedError) throw updateNormalizedError;
                }
                if (legacyRequest) {
                    const { error: updateLegacyError } = await supabase
                        .from("schools")
                        .update({ config_json: { ...config, joinRequests: legacyRequests } })
                        .eq("id", school.id);
                    if (updateLegacyError) throw updateLegacyError;
                }
                return { success: true };
            }

            return { success: true, requests: [...pendingRequests.values()], schoolId: school.id };
        };

        if (req.method === "GET") {
            (async () => {
                try {
                    sendJson(res, 200, await handleRequests({
                        email: url.searchParams.get("email"),
                        schoolId: url.searchParams.get("schoolId")
                    }));
                }
                catch (err) { sendJson(res, err.statusCode || 500, { success: false, error: err.message }); }
            })();
        } else {
            let body = "";
            req.on("data", (chunk) => { body += chunk.toString(); });
            req.on("end", async () => {
                try { sendJson(res, 200, await handleRequests(JSON.parse(body || "{}"))); }
                catch (err) { sendJson(res, err.statusCode || 500, { success: false, error: err.message }); }
            });
        }
        return;
    }

    if (url.pathname === "/api/schools/create-and-assign") {
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
                    const payload = JSON.parse(body || "{}");
                    const email = payload.email;
                    const schoolName = payload.schoolName;
                    const config_json = payload.config_json || {};
                    const logo_url = payload.logoUrl || null;
                    const location = payload.location || null;

                    if (!email || !schoolName) {
                        sendJson(res, 400, { success: false, error: "Missing email or schoolName" });
                        return;
                    }

                    requireSupabase();
                    const normalizedEmail = String(email).trim().toLowerCase();

                    // Ensure user exists
                    const { data: userRow, error: userErr } = await supabase
                        .from("users")
                        .select("email, school_id")
                        .ilike("email", normalizedEmail)
                        .maybeSingle();


                    if (userErr) throw userErr;
                    if (!userRow) {
                        sendJson(res, 404, { success: false, error: "User not found" });
                        return;
                    }

                    // Create school (or reuse by name)
                    const { data: schoolRow, error: schoolErr } = await supabase
                        .from("schools")
                        .select("id")
                        .ilike("name", String(schoolName).trim())
                        .maybeSingle();

                    if (schoolErr) throw schoolErr;

                    let schoolId = schoolRow?.id;
                    if (!schoolId) {
                        const schoolConfig = {
                            ...config_json,
                            ...(location ? { location } : {})
                        };
                        const insertPayload = {
                            name: String(schoolName).trim(),
                            logo_url,
                            config_json: schoolConfig
                        };

                        const { data: created, error: createErr } = await supabase
                            .from("schools")
                            .insert(insertPayload)
                            .select("id")
                            .single();

                        if (createErr) throw createErr;
                        schoolId = created?.id;
                    }

                    // Assign school_id to user
                    const { error: updateErr } = await supabase
                        .from("users")
                        .update({ school_id: schoolId })
                        .eq("email", userRow.email);

                    if (updateErr) throw updateErr;

                    sendJson(res, 200, { success: true, school_id: schoolId });
                } catch (err) {
                    sendJson(res, 500, { success: false, error: err.message });
                }
            });
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/schools/update-config") {
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
                    const payload = JSON.parse(body || "{}");
                    const email = getSessionEmail(req);
                    const config_json = payload.config_json;

                    if (!config_json || typeof config_json !== "object" || Array.isArray(config_json)) {
                        sendJson(res, 400, { success: false, error: "A valid config_json object is required" });
                        return;
                    }

                    requireSupabase();
                    const normalizedEmail = email;

                    // fetch user's status + school_id
                    const { data: userRow, error: userErr } = await supabase
                        .from("users")
                        .select("id, email, status, school_id")
                        .ilike("email", normalizedEmail)
                        .maybeSingle();

                    if (userErr) throw userErr;
                    if (!userRow) {
                        sendJson(res, 404, { success: false, error: "User not found" });
                        return;
                    }

                    const status = String(userRow.status || "");
                    const canUpdate = status === "Administrator" || status === "Teacher" || status === "School Administrator" || status === "Admin";
                    if (!canUpdate) {
                        sendJson(res, 403, { success: false, error: "Forbidden: requires Admin/Teacher" });
                        return;
                    }

                    let schoolId = String(payload.schoolId || userRow.school_id || "");
                    if (payload.schoolId && String(payload.schoolId) !== String(userRow.school_id)) {
                        const { data: membership, error: membershipError } = await supabase
                            .from("school_memberships")
                            .select("school_id, role, status")
                            .eq("user_id", userRow.id)
                            .eq("school_id", payload.schoolId)
                            .eq("status", "active")
                            .maybeSingle();
                        if (membershipError) throw membershipError;
                        if (!membership || !["administrator", "school_admin", "teacher"].includes(String(membership.role))) {
                            sendJson(res, 403, { success: false, error: "No settings access for this school" });
                            return;
                        }
                        schoolId = membership.school_id;
                    }
                    if (!schoolId) {
                        sendJson(res, 400, { success: false, error: "User has no school_id" });
                        return;
                    }

                    const schoolUpdates = { config_json };
                    const schoolName = typeof config_json.schoolName === "string"
                        ? config_json.schoolName.trim()
                        : "";
                    if (schoolName) schoolUpdates.name = schoolName;

                    const { error: upErr } = await supabase
                        .from("schools")
                        .update(schoolUpdates)
                        .eq("id", schoolId);

                    if (upErr) throw upErr;

                    sendJson(res, 200, { success: true });
                } catch (err) {
                    sendJson(res, err.statusCode || 500, { success: false, error: err.message });
                }
            });

            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/admin/search") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === "GET") {
            (async () => {
                try {
                    requireSupabase();
                    await requireAdministrator(url.searchParams.get("adminEmail"));
                    const query = String(url.searchParams.get("q") || "").trim().toLowerCase();

                    const [{ data: users, error: usersError }, { data: schools, error: schoolsError }] = await Promise.all([
                        supabase.from("users").select("email, name, status, school_id, lastSignedIn"),
                        supabase.from("schools").select("id, name, logo_url, config_json")
                    ]);
                    if (usersError) throw usersError;
                    if (schoolsError) throw schoolsError;

                    const userRows = (users || []).filter((user) => {
                        if (!query) return true;
                        return [user.email, user.name, user.status, user.school_id]
                            .some((value) => String(value || "").toLowerCase().includes(query));
                    });
                    const schoolRows = (schools || []).map((school) => {
                        const creator = (users || []).find((user) => user.school_id === school.id) || null;
                        return { ...school, creator };
                    }).filter((school) => {
                        if (!query) return true;
                        return [school.id, school.name, school.creator?.name, school.creator?.email]
                            .some((value) => String(value || "").toLowerCase().includes(query));
                    });

                    sendJson(res, 200, { success: true, users: userRows, schools: schoolRows });
                } catch (err) {
                    sendJson(res, err.statusCode || 500, { success: false, error: err.message });
                }
            })();
            return;
        }

        sendJson(res, 405, { error: "Method not allowed" });
        return;
    }

    if (url.pathname === "/api/admin/users/update" || url.pathname === "/api/admin/users/delete" || url.pathname === "/api/admin/schools/update") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== "POST") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
        }

        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", async () => {
            try {
                requireSupabase();
                const payload = JSON.parse(body || "{}");
                const admin = await requireAdministrator(payload.adminEmail);

                if (url.pathname === "/api/admin/users/update") {
                    const email = String(payload.email || "").trim().toLowerCase();
                    const status = String(payload.status || "").trim();
                    if (!email || !["Student", "Teacher", "School Administrator", "Administrator", "Guest"].includes(status)) {
                        sendJson(res, 400, { success: false, error: "Valid email and role are required" });
                        return;
                    }
                    if (email === String(admin.email).toLowerCase()) {
                        sendJson(res, 400, { success: false, error: "You cannot change your own role" });
                        return;
                    }
                    const { error } = await supabase.from("users").update({ status }).eq("email", email);
                    if (error) throw error;
                } else if (url.pathname === "/api/admin/users/delete") {
                    const email = String(payload.email || "").trim().toLowerCase();
                    if (!email || email === String(admin.email).toLowerCase()) {
                        sendJson(res, 400, { success: false, error: "A different user email is required" });
                        return;
                    }
                    const { error } = await supabase.from("users").delete().eq("email", email);
                    if (error) throw error;
                } else {
                    const schoolId = String(payload.schoolId || "").trim();
                    if (!schoolId || !payload.config_json || typeof payload.config_json !== "object") {
                        sendJson(res, 400, { success: false, error: "School id and configuration are required" });
                        return;
                    }
                    const { error } = await supabase.from("schools").update({ config_json: payload.config_json }).eq("id", schoolId);
                    if (error) throw error;
                }

                sendJson(res, 200, { success: true });
            } catch (err) {
                sendJson(res, err.statusCode || 500, { success: false, error: err.message });
            }
        });
        return;
    }


    if (url.pathname === "/api/events") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (req.method !== "GET") {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
        }

        (async () => {
            const scope = await getStorageScope(req);
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            });
            res.write("retry: 3000\nevent: ready\ndata: {}\n\n");
            const client = { schoolId: String(scope.schoolId), response: res };
            realtimeClients.add(client);
            const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25000);
            heartbeat.unref?.();
            res.on("close", () => {
                clearInterval(heartbeat);
                realtimeClients.delete(client);
            });
        })().catch((error) => {
            if (!res.headersSent) sendJson(res, error.statusCode || 500, { success: false, error: error.message });
            else res.end();
        });
        return;
    }

    if (url.pathname === "/api/files") {
        setCorsHeaders(res);
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        const respondWithError = (error) => {
            if (res.headersSent) return;
            sendJson(res, error.statusCode || 500, { success: false, error: error.message || "File storage failed." });
        };

        if (!["GET", "POST", "DELETE"].includes(req.method)) {
            sendJson(res, 405, { error: "Method not allowed" });
            return;
        }

        (async () => {
            if (!SUPABASE_SERVICE_ROLE_KEY) {
                const error = new Error("File storage requires SUPABASE_SERVICE_ROLE_KEY in the server environment.");
                error.statusCode = 503;
                throw error;
            }
            const scope = await getStorageScope(req);
            const bucket = requireSupabase().storage.from(SUPABASE_STORAGE_BUCKET);
            const objectPath = url.searchParams.get("path");
            const objectName = objectPath?.startsWith(`${scope.prefix}/`)
                ? objectPath.slice(scope.prefix.length + 1)
                : "";
            const validObjectPath = Boolean(objectName) && !objectName.includes("/") && !objectName.includes("..") && objectName !== ".";

            if (req.method === "GET" && objectPath && url.searchParams.get("download") === "true") {
                if (!validObjectPath) {
                    const error = new Error("You do not have access to this file.");
                    error.statusCode = 403;
                    throw error;
                }
                const { data, error } = await bucket.download(objectPath);
                if (error) throw error;
                const buffer = Buffer.from(await data.arrayBuffer());
                res.writeHead(200, {
                    "Content-Type": data.type || "application/octet-stream",
                    "Content-Length": buffer.length,
                    "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(path.basename(objectPath).replace(/^[^_]+__/, ""))}`,
                    "Cache-Control": "private, no-store"
                });
                res.end(buffer);
                return;
            }

            if (req.method === "GET") {
                const { data, error } = await bucket.list(scope.prefix, {
                    limit: 100,
                    sortBy: { column: "created_at", order: "desc" }
                });
                if (error) throw error;
                const files = (data || []).filter((item) => item.id).map((item) => ({
                    filename: item.name.includes("__") ? item.name.split("__").slice(1).join("__") : item.name,
                    path: `${scope.prefix}/${item.name}`,
                    size: item.metadata?.size || 0,
                    mimeType: item.metadata?.mimetype || "application/octet-stream",
                    createdAt: item.created_at || null
                }));
                sendJson(res, 200, { success: true, files });
                return;
            }

            if (req.method === "POST") {
                let filename = "";
                try {
                    filename = decodeURIComponent(String(req.headers["x-file-name"] || "").trim());
                } catch {
                    const error = new Error("Invalid file name encoding.");
                    error.statusCode = 400;
                    throw error;
                }
                const safeName = sanitizeFileName(filename);
                const buffer = await readRequestBuffer(req, MAX_UPLOAD_BYTES);
                if (!buffer.length) {
                    const error = new Error("The uploaded file is empty.");
                    error.statusCode = 400;
                    throw error;
                }
                const contentType = String(req.headers["content-type"] || "application/octet-stream");
                const safeContentType = /^[\w.+-]+\/[\w.+-]+$/.test(contentType) ? contentType : "application/octet-stream";
                const storagePath = `${scope.prefix}/${crypto.randomUUID()}__${safeName}`;
                const { error } = await bucket.upload(storagePath, buffer, {
                    contentType: safeContentType,
                    upsert: false
                });
                if (error) throw error;
                sendJson(res, 201, { success: true, filename: safeName, path: storagePath, size: buffer.length });
                return;
            }

            if (!objectPath) {
                const error = new Error("Missing file path.");
                error.statusCode = 400;
                throw error;
            }
            if (!validObjectPath) {
                const error = new Error("You do not have access to this file.");
                error.statusCode = 403;
                throw error;
            }
            const { error } = await bucket.remove([objectPath]);
            if (error) throw error;
            sendJson(res, 200, { success: true, path: objectPath });
        })().catch(respondWithError);
        return;
    }

    let filePath = path.join(rootDir, pathname === "/" ? "main.html" : pathname);
    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    if (!fs.existsSync(filePath)) {
        const fallbackPath = path.join(rootDir, "web", pathname === "/" ? "main.html" : pathname.replace(/^\/+/, ""));
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
        requireSupabase();
        initializeRealtime();
        const server = http.createServer(handleRequest);
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`LMS server running at http://localhost:${PORT}`);
            console.log(`Use Ctrl+C to stop.`);
        });
    } catch (error) {
        console.error("Failed to initialize LMS server:", error);
        process.exit(1);
    }
})();

