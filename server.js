const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { run, get, all, initDb, seedData } = require("./server_db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_in_production";
const OWNER_PHONE = process.env.OWNER_PHONE || "01070618829";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "123456";

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".png");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDir));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "main.html"));
});
app.use(express.static(__dirname));

function tokenFor(payload, expiresIn = "12h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function generateAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (_err) {
    return "";
  }
}

function generatePaymentReference(prefix = "FW") {
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${Date.now()}-${rand}`;
}

function parsePriceEgpToCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return null;
  if (num === 0) return 0;
  if (!Number.isInteger(num)) return null;
  if (num < 5 || num > 600) return null;
  if (num % 5 !== 0) return null;
  return num * 100;
}

function normalizeForumStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "open" || v === "answered") return v;
  return "";
}

let accessCodeSchemaReady = false;
async function ensureAccessCodeSchema() {
  if (accessCodeSchemaReady) return;

  await run(`
    CREATE TABLE IF NOT EXISTS access_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `);

  const patchColumn = async (columnSql) => {
    try {
      await run(`ALTER TABLE access_codes ADD COLUMN ${columnSql}`);
    } catch (_err) {
      // Column already exists in updated databases.
    }
  };

  await patchColumn("expires_at TEXT");
  await patchColumn("used_at TEXT");
  await patchColumn("created_at TEXT DEFAULT (datetime('now'))");
  accessCodeSchemaReady = true;
}

let lessonViewsSchemaReady = false;
async function ensureLessonViewsSchema() {
  if (lessonViewsSchemaReady) return;
  try {
    await run(`
      CREATE TABLE IF NOT EXISTS lesson_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        lesson_id INTEGER NOT NULL,
        last_viewed_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(student_id, lesson_id),
        FOREIGN KEY(student_id) REFERENCES students(id),
        FOREIGN KEY(lesson_id) REFERENCES lessons(id)
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_lesson_views_student_lesson ON lesson_views(student_id, lesson_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_lesson_views_last ON lesson_views(last_viewed_at)");
    lessonViewsSchemaReady = true;
  } catch (_err) {
    // ignore - best effort
  }
}

async function getStudentSubscriptions(studentId) {
  const rows = await all(
    "SELECT kind, course_id AS courseId, lesson_id AS lessonId FROM subscriptions WHERE student_id = ?",
    [studentId]
  );
  const courseIds = new Set();
  const lessonIds = new Set();
  rows.forEach((r) => {
    if (r.kind === "course" && r.courseId) courseIds.add(Number(r.courseId));
    if (r.kind === "lesson" && r.lessonId) lessonIds.add(Number(r.lessonId));
  });
  return { courseIds, lessonIds };
}

async function canAccessLesson(studentId, lessonId) {
  const lesson = await get(
    `SELECT l.id, l.course_id AS courseId, COALESCE(l.is_individual, 0) AS isIndividual,
            COALESCE(l.individual_price_cents, COALESCE(l.price_cents, 0)) AS lessonPriceCents,
            c.id AS courseId2, COALESCE(c.price_cents, 0) AS coursePriceCents
     FROM lessons l
     JOIN courses c ON c.id = l.course_id
     WHERE l.id = ?`,
    [lessonId]
  );
  if (!lesson) return { ok: false, reason: "lesson_not_found" };

  const subs = await getStudentSubscriptions(studentId);
  const hasCourse = subs.courseIds.has(Number(lesson.courseId));
  const hasLesson = subs.lessonIds.has(Number(lesson.id));

  if (hasCourse) return { ok: true };
  if (hasLesson) return { ok: true };

  const coursePrice = Number(lesson.coursePriceCents) || 0;
  const isIndividual = Number(lesson.isIndividual || 0) === 1;
  const lessonPrice = Number(lesson.lessonPriceCents) || 0;

  if (coursePrice <= 0) return { ok: true };
  if (!isIndividual) return { ok: false, reason: "course_subscription_required" };
  if (lessonPrice <= 0) return { ok: true };
  return { ok: false, reason: "subscription_required" };
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (_e) {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ error: "Owner only" });
  }
  next();
}

function requireGuardian(req, res, next) {
  if (!req.user || req.user.role !== "guardian") {
    return res.status(403).json({ error: "Guardian only" });
  }
  next();
}

function gradeLikePattern(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.includes("الأول")) return "%الأول%";
  if (v.includes("الثاني")) return "%الثاني%";
  if (v.includes("الثالث")) return "%الثالث%";
  return "";
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function requireStaff(req, res, next) {
  if (!req.user || (req.user.role !== "owner" && req.user.role !== "supervisor")) {
    return res.status(403).json({ error: "Owner only" });
  }
  next();
}

const PERMS = {
  COURSES_WRITE: "courses:write",
  LESSONS_WRITE: "lessons:write",
  ASSESSMENTS_WRITE: "assessments:write",
  QUESTIONS_WRITE: "questions:write",
  FORUM_REPLY: "forum:reply",
  UPLOAD_WRITE: "upload:write",
  STUDENTS_READ: "students:read",
  ALERTS_READ: "alerts:read",
  STUDENTS_CODES_WRITE: "students:codes:write",
  NOTIFICATIONS_SEND: "notifications:send",
  ATTEMPTS_READ: "attempts:read",
  PAYMENTS_READ: "payments:read",
  PAYMENTS_APPROVE: "payments:approve",
  SUBSCRIBERS_READ: "subscribers:read",
  GUARDIAN_MANAGE: "guardian:manage",
  SUPERVISORS_MANAGE: "supervisors:manage",
  AUDIT_READ: "audit:read"
};

const supervisorPermCache = new Map(); // id -> { perms:Set, expiresAt:number }
async function getSupervisorPerms(supervisorId) {
  const id = Number(supervisorId);
  if (!id) return new Set();
  const cached = supervisorPermCache.get(id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.perms;

  const row = await get("SELECT permissions_json FROM supervisors WHERE id = ?", [id]);
  let perms = [];
  try {
    perms = row?.permissions_json ? JSON.parse(String(row.permissions_json)) : [];
  } catch (_e) {
    perms = [];
  }
  const set = new Set(Array.isArray(perms) ? perms.map(String) : []);
  supervisorPermCache.set(id, { perms: set, expiresAt: now + 60 * 1000 });
  return set;
}

function requireStaffPerm(...required) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role === "owner") return next();
    if (req.user.role !== "supervisor") return res.status(403).json({ error: "Owner only" });

    const perms = await getSupervisorPerms(req.user.supervisorId);
    const ok = required.every((p) => perms.has(p));
    if (!ok) return res.status(403).json({ error: "Permission denied" });
    next();
  };
}

function requireStaffAnyPerm(...anyOf) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role === "owner") return next();
    if (req.user.role !== "supervisor") return res.status(403).json({ error: "Owner only" });

    const perms = await getSupervisorPerms(req.user.supervisorId);
    const ok = anyOf.some((p) => perms.has(p));
    if (!ok) return res.status(403).json({ error: "Permission denied" });
    next();
  };
}

async function logAudit(req, action, targetType = "", targetId = null, metadata = {}) {
  try {
    const actorRole = req.user?.role || "unknown";
    const actorId = actorRole === "supervisor" ? Number(req.user.supervisorId) : null;
    await run(
      "INSERT INTO audit_log (actor_role, actor_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)",
      [
        actorRole,
        actorId || null,
        String(action),
        String(targetType || ""),
        targetId === null || targetId === undefined ? null : Number(targetId),
        safeJsonStringify(metadata)
      ]
    );
  } catch (_err) {
    // ignore audit failures
  }
}

function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== "student") {
    return res.status(403).json({ error: "Student only" });
  }
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: "You must change password first" });
  }
  next();
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      firstName,
      secondName,
      thirdName,
      phone,
      email,
      guardianPhone,
      grade,
      governorate,
      branch,
      subject,
      password
    } = req.body;

    if (!firstName || !phone || !password || !email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const exists = await get("SELECT id FROM students WHERE phone = ?", [phone]);
    if (exists) {
      return res.status(409).json({ error: "Phone already registered" });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const emailExists = await get("SELECT id FROM students WHERE lower(email) = lower(?)", [normalizedEmail]);
    if (emailExists) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const fullName = [firstName, secondName, thirdName].filter(Boolean).join(" ").trim();
    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO students (full_name, phone, email, password_hash, guardian_phone, grade, governorate, branch, subject)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fullName, phone, normalizedEmail, hash, guardianPhone || "", grade || "", governorate || "", branch || "", subject || ""]
    );

    const token = tokenFor({ role: "student", studentId: result.lastID, phone });
    res.json({ token, role: "student" });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: "Missing credentials" });

    if (phone === OWNER_PHONE && password === OWNER_PASSWORD) {
      return res.json({
        token: tokenFor({ role: "owner", ownerPhone: OWNER_PHONE }),
        role: "owner"
      });
    }

    const supervisor = await get("SELECT id, phone, password_hash, permissions_json FROM supervisors WHERE phone = ?", [phone]);
    if (supervisor) {
      const ok = await bcrypt.compare(password, supervisor.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      supervisorPermCache.delete(Number(supervisor.id));
      return res.json({
        token: tokenFor({ role: "supervisor", supervisorId: supervisor.id, phone: supervisor.phone }),
        role: "supervisor",
        permissions: supervisor.permissions_json ? JSON.parse(String(supervisor.permissions_json)) : []
      });
    }

    const student = await get("SELECT * FROM students WHERE phone = ?", [phone]);
    if (!student) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, student.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      token: tokenFor({ role: "student", studentId: student.id, phone }),
      role: "student"
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

app.post("/api/guardian/login", async (req, res) => {
  try {
    const phoneRaw = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const phone = normalizePhoneDigits(phoneRaw);
    if (!phone || !password) return res.status(400).json({ error: "Missing credentials" });
    if (password.length < 6) return res.status(401).json({ error: "Invalid credentials" });

    const guardian = await get("SELECT id, phone, password_hash FROM guardians WHERE phone = ?", [phone]);
    if (!guardian) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, guardian.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ token: tokenFor({ role: "guardian", guardianPhone: phone }), role: "guardian" });
  } catch (err) {
    res.status(500).json({ error: "Guardian login failed", details: err.message });
  }
});

app.post("/api/guardian/request-access", async (req, res) => {
  try {
    const phoneRaw = String(req.body.phone || "").trim();
    const phone = normalizePhoneDigits(phoneRaw);
    if (!phone) return res.status(400).json({ error: "رقم ولي الأمر مطلوب." });

    const guardian = await get("SELECT id FROM guardians WHERE phone = ?", [phone]);
    if (guardian) {
      return res.json({
        success: true,
        alreadyHasPassword: true,
        message: "هذا الرقم لديه كلمة سر بالفعل. استخدم تسجيل الدخول أو طلب استعادة كلمة السر."
      });
    }

    const existingPending = await get(
      "SELECT id FROM guardian_access_requests WHERE phone = ? AND request_type = 'access' AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [phone]
    );
    if (!existingPending) {
      await run(
        "INSERT INTO guardian_access_requests (phone, request_type, status) VALUES (?, 'access', 'pending')",
        [phone]
      );
    }
    res.json({ success: true, alreadyPending: !!existingPending });
  } catch (err) {
    res.status(500).json({ error: "Request failed", details: err.message });
  }
});

app.post("/api/guardian/request-password-reset", async (req, res) => {
  try {
    const phoneRaw = String(req.body.phone || "").trim();
    const guardianName = String(req.body.guardianName || "").trim();
    const hasWhatsapp = req.body.hasWhatsapp === false ? 0 : 1;
    const phone = normalizePhoneDigits(phoneRaw);
    if (!phone) return res.status(400).json({ error: "رقم ولي الأمر مطلوب." });

    // لا يقبل طلب استعادة جديد لنفس الرقم إلا بعد تأكيد المالك للطلب السابق.
    const activeReset = await get(
      `SELECT id, status
       FROM guardian_access_requests
       WHERE phone = ? AND request_type = 'reset' AND status IN ('pending', 'ready_to_send')
       ORDER BY id DESC
       LIMIT 1`,
      [phone]
    );
    if (activeReset) {
      await run(
        "INSERT INTO guardian_access_requests (phone, guardian_name, has_whatsapp, request_type, status) VALUES (?, ?, ?, 'reset', 'cooldown_blocked')",
        [phone, guardianName || null, hasWhatsapp]
      );
      return res.json({
        success: true,
        blocked: true,
        message: "طلب الاستعادة قيد المعالجة. انتظر تأكيد المالك بعد إرسال كلمة السر الجديدة."
      });
    }

    const existingPending = await get(
      "SELECT id FROM guardian_access_requests WHERE phone = ? AND request_type = 'reset' AND status = 'pending' ORDER BY id DESC LIMIT 1",
      [phone]
    );
    if (!existingPending) {
      await run(
        "INSERT INTO guardian_access_requests (phone, guardian_name, has_whatsapp, request_type, status) VALUES (?, ?, ?, 'reset', 'pending')",
        [phone, guardianName || null, hasWhatsapp]
      );
    }

    const ownerWhatsapp = "201070618829";
    const whatsappText = encodeURIComponent(
      `استعادة كلمة السر - ولي الأمر\n` +
      `رقم ولي الأمر: ${phone}\n` +
      `اسم ولي الأمر: ${guardianName || "-"}`
    );

    res.json({
      success: true,
      alreadyPending: !!existingPending,
      message: "سيتم إرسال لك كلمة السر الخاص بك عبر واتساب أو sms.",
      whatsappUrl: hasWhatsapp ? `https://wa.me/${ownerWhatsapp}?text=${whatsappText}` : ""
    });
  } catch (err) {
    res.status(500).json({ error: "Reset request failed", details: err.message });
  }
});

app.post("/api/auth/login-code", async (req, res) => {
  try {
    await ensureAccessCodeSchema();
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: "Missing phone or code" });

    const student = await get("SELECT id, phone FROM students WHERE phone = ?", [phone]);
    if (!student) return res.status(401).json({ error: "Invalid phone or code" });

    const latestCode = await get(
      `SELECT id, code, expires_at, used_at
       FROM access_codes
       WHERE student_id = ? AND used_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [student.id]
    );

    if (!latestCode) return res.status(401).json({ error: "No active code for this phone" });
    if (String(latestCode.code) !== String(code).trim()) {
      return res.status(401).json({ error: "Invalid code for this phone" });
    }
    if (latestCode.used_at) return res.status(401).json({ error: "Code already used" });

    const now = new Date();
    const expiresAt = new Date(latestCode.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < now) {
      return res.status(401).json({ error: "Code expired" });
    }

    await run("UPDATE access_codes SET used_at = datetime('now') WHERE id = ?", [latestCode.id]);

    const token = tokenFor(
      { role: "student", studentId: student.id, phone: student.phone, mustChangePassword: true, codeLogin: true },
      "2h"
    );

    res.json({ token, role: "student", mustChangePassword: true });
  } catch (err) {
    res.status(500).json({ error: "Code login failed", details: err.message });
  }
});

app.post("/api/auth/request-reset-code", async (req, res) => {
  try {
    await ensureAccessCodeSchema();
    const { phone, email } = req.body;
    if (!phone) return res.status(400).json({ error: "رقم الهاتف مطلوب." });
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب." });

    const normalizedPhone = String(phone || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const studentByPhone = await get("SELECT id, full_name, phone, email FROM students WHERE phone = ?", [normalizedPhone]);
    if (!studentByPhone) {
      return res.status(404).json({ error: "عذراً هذا الرقم غير مسجل به على المنصة." });
    }

    const studentByEmail = await get("SELECT id, phone FROM students WHERE lower(email) = lower(?)", [normalizedEmail]);
    if (!studentByEmail) {
      return res.status(404).json({ error: "عذراً هذا البريد الإلكتروني غير مسجل به على المنصة." });
    }

    if (Number(studentByPhone.id) !== Number(studentByEmail.id)) {
      return res.status(400).json({ error: "عذراً الرقم والبريد الإلكتروني غير مرتبطين بنفس الحساب." });
    }

    const code = generateAccessCode();
    await run("UPDATE access_codes SET used_at = datetime('now') WHERE student_id = ? AND used_at IS NULL", [studentByPhone.id]);
    await run(
      "INSERT INTO access_codes (student_id, code, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))",
      [studentByPhone.id, code]
    );

    const ownerWhatsapp = "201070618829";
    const whatsappText = encodeURIComponent(
      `طلب استعادة كلمة السر\n` +
      `اسم الطالب: ${studentByPhone.full_name}\n` +
      `رقم الطالب: ${studentByPhone.phone}\n` +
      `تم إنشاء كود صالح لمدة 24 ساعة في لوحة التحكم.`
    );

    res.json({
      message: "تم استلام الطلب بنجاح. سيتم التواصل معك بعد مراجعة الرقم.",
      expiresInHours: 24,
      whatsappUrl: `https://wa.me/${ownerWhatsapp}?text=${whatsappText}`
    });
  } catch (err) {
    res.status(500).json({ error: "تعذر إرسال طلب استعادة كلمة السر.", details: err.message });
  }
});

app.post("/api/auth/change-password-with-code", requireAuth, async (req, res) => {
  try {
    if (!req.user || req.user.role !== "student" || !req.user.codeLogin) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);
    await run("UPDATE students SET password_hash = ? WHERE id = ?", [hash, req.user.studentId]);

    const student = await get("SELECT phone FROM students WHERE id = ?", [req.user.studentId]);
    const token = tokenFor({ role: "student", studentId: req.user.studentId, phone: student?.phone || "" });
    res.json({ token, role: "student" });
  } catch (err) {
    res.status(500).json({ error: "Change password failed", details: err.message });
  }
});

app.get("/api/guardian/children", requireAuth, requireGuardian, async (req, res) => {
  const phone = normalizePhoneDigits(req.user.guardianPhone || "");
  if (!phone) return res.json({ children: [] });

  const rows = await all(
    "SELECT id, full_name, phone, grade, created_at FROM students WHERE guardian_phone = ? ORDER BY id DESC",
    [phone]
  );
  res.json({ children: rows || [] });
});

app.get("/api/guardian/progress", requireAuth, requireGuardian, async (req, res) => {
  try {
    await ensureLessonViewsSchema();
    const guardianPhone = normalizePhoneDigits(req.user.guardianPhone || "");
    const studentId = Number(req.query.studentId || 0);
    if (!guardianPhone) return res.status(400).json({ error: "Invalid guardian" });
    if (!studentId) return res.status(400).json({ error: "studentId is required" });

    const student = await get(
      "SELECT id, full_name, phone, guardian_phone, grade FROM students WHERE id = ?",
      [studentId]
    );
    if (!student) return res.status(404).json({ error: "Student not found" });
    const studentGuardianPhone = normalizePhoneDigits(student.guardian_phone || "");
    if (studentGuardianPhone !== guardianPhone) return res.status(403).json({ error: "Guardian only" });

    const grade = String(student.grade || "").trim();
    const courseGradeWhere = grade
      ? (() => {
          const pat = gradeLikePattern(grade);
          if (pat) return { sql: "(c.grade IS NULL OR c.grade = '' OR c.grade LIKE ?)", params: [pat] };
          return { sql: "(c.grade IS NULL OR c.grade = '' OR c.grade = ?)", params: [grade] };
        })()
      : { sql: "1=1", params: [] };

    const lessons = await all(
      `SELECT
         l.id AS lesson_id,
         l.title AS lesson_title,
         l.position AS lesson_position,
         c.id AS course_id,
         c.title AS course_title,
         lv.created_at AS viewed_at
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       LEFT JOIN subscriptions sc ON sc.student_id = ? AND sc.kind = 'course' AND sc.course_id = c.id
       LEFT JOIN subscriptions sl ON sl.student_id = ? AND sl.kind = 'lesson' AND sl.lesson_id = l.id
       LEFT JOIN lesson_views lv ON lv.student_id = ? AND lv.lesson_id = l.id
       WHERE ${courseGradeWhere.sql}
         AND (
           sc.id IS NOT NULL OR sl.id IS NOT NULL OR COALESCE(c.price_cents, 0) <= 0
         )
         AND (
           trim(COALESCE(l.video_url, '')) <> '' OR
           trim(COALESCE(l.explain_file_url, '')) <> '' OR
           trim(COALESCE(l.solution_video_url, '')) <> '' OR
           trim(COALESCE(l.solution_file_url, '')) <> ''
         )
       ORDER BY c.id DESC, l.position, l.id`,
      [studentId, studentId, studentId, ...courseGradeWhere.params]
    );

    const assessments = await all(
      `SELECT
         ass.id AS assessment_id,
         ass.type AS assessment_type,
         ass.title AS assessment_title,
         l.id AS lesson_id,
         l.title AS lesson_title,
         c.id AS course_id,
         c.title AS course_title,
         a.id AS attempt_id,
         a.score AS score,
         a.total AS total,
         a.created_at AS attempt_at
       FROM assessments ass
       JOIN lessons l ON l.id = ass.lesson_id
       JOIN courses c ON c.id = l.course_id
       LEFT JOIN subscriptions sc ON sc.student_id = ? AND sc.kind = 'course' AND sc.course_id = c.id
       LEFT JOIN subscriptions sl ON sl.student_id = ? AND sl.kind = 'lesson' AND sl.lesson_id = l.id
       LEFT JOIN attempts a ON a.id = (
         SELECT a2.id
         FROM attempts a2
         WHERE a2.student_id = ? AND a2.assessment_id = ass.id
         ORDER BY a2.id ASC
         LIMIT 1
       )
       WHERE ${courseGradeWhere.sql}
         AND (
           sc.id IS NOT NULL OR sl.id IS NOT NULL OR COALESCE(c.price_cents, 0) <= 0
         )
       ORDER BY c.id DESC, l.position, ass.id`,
      [studentId, studentId, studentId, ...courseGradeWhere.params]
    );

    res.json({
      student: {
        id: student.id,
        full_name: student.full_name,
        phone: student.phone,
        grade: student.grade
      },
      lessons: (lessons || []).map((r) => ({
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        position: r.lesson_position,
        courseId: r.course_id,
        courseTitle: r.course_title,
        opened: !!r.viewed_at,
        openedAt: r.viewed_at || null
      })),
      assessments: (assessments || []).map((r) => ({
        assessmentId: r.assessment_id,
        type: r.assessment_type,
        title: r.assessment_title,
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        courseId: r.course_id,
        courseTitle: r.course_title,
        attempted: !!r.attempt_id,
        score: r.attempt_id ? Number(r.score || 0) : null,
        total: r.attempt_id ? Number(r.total || 0) : null,
        attemptAt: r.attempt_at || null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load guardian progress", details: err.message });
  }
});

app.get("/api/student/profile", requireAuth, requireStudent, async (req, res) => {
  const student = await get(
    "SELECT id, full_name, phone, guardian_phone, grade, governorate, branch, subject, created_at FROM students WHERE id = ?",
    [req.user.studentId]
  );
  res.json(student || {});
});

app.get("/api/student/courses", requireAuth, requireStudent, async (_req, res) => {
  const scope = String(_req.query.scope || "mine").trim().toLowerCase();
  const student = await get("SELECT grade FROM students WHERE id = ?", [_req.user.studentId]);
  const studentGrade = student?.grade || "";

  const courses =
    scope === "all"
      ? await all(
          `SELECT id, title, description, image_url, COALESCE(price_cents, 0) AS price_cents, subject, grade
           FROM courses
           ORDER BY id DESC`
        )
      : await all(
          `SELECT id, title, description, image_url, COALESCE(price_cents, 0) AS price_cents, subject, grade
           FROM courses
           WHERE (grade IS NULL OR grade = '' OR grade = ?)
           ORDER BY id DESC`,
          [studentGrade]
        );
  const lessons = await all(
    `SELECT
      id,
      course_id,
      title,
      description,
      image_url,
      COALESCE(price_cents, 0) AS price_cents,
      COALESCE(is_individual, 0) AS is_individual,
      COALESCE(individual_price_cents, COALESCE(price_cents, 0)) AS individual_price_cents,
      COALESCE(individual_image_url, '') AS individual_image_url,
      video_url,
      explain_file_url,
      solution_video_url,
      solution_file_url,
      position
     FROM lessons
     ORDER BY course_id, position, id`
  );
  const assessments = await all(
    "SELECT id, lesson_id, type, title, duration_minutes FROM assessments ORDER BY lesson_id, id"
  );
  const lessonViews = await all(
    "SELECT lesson_id, last_viewed_at FROM lesson_views WHERE student_id = ?",
    [_req.user.studentId]
  );
  const lessonViewById = new Map(lessonViews.map((r) => [Number(r.lesson_id), r.last_viewed_at || null]));

  const subs = await getStudentSubscriptions(_req.user.studentId);
  const coursePriceById = new Map(courses.map((c) => [Number(c.id), Number(c.price_cents) || 0]));
  const pendingCourseRequests = await all(
    `SELECT course_id, reference, expires_at
     FROM payment_requests
     WHERE student_id = ? AND kind = 'course' AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [_req.user.studentId]
  );
  const pendingCourseById = new Map(
    pendingCourseRequests.map((r) => [Number(r.course_id), { reference: r.reference, expires_at: r.expires_at }])
  );

	  const lessonsByCourse = new Map();
	  lessons.forEach((lesson) => {
	    if (!lessonsByCourse.has(lesson.course_id)) lessonsByCourse.set(lesson.course_id, []);
	    const courseId = Number(lesson.course_id);
	    const coursePrice = coursePriceById.get(courseId) || 0;
	    const hasVideoUrl = Boolean(String(lesson.video_url || "").trim());
	    const hasExplainFileUrl = Boolean(String(lesson.explain_file_url || "").trim());
	    const hasSolutionVideoUrl = Boolean(String(lesson.solution_video_url || "").trim());
	    const hasSolutionFileUrl = Boolean(String(lesson.solution_file_url || "").trim());
	    const isUnlocked =
	      subs.courseIds.has(courseId) ||
	      subs.lessonIds.has(Number(lesson.id)) ||
	      coursePrice <= 0;

	    lessonsByCourse.get(lesson.course_id).push({
	      ...lesson,
	      has_video_url: hasVideoUrl,
	      has_explain_file_url: hasExplainFileUrl,
	      has_solution_video_url: hasSolutionVideoUrl,
	      has_solution_file_url: hasSolutionFileUrl,
	      opened: lessonViewById.has(Number(lesson.id)),
	      opened_at: lessonViewById.get(Number(lesson.id)) || null,
	      isUnlocked,
	      locked: !isUnlocked,
	      files: assessments.filter((a) => a.lesson_id === lesson.id)
	    });
	  });

  const result = courses.map((course) => {
    const courseId = Number(course.id);
    const isSubscribed = subs.courseIds.has(courseId) || (Number(course.price_cents) || 0) <= 0;

    const rawLessons = lessonsByCourse.get(course.id) || [];
    const safeLessons = rawLessons.map((l) => {
      if (l.isUnlocked) return l;
      return {
        ...l,
        video_url: "",
        explain_file_url: "",
        solution_video_url: "",
        solution_file_url: ""
      };
    });

    return {
      ...course,
      isSubscribed,
      pendingRequest: pendingCourseById.get(courseId) || null,
      lessons: safeLessons
    };
  });

  res.json(result);
});

app.post("/api/student/lessons/:id/view", requireAuth, requireStudent, async (req, res) => {
  try {
    const lessonId = Number(req.params.id);
    if (!lessonId) return res.status(400).json({ error: "Invalid lesson id" });

    const access = await canAccessLesson(req.user.studentId, lessonId);
    if (!access.ok) return res.status(403).json({ error: "هذه المحاضرة غير متاحة إلا بعد الاشتراك." });

    await ensureLessonViewsSchema();
    await run(
      `INSERT INTO lesson_views (student_id, lesson_id, last_viewed_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(student_id, lesson_id) DO UPDATE SET last_viewed_at = datetime('now')`,
      [req.user.studentId, lessonId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark lesson as viewed", details: err.message });
  }
});

app.get("/api/student/individual-lessons", requireAuth, requireStudent, async (req, res) => {
  try {
    const student = await get("SELECT grade FROM students WHERE id = ?", [req.user.studentId]);
    const studentGrade = student?.grade || "";

    const subs = await getStudentSubscriptions(req.user.studentId);

    const rows = await all(
      `SELECT
        l.id,
        l.course_id,
        l.title,
        l.description,
        COALESCE(NULLIF(l.individual_image_url, ''), c.image_url, '') AS lesson_image_url,
        COALESCE(l.individual_price_cents, COALESCE(l.price_cents, 0)) AS lesson_price_cents,
        COALESCE(l.is_individual, 0) AS is_individual,
        c.title AS course_title,
        c.subject AS course_subject,
        c.grade AS course_grade,
        COALESCE(c.price_cents, 0) AS course_price_cents
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       WHERE (c.grade IS NULL OR c.grade = '' OR c.grade = ?)
         AND COALESCE(l.is_individual, 0) = 1
       ORDER BY l.course_id, l.position, l.id`,
      [studentGrade]
    );

    const result = rows.map((r) => {
      const courseId = Number(r.course_id);
      const lessonId = Number(r.id);
      const isUnlocked = subs.courseIds.has(courseId) || subs.lessonIds.has(lessonId);
      return {
        id: r.id,
        course_id: r.course_id,
        title: r.title,
        description: r.description || "",
        image_url: r.lesson_image_url || "",
        price_cents: r.lesson_price_cents,
        course_title: r.course_title || "",
        course_subject: r.course_subject || "",
        isUnlocked
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to load individual lessons", details: err.message });
  }
});

app.post("/api/student/subscribe/course", requireAuth, requireStudent, async (req, res) => {
  try {
    const courseId = Number(req.body.courseId);
    if (!courseId) return res.status(400).json({ error: "Invalid course id" });

    const course = await get(
      "SELECT id, title, COALESCE(price_cents, 0) AS price_cents FROM courses WHERE id = ?",
      [courseId]
    );
    if (!course) return res.status(404).json({ error: "Course not found" });

    const price = Number(course.price_cents) || 0;
    const hasSub = await get(
      "SELECT id FROM subscriptions WHERE student_id = ? AND kind = 'course' AND course_id = ?",
      [req.user.studentId, courseId]
    );
    if (hasSub) return res.json({ success: true, message: "أنت مشترك بالفعل في هذا الكورس." });

    if (price <= 0) {
      await run("INSERT INTO subscriptions (student_id, kind, course_id) VALUES (?, 'course', ?)", [
        req.user.studentId,
        courseId
      ]);
      await logAudit(req, "student.subscribe.course.free", "course", courseId, { price_cents: 0 });
      return res.json({ success: true, message: "تم الاشتراك في الكورس (مجانًا)." });
    }

    await run(
      `UPDATE payment_requests
       SET status = 'expired', decided_at = datetime('now')
       WHERE student_id = ? AND kind = 'course' AND course_id = ? AND status = 'pending'
         AND expires_at IS NOT NULL AND expires_at <= datetime('now')`,
      [req.user.studentId, courseId]
    );

    const existingPending = await get(
      `SELECT id, reference, amount_cents, expires_at, created_at
       FROM payment_requests
       WHERE student_id = ? AND kind = 'course' AND course_id = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.studentId, courseId]
    );

    if (existingPending) {
      return res.json({
        success: true,
        status: "pending",
        reference: existingPending.reference,
        amount_cents: existingPending.amount_cents,
        expires_at: existingPending.expires_at,
        message:
          `لديك طلب اشتراك نشط بالفعل لهذا الكورس.\n` +
          `رقم المرجع: ${existingPending.reference}.\n` +
          `صلاحية الرقم حتى: ${existingPending.expires_at || "غير محدد"}.`
      });
    }

    const reference = generatePaymentReference("FW-C");
    const insert = await run(
      `INSERT INTO payment_requests (student_id, kind, course_id, amount_cents, status, payment_method, reference, expires_at)
       VALUES (?, 'course', ?, ?, 'pending', 'fawry', ?, datetime('now', '+8 hours'))`,
      [req.user.studentId, courseId, price, reference]
    );
    const inserted = await get("SELECT expires_at FROM payment_requests WHERE id = ?", [insert.lastID]);
    await logAudit(req, "student.subscribe.course.pending", "course", courseId, {
      reference,
      amount_cents: price
    });

    res.json({
      success: true,
      status: "pending",
      reference,
      amount_cents: price,
      expires_at: inserted?.expires_at || null,
      message:
        `تم إنشاء طلب اشتراك للكورس "${course.title}".\n` +
        `المبلغ: ${(price / 100).toFixed(2)} جنيه.\n` +
        `رقم المرجع: ${reference}.\n` +
        `ادفع عبر فوري ثم أرسل رقم المرجع للمالك لتفعيل الاشتراك.`
    });
  } catch (err) {
    res.status(500).json({ error: "Subscribe failed", details: err.message });
  }
});

app.post("/api/student/subscribe/lesson", requireAuth, requireStudent, async (req, res) => {
  try {
    const lessonId = Number(req.body.lessonId);
    if (!lessonId) return res.status(400).json({ error: "Invalid lesson id" });

    const lesson = await get(
      `SELECT
         l.id,
         l.title,
         l.course_id AS courseId,
         COALESCE(l.is_individual, 0) AS is_individual,
         COALESCE(l.individual_price_cents, COALESCE(l.price_cents, 0)) AS lesson_price,
              COALESCE(c.price_cents, 0) AS course_price
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       WHERE l.id = ?`,
      [lessonId]
    );
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const hasLessonSub = await get(
      "SELECT id FROM subscriptions WHERE student_id = ? AND kind = 'lesson' AND lesson_id = ?",
      [req.user.studentId, lessonId]
    );
    if (hasLessonSub) return res.json({ success: true, message: "أنت مشترك بالفعل في هذه المحاضرة." });

    const hasCourseSub = await get(
      "SELECT id FROM subscriptions WHERE student_id = ? AND kind = 'course' AND course_id = ?",
      [req.user.studentId, Number(lesson.courseId)]
    );
    if (hasCourseSub) return res.json({ success: true, message: "أنت مشترك في الكورس بالفعل، والمحاضرة مفتوحة لك." });

    const lessonPrice = Number(lesson.lesson_price) || 0;
    const coursePrice = Number(lesson.course_price) || 0;
    const isIndividual = Number(lesson.is_individual || 0) === 1;

    if (!isIndividual) {
      return res.status(400).json({ error: "هذه المحاضرة داخل الكورس فقط. اشترك في الكورس لفتحها." });
    }

    if (coursePrice <= 0 || lessonPrice <= 0) {
      await run("INSERT INTO subscriptions (student_id, kind, lesson_id) VALUES (?, 'lesson', ?)", [
        req.user.studentId,
        lessonId
      ]);
      await logAudit(req, "student.subscribe.lesson.free", "lesson", lessonId, { price_cents: 0 });
      return res.json({ success: true, message: "تم فتح المحاضرة (مجانًا)." });
    }

    await run(
      `UPDATE payment_requests
       SET status = 'expired', decided_at = datetime('now')
       WHERE student_id = ? AND kind = 'lesson' AND lesson_id = ? AND status = 'pending'
         AND expires_at IS NOT NULL AND expires_at <= datetime('now')`,
      [req.user.studentId, lessonId]
    );

    const existingPending = await get(
      `SELECT id, reference, amount_cents, expires_at, created_at
       FROM payment_requests
       WHERE student_id = ? AND kind = 'lesson' AND lesson_id = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY id DESC
       LIMIT 1`,
      [req.user.studentId, lessonId]
    );

    if (existingPending) {
      return res.json({
        success: true,
        status: "pending",
        reference: existingPending.reference,
        amount_cents: existingPending.amount_cents,
        expires_at: existingPending.expires_at,
        message:
          `لديك طلب اشتراك نشط بالفعل لهذه المحاضرة.\n` +
          `رقم المرجع: ${existingPending.reference}.\n` +
          `صلاحية الرقم حتى: ${existingPending.expires_at || "غير محدد"}.`
      });
    }

    const reference = generatePaymentReference("FW-L");
    const insert = await run(
      `INSERT INTO payment_requests (student_id, kind, lesson_id, amount_cents, status, payment_method, reference, expires_at)
       VALUES (?, 'lesson', ?, ?, 'pending', 'fawry', ?, datetime('now', '+8 hours'))`,
      [req.user.studentId, lessonId, lessonPrice, reference]
    );
    const inserted = await get("SELECT expires_at FROM payment_requests WHERE id = ?", [insert.lastID]);
    await logAudit(req, "student.subscribe.lesson.pending", "lesson", lessonId, {
      reference,
      amount_cents: lessonPrice
    });

    res.json({
      success: true,
      status: "pending",
      reference,
      amount_cents: lessonPrice,
      expires_at: inserted?.expires_at || null,
      message:
        `تم إنشاء طلب اشتراك للمحاضرة "${lesson.title}".\n` +
        `المبلغ: ${(lessonPrice / 100).toFixed(2)} جنيه.\n` +
        `رقم المرجع: ${reference}.\n` +
        `ادفع عبر فوري ثم أرسل رقم المرجع للمالك لتفعيل الاشتراك.`
    });
  } catch (err) {
    res.status(500).json({ error: "Subscribe failed", details: err.message });
  }
});

app.get("/api/student/assessment/:id", requireAuth, requireStudent, async (req, res) => {
  const assessment = await get(
    "SELECT id, lesson_id, type, title, duration_minutes, COALESCE(max_attempts, 1) AS max_attempts FROM assessments WHERE id = ?",
    [req.params.id]
  );
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });

  const access = await canAccessLesson(req.user.studentId, assessment.lesson_id);
  if (!access.ok) {
    return res.status(403).json({ error: "هذه المحاضرة غير متاحة إلا بعد الاشتراك." });
  }

  const attemptsUsedRow = await get(
    "SELECT COUNT(1) AS cnt FROM attempts WHERE student_id = ? AND assessment_id = ?",
    [req.user.studentId, assessment.id]
  );
  const attemptsUsed = Number(attemptsUsedRow?.cnt || 0);
  const attemptsAllowed = Math.max(1, Number(assessment.max_attempts || 1));
  if (attemptsUsed >= attemptsAllowed) {
    return res.status(403).json({ error: "تم استهلاك عدد مرات المحاولة المسموح بها لهذا التقييم." });
  }

  const firstAttempt = await get(
    `SELECT id, score, total, created_at
     FROM attempts
     WHERE student_id = ? AND assessment_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [req.user.studentId, assessment.id]
  );

  const questions = await all(
    `SELECT id, text, image_url, option_a, option_b, option_c, option_d, score
     FROM questions WHERE assessment_id = ? ORDER BY id`,
    [assessment.id]
  );
  // ترتيب عشوائي عند كل فتح للتقييم.
  for (let i = questions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  res.json({
    ...assessment,
    attemptsUsed,
    attemptsAllowed,
    attemptsRemaining: Math.max(0, attemptsAllowed - attemptsUsed),
    firstAttempt: firstAttempt
      ? {
          id: firstAttempt.id,
          score: Number(firstAttempt.score || 0),
          total: Number(firstAttempt.total || 0),
          createdAt: firstAttempt.created_at || null
        }
      : null,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      imageUrl: q.image_url,
      options: [q.option_a, q.option_b, q.option_c, q.option_d],
      score: q.score
    }))
  });
});

app.post("/api/student/assessment/:id/submit", requireAuth, requireStudent, async (req, res) => {
  const assessment = await get(
    "SELECT id, type, title, lesson_id, duration_minutes, COALESCE(max_attempts, 1) AS max_attempts FROM assessments WHERE id = ?",
    [req.params.id]
  );
  if (!assessment) return res.status(404).json({ error: "Assessment not found" });

  const access = await canAccessLesson(req.user.studentId, assessment.lesson_id);
  if (!access.ok) {
    return res.status(403).json({ error: "هذه المحاضرة غير متاحة إلا بعد الاشتراك." });
  }

  const attemptsUsedRow = await get(
    "SELECT COUNT(1) AS cnt FROM attempts WHERE student_id = ? AND assessment_id = ?",
    [req.user.studentId, assessment.id]
  );
  const attemptsUsed = Number(attemptsUsedRow?.cnt || 0);
  const attemptsAllowed = Math.max(1, Number(assessment.max_attempts || 1));
  if (attemptsUsed >= attemptsAllowed) {
    return res.status(403).json({ error: "تم استهلاك عدد مرات المحاولة المسموح بها لهذا التقييم." });
  }

  const firstAttemptBefore = await get(
    `SELECT id, score, total
     FROM attempts
     WHERE student_id = ? AND assessment_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [req.user.studentId, assessment.id]
  );

  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  const maxSpent = Math.max(0, Number((assessment.duration_minutes || 300) * 60));
  const rawSpent = Number(req.body.spentSeconds);
  const spentSeconds = Number.isFinite(rawSpent)
    ? Math.min(Math.max(Math.floor(rawSpent), 0), maxSpent)
    : 0;
  const questionRows = await all(
    `SELECT id, text, option_a, option_b, option_c, option_d, correct_option, score
     FROM questions WHERE assessment_id = ? ORDER BY id`,
    [assessment.id]
  );

  let total = 0;
  let score = 0;
  const details = questionRows.map((q) => {
    const chosen = answers.find((a) => Number(a.questionId) === q.id);
    const chosenOption = chosen ? Number(chosen.chosenOption) : -1;
    const isCorrect = chosenOption === q.correct_option;
    total += q.score;
    if (isCorrect) score += q.score;
    const options = [q.option_a, q.option_b, q.option_c, q.option_d];

    return {
      questionId: q.id,
      question: q.text,
      chosenOption,
      chosenText: chosenOption >= 0 ? options[chosenOption] : "لم تتم الإجابة",
      correctOption: q.correct_option,
      correctText: options[q.correct_option],
      isCorrect,
      score: isCorrect ? q.score : 0,
      maxScore: q.score
    };
  });

  const attempt = await run(
    `INSERT INTO attempts (student_id, assessment_id, score, total, spent_seconds, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [req.user.studentId, assessment.id, score, total, spentSeconds]
  );

  for (const item of details) {
    await run(
      `INSERT INTO attempt_answers (attempt_id, question_id, chosen_option, is_correct, score_awarded)
       VALUES (?, ?, ?, ?, ?)`,
      [attempt.lastID, item.questionId, item.chosenOption, item.isCorrect ? 1 : 0, item.score]
    );
  }

  await logAudit(req, "student.assessment.submit", "assessment", assessment.id, {
    score,
    total,
    attempt_id: attempt.lastID
  });

  res.json({
    attemptId: attempt.lastID,
    assessmentType: assessment.type,
    score: firstAttemptBefore ? Number(firstAttemptBefore.score || 0) : score,
    total: firstAttemptBefore ? Number(firstAttemptBefore.total || 0) : total,
    currentAttemptScore: score,
    currentAttemptTotal: total,
    isFirstAttempt: !firstAttemptBefore,
    spentSeconds,
    attemptsUsed: attemptsUsed + 1,
    attemptsAllowed,
    attemptsRemaining: Math.max(0, attemptsAllowed - (attemptsUsed + 1)),
    details
  });
});

app.get("/api/student/history", requireAuth, requireStudent, async (req, res) => {
  const type = req.query.type;
  const sql = `
    SELECT
      a.id AS attempt_id,
      a.score,
      a.total,
      a.spent_seconds,
      a.created_at,
      ass.type,
      ass.id AS assessment_id,
      ass.title AS assessment_title,
      l.title AS lesson_title,
      c.title AS course_title,
      c.subject AS course_subject,
      s.full_name AS student_name
    FROM attempts a
    JOIN students s ON s.id = a.student_id
    JOIN assessments ass ON ass.id = a.assessment_id
    JOIN lessons l ON l.id = ass.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE a.student_id = ?
    ${type ? "AND ass.type = ?" : ""}
    ORDER BY a.id DESC
  `;
  const rows = await all(sql, type ? [req.user.studentId, type] : [req.user.studentId]);

  const result = [];
  for (const row of rows) {
    const answers = await all(
      `SELECT
         q.text AS question,
         aa.chosen_option,
         q.correct_option,
         q.option_a, q.option_b, q.option_c, q.option_d,
         aa.is_correct,
         aa.score_awarded
       FROM attempt_answers aa
       JOIN questions q ON q.id = aa.question_id
       WHERE aa.attempt_id = ?`,
      [row.attempt_id]
    );

    result.push({
      attemptId: row.attempt_id,
      type: row.type,
      assessmentId: row.assessment_id,
      assessmentTitle: row.assessment_title,
      lessonTitle: row.lesson_title,
      courseTitle: row.course_title,
      courseSubject: row.course_subject || "",
      studentName: row.student_name || "",
      score: row.score,
      total: row.total,
      spentSeconds: row.spent_seconds || 0,
      date: row.created_at,
      details: answers.map((a) => {
        const opts = [a.option_a, a.option_b, a.option_c, a.option_d];
        return {
          question: a.question,
          chosenText: a.chosen_option >= 0 ? opts[a.chosen_option] : "لم تتم الإجابة",
          correctText: opts[a.correct_option],
          isCorrect: !!a.is_correct,
          score: a.score_awarded
        };
      })
    });
  }

  res.json(result);
});

app.get("/api/student/notifications", requireAuth, requireStudent, async (req, res) => {
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;
  const unreadOnly = String(req.query.unreadOnly || "") === "1";

  const rows = await all(
    `SELECT id, message, read_at, created_at
     FROM notifications
     WHERE student_id = ? ${unreadOnly ? "AND read_at IS NULL" : ""}
     ORDER BY id DESC
     LIMIT ?`,
    [req.user.studentId, limit]
  );

  const unreadRow = await get(
    "SELECT COUNT(1) AS cnt FROM notifications WHERE student_id = ? AND read_at IS NULL",
    [req.user.studentId]
  );

  res.json({
    unreadCount: Number(unreadRow?.cnt || 0),
    notifications: rows
  });
});

app.post("/api/student/notifications/:id/read", requireAuth, requireStudent, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid notification id" });

  const row = await get("SELECT id FROM notifications WHERE id = ? AND student_id = ?", [id, req.user.studentId]);
  if (!row) return res.status(404).json({ error: "Notification not found" });

  await run("UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?", [id]);
  res.json({ success: true });
});

app.post("/api/student/notifications/read-all", requireAuth, requireStudent, async (req, res) => {
  await run("UPDATE notifications SET read_at = datetime('now') WHERE student_id = ? AND read_at IS NULL", [
    req.user.studentId
  ]);
  res.json({ success: true });
});

app.post(
  "/api/student/forum/upload-image",
  requireAuth,
  requireStudent,
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    await logAudit(req, "forum.question.image.upload", "upload", null, { fileUrl });
    res.json({ imageUrl: fileUrl });
  }
);

app.post("/api/student/forum/questions", requireAuth, requireStudent, async (req, res) => {
  try {
    const incomingTitle = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    if (!body && !imageUrl) {
      return res.status(400).json({ error: "اكتب السؤال أو ارفع صورة على الأقل." });
    }

    const autoTitle = body.replace(/\s+/g, " ").trim().slice(0, 70);
    const title = incomingTitle || (autoTitle.length ? autoTitle : "سؤال بصورة");

    const student = await get("SELECT grade, subject FROM students WHERE id = ?", [req.user.studentId]);
    const result = await run(
      `INSERT INTO forum_questions
       (student_id, grade, subject, title, body, image_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'), datetime('now'))`,
      [
        req.user.studentId,
        String(student?.grade || ""),
        String(student?.subject || ""),
        title,
        body,
        imageUrl || ""
      ]
    );

    await logAudit(req, "forum.question.create", "forum_question", result.lastID, {});
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: "Failed to create question", details: err.message });
  }
});

app.get("/api/student/forum/questions", requireAuth, requireStudent, async (req, res) => {
  const rows = await all(
    `SELECT
      q.id, q.title, q.body, q.image_url, q.status, q.created_at, q.updated_at, q.grade, q.subject,
      (SELECT COUNT(1) FROM forum_answers a WHERE a.question_id = q.id) AS answers_count
     FROM forum_questions q
     WHERE q.student_id = ?
     ORDER BY q.id DESC`,
    [req.user.studentId]
  );
  res.json(rows);
});

app.get("/api/student/forum/questions/:id", requireAuth, requireStudent, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid question id" });

  const question = await get(
    `SELECT id, student_id, title, body, image_url, status, created_at, updated_at, grade, subject
     FROM forum_questions
     WHERE id = ?`,
    [id]
  );
  if (!question) return res.status(404).json({ error: "Question not found" });
  if (Number(question.student_id) !== Number(req.user.studentId)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const answers = await all(
    `SELECT id, author_role, author_id, body, image_url, audio_url, created_at
     FROM forum_answers
     WHERE question_id = ?
     ORDER BY id ASC`,
    [id]
  );

  res.json({ question, answers });
});

app.get("/api/owner/forum/questions", requireAuth, requireStaffPerm(PERMS.FORUM_REPLY), async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const status = normalizeForumStatus(req.query.status);
  const grade = String(req.query.grade || "").trim();

  const where = [];
  const params = [];
  if (status) {
    where.push("q.status = ?");
    params.push(status);
  }
  if (grade) {
    where.push("q.grade = ?");
    params.push(grade);
  }
  if (q) {
    where.push("(lower(q.title) LIKE ? OR lower(q.body) LIKE ? OR lower(s.full_name) LIKE ? OR s.phone LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql = `
    SELECT
      q.id, q.student_id, q.title, q.body, q.image_url, q.status, q.created_at, q.updated_at, q.grade, q.subject,
      s.full_name AS student_name, s.phone AS student_phone,
      (SELECT COUNT(1) FROM forum_answers a WHERE a.question_id = q.id) AS answers_count
    FROM forum_questions q
    JOIN students s ON s.id = q.student_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY q.status = 'open' DESC, q.id DESC
    LIMIT 500
  `;
  const rows = await all(sql, params);
  res.json(rows);
});

app.get("/api/owner/forum/questions/:id", requireAuth, requireStaffPerm(PERMS.FORUM_REPLY), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid question id" });

  const question = await get(
    `SELECT
      q.id, q.student_id, q.title, q.body, q.image_url, q.status, q.created_at, q.updated_at, q.grade, q.subject,
      s.full_name AS student_name, s.phone AS student_phone
     FROM forum_questions q
     JOIN students s ON s.id = q.student_id
     WHERE q.id = ?`,
    [id]
  );
  if (!question) return res.status(404).json({ error: "Question not found" });

  const answers = await all(
    `SELECT id, author_role, author_id, body, image_url, audio_url, created_at
     FROM forum_answers
     WHERE question_id = ?
     ORDER BY id ASC`,
    [id]
  );

  res.json({ question, answers });
});

app.post(
  "/api/owner/forum/upload-image",
  requireAuth,
  requireStaffPerm(PERMS.FORUM_REPLY),
  upload.single("image"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    await logAudit(req, "forum.answer.image.upload", "upload", null, { fileUrl });
    res.json({ imageUrl: fileUrl });
  }
);

app.post(
  "/api/owner/forum/upload-audio",
  requireAuth,
  requireStaffPerm(PERMS.FORUM_REPLY),
  upload.single("audio"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No audio uploaded" });
    const fileUrl = `/uploads/${req.file.filename}`;
    await logAudit(req, "forum.answer.audio.upload", "upload", null, { fileUrl });
    res.json({ audioUrl: fileUrl });
  }
);

app.post("/api/owner/forum/questions/:id/answers", requireAuth, requireStaffPerm(PERMS.FORUM_REPLY), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid question id" });

    const body = String(req.body?.body || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const audioUrl = String(req.body?.audioUrl || "").trim();
    if (!body && !imageUrl && !audioUrl) {
      return res.status(400).json({ error: "أضف نصًا أو صورة أو صوتًا للرد." });
    }

    const q = await get("SELECT id, student_id, status FROM forum_questions WHERE id = ?", [id]);
    if (!q) return res.status(404).json({ error: "Question not found" });
    const existingAnswer = await get("SELECT id FROM forum_answers WHERE question_id = ? LIMIT 1", [id]);
    if (existingAnswer || String(q.status || "") === "answered") {
      return res.status(400).json({ error: "تمت الإجابة على هذا السؤال بالفعل. الرد متاح مرة واحدة فقط." });
    }

    const authorRole = String(req.user?.role || "owner");
    const authorId = authorRole === "supervisor" ? Number(req.user?.supervisorId || 0) : null;

    const result = await run(
      `INSERT INTO forum_answers
       (question_id, author_role, author_id, body, image_url, audio_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, authorRole, authorId, body, imageUrl || "", audioUrl || ""]
    );

    await run(
      `UPDATE forum_questions
       SET status = 'answered', updated_at = datetime('now'), answered_by_role = ?, answered_by_id = ?
       WHERE id = ?`,
      [authorRole, authorId, id]
    );

    await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [
      q.student_id,
      "تم الرد على سؤالك في المنتدى."
    ]);
    await logAudit(req, "forum.answer.create", "forum_question", id, { answerId: result.lastID });
    res.json({ id: result.lastID, success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to add answer", details: err.message });
  }
});

app.patch("/api/owner/forum/questions/:id/status", requireAuth, requireStaffPerm(PERMS.FORUM_REPLY), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid question id" });
    const status = normalizeForumStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: "Invalid status" });

    const q = await get("SELECT id, student_id FROM forum_questions WHERE id = ?", [id]);
    if (!q) return res.status(404).json({ error: "Question not found" });

    await run("UPDATE forum_questions SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [
      q.student_id,
      `تم تحديث حالة سؤالك إلى: ${status === "open" ? "لم تتم الإجابة عليه" : "تمت الإجابة عليه"}`
    ]);
    await logAudit(req, "forum.question.status", "forum_question", id, { status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update question status", details: err.message });
  }
});

app.get("/api/owner/students", requireAuth, requireStaffPerm(PERMS.STUDENTS_READ), async (_req, res) => {
  const students = await all(
    `SELECT
      s.id, s.full_name, s.phone, s.guardian_phone, s.grade, s.governorate, s.branch, s.subject, s.created_at,
      (
        SELECT ac.code
        FROM access_codes ac
        WHERE ac.student_id = s.id
          AND ac.used_at IS NULL
          AND datetime(ac.expires_at) > datetime('now')
        ORDER BY ac.id DESC
        LIMIT 1
      ) AS active_code,
      (
        SELECT ac.expires_at
        FROM access_codes ac
        WHERE ac.student_id = s.id
          AND ac.used_at IS NULL
          AND datetime(ac.expires_at) > datetime('now')
        ORDER BY ac.id DESC
        LIMIT 1
      ) AS active_code_expires_at
     FROM students s
     ORDER BY s.id DESC`
  );
  res.json(students);
});

app.post("/api/owner/students/:id/access-code", requireAuth, requireStaffPerm(PERMS.STUDENTS_CODES_WRITE), async (req, res) => {
  try {
    await ensureAccessCodeSchema();
    const studentId = Number(req.params.id);
    if (!studentId) return res.status(400).json({ error: "Invalid student id" });

    const student = await get("SELECT id, full_name, phone FROM students WHERE id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const code = generateAccessCode();
    await run("UPDATE access_codes SET used_at = datetime('now') WHERE student_id = ? AND used_at IS NULL", [studentId]);
    await run(
      "INSERT INTO access_codes (student_id, code, expires_at) VALUES (?, ?, datetime('now', '+24 hours'))",
      [studentId, code]
    );

    await logAudit(req, "student.access_code.create", "student", studentId, { phone: student.phone });
    res.json({
      studentId: student.id,
      studentName: student.full_name,
      phone: student.phone,
      code,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      expiresInHours: 24
    });
  } catch (err) {
    res.status(500).json({ error: "Create access code failed", details: err.message });
  }
});

// إلغاء/حذف الكود النشط الحالي للطالب (يُستخدم لو المالك عايز يلغي الكود)
app.delete("/api/owner/students/:id/access-code", requireAuth, requireStaffPerm(PERMS.STUDENTS_CODES_WRITE), async (req, res) => {
  try {
    await ensureAccessCodeSchema();
    const studentId = Number(req.params.id);
    if (!studentId) return res.status(400).json({ error: "Invalid student id" });

    const student = await get("SELECT id FROM students WHERE id = ?", [studentId]);
    if (!student) return res.status(404).json({ error: "Student not found" });

    await run(
      `UPDATE access_codes
       SET used_at = datetime('now')
       WHERE student_id = ?
         AND used_at IS NULL
         AND datetime(expires_at) > datetime('now')`,
      [studentId]
    );

    await logAudit(req, "student.access_code.delete", "student", studentId, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Delete access code failed", details: err.message });
  }
});

app.post("/api/owner/notifications/broadcast", requireAuth, requireStaffPerm(PERMS.NOTIFICATIONS_SEND), async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const audience = String(req.body.audience || "all").trim();
    const grade = String(req.body.grade || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 500) return res.status(400).json({ error: "Message too long" });

    const where = [];
    const params = [];

    if (grade) {
      const pat = gradeLikePattern(grade);
      if (pat) {
        where.push("s.grade LIKE ?");
        params.push(pat);
      } else {
        where.push("s.grade = ?");
        params.push(grade);
      }
    }

    if (audience === "subscribed") {
      where.push("EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.student_id = s.id)");
    } else if (audience !== "all") {
      return res.status(400).json({ error: "Invalid audience" });
    }

    const rows = await all(
      `SELECT s.id
       FROM students s
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.id DESC`,
      params
    );

    const ids = rows.map((r) => Number(r.id)).filter(Boolean);
    if (!ids.length) return res.json({ success: true, count: 0 });

    await run("BEGIN");
    try {
      for (const id of ids) {
        await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [id, message]);
      }
      await run("COMMIT");
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }

    await logAudit(req, "notifications.broadcast", "students", null, {
      audience,
      grade: grade || null,
      count: ids.length,
      message_len: message.length,
      message_preview: message.slice(0, 160)
    });
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Broadcast failed", details: err.message });
  }
});

app.post("/api/owner/notifications/to-student", requireAuth, requireStaffPerm(PERMS.NOTIFICATIONS_SEND), async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    const studentId = req.body.studentId !== undefined ? Number(req.body.studentId) : 0;
    const phone = String(req.body.phone || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required" });
    if (message.length > 500) return res.status(400).json({ error: "Message too long" });

    let student = null;
    if (studentId) {
      student = await get("SELECT id, phone FROM students WHERE id = ?", [studentId]);
    } else if (phone) {
      student = await get("SELECT id, phone FROM students WHERE phone = ?", [phone]);
    } else {
      return res.status(400).json({ error: "studentId or phone is required" });
    }
    if (!student) return res.status(404).json({ error: "Student not found" });

    await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [student.id, message]);
    await logAudit(req, "notifications.send", "student", student.id, {
      phone: student.phone,
      message_len: message.length,
      message_preview: message.slice(0, 160)
    });
    res.json({ success: true, studentId: student.id });
  } catch (err) {
    res.status(500).json({ error: "Send failed", details: err.message });
  }
});

app.get(
  "/api/owner/students/progress",
  requireAuth,
  requireStaffAnyPerm(PERMS.STUDENTS_READ, PERMS.ALERTS_READ),
  async (req, res) => {
  try {
    await ensureLessonViewsSchema();
    const grade = String(req.query.grade || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();
    const limitRaw = Number(req.query.limit || 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;

    const where = [];
    const params = [];

    if (grade) {
      const pat = gradeLikePattern(grade);
      if (pat) {
        where.push("s.grade LIKE ?");
        params.push(pat);
      } else {
        where.push("s.grade = ?");
        params.push(grade);
      }
    }

    if (q) {
      where.push("(lower(s.full_name) LIKE ? OR s.phone LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like);
    }

    const students = await all(
      `SELECT s.id, s.full_name, s.phone, s.guardian_phone, s.grade
       FROM students s
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY s.id DESC
       LIMIT ?`,
      [...params, limit]
    );
    const studentIds = students.map((s) => Number(s.id)).filter(Boolean);
    if (!studentIds.length) return res.json({ students: [], progressByStudentId: {} });

    const inSql = studentIds.map(() => "?").join(", ");

    const courseGradeWhere = grade
      ? (() => {
          const pat = gradeLikePattern(grade);
          if (pat) return { sql: "(c.grade IS NULL OR c.grade = '' OR c.grade LIKE ?)", params: [pat] };
          return { sql: "(c.grade IS NULL OR c.grade = '' OR c.grade = ?)", params: [grade] };
        })()
      : { sql: "1=1", params: [] };

    const missingLessonRows = await all(
      `SELECT
         s.id AS student_id,
         l.id AS lesson_id,
         l.title AS lesson_title,
         c.id AS course_id,
         c.title AS course_title
       FROM students s
       JOIN lessons l ON 1=1
       JOIN courses c ON c.id = l.course_id
       LEFT JOIN subscriptions sc ON sc.student_id = s.id AND sc.kind = 'course' AND sc.course_id = c.id
       LEFT JOIN subscriptions sl ON sl.student_id = s.id AND sl.kind = 'lesson' AND sl.lesson_id = l.id
       LEFT JOIN lesson_views lv ON lv.student_id = s.id AND lv.lesson_id = l.id
       WHERE s.id IN (${inSql})
         AND ${courseGradeWhere.sql}
         AND (
           sc.id IS NOT NULL OR sl.id IS NOT NULL OR COALESCE(c.price_cents, 0) <= 0
         )
         AND (
           trim(COALESCE(l.video_url, '')) <> '' OR
           trim(COALESCE(l.explain_file_url, '')) <> '' OR
           trim(COALESCE(l.solution_video_url, '')) <> '' OR
           trim(COALESCE(l.solution_file_url, '')) <> ''
         )
         AND lv.id IS NULL
       ORDER BY s.id DESC, c.id DESC, l.position, l.id`,
      [...studentIds, ...courseGradeWhere.params]
    );

    const missingAssessmentRows = await all(
      `SELECT
         s.id AS student_id,
         ass.id AS assessment_id,
         ass.type AS assessment_type,
         ass.title AS assessment_title,
         l.id AS lesson_id,
         l.title AS lesson_title,
         c.id AS course_id,
         c.title AS course_title
       FROM students s
       JOIN lessons l ON 1=1
       JOIN courses c ON c.id = l.course_id
       JOIN assessments ass ON ass.lesson_id = l.id
       LEFT JOIN subscriptions sc ON sc.student_id = s.id AND sc.kind = 'course' AND sc.course_id = c.id
       LEFT JOIN subscriptions sl ON sl.student_id = s.id AND sl.kind = 'lesson' AND sl.lesson_id = l.id
       LEFT JOIN attempts a ON a.student_id = s.id AND a.assessment_id = ass.id
       WHERE s.id IN (${inSql})
         AND ${courseGradeWhere.sql}
         AND (
           sc.id IS NOT NULL OR sl.id IS NOT NULL OR COALESCE(c.price_cents, 0) <= 0
         )
         AND a.id IS NULL
       ORDER BY s.id DESC, c.id DESC, l.position, ass.id`,
      [...studentIds, ...courseGradeWhere.params]
    );

    const progressByStudentId = {};
    studentIds.forEach((id) => {
      progressByStudentId[id] = { missingLessons: [], missingAssessments: [] };
    });

    missingLessonRows.forEach((r) => {
      const sid = Number(r.student_id);
      if (!progressByStudentId[sid]) progressByStudentId[sid] = { missingLessons: [], missingAssessments: [] };
      progressByStudentId[sid].missingLessons.push({
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        courseId: r.course_id,
        courseTitle: r.course_title
      });
    });

    missingAssessmentRows.forEach((r) => {
      const sid = Number(r.student_id);
      if (!progressByStudentId[sid]) progressByStudentId[sid] = { missingLessons: [], missingAssessments: [] };
      progressByStudentId[sid].missingAssessments.push({
        assessmentId: r.assessment_id,
        type: r.assessment_type,
        title: r.assessment_title,
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        courseId: r.course_id,
        courseTitle: r.course_title
      });
    });

    res.json({ students, progressByStudentId });
  } catch (err) {
    res.status(500).json({ error: "Failed to load progress", details: err.message });
  }
  }
);

app.get("/api/owner/attempts", requireAuth, requireStaffPerm(PERMS.ATTEMPTS_READ), async (req, res) => {
  const type = req.query.type;
  const rows = await all(
    `SELECT
       a.id AS attempt_id,
       a.score, a.total, a.spent_seconds, a.created_at,
       s.full_name AS student_name, s.phone AS student_phone, s.grade AS student_grade,
       ass.type, ass.title AS assessment_title,
       l.title AS lesson_title,
       c.title AS course_title,
       c.subject AS course_subject
     FROM attempts a
     JOIN students s ON s.id = a.student_id
     JOIN assessments ass ON ass.id = a.assessment_id
     JOIN lessons l ON l.id = ass.lesson_id
     JOIN courses c ON c.id = l.course_id
     WHERE a.id = (
       SELECT a1.id
       FROM attempts a1
       WHERE a1.student_id = a.student_id AND a1.assessment_id = a.assessment_id
       ORDER BY a1.id ASC
       LIMIT 1
     )
     ${type ? "AND ass.type = ?" : ""}
     ORDER BY a.id DESC`,
    type ? [type] : []
  );
  res.json(rows);
});

app.post("/api/owner/courses", requireAuth, requireStaffPerm(PERMS.COURSES_WRITE), async (req, res) => {
  const { title, description, imageUrl, priceEgp, subject, grade } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  const priceCents = parsePriceEgpToCents(priceEgp);
  if (priceCents === null) return res.status(400).json({ error: "Invalid course price" });

  const r = await run(
    "INSERT INTO courses (title, description, image_url, price_cents, subject, grade) VALUES (?, ?, ?, ?, ?, ?)",
    [
    title,
    description || "",
    imageUrl || "",
    priceCents,
    subject || "",
    grade || ""
    ]
  );
  await logAudit(req, "course.create", "course", r.lastID, { title, grade, subject });
  res.json({ id: r.lastID });
});

app.post("/api/owner/lessons", requireAuth, requireStaffPerm(PERMS.LESSONS_WRITE), async (req, res) => {
  const {
    courseId,
    title,
    description,
    imageUrl,
    priceEgp,
    isIndividual,
    videoUrl,
    explainFileUrl,
    solutionVideoUrl,
    solutionFileUrl,
    position
  } = req.body;

  if (!courseId || !title) return res.status(400).json({ error: "courseId and title are required" });

  const isIndividualFlag = Boolean(isIndividual);
  const priceCents = parsePriceEgpToCents(isIndividualFlag ? priceEgp : "");
  if (priceCents === null) return res.status(400).json({ error: "Invalid lesson price" });

  const r = await run(
    `INSERT INTO lessons
     (course_id, title, description, image_url, price_cents, is_individual, individual_price_cents, individual_image_url, video_url, explain_file_url, solution_video_url, solution_file_url, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(courseId),
      title,
      description || "",
      "",
      0,
      isIndividualFlag ? 1 : 0,
      isIndividualFlag ? priceCents : 0,
      isIndividualFlag ? (imageUrl || "") : "",
      videoUrl || "",
      explainFileUrl || "",
      solutionVideoUrl || "",
      solutionFileUrl || "",
      Number(position) || 1
    ]
  );

  await logAudit(req, "lesson.create", "lesson", r.lastID, {
    title,
    courseId: Number(courseId),
    kind: isIndividualFlag ? "individual" : "course"
  });
  res.json({ id: r.lastID });
});

app.post("/api/owner/assessments", requireAuth, requireStaffPerm(PERMS.ASSESSMENTS_WRITE), async (req, res) => {
  const { lessonId, type, title, durationMinutes, maxAttempts } = req.body;
  if (!lessonId || !type || !title) return res.status(400).json({ error: "lessonId, type, title are required" });
  if (![
    "quiz",
    "homework",
    "exam"
  ].includes(type)) return res.status(400).json({ error: "type must be quiz, homework, or exam" });
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) {
    return res.status(400).json({ error: "durationMinutes must be a positive number" });
  }
  const attemptsAllowed = Math.max(1, Math.floor(Number(maxAttempts) || 1));

  const r = await run(
    "INSERT INTO assessments (lesson_id, type, title, duration_minutes, max_attempts) VALUES (?, ?, ?, ?, ?)",
    [Number(lessonId), type, title, Math.floor(duration), attemptsAllowed]
  );
  await logAudit(req, "assessment.create", "assessment", r.lastID, {
    lessonId: Number(lessonId),
    type,
    title,
    maxAttempts: attemptsAllowed
  });
  res.json({ id: r.lastID });
});

app.post("/api/owner/questions", requireAuth, requireStaffPerm(PERMS.QUESTIONS_WRITE), async (req, res) => {
  const {
    assessmentId,
    text,
    imageUrl,
    optionA,
    optionB,
    optionC,
    optionD,
    correctOption
  } = req.body;

  if (!assessmentId || (!text && !imageUrl)) {
    return res.status(400).json({ error: "assessmentId and (text or imageUrl) are required" });
  }

  const correct = Number(correctOption);
  if (![0, 1, 2, 3].includes(correct)) {
    return res.status(400).json({ error: "correctOption must be 0..3" });
  }

  const r = await run(
    `INSERT INTO questions
     (assessment_id, text, image_url, option_a, option_b, option_c, option_d, correct_option, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [assessmentId, text || "", imageUrl || "", optionA || "", optionB || "", optionC || "", optionD || "", correct, 1]
  );

  await logAudit(req, "question.create", "question", r.lastID, { assessmentId: Number(assessmentId) });
  res.json({ id: r.lastID });
});

app.post("/api/owner/questions/bulk", requireAuth, requireStaffPerm(PERMS.QUESTIONS_WRITE), async (req, res) => {
  try {
    const assessmentId = Number(req.body?.assessmentId || 0);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!assessmentId) return res.status(400).json({ error: "assessmentId is required" });
    if (!rows.length) return res.status(400).json({ error: "rows are required" });
    if (rows.length > 2000) return res.status(400).json({ error: "rows limit is 2000 per request" });

    const assessment = await get("SELECT id FROM assessments WHERE id = ?", [assessmentId]);
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const parseCorrect = (v) => {
      const raw = String(v ?? "").trim().toUpperCase();
      if (["0", "1", "2", "3"].includes(raw)) return Number(raw);
      if (raw === "A") return 0;
      if (raw === "B") return 1;
      if (raw === "C") return 2;
      if (raw === "D") return 3;
      return -1;
    };

    let inserted = 0;
    await run("BEGIN TRANSACTION");
    for (const item of rows) {
      const text = String(item?.text || "").trim();
      const imageUrl = String(item?.imageUrl || "").trim();
      const optionA = String(item?.optionA || "").trim();
      const optionB = String(item?.optionB || "").trim();
      const optionC = String(item?.optionC || "").trim();
      const optionD = String(item?.optionD || "").trim();
      const correct = parseCorrect(item?.correctOption);
      if ((!text && !imageUrl) || !optionA || !optionB || !optionC || !optionD || correct < 0) continue;

      await run(
        `INSERT INTO questions
         (assessment_id, text, image_url, option_a, option_b, option_c, option_d, correct_option, score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [assessmentId, text, imageUrl, optionA, optionB, optionC, optionD, correct]
      );
      inserted += 1;
    }
    await run("COMMIT");

    await logAudit(req, "question.bulk_import", "assessment", assessmentId, { inserted });
    res.json({ inserted });
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch (_e) {
      // ignore rollback errors
    }
    res.status(500).json({ error: "Bulk import failed", details: err.message });
  }
});

app.post(
  "/api/owner/upload-question-image",
  requireAuth,
  requireStaffPerm(PERMS.UPLOAD_WRITE),
  upload.single("image"),
  async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const fileUrl = `/uploads/${req.file.filename}`;
  await logAudit(req, "upload.question_image", "upload", null, { fileUrl });
  res.json({ imageUrl: fileUrl });
  }
);

async function deleteByAssessmentIds(assessmentIds) {
  if (!assessmentIds.length) return;
  const placeholders = assessmentIds.map(() => "?").join(",");
  const attempts = await all(
    `SELECT id FROM attempts WHERE assessment_id IN (${placeholders})`,
    assessmentIds
  );
  const attemptIds = attempts.map((a) => a.id);
  if (attemptIds.length) {
    const attemptPlaceholders = attemptIds.map(() => "?").join(",");
    await run(`DELETE FROM attempt_answers WHERE attempt_id IN (${attemptPlaceholders})`, attemptIds);
    await run(`DELETE FROM attempts WHERE id IN (${attemptPlaceholders})`, attemptIds);
  }
  await run(`DELETE FROM questions WHERE assessment_id IN (${placeholders})`, assessmentIds);
  await run(`DELETE FROM assessments WHERE id IN (${placeholders})`, assessmentIds);
}

app.delete("/api/owner/questions/:id", requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid question id" });
  await run("DELETE FROM questions WHERE id = ?", [id]);
  await logAudit(req, "question.delete", "question", id, {});
  res.json({ success: true });
});

app.delete("/api/owner/assessments/:id", requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid assessment id" });
  await deleteByAssessmentIds([id]);
  await logAudit(req, "assessment.delete", "assessment", id, {});
  res.json({ success: true });
});

app.delete("/api/owner/lessons/:id", requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid lesson id" });
  const assessments = await all("SELECT id FROM assessments WHERE lesson_id = ?", [id]);
  await deleteByAssessmentIds(assessments.map((a) => a.id));
  await run("DELETE FROM lessons WHERE id = ?", [id]);
  await logAudit(req, "lesson.delete", "lesson", id, {});
  res.json({ success: true });
});

app.delete("/api/owner/courses/:id", requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid course id" });
  const lessons = await all("SELECT id FROM lessons WHERE course_id = ?", [id]);
  if (lessons.length) {
    const lessonIds = lessons.map((l) => l.id);
    const placeholders = lessonIds.map(() => "?").join(",");
    const assessments = await all(
      `SELECT id FROM assessments WHERE lesson_id IN (${placeholders})`,
      lessonIds
    );
    await deleteByAssessmentIds(assessments.map((a) => a.id));
    await run(`DELETE FROM lessons WHERE id IN (${placeholders})`, lessonIds);
  }
  await run("DELETE FROM courses WHERE id = ?", [id]);
  await logAudit(req, "course.delete", "course", id, {});
  res.json({ success: true });
});

app.get(
  "/api/owner/courses",
  requireAuth,
  requireStaffAnyPerm(
    PERMS.COURSES_WRITE,
    PERMS.LESSONS_WRITE,
    PERMS.ASSESSMENTS_WRITE,
    PERMS.QUESTIONS_WRITE,
    PERMS.UPLOAD_WRITE
  ),
  async (req, res) => {
  const courses = await all(
    "SELECT id, title, description, image_url, COALESCE(price_cents, 0) AS price_cents, subject, grade FROM courses ORDER BY id DESC"
  );
  const lessons = await all(
    `SELECT
       id,
       course_id,
       title,
       description,
       image_url,
       COALESCE(price_cents, 0) AS price_cents,
       COALESCE(is_individual, 0) AS is_individual,
       COALESCE(individual_price_cents, COALESCE(price_cents, 0)) AS individual_price_cents,
       COALESCE(individual_image_url, '') AS individual_image_url
     FROM lessons
     ORDER BY id DESC`
  );
  const assessments = await all(
    "SELECT id, lesson_id, type, title, duration_minutes, COALESCE(max_attempts, 1) AS max_attempts FROM assessments ORDER BY id DESC"
  );
  const questions = await all(
    `SELECT
      q.id,
      q.assessment_id,
      q.text,
      a.title AS assessment_title
     FROM questions q
     JOIN assessments a ON a.id = q.assessment_id
     ORDER BY q.id DESC`
  );
  await logAudit(req, "content.map.read", "content", null, {});
  res.json({ courses, lessons, assessments, questions });
});

app.get("/api/owner/payment-requests", requireAuth, requireStaffPerm(PERMS.PAYMENTS_READ), async (req, res) => {
  const grade = String(req.query.grade || "").trim();

  await run(
    `UPDATE payment_requests
     SET status = 'expired', decided_at = datetime('now')
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= datetime('now')`
  );

  const rows = await all(
    `SELECT
      pr.id,
      pr.kind,
      pr.amount_cents,
      pr.status,
      pr.reference,
      pr.expires_at,
      pr.created_at,
      s.full_name AS student_name,
      s.phone AS student_phone,
      c.title AS course_title,
      c.subject AS course_subject,
      c.grade AS course_grade,
      l.title AS lesson_title,
      c2.title AS lesson_course_title,
      c2.subject AS lesson_course_subject,
      c2.grade AS lesson_course_grade
     FROM payment_requests pr
     JOIN students s ON s.id = pr.student_id
     LEFT JOIN courses c ON c.id = pr.course_id
     LEFT JOIN lessons l ON l.id = pr.lesson_id
     LEFT JOIN courses c2 ON c2.id = l.course_id
     WHERE pr.status = 'pending' AND (pr.expires_at IS NULL OR pr.expires_at > datetime('now'))
     ORDER BY pr.id DESC`
  );

  const filtered = grade
    ? rows.filter((r) => (r.course_grade || r.lesson_course_grade || "") === grade)
    : rows;

  res.json(
    filtered.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount_cents: r.amount_cents,
      status: r.status,
      reference: r.reference,
      expires_at: r.expires_at,
      created_at: r.created_at,
      student_name: r.student_name,
      student_phone: r.student_phone,
      course_title: r.course_title || r.lesson_course_title || "",
      course_subject: r.course_subject || r.lesson_course_subject || "",
      lesson_title: r.lesson_title || ""
    }))
  );
});

app.post("/api/owner/payment-requests/:id/approve", requireAuth, requireStaffPerm(PERMS.PAYMENTS_APPROVE), async (req, res) => {
  let id = 0;
  try {
    id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid request id" });

    const pr = await get(
      "SELECT id, student_id, kind, course_id, lesson_id, status, expires_at FROM payment_requests WHERE id = ?",
      [id]
    );
    if (!pr) return res.status(404).json({ error: "طلب الدفع غير موجود." });
    if (pr.status !== "pending") {
      return res.status(400).json({
        error: `لا يمكن تأكيد هذا الطلب لأن حالته الحالية هي: ${pr.status || "-"}`
      });
    }

    if (pr.expires_at) {
      const expiresAt = new Date(String(pr.expires_at).replace(" ", "T"));
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
        await run("UPDATE payment_requests SET status = 'expired', decided_at = datetime('now') WHERE id = ?", [id]);
        return res.status(400).json({
          error: `انتهت صلاحية طلب الدفع. وقت الانتهاء: ${pr.expires_at}`
        });
      }
    }

    if (pr.kind === "course") {
      if (!pr.course_id) return res.status(400).json({ error: "بيانات الطلب غير مكتملة: course_id مفقود." });
      await run("INSERT OR IGNORE INTO subscriptions (student_id, kind, course_id) VALUES (?, 'course', ?)", [
        pr.student_id,
        pr.course_id
      ]);
      const course = await get("SELECT title FROM courses WHERE id = ?", [pr.course_id]);
      await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [
        pr.student_id,
        `تم تفعيل اشتراكك في الكورس: ${course?.title || ""}`.trim()
      ]);
      await logAudit(req, "payment.approve.course", "payment_request", id, { courseId: pr.course_id, studentId: pr.student_id });
    } else if (pr.kind === "lesson") {
      if (!pr.lesson_id) return res.status(400).json({ error: "بيانات الطلب غير مكتملة: lesson_id مفقود." });
      await run("INSERT OR IGNORE INTO subscriptions (student_id, kind, lesson_id) VALUES (?, 'lesson', ?)", [
        pr.student_id,
        pr.lesson_id
      ]);
      const lesson = await get("SELECT title FROM lessons WHERE id = ?", [pr.lesson_id]);
      await run("INSERT INTO notifications (student_id, message) VALUES (?, ?)", [
        pr.student_id,
        `تم تفعيل اشتراكك في المحاضرة: ${lesson?.title || ""}`.trim()
      ]);
      await logAudit(req, "payment.approve.lesson", "payment_request", id, { lessonId: pr.lesson_id, studentId: pr.student_id });
    } else {
      return res.status(400).json({ error: `نوع اشتراك غير مدعوم: ${pr.kind || "-"}` });
    }

    await run("UPDATE payment_requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    const details = String(err?.message || "Unknown server error");
    const code = String(err?.code || "");
    console.error("[payment-approve] failed", {
      requestId: id || null,
      actorRole: req.user?.role || null,
      actorId: req.user?.supervisorId || null,
      details,
      code
    });
    res.status(500).json({
      error: `فشل تأكيد الدفع: ${details}`,
      details,
      code
    });
  }
});

app.get("/api/owner/subscribers", requireAuth, requireStaffPerm(PERMS.SUBSCRIBERS_READ), async (req, res) => {
  const grade = String(req.query.grade || "").trim();

  const rows = await all(
    `SELECT
      sub.id,
      sub.kind,
      sub.created_at,
      s.full_name AS student_name,
      s.phone AS student_phone,
      c.title AS course_title,
      c.subject AS course_subject,
      c.grade AS course_grade,
      NULL AS lesson_title
     FROM subscriptions sub
     JOIN students s ON s.id = sub.student_id
     JOIN courses c ON c.id = sub.course_id
     WHERE sub.kind = 'course'

     UNION ALL

     SELECT
      sub.id,
      sub.kind,
      sub.created_at,
      s.full_name AS student_name,
      s.phone AS student_phone,
      c2.title AS course_title,
      c2.subject AS course_subject,
      c2.grade AS course_grade,
      l.title AS lesson_title
     FROM subscriptions sub
     JOIN students s ON s.id = sub.student_id
     JOIN lessons l ON l.id = sub.lesson_id
     JOIN courses c2 ON c2.id = l.course_id
     WHERE sub.kind = 'lesson'

     ORDER BY created_at DESC`
  );

  const filtered = grade ? rows.filter((r) => (r.course_grade || "") === grade) : rows;
  res.json(filtered);
});

app.get("/api/owner/supervisors", requireAuth, requireStaffPerm(PERMS.SUPERVISORS_MANAGE), async (_req, res) => {
  const rows = await all("SELECT id, full_name, phone, permissions_json, created_at FROM supervisors ORDER BY id DESC");
  res.json(
    rows.map((r) => {
      let permissions = [];
      try {
        permissions = r.permissions_json ? JSON.parse(String(r.permissions_json)) : [];
      } catch (_e) {
        permissions = [];
      }
      return {
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        created_at: r.created_at,
        permissions: Array.isArray(permissions) ? permissions.map(String) : []
      };
    })
  );
});

app.post("/api/owner/supervisors", requireAuth, requireStaffPerm(PERMS.SUPERVISORS_MANAGE), async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");
    const permissions = Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [];

    if (!fullName || !phone || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const exists = await get("SELECT id FROM supervisors WHERE phone = ?", [phone]);
    if (exists) return res.status(409).json({ error: "Phone already registered" });

    const hash = await bcrypt.hash(password, 10);
    const r = await run("INSERT INTO supervisors (full_name, phone, password_hash) VALUES (?, ?, ?)", [
      fullName,
      phone,
      hash
    ]);
    await run("UPDATE supervisors SET permissions_json = ? WHERE id = ?", [safeJsonStringify(permissions), r.lastID]);
    supervisorPermCache.delete(Number(r.lastID));
    await logAudit(req, "supervisor.create", "supervisor", r.lastID, { phone, fullName, permissionsCount: permissions.length });

    res.json({ id: r.lastID });
  } catch (err) {
    res.status(500).json({ error: "Create supervisor failed", details: err.message });
  }
});

app.delete("/api/owner/supervisors/:id", requireAuth, requireStaffPerm(PERMS.SUPERVISORS_MANAGE), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid supervisor id" });
  await run("DELETE FROM supervisors WHERE id = ?", [id]);
  supervisorPermCache.delete(Number(id));
  await logAudit(req, "supervisor.delete", "supervisor", id, {});
  res.json({ success: true });
});

app.put("/api/owner/supervisors/:id", requireAuth, requireStaffPerm(PERMS.SUPERVISORS_MANAGE), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid supervisor id" });

    const fullName = req.body.fullName !== undefined ? String(req.body.fullName || "").trim() : null;
    const phone = req.body.phone !== undefined ? String(req.body.phone || "").trim() : null;
    const password = req.body.password !== undefined ? String(req.body.password || "") : null;
    const permissions = req.body.permissions !== undefined
      ? (Array.isArray(req.body.permissions) ? req.body.permissions.map(String) : [])
      : null;

    const fields = [];
    const params = [];

    if (fullName !== null) { fields.push("full_name = ?"); params.push(fullName); }
    if (phone !== null) { fields.push("phone = ?"); params.push(phone); }
    if (password !== null) {
      if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
      const hash = await bcrypt.hash(password, 10);
      fields.push("password_hash = ?");
      params.push(hash);
    }
    if (permissions !== null) {
      fields.push("permissions_json = ?");
      params.push(safeJsonStringify(permissions));
    }

    if (!fields.length) return res.json({ success: true });
    params.push(id);

    await run(`UPDATE supervisors SET ${fields.join(", ")} WHERE id = ?`, params);
    supervisorPermCache.delete(Number(id));
    await logAudit(req, "supervisor.update", "supervisor", id, { changed: fields.length });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Update supervisor failed", details: err.message });
  }
});

app.get("/api/owner/audit", requireAuth, requireStaffPerm(PERMS.AUDIT_READ), async (req, res) => {
  const limitRaw = Number(req.query.limit || 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 100;

  const search = String(req.query.search || "").trim().toLowerCase();
  const actorRole = String(req.query.actorRole || "").trim();
  const actorId = Number(req.query.actorId || 0);
  const action = String(req.query.action || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const where = [];
  const params = [];

  if (actorRole) {
    where.push("a.actor_role = ?");
    params.push(actorRole);
  }
  if (actorId > 0) {
    where.push("a.actor_id = ?");
    params.push(actorId);
  }
  if (action) {
    where.push("a.action = ?");
    params.push(action);
  }
  if (from) {
    where.push("a.created_at >= ?");
    params.push(from);
  }
  if (to) {
    where.push("a.created_at <= ?");
    params.push(to);
  }
  if (search) {
    where.push(
      `(lower(a.action) LIKE ? OR lower(a.target_type) LIKE ? OR CAST(a.target_id AS TEXT) LIKE ? OR lower(a.metadata_json) LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const sql = `
    SELECT
      a.id,
      a.actor_role,
      a.actor_id,
      CASE
        WHEN a.actor_role = 'owner' THEN 'المالك'
        WHEN a.actor_role = 'supervisor' THEN COALESCE(s.full_name, 'مشرف غير معروف')
        ELSE ''
      END AS actor_name,
      a.action,
      a.target_type,
      a.target_id,
      a.metadata_json,
      a.created_at
    FROM audit_log a
    LEFT JOIN supervisors s ON a.actor_role = 'supervisor' AND a.actor_id = s.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY a.id DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = await all(sql, params);
  res.json(
    rows.map((r) => {
      let metadata = null;
      try {
        metadata = r.metadata_json ? JSON.parse(String(r.metadata_json)) : null;
      } catch (_e) {
        metadata = null;
      }
      return {
        id: r.id,
        actor_role: r.actor_role,
        actor_id: r.actor_id,
        actor_name: r.actor_name || null,
        action: r.action,
        target_type: r.target_type,
        target_id: r.target_id,
        metadata,
        created_at: r.created_at
      };
    })
  );
});

app.get("/api/owner/guardian-requests", requireAuth, requireStaffPerm(PERMS.GUARDIAN_MANAGE), async (req, res) => {
  const limitRaw = Number(req.query.limit || 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;
  const status = String(req.query.status || "pending").trim();
  const requestType = String(req.query.requestType || "").trim();

  const where = [];
  const params = [];
  if (status) {
    where.push("r.status = ?");
    params.push(status);
  }
  if (requestType) {
    where.push("r.request_type = ?");
    params.push(requestType);
  }

  const rows = await all(
    `SELECT
       r.id, r.phone, r.guardian_name, r.has_whatsapp, r.request_type, r.status, r.created_at, r.resolved_at, r.resolved_by_role, r.resolved_by_id,
       COUNT(s.id) AS children_count,
       GROUP_CONCAT(s.full_name, ' | ') AS children_names
     FROM guardian_access_requests r
     LEFT JOIN students s ON s.guardian_phone = r.phone
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY r.id
     ORDER BY r.id DESC
     LIMIT ?`,
    [...params, limit]
  );

  res.json(rows || []);
});

app.post("/api/owner/guardian/set-password", requireAuth, requireStaffPerm(PERMS.GUARDIAN_MANAGE), async (req, res) => {
  try {
    const phone = normalizePhoneDigits(String(req.body.phone || "").trim());
    const password = String(req.body.password || "");
    const requestId = req.body.requestId !== undefined ? Number(req.body.requestId) : null;
    const resolvedByRole = String(req.user?.role || "owner");
    const resolvedById = req.user?.role === "supervisor" ? Number(req.user.supervisorId || 0) || null : null;

    if (!phone) return res.status(400).json({ error: "Phone is required" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const hash = await bcrypt.hash(password, 10);
    const exists = await get("SELECT id FROM guardians WHERE phone = ?", [phone]);
    if (exists) {
      await run("UPDATE guardians SET password_hash = ?, updated_at = datetime('now') WHERE phone = ?", [hash, phone]);
    } else {
      await run("INSERT INTO guardians (phone, password_hash) VALUES (?, ?)", [phone, hash]);
    }

    if (requestId) {
      const reqRow = await get("SELECT request_type, status FROM guardian_access_requests WHERE id = ?", [requestId]);
      if (reqRow?.request_type === "reset" && !["pending", "ready_to_send"].includes(String(reqRow.status || ""))) {
        return res.status(400).json({ error: "هذا الطلب مغلق بالفعل." });
      }
      const nextStatus = reqRow?.request_type === "reset" ? "ready_to_send" : "resolved";
      await run(
        "UPDATE guardian_access_requests SET status = ?, resolved_at = datetime('now'), resolved_by_role = ?, resolved_by_id = ? WHERE id = ?",
        [nextStatus, resolvedByRole, resolvedById, requestId]
      );
    } else {
      await run(
        "UPDATE guardian_access_requests SET status = 'resolved', resolved_at = datetime('now'), resolved_by_role = ?, resolved_by_id = ? WHERE phone = ? AND status = 'pending' AND request_type <> 'reset'",
        [resolvedByRole, resolvedById, phone]
      );
    }

    await logAudit(req, "guardian.password.set", "guardian", null, {
      phone,
      password_len: password.length
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Set guardian password failed", details: err.message });
  }
});

app.post("/api/owner/guardian/confirm-reset", requireAuth, requireStaffPerm(PERMS.GUARDIAN_MANAGE), async (req, res) => {
  try {
    const requestId = Number(req.body.requestId || 0);
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    const reqRow = await get(
      "SELECT id, phone, request_type, status FROM guardian_access_requests WHERE id = ?",
      [requestId]
    );
    if (!reqRow) return res.status(404).json({ error: "Request not found" });
    if (String(reqRow.request_type) !== "reset") return res.status(400).json({ error: "Not a reset request" });
    if (String(reqRow.status) !== "ready_to_send") {
      return res.status(400).json({ error: "يجب توليد/حفظ كلمة السر أولًا قبل التأكيد." });
    }

    const resolvedByRole = String(req.user?.role || "owner");
    const resolvedById = req.user?.role === "supervisor" ? Number(req.user.supervisorId || 0) || null : null;
    await run(
      "UPDATE guardian_access_requests SET status = 'resolved', resolved_at = datetime('now'), resolved_by_role = ?, resolved_by_id = ? WHERE id = ?",
      [resolvedByRole, resolvedById, requestId]
    );

    await logAudit(req, "guardian.reset.confirm", "guardian", null, {
      phone: reqRow.phone,
      request_id: requestId
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Confirm reset failed", details: err.message });
  }
});

app.get(
  "/api/owner/messages-log",
  requireAuth,
  requireStaffAnyPerm(PERMS.AUDIT_READ, PERMS.NOTIFICATIONS_SEND),
  async (req, res) => {
    const limitRaw = Number(req.query.limit || 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;

    const actions = ["notifications.broadcast", "notifications.send", "whatsapp.open", "whatsapp.links"];
    const inSql = actions.map(() => "?").join(", ");
    const rows = await all(
      `SELECT id, actor_role, actor_id, action, target_type, target_id, metadata_json, created_at
       FROM audit_log
       WHERE action IN (${inSql})
       ORDER BY id DESC
       LIMIT ?`,
      [...actions, limit]
    );

    res.json(
      rows.map((r) => {
        let metadata = null;
        try {
          metadata = r.metadata_json ? JSON.parse(String(r.metadata_json)) : null;
        } catch (_e) {
          metadata = null;
        }
        return {
          id: r.id,
          actor_role: r.actor_role,
          actor_id: r.actor_id,
          action: r.action,
          target_type: r.target_type,
          target_id: r.target_id,
          metadata,
          created_at: r.created_at
        };
      })
    );
  }
);

app.post("/api/owner/whatsapp/log", requireAuth, requireStaff, async (req, res) => {
  try {
    const studentId = req.body.studentId !== undefined ? Number(req.body.studentId) : null;
    const phone = String(req.body.phone || "").trim();
    const source = String(req.body.source || "").trim();
    const bulk = Boolean(req.body.bulk);
    const count = req.body.count !== undefined ? Number(req.body.count) : null;

    const message = String(req.body.message || "");
    const preview = message.trim().slice(0, 160);

    await logAudit(req, bulk ? "whatsapp.links" : "whatsapp.open", "student", studentId || null, {
      phone: phone || null,
      source: source || null,
      count: Number.isFinite(count) ? count : null,
      message_len: message.length,
      message_preview: preview || null
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "WhatsApp log failed", details: err.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "main.html"));
});

Promise.resolve()
  .then(initDb)
  .then(seedData)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Server startup failed:", err);
    process.exit(1);
  });
