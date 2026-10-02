const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");


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


function getSupabaseClientOrNull() {
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !key) return null;
    return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false }
  });
}


const supabase = getSupabaseClientOrNull();

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

async function getUserData() {
    // Service role bypasses RLS; requires SUPABASE_SERVICE_ROLE_KEY.
    requireSupabase();
    const { data, error } = await supabase
        .from("users")
        .select("email, name, status, preferences, passwordHash, school_id, createdAt, lastSignedIn, enrolledClasses, taughtClasses");

    if (error) throw error;

    return (data || []).map((row) => ({
        email: row.email,
        name: row.name,
        status: row.status,
        preferences: row.preferences || {},
        passwordHash: row.passwordHash,
        school_id: row.school_id || null,
        createdAt: row.createdAt,
        lastSignedIn: row.lastSignedIn,
        enrolledClasses: row.enrolledClasses || [],
        taughtClasses: row.taughtClasses || []
    }));
}


async function saveUserData(updatedUsers) {
    // Upsert changed records without deleting users or clearing fields omitted by the client.
    try {
        for (const user of updatedUsers) {
            let passwordHash = String(user.passwordHash || "").trim();

            const record = {
                email: String(user.email || ""),
                name: String(user.name || ""),
                status: String(user.status || ""),
                preferences: user.preferences || {},
                school_id: user.school_id || null,
                createdAt: String(user.createdAt || ""),
                lastSignedIn: String(user.lastSignedIn || ""),
                enrolledClasses: user.enrolledClasses || [],
                taughtClasses: user.taughtClasses || []
            };

            // Do not overwrite a real hash when a sanitized browser user is saved.
            if (passwordHash) record.passwordHash = passwordHash;

            const { error: upsertError } = await supabase.from("users").upsert(record, { onConflict: "email" });
            if (upsertError) throw upsertError;
        }

        return updatedUsers;
    } catch (error) {
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
                    const email = payload.email;
                    const config_json = payload.config_json;

                    if (!email || !config_json) {
                        sendJson(res, 400, { success: false, error: "Missing email or config_json" });
                        return;
                    }

                    requireSupabase();
                    const normalizedEmail = String(email).trim().toLowerCase();

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

                    const { error: upErr } = await supabase
                        .from("schools")
                        .update({ config_json })
                        .eq("id", schoolId);

                    if (upErr) throw upErr;

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

