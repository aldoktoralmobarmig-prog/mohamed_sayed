const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "platform.db");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnName, columnDef) {
  const rows = await all(`PRAGMA table_info(${tableName})`);
  const exists = rows.some((r) => r.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
	      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      guardian_phone TEXT,
      grade TEXT,
      governorate TEXT,
      branch TEXT,
      subject TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      permissions_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_role TEXT NOT NULL,
      actor_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      metadata_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(student_id) REFERENCES students(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS guardians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await ensureColumn("guardians", "password_expires_at", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS guardian_access_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      guardian_name TEXT,
      has_whatsapp INTEGER NOT NULL DEFAULT 1,
      request_type TEXT NOT NULL DEFAULT 'access',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      resolved_by_role TEXT,
      resolved_by_id INTEGER
    )
  `);

  await run("CREATE INDEX IF NOT EXISTS idx_guardian_requests_phone ON guardian_access_requests(phone)");
  await run("CREATE INDEX IF NOT EXISTS idx_guardian_requests_status ON guardian_access_requests(status)");
  await ensureColumn("guardian_access_requests", "request_type", "TEXT NOT NULL DEFAULT 'access'");
  await ensureColumn("guardian_access_requests", "guardian_name", "TEXT");
  await ensureColumn("guardian_access_requests", "has_whatsapp", "INTEGER NOT NULL DEFAULT 1");
  await run("CREATE INDEX IF NOT EXISTS idx_guardian_requests_type ON guardian_access_requests(request_type)");

		  await run(`
		    CREATE TABLE IF NOT EXISTS courses (
		      id INTEGER PRIMARY KEY AUTOINCREMENT,
		      title TEXT NOT NULL,
	      description TEXT,
	      image_url TEXT,
	      price_cents INTEGER DEFAULT 0,
	      subject TEXT,
	      grade TEXT
	    )
	  `);

	  await run(`
	    CREATE TABLE IF NOT EXISTS lessons (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      course_id INTEGER NOT NULL,
	      title TEXT NOT NULL,
	      description TEXT,
	      image_url TEXT,
	      price_cents INTEGER DEFAULT 0,
	      video_url TEXT,
	      explain_file_url TEXT,
	      solution_video_url TEXT,
	      solution_file_url TEXT,
	      position INTEGER DEFAULT 1,
	      FOREIGN KEY(course_id) REFERENCES courses(id)
	    )
	  `);

  await run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 300,
      max_attempts INTEGER DEFAULT 1,
      FOREIGN KEY(lesson_id) REFERENCES lessons(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      text TEXT,
      image_url TEXT,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option INTEGER NOT NULL,
      score INTEGER DEFAULT 1,
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      assessment_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      spent_seconds INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(assessment_id) REFERENCES assessments(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS attempt_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      chosen_option INTEGER,
      is_correct INTEGER NOT NULL,
      score_awarded INTEGER NOT NULL,
      FOREIGN KEY(attempt_id) REFERENCES attempts(id),
      FOREIGN KEY(question_id) REFERENCES questions(id)
    )
  `);

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

		  await run(`
		    CREATE TABLE IF NOT EXISTS access_codes (
		      id INTEGER PRIMARY KEY AUTOINCREMENT,
		      student_id INTEGER NOT NULL,
	      code TEXT NOT NULL,
	      expires_at TEXT NOT NULL,
	      used_at TEXT,
	      created_at TEXT DEFAULT (datetime('now')),
	      FOREIGN KEY(student_id) REFERENCES students(id)
	    )
	  `);

	  await run(`
	    CREATE TABLE IF NOT EXISTS subscriptions (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      student_id INTEGER NOT NULL,
	      kind TEXT NOT NULL,
	      course_id INTEGER,
	      lesson_id INTEGER,
	      created_at TEXT DEFAULT (datetime('now')),
	      activated_at TEXT DEFAULT (datetime('now')),
	      FOREIGN KEY(student_id) REFERENCES students(id),
	      FOREIGN KEY(course_id) REFERENCES courses(id),
	      FOREIGN KEY(lesson_id) REFERENCES lessons(id)
	    )
	  `);

	  await run(`
	    CREATE TABLE IF NOT EXISTS payment_requests (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      student_id INTEGER NOT NULL,
	      kind TEXT NOT NULL,
	      course_id INTEGER,
	      lesson_id INTEGER,
	      amount_cents INTEGER NOT NULL,
	      status TEXT NOT NULL DEFAULT 'pending',
	      payment_method TEXT NOT NULL DEFAULT 'fawry',
	      reference TEXT NOT NULL,
	      expires_at TEXT,
	      created_at TEXT DEFAULT (datetime('now')),
	      decided_at TEXT,
	      FOREIGN KEY(student_id) REFERENCES students(id),
	      FOREIGN KEY(course_id) REFERENCES courses(id),
	      FOREIGN KEY(lesson_id) REFERENCES lessons(id)
	    )
	  `);

	  await run(`
	    CREATE TABLE IF NOT EXISTS forum_questions (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      student_id INTEGER NOT NULL,
	      grade TEXT,
	      subject TEXT,
	      title TEXT NOT NULL,
	      body TEXT NOT NULL,
	      image_url TEXT,
	      status TEXT NOT NULL DEFAULT 'open',
	      created_at TEXT DEFAULT (datetime('now')),
	      updated_at TEXT DEFAULT (datetime('now')),
	      answered_by_role TEXT,
	      answered_by_id INTEGER,
	      FOREIGN KEY(student_id) REFERENCES students(id)
	    )
	  `);

	  await run(`
	    CREATE TABLE IF NOT EXISTS forum_answers (
	      id INTEGER PRIMARY KEY AUTOINCREMENT,
	      question_id INTEGER NOT NULL,
	      author_role TEXT NOT NULL,
	      author_id INTEGER,
	      body TEXT,
	      image_url TEXT,
	      audio_url TEXT,
	      created_at TEXT DEFAULT (datetime('now')),
	      FOREIGN KEY(question_id) REFERENCES forum_questions(id)
	    )
	  `);

	  await ensureColumn("lessons", "explain_file_url", "TEXT");
	  await ensureColumn("lessons", "solution_video_url", "TEXT");
	  await ensureColumn("lessons", "solution_file_url", "TEXT");
	  await ensureColumn("attempts", "spent_seconds", "INTEGER DEFAULT 0");
	  await ensureColumn("assessments", "max_attempts", "INTEGER DEFAULT 1");
	  await run("UPDATE assessments SET max_attempts = 1 WHERE max_attempts IS NULL OR max_attempts <= 0");
	  await ensureColumn("students", "subject", "TEXT");
  await ensureColumn("students", "email", "TEXT");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email ON students(email)");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_supervisors_phone ON supervisors(phone)");
  await ensureColumn("supervisors", "permissions_json", "TEXT");
	  await run("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at)");
	  await run("CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id)");
	  await run("CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(student_id, read_at)");
	  await run("CREATE INDEX IF NOT EXISTS idx_lesson_views_student_lesson ON lesson_views(student_id, lesson_id)");
	  await run("CREATE INDEX IF NOT EXISTS idx_lesson_views_last ON lesson_views(last_viewed_at)");
	  await ensureColumn("courses", "image_url", "TEXT");
	  await ensureColumn("courses", "price_cents", "INTEGER DEFAULT 0");
	  await ensureColumn("courses", "subject", "TEXT");
	  await ensureColumn("courses", "grade", "TEXT");
	  await ensureColumn("lessons", "description", "TEXT");
	  await ensureColumn("lessons", "image_url", "TEXT");
	  await ensureColumn("lessons", "price_cents", "INTEGER DEFAULT 0");
	  await ensureColumn("lessons", "is_individual", "INTEGER NOT NULL DEFAULT 0");
	  await ensureColumn("lessons", "individual_price_cents", "INTEGER NOT NULL DEFAULT 0");
	  await ensureColumn("lessons", "individual_image_url", "TEXT");
	  await run(
	    `UPDATE lessons
	     SET is_individual = 1
	     WHERE COALESCE(price_cents, 0) > 0 AND COALESCE(is_individual, 0) = 0`
	  );
	  await run(
	    `UPDATE lessons
	     SET individual_price_cents = COALESCE(price_cents, 0)
	     WHERE COALESCE(is_individual, 0) = 1 AND COALESCE(individual_price_cents, 0) = 0`
	  );
	  await run(
	    `UPDATE lessons
	     SET individual_image_url = COALESCE(image_url, '')
	     WHERE COALESCE(is_individual, 0) = 1
	       AND (individual_image_url IS NULL OR trim(individual_image_url) = '')
	       AND COALESCE(image_url, '') <> ''`
	  );
	  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_course ON subscriptions(student_id, kind, course_id)");
	  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_lesson ON subscriptions(student_id, kind, lesson_id)");
	  await run("CREATE INDEX IF NOT EXISTS idx_payment_requests_student ON payment_requests(student_id)");
	  await run("CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status)");
	  await ensureColumn("payment_requests", "expires_at", "TEXT");
	  await run("CREATE INDEX IF NOT EXISTS idx_forum_questions_student ON forum_questions(student_id)");
	  await run("CREATE INDEX IF NOT EXISTS idx_forum_questions_status ON forum_questions(status)");
	  await run("CREATE INDEX IF NOT EXISTS idx_forum_answers_question ON forum_answers(question_id)");
	  await ensureColumn("forum_questions", "grade", "TEXT");
	  await ensureColumn("forum_questions", "subject", "TEXT");
	  await ensureColumn("forum_questions", "answered_by_role", "TEXT");
	  await ensureColumn("forum_questions", "answered_by_id", "INTEGER");
	  await ensureColumn("forum_answers", "audio_url", "TEXT");
	}

async function seedData() {
  const countRow = await get("SELECT COUNT(*) AS c FROM courses");
  if ((countRow && countRow.c) > 0) return;

  const course = await run(
    "INSERT INTO courses (title, description) VALUES (?, ?)",
    ["كورس تجريبي - فيزياء", "هذا كورس مبدئي تمت إضافته تلقائيًا."]
  );

  const lesson = await run(
    "INSERT INTO lessons (course_id, title, video_url, explain_file_url, solution_video_url, solution_file_url, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      course.lastID,
      "المحاضرة الأولى",
      "https://www.youtube.com/embed/8mAITcNt710",
      "",
      "https://www.youtube.com/embed/8mAITcNt710",
      "",
      1
    ]
  );

  const quiz = await run(
    "INSERT INTO assessments (lesson_id, type, title, duration_minutes) VALUES (?, ?, ?, ?)",
    [lesson.lastID, "quiz", "كويز تجريبي", 300]
  );

  await run(
    `INSERT INTO questions
     (assessment_id, text, image_url, option_a, option_b, option_c, option_d, correct_option, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [quiz.lastID, "ما وحدة قياس القوة؟", "", "الأمبير", "النيوتن", "الكيلوجرام", "الجول", 1, 1]
  );
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
  seedData
};
