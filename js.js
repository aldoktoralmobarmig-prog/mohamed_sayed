const API_BASE = (() => {
  // لو الصفحة مفتوحة من Live Server أو file://، خلّي الـ API يروح لسيرفر المنصة مباشرة.
  // لو الصفحة مفتوحة من نفس سيرفر Node (localhost:3000) هنسيبه فاضي (نفس الأصل).
  const devApi = "http://localhost:3000";
  try {
    const { protocol, hostname, port } = window.location;
    if (protocol === "file:") return devApi;
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port && port !== "3000") return devApi;
    return "";
  } catch (_e) {
    return "";
  }
})();

function setAuth(token, role, mustChangePassword = false, permissions = null) {
  localStorage.setItem("authToken", token);
  localStorage.setItem("authRole", role);
  localStorage.setItem("mustChangePassword", mustChangePassword ? "1" : "0");
  if (permissions && Array.isArray(permissions)) {
    localStorage.setItem("authPerms", JSON.stringify(permissions.map(String)));
  } else {
    localStorage.removeItem("authPerms");
  }
}

function clearAuth() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("authRole");
  localStorage.removeItem("mustChangePassword");
  localStorage.removeItem("authPerms");
}

function getToken() {
  return localStorage.getItem("authToken") || "";
}

function getRole() {
  return localStorage.getItem("authRole") || "";
}

function getMustChangePassword() {
  return localStorage.getItem("mustChangePassword") === "1";
}

function getPerms() {
  try {
    const raw = localStorage.getItem("authPerms");
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch (_e) {
    return [];
  }
}

function hasPerm(perm) {
  const role = getRole();
  if (role === "owner") return true;
  if (role !== "supervisor") return false;
  return new Set(getPerms()).has(String(perm));
}

const STAFF_PERMS = {
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
  AUDIT_READ: "audit:read"
};

const SUPERVISOR_PERM_OPTIONS = [
  { value: STAFF_PERMS.COURSES_WRITE, label: "إضافة كورسات" },
  { value: STAFF_PERMS.LESSONS_WRITE, label: "إضافة محاضرات" },
  { value: STAFF_PERMS.ASSESSMENTS_WRITE, label: "إضافة كويز/واجب/امتحان" },
  { value: STAFF_PERMS.QUESTIONS_WRITE, label: "إضافة أسئلة" },
  { value: STAFF_PERMS.FORUM_REPLY, label: "الرد على أسئلة/رسائل الطلاب" },
  { value: STAFF_PERMS.UPLOAD_WRITE, label: "رفع صور الأسئلة" },
  { value: STAFF_PERMS.STUDENTS_READ, label: "مشاهدة الطلاب" },
  { value: STAFF_PERMS.ALERTS_READ, label: "مشاهدة الطلاب غير المكتملين (محاضرات/كويز/واجب/امتحان)" },
  { value: STAFF_PERMS.STUDENTS_CODES_WRITE, label: "إصدار/حذف أكواد دخول الطلاب" },
  { value: STAFF_PERMS.NOTIFICATIONS_SEND, label: "إرسال إشعارات للطلاب (داخل المنصة)" },
  { value: STAFF_PERMS.ATTEMPTS_READ, label: "مشاهدة نتائج الطلاب" },
  { value: STAFF_PERMS.PAYMENTS_READ, label: "مشاهدة طلبات الاشتراك" },
  { value: STAFF_PERMS.PAYMENTS_APPROVE, label: "تأكيد الدفع" },
  { value: STAFF_PERMS.SUBSCRIBERS_READ, label: "مشاهدة المشتركين" },
  { value: STAFF_PERMS.GUARDIAN_MANAGE, label: "إدارة لوحة ولي الأمر" },
  { value: STAFF_PERMS.AUDIT_READ, label: "مشاهدة سجل العمليات" }
];

function byId(id) {
  return document.getElementById(id);
}

function isAuthErrorMessage(message) {
  const msg = String(message || "");
  return (
    msg === "Unauthorized" ||
    msg === "Invalid token" ||
    msg === "Owner only" ||
    msg === "Student only" ||
    msg === "You must change password first"
  );
}

function parseDbDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function optimizeImageUrl(url, width = 900) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return raw;
  if (!/images\.unsplash\.com/i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("auto")) u.searchParams.set("auto", "format");
    if (!u.searchParams.has("fit")) u.searchParams.set("fit", "crop");
    if (!u.searchParams.has("q")) u.searchParams.set("q", "70");
    if (!u.searchParams.has("w")) u.searchParams.set("w", String(Math.max(480, Number(width) || 900)));
    return u.toString();
  } catch (_e) {
    return raw;
  }
}

function formatRemainingUntil(value) {
  const d = parseDbDateTime(value);
  if (!d) return "-";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "انتهت";
  const totalMinutes = Math.ceil(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} دقيقة`;
  if (m === 0) return `${h} ساعة`;
  return `${h} ساعة و ${m} دقيقة`;
}

function initPasswordToggles() {
  const toggles = document.querySelectorAll(".pass-toggle");
  toggles.forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = byId(targetId);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.innerHTML = isPassword
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });
  });
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    "Content-Type": options.body instanceof FormData ? undefined : "application/json"
  };

  if (headers["Content-Type"] === undefined) delete headers["Content-Type"];
  if (token) headers.Authorization = `Bearer ${token}`;

  const fullUrl = `${API_BASE}${url}`;
  let response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers
    });
  } catch (_networkErr) {
    const baseHint = API_BASE || window.location.origin;
    throw new Error(
      `Failed to fetch: تعذر الاتصال بالسيرفر.\n` +
      `تأكد إن السيرفر شغال على ${baseHint}.\n` +
      `لو فاتح الصفحة من file:// افتحها من: http://localhost:3000/`
    );
  }

  let data = {};
  let rawText = "";
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      rawText = await response.text();
    }
  } catch (_err) {
    data = {};
  }

  if (!response.ok) {
    const fallback = rawText
      ? rawText.replace(/\s+/g, " ").trim().slice(0, 180)
      : `HTTP ${response.status}`;
    throw new Error(data.error || data.details || fallback || "Request failed");
  }

  return data;
}

function initRegisterPage() {
  const form = document.querySelector('form[action="aftermain.html"]');
  if (!form) return;
  initPasswordToggles();

  const passwordInput = byId("paasword");
  const confirmInput = byId("confirmRegisterPassword");

  function updateRegisterPasswordMatchUI() {
    if (!passwordInput || !confirmInput) return true;
    const a = passwordInput.value || "";
    const b = confirmInput.value || "";
    const mismatch = b.length > 0 && a !== b;
    passwordInput.classList.toggle("soft-error", mismatch);
    confirmInput.classList.toggle("soft-error", mismatch);
    return !mismatch;
  }

  passwordInput?.addEventListener("input", updateRegisterPasswordMatchUI);
  confirmInput?.addEventListener("input", updateRegisterPasswordMatchUI);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!updateRegisterPasswordMatchUI()) {
      alert("تأكيد كلمة السر غير مطابق.");
      return;
    }
    try {
      const payload = {
        firstName: byId("firstname")?.value.trim() || "",
        secondName: byId("secondname")?.value.trim() || "",
        thirdName: byId("thirdname")?.value.trim() || "",
        phone: byId("telm")?.value.trim() || "",
        email: byId("email")?.value.trim() || "",
        guardianPhone: byId("telf")?.value.trim() || "",
        grade: byId("selectsaf")?.value || "",
        governorate: byId("selectedmoh")?.value || "",
        branch: byId("shopa")?.value || "",
        subject: byId("subject")?.value || "",
        password: byId("paasword")?.value || ""
      };

      const result = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAuth(result.token, result.role, false, result.permissions || null);
      window.location.href = "aftermain.html";
    } catch (err) {
      alert(`فشل إنشاء الحساب: ${err.message}`);
    }
  });
}

function initLoginPage() {
  const passwordForm = document.querySelector(".login-form");
  const codeForm = byId("codeLoginForm");
  const guardianLoginForm = byId("guardianLoginForm");
  const changeWrap = byId("changePasswordWrap");
  const changeForm = byId("changePasswordForm");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const passwordTab = byId("passwordTab");
  const codeTab = byId("codeTab");
  const guardianTab = byId("guardianTab");
  const guardianRequestAccessBtn = byId("guardianRequestAccessBtn");
  const guardianForgotToggleBtn = byId("guardianForgotToggleBtn");
  const guardianForgotWrap = byId("guardianForgotWrap");
  const guardianResetSubmit = byId("guardianResetSubmit");
  const forgotWrap = document.querySelector(".forgot-wrap");
  const forgotSubmit = document.querySelector(".forgot-box .forgot-submit");
  const recoveryPhoneInput = document.querySelector('input[name="recovery_phone"]');
  const recoveryEmailInput = document.querySelector('input[name="recovery_email"]');
  if (!passwordForm && !codeForm && !guardianLoginForm) return;
  initPasswordToggles();

  function activateTab(tab) {
    tabButtons.forEach((b) => b.classList.remove("active"));
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (targetBtn) targetBtn.classList.add("active");
    if (passwordTab) passwordTab.classList.toggle("active", tab === "password");
    if (codeTab) codeTab.classList.toggle("active", tab === "code");
    if (guardianTab) guardianTab.classList.toggle("active", tab === "guardian");
    if (forgotWrap) forgotWrap.hidden = tab === "guardian";
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        phone: byId("phone")?.value.trim() || "",
        password: byId("password")?.value || ""
      };

      const result = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAuth(result.token, result.role, false, result.permissions || null);
      if (result.role === "owner" || result.role === "supervisor") {
        window.location.href = "owner.html";
      } else if (result.role === "guardian") {
        window.location.href = "guardian.html";
      } else {
        window.location.href = "aftermain.html";
      }
    } catch (err) {
      alert(`فشل تسجيل الدخول: ${err.message}`);
    }
  });

  guardianLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        phone: byId("guardianPhoneLogin")?.value.trim() || "",
        password: byId("guardianPasswordLogin")?.value || ""
      };
      const result = await apiFetch("/api/guardian/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setAuth(result.token, result.role, false, null);
      window.location.href = "guardian.html";
    } catch (err) {
      alert(`فشل دخول ولي الأمر: ${err.message}`);
    }
  });

  guardianRequestAccessBtn?.addEventListener("click", async () => {
    try {
      const phone = byId("guardianPhoneLogin")?.value.trim() || "";
      if (!phone) {
        alert("اكتب رقم ولي الأمر أولاً.");
        return;
      }
      const result = await apiFetch("/api/guardian/request-access", {
        method: "POST",
        body: JSON.stringify({ phone })
      });
      if (result?.alreadyHasPassword) {
        alert("هذا الرقم لديه كلمة سر بالفعل. لو ناسيها اضغط (نسيت كلمة السر؟).");
        return;
      }
      alert("تم إرسال الطلب للمالك. سيتم إرسال كلمة السر لرقم ولي الأمر بعد المراجعة.");
    } catch (err) {
      alert(err.message || "تعذر إرسال الطلب.");
    }
  });

  guardianForgotToggleBtn?.addEventListener("click", () => {
    if (!guardianForgotWrap) return;
    guardianForgotWrap.hidden = !guardianForgotWrap.hidden;
    if (!guardianForgotWrap.hidden) {
      const phoneFromLogin = byId("guardianPhoneLogin")?.value.trim() || "";
      const resetInput = byId("guardianResetPhone");
      if (resetInput && phoneFromLogin && !resetInput.value) resetInput.value = phoneFromLogin;
    }
  });

  guardianResetSubmit?.addEventListener("click", async () => {
    try {
      const phone = byId("guardianResetPhone")?.value.trim() || "";
      const guardianName = byId("guardianResetName")?.value.trim() || "";
      const hasWhatsapp = !!byId("guardianHasWhatsapp")?.checked;
      if (!phone) {
        alert("اكتب رقم ولي الأمر أولاً.");
        return;
      }
      const result = await apiFetch("/api/guardian/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ phone, guardianName, hasWhatsapp })
      });
      if (result?.blocked) {
        alert(result?.message || "لا يمكن تنفيذ الطلب الآن.");
        return;
      }
      if (result?.whatsappUrl) {
        const popup = window.open(result.whatsappUrl, "_blank");
        if (!popup) window.location.href = result.whatsappUrl;
        alert(
          `تم إرسال طلب الاستعادة للدعم عبر واتساب.\n` +
          `انتظر تأكيد المالك بعد إرسال كلمة السر الجديدة.`
        );
        return;
      }
      alert(
        `سيتم إرسال كلمة السر الخاص بك عبر واتساب أو sms.\n` +
        `انتظر تأكيد المالك بعد إرسال كلمة السر الجديدة.`
      );
    } catch (err) {
      alert(err.message || "تعذر إرسال طلب الاستعادة.");
    }
  });

  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        phone: byId("codePhone")?.value.trim() || "",
        code: byId("accessCode")?.value.trim() || ""
      };
      const result = await apiFetch("/api/auth/login-code", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setAuth(result.token, result.role, true, result.permissions || null);
      if (changeWrap) {
        changeWrap.hidden = false;
      }
      alert("تم التحقق من الكود. لازم تغيّر كلمة السر الآن.");
    } catch (err) {
      alert(`فشل الدخول بالكود: ${err.message}`);
    }
  });

  changeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const newPassword = byId("newPassword")?.value || "";
      const confirmPassword = byId("confirmPassword")?.value || "";
      if (newPassword.length < 6) {
        alert("كلمة السر الجديدة لازم تكون 6 أحرف على الأقل.");
        return;
      }
      if (newPassword !== confirmPassword) {
        alert("تأكيد كلمة السر غير مطابق.");
        return;
      }

      const result = await apiFetch("/api/auth/change-password-with-code", {
        method: "POST",
        body: JSON.stringify({ newPassword })
      });
      setAuth(result.token, result.role, false, null);
      alert("تم تغيير كلمة السر بنجاح.");
      window.location.href = "aftermain.html";
    } catch (err) {
      alert(`تعذر تغيير كلمة السر: ${err.message}`);
    }
  });

  forgotSubmit?.addEventListener("click", async () => {
    try {
      const phone = recoveryPhoneInput?.value.trim() || "";
      const email = recoveryEmailInput?.value.trim() || "";
      if (!phone) {
        alert("اكتب رقم الهاتف أولًا.");
        return;
      }
      if (!email) {
        alert("اكتب البريد الإلكتروني أولًا.");
        return;
      }
      const result = await apiFetch("/api/auth/request-reset-code", {
        method: "POST",
        body: JSON.stringify({ phone, email })
      });
      activateTab("code");
      if (byId("codePhone")) byId("codePhone").value = phone;
      if (result.whatsappUrl) {
        const popup = window.open(result.whatsappUrl, "_blank");
        if (!popup) {
          window.location.href = result.whatsappUrl;
        }
      }
      alert("تم إرسال رقمك لواتساب الدعم. إذا كان الرقم مسجلًا، سيتم توليد كود صالح 24 ساعة ويرسله لك المالك.");
    } catch (err) {
      alert(err.message || "تعذر إرسال الكود.");
    }
  });
}

function initOwnerPage() {
  const ownerApp = byId("ownerApp");
  if (!ownerApp) return;

  function showOwnerInlineNotice(message, duration = 3200) {
    let stack = document.querySelector(".owner-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "owner-toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = "owner-toast";
    toast.textContent = String(message || "");
    stack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => {
        toast.remove();
        if (!stack.childElementCount) stack.remove();
      }, 180);
    }, Math.max(1200, Number(duration) || 3200));
  }

  function showOwnerConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "owner-confirm-overlay";
      overlay.innerHTML = `
        <div class="owner-confirm-card" role="dialog" aria-modal="true">
          <p class="owner-confirm-text">${String(message || "")}</p>
          <div class="owner-confirm-actions">
            <button type="button" class="owner-confirm-btn" data-owner-confirm="cancel">إلغاء</button>
            <button type="button" class="owner-confirm-btn danger" data-owner-confirm="ok">تأكيد</button>
          </div>
        </div>
      `;
      const close = (ok) => {
        overlay.remove();
        resolve(!!ok);
      };
      overlay.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-owner-confirm]");
        if (btn) {
          close(btn.getAttribute("data-owner-confirm") === "ok");
          return;
        }
        if (e.target === overlay) close(false);
      });
      document.body.appendChild(overlay);
    });
  }

  // استبدال تنبيه المتصفح بتنبيه داخل صفحة لوحة المالك.
  window.alert = (message) => {
    showOwnerInlineNotice(message);
  };

  const role = getRole();
  const isOwner = role === "owner";
  const isSupervisor = role === "supervisor";

  if (!isOwner && !isSupervisor) {
    window.location.href = "sign.html";
    return;
  }

  function showOwnerLoginToast() {
    const toast = document.createElement("div");
    toast.style.cssText = "position:fixed;top:18px;right:18px;z-index:99999;background:#0f7b3f;color:#fff;padding:10px 14px;border-radius:10px;display:flex;align-items:center;gap:8px;font-weight:700;box-shadow:0 10px 24px rgba(0,0,0,.2);opacity:0;transform:translateY(-8px);transition:opacity .25s ease,transform .25s ease;";
    toast.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>تم تسجيل الدخول بنجاح</span>';
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      setTimeout(() => toast.remove(), 260);
    }, 2200);
  }

  try {
    if (sessionStorage.getItem("ownerLoginSuccess") === "1") {
      sessionStorage.removeItem("ownerLoginSuccess");
      setTimeout(showOwnerLoginToast, 120);
    }
  } catch (_e) {
    // ignore
  }

  const ownerStudents = byId("ownerStudents");
  const ownerQuizAttempts = byId("ownerQuizAttempts");
  const ownerHomeworkAttempts = byId("ownerHomeworkAttempts");
  const ownerExamAttempts = byId("ownerExamAttempts");
  const addCourseForm = byId("addCourseForm");
  const addLessonForm = byId("addLessonForm");
  const addAssessmentForm = byId("addAssessmentForm");
  const addQuestionForm = byId("addQuestionForm");
  const uploadImageForm = byId("uploadImageForm");
  const importQuestionsForm = byId("importQuestionsForm");
  const questionImportAssessmentId = byId("questionImportAssessmentId");
  const questionImportCsvFile = byId("questionImportCsvFile");
  const downloadQuestionCsvTemplate = byId("downloadQuestionCsvTemplate");
  const ownerMenuToggle = byId("ownerMenuToggle");
  const ownerSideMenu = byId("ownerSideMenu");
  const deleteManagerPanel = byId("deleteManagerPanel");
  const assessmentType = byId("assessmentType");
  const assessmentDuration = byId("assessmentDuration");
  const assessmentMaxAttempts = byId("assessmentMaxAttempts");
	  const studentSearch = byId("studentSearch");
	  const ownerProgressReload = byId("ownerProgressReload");
		  const ownerMessageText = byId("ownerMessageText");
		  const ownerMessageAudience = byId("ownerMessageAudience");
		  const ownerMessagePhone = byId("ownerMessagePhone");
		  const ownerMessageGradeScope = byId("ownerMessageGradeScope");
		  const ownerSendMessage = byId("ownerSendMessage");
		  const ownerOpenWhatsapp = byId("ownerOpenWhatsapp");
		  const alertsSearch = byId("alertsSearch");
		  const alertsFilterType = byId("alertsFilterType");
		  const alertsSendRemindersPlatform = byId("alertsSendRemindersPlatform");
		  const alertsShowWhatsappLinks = byId("alertsShowWhatsappLinks");
		  const alertsCopyWhatsappLinks = byId("alertsCopyWhatsappLinks");
		  const alertsWhatsappLinks = byId("alertsWhatsappLinks");
		  const ownerMessagesLogSearch = byId("ownerMessagesLogSearch");
		  const ownerMessagesLogReload = byId("ownerMessagesLogReload");
		  const ownerMessagesLogList = byId("ownerMessagesLogList");
		  const guardianRequestsSearch = byId("guardianRequestsSearch");
		  const guardianRequestsStatus = byId("guardianRequestsStatus");
		  const guardianRequestsReload = byId("guardianRequestsReload");
		  const guardianRequestsList = byId("guardianRequestsList");
		  const guardianManualPhone = byId("guardianManualPhone");
		  const guardianManualPassword = byId("guardianManualPassword");
		  const guardianManualGenerate = byId("guardianManualGenerate");
		  const guardianManualSave = byId("guardianManualSave");
		  const guardianManualWhatsapp = byId("guardianManualWhatsapp");
		  const guardianManualCopy = byId("guardianManualCopy");
		  const guardianManualMsg = byId("guardianManualMsg");
		  const ownerAlertsList = byId("ownerAlertsList");
		  const ownerQuizSearch = byId("ownerQuizSearch");
		  const ownerHomeworkSearch = byId("ownerHomeworkSearch");
		  const ownerExamSearch = byId("ownerExamSearch");
		  const ownerForumSearch = byId("ownerForumSearch");
		  const ownerForumStatus = byId("ownerForumStatus");
		  const ownerForumReload = byId("ownerForumReload");
		  const ownerForumQuestionsList = byId("ownerForumQuestionsList");
		  const ownerForumReplyBox = byId("ownerForumReplyBox");
		  const ownerForumSelectedMeta = byId("ownerForumSelectedMeta");
		  const ownerForumAnswersList = byId("ownerForumAnswersList");
		  const ownerForumAnswerForm = byId("ownerForumAnswerForm");
		  const ownerForumAnswerText = byId("ownerForumAnswerText");
		  const ownerForumAnswerImageFile = byId("ownerForumAnswerImageFile");
		  const ownerForumRecordStart = byId("ownerForumRecordStart");
		  const ownerForumRecordStop = byId("ownerForumRecordStop");
		  const ownerForumRecordedAudio = byId("ownerForumRecordedAudio");
  const gradeButtons = document.querySelectorAll(".grade-btn");
  const activeGradeLabel = byId("activeGradeLabel");
	  const deleteCoursesList = byId("deleteCoursesList");
	  const deleteLessonsList = byId("deleteLessonsList");
	  const deleteQuizzesList = byId("deleteQuizzesList");
	  const deleteHomeworkList = byId("deleteHomeworkList");
	  const deleteExamsList = byId("deleteExamsList");
	  const ownerPaymentRequests = byId("ownerPaymentRequests");
	  const paymentsSearch = byId("paymentsSearch");
	  const paymentsKindFilter = byId("paymentsKindFilter");
	  const ownerSubscribers = byId("ownerSubscribers");
	  const subscribersSearch = byId("subscribersSearch");
	  const subscribersKindFilter = byId("subscribersKindFilter");
	  const auditSearch = byId("auditSearch");
	  const auditLimit = byId("auditLimit");
	  const auditActorRole = byId("auditActorRole");
	  const auditActorId = byId("auditActorId");
	  const auditAction = byId("auditAction");
	  const auditReload = byId("auditReload");
	  const ownerAuditList = byId("ownerAuditList");
	  const ownerSupervisorsList = byId("ownerSupervisorsList");
	  const addSupervisorForm = byId("addSupervisorForm");
	  const coursePriceSelect = byId("coursePrice");
	  const lessonPriceSelect = byId("lessonPrice");
	  const lessonMode = byId("lessonMode");
	  const lessonIndividualPriceWrap = byId("lessonIndividualPriceWrap");
	  const lessonIndividualImageWrap = byId("lessonIndividualImageWrap");

  const lessonCourseId = byId("lessonCourseId");
  const assessmentCourseId = byId("assessmentCourseId");
  const assessmentLessonId = byId("assessmentLessonId");
  const questionAssessmentId = byId("questionAssessmentId");
  let ownerStudentsCache = [];
	  let ownerAttemptsCache = { quiz: [], homework: [], exam: [] };
	  let ownerPaymentRequestsCache = [];
	  let ownerSubscribersCache = [];
	  let ownerAuditCache = [];
	  let guardianRequestsCache = [];
		  let selectedGrade = "الصف الأول الثانوي";
		  const ownerIssuedCodes = new Map();
		  const ownerProgressByStudentId = new Map();
		  let ownerProgressStudentsCache = [];
		  let ownerAlertsComputedCache = [];
		  let ownerMessagesLogCache = [];
		  let ownerProgressMeta = { loaded: false, grade: "", q: "" };
		  let ownerLessonsForSelectedGrade = [];
		  let ownerForumSelectedId = 0;
		  let ownerForumRecorder = null;
		  let ownerForumRecordedBlob = null;
		  let ownerForumRecordedStream = null;
		  let ownerForumRecordChunks = [];
				  let ownerManageData = { courses: [], lessons: [], assessments: [] };
				  let ownerMapCache = { courses: [], lessons: [], assessments: [], questions: [] };
			  const panels = {
			    courses: [byId("ownerCoursesPanel"), byId("ownerLessonsPanel"), byId("ownerAssessmentsPanel"), byId("ownerQuestionsPanel")],
			    delete: [byId("deleteManagerPanel")],
			    students: [byId("ownerStudentsPanel")],
			    alerts: [byId("ownerAlertsPanel")],
			    forum: [byId("ownerForumPanel")],
			    guardian: [byId("ownerGuardianPanel")],
			    payments: [byId("ownerPaymentsPanel")],
			    subscribers: [byId("ownerSubscribersPanel")],
			    audit: [byId("ownerAuditPanel")],
			    supervisors: [byId("ownerSupervisorsPanel")],
			    quiz: [byId("ownerQuizPanel")],
			    homework: [byId("ownerHomeworkPanel")],
			    exam: [byId("ownerExamPanel")]
			  };

		  const permSet = new Set(getPerms());
		  const has = (p) => (isOwner ? true : permSet.has(String(p)));
		  const hasAny = (arr) => (isOwner ? true : arr.some((p) => permSet.has(String(p))));

		  const canContentManage = hasAny([
		    STAFF_PERMS.COURSES_WRITE,
		    STAFF_PERMS.LESSONS_WRITE,
		    STAFF_PERMS.ASSESSMENTS_WRITE,
		    STAFF_PERMS.QUESTIONS_WRITE,
		    STAFF_PERMS.UPLOAD_WRITE
		  ]);
		  const canStudentsRead = has(STAFF_PERMS.STUDENTS_READ);
		  const canAlertsView = isOwner || has(STAFF_PERMS.STUDENTS_READ) || has(STAFF_PERMS.ALERTS_READ);
		  const canStudentCodesWrite = has(STAFF_PERMS.STUDENTS_CODES_WRITE);
		  const canNotificationsSend = isOwner || has(STAFF_PERMS.NOTIFICATIONS_SEND);
		  const canAttemptsRead = has(STAFF_PERMS.ATTEMPTS_READ);
		  const canForumReply = has(STAFF_PERMS.FORUM_REPLY);
		  const canPaymentsRead = has(STAFF_PERMS.PAYMENTS_READ);
			  const canPaymentsApprove = has(STAFF_PERMS.PAYMENTS_APPROVE);
			  const canSubscribersRead = has(STAFF_PERMS.SUBSCRIBERS_READ);
			  const canGuardianManage = has(STAFF_PERMS.GUARDIAN_MANAGE);
			  const canAuditRead = has(STAFF_PERMS.AUDIT_READ);

			  function normalizePhoneDigits(value) {
			    return String(value || "").replace(/\D/g, "");
			  }

			  function phoneToWhatsappNumber(phone) {
			    const digits = normalizePhoneDigits(phone);
			    if (!digits) return "";
			    if (digits.startsWith("0") && digits.length === 11) return `20${digits.slice(1)}`;
			    if (digits.startsWith("20") && digits.length >= 12) return digits;
			    return digits;
			  }

			  function whatsappUrlFor(phone, message) {
			    const n = phoneToWhatsappNumber(phone);
			    if (!n) return "";
			    const text = encodeURIComponent(String(message || "").trim());
			    return `https://wa.me/${n}${text ? `?text=${text}` : ""}`;
			  }

			  function forumStatusText(status) {
			    return String(status || "") === "answered" ? "تمت الإجابة" : "مفتوح";
			  }

			  function ownerForumItemHtml(q) {
			    const status = String(q.status || "open");
			    const statusClass = status === "answered" ? "badge-ok" : "badge-warn";
			    const body = String(q.body || "").trim();
			    const image = String(q.image_url || "").trim();
			    const count = Number(q.answers_count || 0);
			    return `
			      <article class="item">
			        <h4>#${q.id} - ${q.title || "-"}</h4>
			        <p>الطالب: ${q.student_name || "-"} (${q.student_phone || "-"})</p>
			        <p>الصف/المادة: ${q.grade || "-"} / ${q.subject || "-"}</p>
			        <p>الحالة: <span class="${statusClass}">${forumStatusText(status)}</span></p>
			        ${body ? `<p>${body}</p>` : ""}
			        ${image ? `<img src="${image}" alt="صورة السؤال" style="max-width:220px;border-radius:10px;border:1px solid #ddd">` : ""}
			        <p>عدد الردود: ${count}</p>
			        <small>التاريخ: ${q.created_at || "-"}</small>
			        <div class="grid two-col" style="margin-top:8px">
			          <button type="button" class="owner-code-btn" data-owner-forum-open="${q.id}">فتح السؤال</button>
			          <button type="button" class="copy-code-btn" data-owner-forum-status="${q.id}" data-next-status="${status === "answered" ? "open" : "answered"}">${status === "answered" ? "إعادة فتح" : "تحديد تمت الإجابة"}</button>
			        </div>
			      </article>
			    `;
			  }

			  function renderOwnerForumQuestions(rows) {
			    if (!ownerForumQuestionsList) return;
			    const list = Array.isArray(rows) ? rows : [];
			    if (!list.length) {
			      ownerForumQuestionsList.innerHTML = "<p class='empty'>لا توجد أسئلة منتدى مطابقة.</p>";
			      return;
			    }
			    ownerForumQuestionsList.innerHTML = list.map(ownerForumItemHtml).join("");
			  }

			  async function loadOwnerForumQuestions() {
			    if (!canForumReply || !ownerForumQuestionsList) return;
			    const qs = new URLSearchParams();
			    const q = String(ownerForumSearch?.value || "").trim();
			    const status = String(ownerForumStatus?.value || "").trim();
			    if (q) qs.set("q", q);
			    if (status) qs.set("status", status);
			    if (selectedGrade) qs.set("grade", selectedGrade);
			    const rows = await apiFetch(`/api/owner/forum/questions?${qs.toString()}`);
			    renderOwnerForumQuestions(rows || []);
			  }

			  function renderOwnerForumAnswers(answers) {
			    if (!ownerForumAnswersList) return;
			    const list = Array.isArray(answers) ? answers : [];
			    if (!list.length) {
			      ownerForumAnswersList.innerHTML = "<p class='empty'>لا توجد ردود لهذا السؤال.</p>";
			      return;
			    }
			    ownerForumAnswersList.innerHTML = list
			      .map((a) => `
			        <article class="item">
			          <p><strong>${a.author_role === "owner" ? "المالك" : "مشرف"}</strong></p>
			          ${a.body ? `<p>${a.body}</p>` : ""}
			          ${a.image_url ? `<img src="${a.image_url}" alt="صورة الرد" style="max-width:220px;border-radius:10px;border:1px solid #ddd">` : ""}
			          ${a.audio_url ? `<audio controls src="${a.audio_url}" style="width:100%;margin-top:6px"></audio>` : ""}
			          <small>${a.created_at || "-"}</small>
			        </article>
			      `)
			      .join("");
			  }

			  async function loadOwnerForumQuestionDetails(id) {
			    const qid = Number(id);
			    if (!qid) return;
			    const data = await apiFetch(`/api/owner/forum/questions/${qid}`);
			    ownerForumSelectedId = qid;
			    if (ownerForumReplyBox) ownerForumReplyBox.hidden = false;
			    if (ownerForumSelectedMeta) {
			      ownerForumSelectedMeta.textContent = `السؤال #${data?.question?.id || qid} - ${data?.question?.title || "-"} | ${data?.question?.student_name || "-"}`;
			    }
			    renderOwnerForumAnswers(data?.answers || []);
			  }

			  async function uploadOwnerForumImage(file) {
			    const fd = new FormData();
			    fd.append("image", file);
			    const data = await apiFetch("/api/owner/forum/upload-image", { method: "POST", body: fd });
			    return String(data?.imageUrl || "");
			  }

			  async function uploadOwnerForumAudio(blob) {
			    const fd = new FormData();
			    fd.append("audio", blob, "forum-reply.webm");
			    const data = await apiFetch("/api/owner/forum/upload-audio", { method: "POST", body: fd });
			    return String(data?.audioUrl || "");
			  }

		  function hideOwnerAction(action) {
		    ownerSideMenu?.querySelector(`[data-owner-action="${action}"]`)?.remove();
		    (panels[action] || []).forEach((p) => p && (p.hidden = true));
		  }

		  // عناصر خاصة بالمالك فقط
		  if (!isOwner) {
		    hideOwnerAction("delete");
		    hideOwnerAction("supervisors");
		  }

		  // عرض اللوحات حسب الصلاحيات (للمشرف)
		  if (isSupervisor && !canContentManage) hideOwnerAction("courses");
		  if (isSupervisor && !canStudentsRead) hideOwnerAction("students");
		  if (isSupervisor && !canAlertsView && !canNotificationsSend) hideOwnerAction("alerts");
		  if (isSupervisor && !canForumReply) hideOwnerAction("forum");
		  if (isSupervisor && !canPaymentsRead) hideOwnerAction("payments");
		  if (isSupervisor && !canSubscribersRead) hideOwnerAction("subscribers");
		  if (isSupervisor && !canGuardianManage) hideOwnerAction("guardian");
		  if (isSupervisor && !canAuditRead) hideOwnerAction("audit");
		  if (isSupervisor && !canAttemptsRead) {
		    hideOwnerAction("quiz");
		    hideOwnerAction("homework");
		    hideOwnerAction("exam");
		  }

	  function formatEgp(cents) {
	    const n = Number(cents) || 0;
	    return `${(n / 100).toFixed(2)} جنيه`;
	  }

	  function fillPriceOptions(selectEl) {
	    if (!selectEl) return;
	    if (selectEl.dataset.filled === "1") return;
	    selectEl.dataset.filled = "1";

	    const currentValue = String(selectEl.value || "");
	    selectEl.innerHTML = "";

	    const freeOption = document.createElement("option");
	    freeOption.value = "";
	    freeOption.textContent = "مجاني / بدون سعر";
	    selectEl.appendChild(freeOption);

	    for (let egp = 5; egp <= 600; egp += 5) {
	      const opt = document.createElement("option");
	      opt.value = String(egp);
	      opt.textContent = `${egp} جنيه`;
	      selectEl.appendChild(opt);
	    }

	    if (currentValue) selectEl.value = currentValue;
	  }

	  function updateLessonModeFields() {
	    const isIndividual = String(lessonMode?.value || "course") === "individual";
	    if (lessonIndividualPriceWrap) lessonIndividualPriceWrap.hidden = !isIndividual;
	    if (lessonIndividualImageWrap) lessonIndividualImageWrap.hidden = !isIndividual;
	  }

		  function renderPaymentRequests(rows) {
		    if (!ownerPaymentRequests) return;
		    const list = Array.isArray(rows) ? rows : [];
		    const q = String(paymentsSearch?.value || "").trim().toLowerCase();
		    const kindFilter = String(paymentsKindFilter?.value || "").trim();

		    const filtered = list.filter((r) => {
		      if (kindFilter && String(r.kind || "") !== kindFilter) return false;
		      if (!q) return true;
		      const hay = [
		        r.student_name,
		        r.student_phone,
		        r.course_title,
		        r.lesson_title,
		        r.reference,
		        r.course_subject
		      ]
		        .filter(Boolean)
		        .join(" ")
		        .toLowerCase();
		      return hay.includes(q);
		    });

		    if (!filtered.length) {
		      ownerPaymentRequests.innerHTML = list.length
		        ? "<p class='empty'>لا توجد طلبات مطابقة للبحث.</p>"
		        : "<p class='empty'>لا توجد طلبات اشتراك حالياً.</p>";
		      return;
		    }

		    ownerPaymentRequests.innerHTML = filtered
		      .map((r) => {
		        const kindText = r.kind === "course" ? "كورس" : "محاضرة";
		        const title = r.kind === "course"
		          ? r.course_title
		          : `${r.course_title || ""}${r.lesson_title ? ` / ${r.lesson_title}` : ""}`;
		        const created = String(r.created_at || "");
		        const [datePart, timePart] = created.includes(" ") ? created.split(" ") : [created, ""];
		        const remain = r.expires_at ? formatRemainingUntil(r.expires_at) : "-";
		        const approveBtn = canPaymentsApprove
		          ? `<button type="button" class="owner-approve-btn" data-request-id="${r.id}">تأكيد الدفع وفتح الاشتراك</button>`
		          : "";
		        return `
		          <article class="item">
		            <h4>${kindText}: ${title || "-"}</h4>
		            <p>اسم الطالب: ${r.student_name || "-"}</p>
		            <p>رقم الطالب: ${r.student_phone || "-"}</p>
		            <p>المادة: ${r.course_subject || "-"}</p>
		            <p>المبلغ: ${formatEgp(r.amount_cents)}</p>
		            <p>المحتوى: ${title || "-"}</p>
		            <p>الرقم المرجعي: <strong>${r.reference}</strong></p>
		            <p>التاريخ: ${datePart || "-"}</p>
		            <p>الوقت: ${timePart || "-"}</p>
		            <p>المتبقي لانتهاء الصلاحية: <strong>${remain}</strong></p>
		            ${approveBtn}
		          </article>
		        `;
		      })
		      .join("");
		  }

		  async function loadOwnerPaymentRequests() {
		    const rows = await apiFetch(`/api/owner/payment-requests?grade=${encodeURIComponent(selectedGrade)}`);
		    ownerPaymentRequestsCache = rows || [];
		    renderPaymentRequests(ownerPaymentRequestsCache);
		  }

		  function renderSubscribers(rows) {
		    if (!ownerSubscribers) return;
		    const list = Array.isArray(rows) ? rows : [];
		    const q = String(subscribersSearch?.value || "").trim().toLowerCase();
		    const kindFilter = String(subscribersKindFilter?.value || "").trim();

		    const filtered = list.filter((r) => {
		      if (kindFilter && String(r.kind || "") !== kindFilter) return false;
		      if (!q) return true;
		      const hay = [r.student_name, r.student_phone, r.course_title, r.lesson_title, r.course_subject]
		        .filter(Boolean)
		        .join(" ")
		        .toLowerCase();
		      return hay.includes(q);
		    });

		    if (!filtered.length) {
		      ownerSubscribers.innerHTML = list.length
		        ? "<p class='empty'>لا توجد اشتراكات مطابقة للبحث.</p>"
		        : "<p class='empty'>لا توجد اشتراكات مفعّلة لهذا الصف حالياً.</p>";
		      return;
		    }

		    ownerSubscribers.innerHTML = filtered
		      .map((r) => {
		        const kindText = r.kind === "course" ? "اشتراك كورس" : "اشتراك محاضرة";
		        const target = r.kind === "course"
		          ? r.course_title
		          : `${r.course_title || ""}${r.lesson_title ? ` / ${r.lesson_title}` : ""}`;
		        return `
		          <article class="item">
		            <h4>${kindText}</h4>
		            <p>الطالب: ${r.student_name || "-"} (${r.student_phone || "-"})</p>
		            <p>المادة: ${r.course_subject || "-"}</p>
		            <p>المحتوى: ${target || "-"}</p>
		            <p>وقت الاشتراك: ${r.created_at || "-"}</p>
		          </article>
		        `;
		      })
		      .join("");
		  }

		  async function loadOwnerSubscribers() {
		    const rows = await apiFetch(`/api/owner/subscribers?grade=${encodeURIComponent(selectedGrade)}`);
		    ownerSubscribersCache = rows || [];
		    renderSubscribers(ownerSubscribersCache);
		  }

		  function renderAudit(rows) {
		    if (!ownerAuditList) return;
		    const list = Array.isArray(rows) ? rows : [];
		    if (!list.length) {
		      ownerAuditList.innerHTML = "<p class='empty'>لا توجد عمليات.</p>";
		      return;
		    }

		    const roleText = (r) => (r.actor_role === "owner" ? "المالك" : r.actor_role === "supervisor" ? "مشرف" : r.actor_role);
		    const prettyAction = (value) => {
		      const raw = String(value || "").trim();
		      if (!raw) return "-";
		      return raw
		        .replaceAll(".", " > ")
		        .replaceAll("_", " ");
		    };
		    ownerAuditList.innerHTML = list
		      .map((r) => {
		        const meta = r.metadata ? JSON.stringify(r.metadata, null, 2) : "";
		        const actorName = String(r.actor_name || "").trim();
		        const actorLine = actorName
		          ? `${roleText(r)}: ${actorName}${r.actor_id ? ` (#${r.actor_id})` : ""}`
		          : `${roleText(r)}${r.actor_id ? ` (#${r.actor_id})` : ""}`;
		        return `
		          <article class="item">
		            <h4>${prettyAction(r.action)}</h4>
		            <p>المنفذ: ${actorLine}</p>
		            <p>الهدف: ${r.target_type || "-"}${r.target_id ? ` (#${r.target_id})` : ""}</p>
		            ${meta ? `<pre class="grade-note" dir="ltr" style="white-space:pre-wrap">${meta}</pre>` : ""}
		            <small>التاريخ: ${r.created_at || "-"}</small>
		          </article>
		        `;
		      })
		      .join("");
		  }

		  async function loadOwnerAudit() {
		    if (!isOwner && !canAuditRead) return;
		    const limit = Number(auditLimit?.value || 100) || 100;
		    const search = String(auditSearch?.value || "").trim();
		    const actorRole = String(auditActorRole?.value || "").trim();
		    const actorId = Number(auditActorId?.value || 0);
		    const action = String(auditAction?.value || "").trim();

		    const qs = new URLSearchParams();
		    qs.set("limit", String(limit));
		    if (search) qs.set("search", search);
		    if (actorRole) qs.set("actorRole", actorRole);
		    if (actorId > 0) qs.set("actorId", String(actorId));
		    if (action) qs.set("action", action);

		    const rows = await apiFetch(`/api/owner/audit?${qs.toString()}`);
		    ownerAuditCache = rows || [];
		    renderAudit(ownerAuditCache);
		  }

		  function makeGuardianPassword(len = 8) {
		    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
		    let out = "";
		    for (let i = 0; i < len; i += 1) {
		      out += chars[Math.floor(Math.random() * chars.length)];
		    }
		    return out;
		  }

		  function guardianMessageText(phone, password) {
		    return (
		      `مرحبا ولي الأمر.\n` +
		      `رقم الدخول: ${phone}\n` +
		      `كلمة السر: ${password}\n` +
		      `ادخل من صفحة "متابعة تقدم نجلك" في المنصة.`
		    );
		  }

		  function renderGuardianRequests() {
		    if (!guardianRequestsList) return;
		    const q = String(guardianRequestsSearch?.value || "").trim().toLowerCase();
		    const filtered = (guardianRequestsCache || []).filter((r) => {
		      const phone = String(r.phone || "");
		      const children = String(r.children_names || "");
		      if (!q) return true;
		      return phone.toLowerCase().includes(q) || children.toLowerCase().includes(q);
		    });

		    if (!filtered.length) {
		      guardianRequestsList.innerHTML = "<p class='empty'>لا توجد طلبات حالياً.</p>";
		      return;
		    }

		    guardianRequestsList.innerHTML = filtered
		      .map((r) => {
		        const phone = String(r.phone || "");
		        const reqType = String(r.request_type || "access");
		        const reqTypeLabel = reqType === "reset" ? "استعادة كلمة السر" : "طلب أول كلمة سر";
		        const statusRaw = String(r.status || "");
		        const statusLabel =
		          statusRaw === "pending"
		            ? "معلق"
		            : statusRaw === "ready_to_send"
		              ? "تم توليد كلمة السر وبانتظار التأكيد"
		            : statusRaw === "resolved"
		              ? "تم الحل"
		              : statusRaw === "cooldown_blocked"
		                ? "مرفوض بسبب الصلاحية"
		              : statusRaw || "-";
		        const hasWhatsapp = Number(r.has_whatsapp || 0) === 1;
		        const channelText = hasWhatsapp ? "واتساب / SMS" : "SMS غالبًا";
		        const isReset = reqType === "reset";
		        const canConfirm = isReset && statusRaw === "ready_to_send";
		        return `
		          <article class="item">
		            <h4>رقم ولي الأمر: ${phone || "-"}</h4>
		            <p>اسم ولي الأمر: ${r.guardian_name || "-"}</p>
		            <p>نوع الطلب: <strong>${reqTypeLabel}</strong></p>
		            <p>قناة التواصل: ${channelText}</p>
		            <p>الحالة: ${statusLabel}</p>
		            <p>عدد الأبناء المرتبطين: ${Number(r.children_count || 0)}</p>
		            <p class="guardian-phone">الأبناء: ${r.children_names || "-"}</p>
		            <p>تاريخ الطلب: ${r.created_at || "-"}</p>
		            <div class="grid two-col" style="margin-top:8px">
		              <input type="text" class="guardian-password-input" data-request-id="${r.id}" data-phone="${phone}" placeholder="اكتب كلمة السر (6 أحرف على الأقل)">
		              <button type="button" class="copy-code-btn guardian-generate-btn" data-request-id="${r.id}" data-phone="${phone}">توليد كلمة سر</button>
		              <button type="button" class="guardian-save-btn" data-request-id="${r.id}" data-phone="${phone}">حفظ كلمة السر</button>
		              <button type="button" class="owner-code-btn guardian-copy-btn" data-phone="${phone}" data-request-id="${r.id}">نسخ الرسالة</button>
		              <button type="button" class="copy-code-btn guardian-wa-btn" data-phone="${phone}" data-request-id="${r.id}">إرسال عبر واتساب</button>
		              <button type="button" class="owner-code-btn guardian-sms-btn" data-phone="${phone}" data-request-id="${r.id}">إرسال عبر SMS</button>
		              ${canConfirm ? `<button type="button" class="guardian-confirm-btn" data-request-id="${r.id}" data-phone="${phone}">تأكيد الإرسال</button>` : ""}
		            </div>
		          </article>
		        `;
		      })
		      .join("");
		  }

		  async function loadGuardianRequests() {
		    if (!isOwner && !canGuardianManage) return;
		    const status = String(guardianRequestsStatus?.value || "").trim();
		    const qs = new URLSearchParams();
		    qs.set("requestType", "reset");
		    if (status) qs.set("status", status);
		    qs.set("limit", "500");
		    const rows = await apiFetch(`/api/owner/guardian-requests?${qs.toString()}`);
		    guardianRequestsCache = Array.isArray(rows) ? rows : [];
		    renderGuardianRequests();
		  }

		  function renderSupervisors(rows) {
		    if (!ownerSupervisorsList) return;
		    const list = Array.isArray(rows) ? rows : [];
		    if (!list.length) {
		      ownerSupervisorsList.innerHTML = "<p class='empty'>لا يوجد مشرفين.</p>";
		      return;
		    }
		    const labelByPerm = new Map(SUPERVISOR_PERM_OPTIONS.map((o) => [o.value, o.label]));
		    ownerSupervisorsList.innerHTML = list
		      .map((s) => {
		        const perms = Array.isArray(s.permissions) ? s.permissions.map(String) : [];
		        const permsText = perms.length
		          ? perms.map((p) => labelByPerm.get(p) || p).join("، ")
		          : "بدون صلاحيات";
		        const editBox = isOwner
		          ? `
		            <details class="perm-box" style="text-align:right">
		              <summary style="cursor:pointer;font-weight:800;color:#2f1f66">تعديل الصلاحيات</summary>
		              <div class="perm-grid" style="margin-top:10px">
		                ${SUPERVISOR_PERM_OPTIONS.map((o) => {
		                  const checked = perms.includes(o.value) ? "checked" : "";
		                  return `<label><input type="checkbox" class="supervisor-perm" value="${o.value}" ${checked}> ${o.label}</label>`;
		                }).join("")}
		              </div>
		              <input type="password" class="supervisor-new-pass" placeholder="تغيير كلمة السر (اختياري)" minlength="6">
		              <button type="button" class="owner-save-supervisor-btn" data-supervisor-id="${s.id}">حفظ</button>
		            </details>
		          `
		          : "";
		        return `
		          <article class="item">
		            <h4>${s.full_name || "-"}</h4>
		            <p>الرقم: ${s.phone || "-"}</p>
		            <p>الصلاحيات: ${permsText}</p>
		            <p>تاريخ الإضافة: ${s.created_at || "-"}</p>
		            ${editBox}
		            ${isOwner ? `<button type="button" class="delete-code-btn owner-delete-supervisor-btn" data-supervisor-id="${s.id}">حذف</button>` : ""}
		          </article>
		        `;
		      })
		      .join("");
		  }

	  async function loadOwnerSupervisors() {
	    const rows = await apiFetch("/api/owner/supervisors");
	    renderSupervisors(rows);
	  }

  function syncOwnerStudents(students) {
    ownerStudentsCache = students || [];
    ownerIssuedCodes.clear();
    ownerStudentsCache.forEach((s) => {
      if (s.active_code && s.active_code_expires_at) {
        const raw = String(s.active_code_expires_at).replace(" ", "T");
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return;
        ownerIssuedCodes.set(Number(s.id), {
          code: String(s.active_code),
          expiresAt: parsed.toISOString()
        });
      }
    });
  }

  function assessmentTypeLabel(type) {
    if (type === "quiz") return "كويز";
    if (type === "homework") return "واجب";
    if (type === "exam") return "امتحان";
    return type;
  }

  function formatSpent(sec) {
    const n = Math.max(0, Number(sec) || 0);
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    const pad = (x) => String(x).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function formatExpiryDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("ar-EG", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function formatRemainingFromIso(iso) {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    if (Number.isNaN(d.getTime()) || diff <= 0) return "منتهي";
    const total = Math.floor(diff / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (x) => String(x).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function updateCodeCountdowns() {
    const nodes = ownerStudents.querySelectorAll(".owner-code-status");
    nodes.forEach((node) => {
      const expiresAt = node.dataset.expiresAt;
      const remainEl = node.querySelector(".owner-code-remain");
      if (remainEl) remainEl.textContent = formatRemainingFromIso(expiresAt);
    });
  }

		  function updateGuardianCountdowns() {}

  function normalizeArabicText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function gradeMatches(gradeValue, gradeFilter) {
    const g = normalizeArabicText(gradeValue);
    const f = normalizeArabicText(gradeFilter);
    if (!g || !f) return false;
    if (g === f) return true;
    if (f.includes("الأول")) return g.includes("الأول");
    if (f.includes("الثاني")) return g.includes("الثاني");
    if (f.includes("الثالث")) return g.includes("الثالث");
    return false;
  }

  function bySelectedGrade(items, gradeReader) {
    return items.filter((item) => gradeMatches(gradeReader(item), selectedGrade));
  }

  function renderAssessmentLessonOptionsByCourse() {
    if (!assessmentLessonId) return;
    const selectedCourseId = Number(assessmentCourseId?.value || 0);
    if (!selectedCourseId) {
      assessmentLessonId.innerHTML = `<option value="" selected disabled>اختر المحاضرة</option>`;
      return;
    }
    const lessonsPool = Array.isArray(ownerLessonsForSelectedGrade) ? ownerLessonsForSelectedGrade : [];
    const lessons = selectedCourseId
      ? lessonsPool.filter((l) => Number(l.course_id) === selectedCourseId)
      : lessonsPool;

    if (!lessons.length) {
      assessmentLessonId.innerHTML = `<option value="" selected disabled>لا توجد محاضرات لهذا الكورس</option>`;
      return;
    }
    assessmentLessonId.innerHTML = `<option value="" selected disabled>اختر المحاضرة</option>${lessons
      .map((l) => `<option value="${l.id}">${l.title}</option>`)
      .join("")}`;
  }

  function normalizeAssessmentDurationValue() {
    if (!assessmentDuration) return 300;
    let v = Number(assessmentDuration.value || 300);
    if (!Number.isFinite(v) || v <= 0) v = 300;
    v = Math.max(5, Math.round(v / 5) * 5);
    assessmentDuration.value = String(v);
    return v;
  }

  function normalizeAssessmentMaxAttemptsValue() {
    if (!assessmentMaxAttempts) return 1;
    let v = Number(assessmentMaxAttempts.value || 1);
    if (!Number.isFinite(v) || v <= 0) v = 1;
    v = Math.max(1, Math.floor(v));
    assessmentMaxAttempts.value = String(v);
    return v;
  }

  function renderOwnerCourseMapsByGrade() {
    const coursesForGrade = (ownerMapCache.courses || []).filter((c) => {
      const g = c.grade || "";
      // لو فيه كورسات قديمة بدون صف، هنظهرها في كل الصفوف بدل ما تختفي.
      return !g || gradeMatches(g, selectedGrade);
    });
    const courseIdSet = new Set(coursesForGrade.map((c) => Number(c.id)));

    const lessonsForGrade = (ownerMapCache.lessons || []).filter((l) => courseIdSet.has(Number(l.course_id)));
    const lessonIdSet = new Set(lessonsForGrade.map((l) => Number(l.id)));

    const assessmentsForGrade = (ownerMapCache.assessments || []).filter((a) => lessonIdSet.has(Number(a.lesson_id)));
    const assessmentIdSet = new Set(assessmentsForGrade.map((a) => Number(a.id)));

    // تحديث قوائم الحذف حسب الصف
    ownerManageData = {
      courses: coursesForGrade,
      lessons: lessonsForGrade,
      assessments: assessmentsForGrade
    };
    ownerLessonsForSelectedGrade = lessonsForGrade;
    renderManageDeletePanel();

    // تحديث القوائم المنسدلة (المحاضرات/التقييمات/الأسئلة) حسب الصف
    if (lessonCourseId) {
      lessonCourseId.innerHTML = coursesForGrade
        .map((c) => `<option value="${c.id}">${c.title}${c.subject ? ` - (${c.subject})` : ""}</option>`)
        .join("");
    }

    if (assessmentCourseId) {
      assessmentCourseId.innerHTML = coursesForGrade.length
        ? `<option value="" selected disabled>اختر الكورس أولاً</option>${coursesForGrade
            .map((c) => `<option value="${c.id}">${c.title}${c.subject ? ` - (${c.subject})` : ""}</option>`)
            .join("")}`
        : `<option value="" selected disabled>لا توجد كورسات لهذا الصف</option>`;
    }
    renderAssessmentLessonOptionsByCourse();

    if (questionAssessmentId) {
      questionAssessmentId.innerHTML = assessmentsForGrade.length
        ? `<option value="" selected disabled>اختر التقييم أولاً</option>${assessmentsForGrade
            .map((a) => `<option value="${a.id}">[${assessmentTypeLabel(a.type)}] ${a.title}</option>`)
            .join("")}`
        : `<option value="" selected disabled>لا توجد تقييمات لهذا الصف</option>`;
    }
    if (questionImportAssessmentId) {
      questionImportAssessmentId.innerHTML = assessmentsForGrade.length
        ? `<option value="" selected disabled>اختر التقييم أولاً</option>${assessmentsForGrade
            .map((a) => `<option value="${a.id}">[${assessmentTypeLabel(a.type)}] ${a.title}</option>`)
            .join("")}`
        : `<option value="" selected disabled>لا توجد تقييمات لهذا الصف</option>`;
    }

    // خلي اختيار الصف في إضافة الكورس متوافق مع الصف اللي فوق
    const courseGradeSelect = byId("courseGrade");
    if (courseGradeSelect) {
      courseGradeSelect.value = selectedGrade;
    }
  }

	  function renderOwnerAttempts(container, rows, emptyText, query = "") {
	    if (!container) return;
	    container.innerHTML = "";
	    const q = String(query || "").trim().toLowerCase();
	    const filtered = !q
	      ? rows
	      : rows.filter((a) => (a.student_name || "").toLowerCase().includes(q));

    if (!filtered.length) {
      container.innerHTML = `<p class="empty">${emptyText}</p>`;
      return;
    }

	    filtered.forEach((a) => {
	      const item = document.createElement("article");
	      item.className = "item";
	      item.innerHTML = `
	        <h4>${a.student_name} - ${a.assessment_title}</h4>
	        <p>${a.course_title} / ${a.lesson_title}</p>
	        <p>المادة: ${a.course_subject || "-"}</p>
	        <p>النوع: ${assessmentTypeLabel(a.type)} | الدرجة: ${a.score}/${a.total}</p>
	        <p>الوقت المستغرق: ${formatSpent(a.spent_seconds)}</p>
	        <small>التاريخ: ${a.created_at}</small>
	      `;
	      container.appendChild(item);
	    });
	  }

  function renderOwnerStudents(query = "") {
    const gradeFiltered = bySelectedGrade(ownerStudentsCache, (s) => s.grade);
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? gradeFiltered
      : gradeFiltered.filter((s) => {
          const name = (s.full_name || "").toLowerCase();
          const phone = String(s.phone || "").toLowerCase();
          return name.includes(q) || phone.includes(q);
        });

    ownerStudents.innerHTML = "";
    if (!filtered.length) {
      ownerStudents.innerHTML = `<p class="empty">لا يوجد طالب مطابق لبحثك.</p>`;
      return;
    }

		    filtered.forEach((s) => {
		      const codeInfo = ownerIssuedCodes.get(Number(s.id));
		      const codeStatusHtml = codeInfo
		        ? `
		          <div class="owner-code-status" data-expires-at="${codeInfo.expiresAt}">
	            <p>الكود الحالي: <strong>${codeInfo.code}</strong></p>
            <p>ينتهي: <strong>${formatExpiryDate(codeInfo.expiresAt)}</strong></p>
            <p>الوقت المتبقي: <strong class="owner-code-remain">${formatRemainingFromIso(codeInfo.expiresAt)}</strong></p>
            <div class="code-actions">
              <button type="button" class="copy-code-btn" data-code="${codeInfo.code}">نسخ الكود</button>
              <button type="button" class="delete-code-btn" data-student-id="${s.id}">حذف الكود</button>
            </div>
          </div>
        `
        : "";
      const codeValue = codeInfo ? codeInfo.code : "";
      const item = document.createElement("article");
	      item.className = "item";
	      item.innerHTML = `
	        <h4>${s.full_name}</h4>
	        <div class="student-meta">
	          <span class="meta-name">الاسم: ${s.full_name}</span>
	          <span class="meta-phone">رقم الطالب: ${s.phone}</span>
	          <span class="meta-grade">الصف: ${s.grade || "-"}</span>
	          <span class="meta-subject">المادة: ${s.subject || "-"}</span>
	        </div>
	        <p class="guardian-phone">رقم ولي الأمر: ${s.guardian_phone || "-"}</p>
		        <div class="student-extra">
		          <span class="meta-governorate">المحافظة: ${s.governorate || "-"}</span>
		          <span class="meta-branch">الشعبة: ${s.branch || "-"}</span>
		        </div>
		        ${codeStatusHtml}
		        <div class="owner-code-row">
		          <button type="button" class="owner-code-btn" data-student-id="${s.id}" data-student-name="${s.full_name}">إصدار كود دخول 24 ساعة</button>
		          <input type="text" class="owner-code-input" value="${codeValue}" placeholder="الكود يظهر هنا بعد الإصدار" readonly>
		        </div>
	      `;
	      ownerStudents.appendChild(item);
	    });
		    updateCodeCountdowns();
		  }

		  function getAlertsFilterValue() {
		    const v = String(alertsFilterType?.value || "all").trim();
		    if (v === "lessons" || v === "quiz" || v === "homework" || v === "exam" || v === "all") return v;
		    return "all";
		  }

		  function selectProgressByFilter(progress, filterType) {
		    const rawLessons = Array.isArray(progress?.missingLessons) ? progress.missingLessons : [];
		    const rawAssessments = Array.isArray(progress?.missingAssessments) ? progress.missingAssessments : [];

		    if (filterType === "lessons") return { missingLessons: rawLessons, missingAssessments: [] };
		    if (filterType === "quiz" || filterType === "homework" || filterType === "exam") {
		      return { missingLessons: [], missingAssessments: rawAssessments.filter((a) => String(a.type || "") === filterType) };
		    }
		    return { missingLessons: rawLessons, missingAssessments: rawAssessments };
		  }

		  function buildReminderMessage(student, missingLessons, missingAssessments, filterType) {
		    const name = String(student?.full_name || student?.fullName || "").trim() || "طالب";
		    const parts = [`مرحباً ${name}`, "", "عندك مهام غير مكتملة في المنصة:"];

		    const joinTitles = (arr, mapper, maxItems = 8) => {
		      const list = (Array.isArray(arr) ? arr : []).slice(0, maxItems).map(mapper).filter(Boolean);
		      const extra = (Array.isArray(arr) ? arr.length : 0) - list.length;
		      const base = list.join("، ");
		      if (extra > 0) return `${base}${base ? "، " : ""}+${extra} أخرى`;
		      return base;
		    };

		    if (filterType === "all" || filterType === "lessons") {
		      if (missingLessons.length) {
		        const titles = joinTitles(missingLessons, (x) => `${x.courseTitle || "-"} / ${x.lessonTitle || "-"}`);
		        parts.push(`- محاضرات لم تُفتح (${missingLessons.length}): ${titles}`);
		      }
		    }

		    const typeLabel = (t) => (t === "quiz" ? "كويزات" : t === "homework" ? "واجبات" : t === "exam" ? "امتحانات" : "تقييمات");

		    if (filterType === "all") {
		      const quiz = missingAssessments.filter((a) => String(a.type || "") === "quiz");
		      const homework = missingAssessments.filter((a) => String(a.type || "") === "homework");
		      const exam = missingAssessments.filter((a) => String(a.type || "") === "exam");
		      const other = missingAssessments.filter((a) => !["quiz", "homework", "exam"].includes(String(a.type || "")));

		      const addAssess = (label, list) => {
		        if (!list.length) return;
		        const titles = joinTitles(list, (x) => `${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}`);
		        parts.push(`- ${label} لم تُحل (${list.length}): ${titles}`);
		      };

		      addAssess("كويزات", quiz);
		      addAssess("واجبات", homework);
		      addAssess("امتحانات", exam);
		      if (other.length) {
		        const titles = joinTitles(other, (x) => `[${assessmentTypeLabel(x.type)}] ${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}`);
		        parts.push(`- تقييمات أخرى (${other.length}): ${titles}`);
		      }
		    } else if (filterType === "quiz" || filterType === "homework" || filterType === "exam") {
		      if (missingAssessments.length) {
		        const titles = joinTitles(
		          missingAssessments,
		          (x) => `${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}`
		        );
		        parts.push(`- ${typeLabel(filterType)} لم تُحل (${missingAssessments.length}): ${titles}`);
		      }
		    } else {
		      if (missingAssessments.length) {
		        const titles = joinTitles(
		          missingAssessments,
		          (x) => `${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}`
		        );
		        parts.push(`- تقييمات لم تُحل (${missingAssessments.length}): ${titles}`);
		      }
		    }

		    parts.push("", "لو عندك مشكلة في الدخول تواصل معنا.");

		    let msg = parts.join("\n").trim();
		    if (msg.length > 500) msg = msg.slice(0, 497).trimEnd() + "...";
		    return msg;
		  }

		  function computeOwnerAlertsItems() {
		    const filterType = getAlertsFilterValue();
		    const qRaw = String(alertsSearch?.value || "").trim();
		    const q = qRaw.toLowerCase();

		    const base = Array.isArray(ownerProgressStudentsCache) && ownerProgressStudentsCache.length
		      ? ownerProgressStudentsCache
		      : bySelectedGrade(ownerStudentsCache, (s) => s.grade);

		    const filteredByQuery = !q
		      ? base
		      : base.filter((s) => {
		          const name = String(s.full_name || "").toLowerCase();
		          const phone = String(s.phone || "").toLowerCase();
		          const guardianPhone = String(s.guardian_phone || "").toLowerCase();
		          return name.includes(q) || phone.includes(q) || guardianPhone.includes(q);
		        });

		    const items = [];
		    filteredByQuery.forEach((s) => {
		      const progress = ownerProgressByStudentId.get(Number(s.id)) || { missingLessons: [], missingAssessments: [] };
		      const selected = selectProgressByFilter(progress, filterType);
		      const missingLessons = Array.isArray(selected.missingLessons) ? selected.missingLessons : [];
		      const missingAssessments = Array.isArray(selected.missingAssessments) ? selected.missingAssessments : [];
		      const totalMissing = missingLessons.length + missingAssessments.length;
		      if (totalMissing <= 0) return;

		      const message = buildReminderMessage(s, missingLessons, missingAssessments, filterType);
		      items.push({
		        student: s,
		        studentId: Number(s.id),
		        phone: String(s.phone || "").trim(),
		        guardianPhone: String(s.guardian_phone || "").trim(),
		        missingLessons,
		        missingAssessments,
		        message
		      });
		    });

		    return items;
		  }

		  function renderOwnerAlerts(query) {
		    if (!ownerAlertsList) return;
		    if (!canAlertsView) {
		      ownerAlertsList.innerHTML = "<p class='empty'>ليس لديك صلاحية مشاهدة الطلاب غير المكتملين.</p>";
		      return;
		    }
		    const progressOk = ownerProgressMeta.loaded && ownerProgressMeta.grade === selectedGrade;

		    if (!progressOk) {
		      ownerAlertsList.innerHTML =
		        "<p class='empty'>اضغط <strong>تحديث قائمة غير المكتملين</strong> لعرض الطلاب الذين لم يفتحوا المحاضرات أو لم يحلّوا التقييمات.</p>";
		      return;
		    }

		    if (alertsSearch && typeof query === "string") alertsSearch.value = query;

		    const filterType = getAlertsFilterValue();
		    const items = computeOwnerAlertsItems();
		    ownerAlertsComputedCache = items;

		    const rows = items.map((it) => {
		      const s = it.student;
		      const missingLessons = it.missingLessons;
		      const missingAssessments = it.missingAssessments;

		      const maxItems = 20;
		      const lessonsPreview = missingLessons.slice(0, maxItems);
		      const assessmentsPreview = missingAssessments.slice(0, maxItems);

		      const showLessons = filterType === "all" || filterType === "lessons";
		      const showAssessments = filterType === "all" || ["quiz", "homework", "exam"].includes(filterType);

		      const renderAssessmentsList = (list, emptyLabel) => {
		        if (!list.length) return `<p class='empty'>لا يوجد ${emptyLabel}.</p>`;
		        return `<ul class="progress-list">${list
		          .map((x) => `<li>${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}</li>`)
		          .join("")}</ul>`;
		      };

		      const quiz = assessmentsPreview.filter((a) => String(a.type || "") === "quiz");
		      const homework = assessmentsPreview.filter((a) => String(a.type || "") === "homework");
		      const exam = assessmentsPreview.filter((a) => String(a.type || "") === "exam");
		      const other = assessmentsPreview.filter((a) => !["quiz", "homework", "exam"].includes(String(a.type || "")));

		      const summaryText =
		        filterType === "lessons"
		          ? `غير مكتمل: <strong>${missingLessons.length}</strong> محاضرة`
		          : filterType === "quiz"
		            ? `غير مكتمل: <strong>${missingAssessments.length}</strong> كويز`
		            : filterType === "homework"
		              ? `غير مكتمل: <strong>${missingAssessments.length}</strong> واجب`
		              : filterType === "exam"
		                ? `غير مكتمل: <strong>${missingAssessments.length}</strong> امتحان`
		                : `غير مكتمل: <strong>${missingLessons.length}</strong> محاضرة + <strong>${missingAssessments.length}</strong> تقييم`;

		      const lessonsBlock = showLessons
		        ? `
		          <div>
		            <h3 style="margin:0;color:#5b2f86;font-size:0.95rem">محاضرات لم تُفتح</h3>
		            ${
		              missingLessons.length
		                ? `<ul class="progress-list">${lessonsPreview
		                    .map((x) => `<li>${x.courseTitle || "-"} / ${x.lessonTitle || "-"}</li>`)
		                    .join("")}${missingLessons.length > lessonsPreview.length ? `<li class="muted">+ ${missingLessons.length - lessonsPreview.length} أخرى</li>` : ""}</ul>`
		                : "<p class='empty'>لا يوجد.</p>"
		            }
		          </div>
		        `
		        : "";

		      const assessmentsBlock = showAssessments
		        ? `
		          <div>
		            <h3 style="margin:0;color:#5b2f86;font-size:0.95rem">تقييمات لم تُحل</h3>
		            <div style="display:grid;gap:10px;margin-top:8px">
		              ${
		                filterType === "quiz"
		                  ? `<div>${renderAssessmentsList(quiz, "كويزات")}</div>`
		                  : filterType === "homework"
		                    ? `<div>${renderAssessmentsList(homework, "واجبات")}</div>`
		                    : filterType === "exam"
		                      ? `<div>${renderAssessmentsList(exam, "امتحانات")}</div>`
		                      : `
		                        <div>
		                          <p style="margin:0;font-weight:900;color:#2f1f66">كويزات</p>
		                          ${renderAssessmentsList(quiz, "كويزات")}
		                        </div>
		                        <div>
		                          <p style="margin:0;font-weight:900;color:#2f1f66">واجبات</p>
		                          ${renderAssessmentsList(homework, "واجبات")}
		                        </div>
		                        <div>
		                          <p style="margin:0;font-weight:900;color:#2f1f66">امتحانات</p>
		                          ${renderAssessmentsList(exam, "امتحانات")}
		                        </div>
		                        ${
		                          other.length
		                            ? `<div>
		                                <p style="margin:0;font-weight:900;color:#2f1f66">أخرى</p>
		                                <ul class="progress-list">${other
		                                  .map((x) => `<li>[${assessmentTypeLabel(x.type)}] ${x.title || "-"} — ${x.courseTitle || "-"} / ${x.lessonTitle || "-"}</li>`)
		                                  .join("")}</ul>
		                              </div>`
		                            : ""
		                        }
		                        ${
		                          missingAssessments.length > assessmentsPreview.length
		                            ? `<p class="grade-note">+ ${missingAssessments.length - assessmentsPreview.length} تقييمات أخرى</p>`
		                            : ""
		                        }
		                      `
		              }
		            </div>
		          </div>
		        `
		        : "";

		      const cols = showLessons && showAssessments ? `${lessonsBlock}${assessmentsBlock}` : `${lessonsBlock || assessmentsBlock}`;

		      return `
		        <article class="item">
		          <h4>${s.full_name || "-"}</h4>
		          <p>رقم الطالب: <strong>${s.phone || "-"}</strong></p>
		          <p class="guardian-phone">رقم ولي الأمر: ${s.guardian_phone || "-"}</p>
		          <details class="perm-box progress-box" open>
		            <summary style="cursor:pointer;font-weight:900;color:#2f1f66">
		              ${summaryText}
		            </summary>
		            <div class="grid two-col" style="margin-top:10px">
		              ${cols}
		            </div>
		            <div class="code-actions" style="justify-content:center">
		              ${
		                canNotificationsSend
		                  ? `<button type="button" class="copy-code-btn owner-msg-student-btn" data-student-id="${s.id}" data-student-phone="${s.phone}">إشعار داخل المنصة</button>`
		                  : ""
		              }
		              <button type="button" class="copy-code-btn owner-wa-student-btn" data-student-id="${s.id}" data-student-phone="${s.phone}">واتساب</button>
		            </div>
		          </details>
		        </article>
		      `;
		    });

		    if (!rows.length) {
		      ownerAlertsList.innerHTML = "<p class='empty'>لا يوجد طلاب غير مكتملين للصف الحالي.</p>";
		      return;
		    }

		    ownerAlertsList.innerHTML = rows.join("");
		  }

		  function renderOwnerMessagesLog() {
		    if (!ownerMessagesLogList) return;
		    const q = String(ownerMessagesLogSearch?.value || "").trim().toLowerCase();
		    const list = Array.isArray(ownerMessagesLogCache) ? ownerMessagesLogCache : [];

		    const filtered = !q
		      ? list
		      : list.filter((r) => {
		          const hay = [
		            r.action,
		            r.created_at,
		            r.actor_role,
		            r.target_type,
		            r.target_id,
		            JSON.stringify(r.metadata || {})
		          ]
		            .filter(Boolean)
		            .join(" ")
		            .toLowerCase();
		          return hay.includes(q);
		        });

		    if (!filtered.length) {
		      ownerMessagesLogList.innerHTML = "<p class='empty'>لا توجد رسائل في السجل.</p>";
		      return;
		    }

		    const actorLabel = (role) => (role === "owner" ? "المالك" : role === "supervisor" ? "المشرف" : role || "-");
		    const channelLabel = (action) => (String(action || "").startsWith("whatsapp") ? "واتساب" : "المنصة");

		    ownerMessagesLogList.innerHTML = filtered
		      .slice(0, 200)
		      .map((r) => {
		        const meta = r.metadata || {};
		        const action = String(r.action || "");
		        let title = action;
		        if (action === "notifications.broadcast") {
		          const aud = meta.audience === "subscribed" ? "المشتركين فقط" : "كل الطلاب";
		          const g = meta.grade ? ` | الصف: ${meta.grade}` : " | كل الصفوف";
		          const c = meta.count !== undefined ? ` | العدد: ${meta.count}` : "";
		          title = `إرسال عام داخل المنصة (${aud}${g}${c})`;
		        } else if (action === "notifications.send") {
		          title = `إشعار لطالب داخل المنصة (رقم: ${meta.phone || "-"})`;
		        } else if (action === "whatsapp.open") {
		          title = `فتح واتساب (رقم: ${meta.phone || "-"})`;
		        } else if (action === "whatsapp.links") {
		          title = `تجهيز روابط واتساب (عدد: ${meta.count || "-"})`;
		        }

		        const preview = meta.message_preview ? `<p class="grade-note">نص مختصر: ${meta.message_preview}</p>` : "";
		        return `
		          <article class="item">
		            <h4>${title}</h4>
		            <p>القناة: <strong>${channelLabel(action)}</strong> | المنفذ: <strong>${actorLabel(r.actor_role)}</strong></p>
		            <p>التاريخ: ${r.created_at || "-"}</p>
		            ${preview}
		          </article>
		        `;
		      })
		      .join("");
		  }

		  async function loadOwnerMessagesLog() {
		    if (!ownerMessagesLogList) return;
		    ownerMessagesLogList.innerHTML = "<p class='empty'>جاري تحميل سجل الرسائل...</p>";
		    try {
		      const rows = await apiFetch("/api/owner/messages-log?limit=200");
		      ownerMessagesLogCache = Array.isArray(rows) ? rows : [];
		      renderOwnerMessagesLog();
		    } catch (err) {
		      ownerMessagesLogList.innerHTML = `<p class='empty'>تعذر تحميل سجل الرسائل: ${err.message || "-"}</p>`;
		    }
		  }

		  function renderOwnerDashboardByGrade() {
		    renderOwnerStudents(studentSearch?.value || "");
		    renderOwnerAttempts(
      ownerQuizAttempts,
      bySelectedGrade(ownerAttemptsCache.quiz, (a) => a.student_grade),
      "لا توجد نتائج كويزات لهذا الصف حتى الآن.",
      ownerQuizSearch?.value || ""
    );
    renderOwnerAttempts(
      ownerHomeworkAttempts,
      bySelectedGrade(ownerAttemptsCache.homework, (a) => a.student_grade),
      "لا توجد نتائج واجبات لهذا الصف حتى الآن.",
      ownerHomeworkSearch?.value || ""
    );
    renderOwnerAttempts(
      ownerExamAttempts,
      bySelectedGrade(ownerAttemptsCache.exam, (a) => a.student_grade),
      "لا توجد نتائج امتحانات لهذا الصف حتى الآن.",
      ownerExamSearch?.value || ""
    );
  }

  function renderDeleteList(container, rows, textBuilder, type, emptyText) {
    if (!container) return;
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = `<p class="empty">${emptyText}</p>`;
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("article");
      item.className = "item delete-item";
      item.innerHTML = `
        <span>${textBuilder(row)}</span>
        <button type="button" class="danger-btn" data-delete-type="${type}" data-delete-id="${row.id}">حذف</button>
      `;
      container.appendChild(item);
    });
  }

  function renderManageDeletePanel() {
    renderDeleteList(
      deleteCoursesList,
      ownerManageData.courses,
      (x) => `#${x.id} - ${x.title}`,
      "course",
      "لا توجد كورسات."
    );
    renderDeleteList(
      deleteLessonsList,
      ownerManageData.lessons,
      (x) => `#${x.id} - ${x.title}${Number(x.is_individual || 0) === 1 ? " (فردية)" : " (داخل الكورس)"}`,
      "lesson",
      "لا توجد محاضرات."
    );
    renderDeleteList(
      deleteQuizzesList,
      ownerManageData.assessments.filter((a) => a.type === "quiz"),
      (x) => `#${x.id} - [${assessmentTypeLabel(x.type)}] ${x.title}`,
      "assessment",
      "لا توجد كويزات."
    );
    renderDeleteList(
      deleteHomeworkList,
      ownerManageData.assessments.filter((a) => a.type === "homework"),
      (x) => `#${x.id} - [${assessmentTypeLabel(x.type)}] ${x.title}`,
      "assessment",
      "لا توجد واجبات."
    );
    renderDeleteList(
      deleteExamsList,
      ownerManageData.assessments.filter((a) => a.type === "exam"),
      (x) => `#${x.id} - [${assessmentTypeLabel(x.type)}] ${x.title}`,
      "assessment",
      "لا توجد امتحانات."
    );
  }

  function hideOwnerPanels() {
    Object.values(panels).flat().forEach((p) => {
      if (p) p.hidden = true;
    });
  }

		  function openOwnerPanel(action) {
		    hideOwnerPanels();
		    const list = panels[action] || panels.courses;
		    list.forEach((p) => {
		      if (p) p.hidden = false;
		    });

		    if (action === "courses" && isSupervisor) {
		      const coursePanel = byId("ownerCoursesPanel");
		      const lessonsPanel = byId("ownerLessonsPanel");
		      const assessmentsPanel = byId("ownerAssessmentsPanel");
		      const questionsPanel = byId("ownerQuestionsPanel");

		      if (coursePanel) coursePanel.hidden = !has(STAFF_PERMS.COURSES_WRITE);
		      if (lessonsPanel) lessonsPanel.hidden = !has(STAFF_PERMS.LESSONS_WRITE);
		      if (assessmentsPanel) assessmentsPanel.hidden = !has(STAFF_PERMS.ASSESSMENTS_WRITE);
		      if (questionsPanel) questionsPanel.hidden = !(has(STAFF_PERMS.QUESTIONS_WRITE) || has(STAFF_PERMS.UPLOAD_WRITE));

		      if (addQuestionForm) addQuestionForm.hidden = !has(STAFF_PERMS.QUESTIONS_WRITE);
		      if (importQuestionsForm) importQuestionsForm.hidden = !has(STAFF_PERMS.QUESTIONS_WRITE);
		      if (uploadImageForm) uploadImageForm.hidden = !has(STAFF_PERMS.UPLOAD_WRITE);
		    }

		    ownerSideMenu?.querySelectorAll(".owner-menu-item").forEach((b) => b.classList.remove("active"));
		    const activeBtn = ownerSideMenu?.querySelector(`[data-owner-action="${action}"]`);
		    activeBtn?.classList.add("active");

		    if (action === "payments") {
		      loadOwnerPaymentRequests().catch(() => {});
		    }
		    if (action === "subscribers") {
		      loadOwnerSubscribers().catch(() => {});
		    }
		    if (action === "audit") {
		      loadOwnerAudit().catch(() => {});
		    }
		    if (action === "supervisors") {
		      loadOwnerSupervisors().catch(() => {});
		    }
		    if (action === "guardian") {
		      loadGuardianRequests().catch(() => {});
		    }
		    if (action === "forum") {
		      loadOwnerForumQuestions().catch(() => {});
		    }
			    if (action === "alerts") {
			      renderOwnerAlerts(alertsSearch?.value || "");
			      if (canAlertsView && (!ownerProgressMeta.loaded || ownerProgressMeta.grade !== selectedGrade)) {
			        loadOwnerStudentsProgress().catch(() => {});
			      }
			      loadOwnerMessagesLog().catch(() => {});
			    }
			  }

  function toggleOwnerMenu(force) {
    if (!ownerSideMenu) return;
    const open = force === undefined ? !ownerSideMenu.classList.contains("open") : !!force;
    ownerSideMenu.classList.toggle("open", open);
    ownerMenuToggle?.classList.toggle("active", open);
  }

			  async function loadOwnerData() {
			    const [students, attemptsQuiz, attemptsHomework, attemptsExam, mapData] = await Promise.all([
			      canStudentsRead ? apiFetch("/api/owner/students") : Promise.resolve([]),
		      canAttemptsRead ? apiFetch("/api/owner/attempts?type=quiz") : Promise.resolve([]),
		      canAttemptsRead ? apiFetch("/api/owner/attempts?type=homework") : Promise.resolve([]),
		      canAttemptsRead ? apiFetch("/api/owner/attempts?type=exam") : Promise.resolve([]),
		      canContentManage ? apiFetch("/api/owner/courses") : Promise.resolve({ courses: [], lessons: [], assessments: [], questions: [] })
		    ]);
	
		    ownerAttemptsCache = { quiz: attemptsQuiz || [], homework: attemptsHomework || [], exam: attemptsExam || [] };
		    if (canStudentsRead) syncOwnerStudents(students || []);
		    else syncOwnerStudents([]);
		    renderOwnerDashboardByGrade();
	
			    ownerMapCache = mapData || { courses: [], lessons: [], assessments: [], questions: [] };
			    renderOwnerCourseMapsByGrade();
			  }

			  async function loadOwnerStudentsProgress(queryOverride) {
			    if (!canAlertsView) return;
			    const qRaw = String(queryOverride ?? "").trim();
			    const q = qRaw.toLowerCase();
			    const qs = new URLSearchParams();
			    qs.set("grade", selectedGrade);
			    if (qRaw) qs.set("q", qRaw);
			    qs.set("limit", "500");
			    const data = await apiFetch(`/api/owner/students/progress?${qs.toString()}`);
			    ownerProgressByStudentId.clear();
			    ownerProgressStudentsCache = Array.isArray(data?.students) ? data.students : [];
			    const map = data?.progressByStudentId || {};
			    Object.keys(map).forEach((k) => {
			      const id = Number(k);
			      if (!id) return;
			      ownerProgressByStudentId.set(id, map[k]);
			    });
			    ownerProgressMeta = { loaded: true, grade: selectedGrade, q };
			    renderOwnerAlerts(qRaw);
			  }

		  fillPriceOptions(coursePriceSelect);
		  fillPriceOptions(lessonPriceSelect);
		  updateLessonModeFields();
		  lessonMode?.addEventListener("change", updateLessonModeFields);

  ownerMenuToggle?.addEventListener("click", () => {
    toggleOwnerMenu();
  });

  document.addEventListener("click", (e) => {
    if (!ownerSideMenu?.classList.contains("open")) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (ownerSideMenu.contains(target)) return;
    if (ownerMenuToggle?.contains(target)) return;
    toggleOwnerMenu(false);
  });

	  ownerSideMenu?.addEventListener("click", (e) => {
	    const btn = e.target.closest("[data-owner-action]");
	    if (!btn) return;
    const action = btn.dataset.ownerAction;
    if (!action) return;

    if (action === "logout") {
      clearAuth();
      window.location.href = "sign.html";
      return;
    }

	    openOwnerPanel(action);
	    toggleOwnerMenu(false);
	  });

	  ownerForumReload?.addEventListener("click", () => {
	    loadOwnerForumQuestions().catch((err) => alert(err.message || "تعذر تحميل أسئلة المنتدى."));
	  });
	  ownerForumSearch?.addEventListener("input", () => {
	    loadOwnerForumQuestions().catch(() => {});
	  });
	  ownerForumStatus?.addEventListener("change", () => {
	    loadOwnerForumQuestions().catch(() => {});
	  });
	  ownerForumQuestionsList?.addEventListener("click", async (e) => {
	    const openBtn = e.target.closest("[data-owner-forum-open]");
	    if (openBtn) {
	      const id = Number(openBtn.getAttribute("data-owner-forum-open"));
	      try {
	        await loadOwnerForumQuestionDetails(id);
	      } catch (err) {
	        alert(err.message || "تعذر تحميل تفاصيل السؤال.");
	      }
	      return;
	    }
	    const statusBtn = e.target.closest("[data-owner-forum-status]");
	    if (statusBtn) {
	      const id = Number(statusBtn.getAttribute("data-owner-forum-status"));
	      const nextStatus = String(statusBtn.getAttribute("data-next-status") || "").trim();
	      if (!id || !nextStatus) return;
	      try {
	        await apiFetch(`/api/owner/forum/questions/${id}/status`, {
	          method: "PATCH",
	          body: JSON.stringify({ status: nextStatus })
	        });
	        await loadOwnerForumQuestions();
	        if (ownerForumSelectedId === id) await loadOwnerForumQuestionDetails(id);
	      } catch (err) {
	        alert(err.message || "تعذر تحديث حالة السؤال.");
	      }
	    }
	  });

	  ownerForumRecordStart?.addEventListener("click", async () => {
	    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
	      alert("المتصفح لا يدعم تسجيل الصوت هنا.");
	      return;
	    }
	    try {
	      ownerForumRecordedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
	      ownerForumRecordChunks = [];
	      ownerForumRecorder = new MediaRecorder(ownerForumRecordedStream);
	      ownerForumRecorder.ondataavailable = (ev) => {
	        if (ev.data && ev.data.size > 0) ownerForumRecordChunks.push(ev.data);
	      };
	      ownerForumRecorder.onstop = () => {
	        ownerForumRecordedBlob = new Blob(ownerForumRecordChunks, { type: "audio/webm" });
	        if (ownerForumRecordedAudio) {
	          ownerForumRecordedAudio.src = URL.createObjectURL(ownerForumRecordedBlob);
	          ownerForumRecordedAudio.hidden = false;
	        }
	        ownerForumRecordedStream?.getTracks()?.forEach((t) => t.stop());
	        ownerForumRecordedStream = null;
	      };
	      ownerForumRecorder.start();
	      alert("بدأ تسجيل الصوت.");
	    } catch (err) {
	      alert(err.message || "تعذر بدء تسجيل الصوت.");
	    }
	  });

	  ownerForumRecordStop?.addEventListener("click", () => {
	    if (!ownerForumRecorder || ownerForumRecorder.state === "inactive") {
	      alert("لا يوجد تسجيل جاري.");
	      return;
	    }
	    ownerForumRecorder.stop();
	  });

	  ownerForumAnswerForm?.addEventListener("submit", async (e) => {
	    e.preventDefault();
	    if (!ownerForumSelectedId) {
	      alert("اختر سؤالًا أولًا من قائمة المنتدى.");
	      return;
	    }
	    try {
	      const body = String(ownerForumAnswerText?.value || "").trim();
	      const imageFile = ownerForumAnswerImageFile?.files?.[0] || null;
	      let imageUrl = "";
	      let audioUrl = "";
	      if (imageFile) imageUrl = await uploadOwnerForumImage(imageFile);
	      if (ownerForumRecordedBlob) audioUrl = await uploadOwnerForumAudio(ownerForumRecordedBlob);
	      await apiFetch(`/api/owner/forum/questions/${ownerForumSelectedId}/answers`, {
	        method: "POST",
	        body: JSON.stringify({ body, imageUrl, audioUrl })
	      });
	      if (ownerForumAnswerText) ownerForumAnswerText.value = "";
	      if (ownerForumAnswerImageFile) ownerForumAnswerImageFile.value = "";
	      ownerForumRecordedBlob = null;
	      if (ownerForumRecordedAudio) {
	        ownerForumRecordedAudio.hidden = true;
	        ownerForumRecordedAudio.removeAttribute("src");
	      }
	      await loadOwnerForumQuestions();
	      await loadOwnerForumQuestionDetails(ownerForumSelectedId);
	      alert("تم إرسال الرد بنجاح.");
	    } catch (err) {
	      alert(err.message || "تعذر إرسال الرد.");
	    }
	  });

			  ownerSendMessage?.addEventListener("click", async () => {
			    try {
			      if (!canNotificationsSend) {
			        alert("ليس لديك صلاحية إرسال إشعارات داخل المنصة.");
			        return;
			      }
			      const message = String(ownerMessageText?.value || "").trim();
			      const audience = String(ownerMessageAudience?.value || "all");
			      const phone = String(ownerMessagePhone?.value || "").trim();
			      const scope = String(ownerMessageGradeScope?.value || "current");

			      if (!message) {
			        alert("اكتب الرسالة أولاً.");
			        return;
			      }

			      if (audience === "phone") {
			        if (!phone) {
			          alert("اكتب رقم الطالب أولاً.");
			          return;
			        }
			        await apiFetch("/api/owner/notifications/to-student", {
			          method: "POST",
			          body: JSON.stringify({ phone, message })
			        });
			        alert("تم إرسال إشعار للطالب.");
			        return;
			      }

			      const payload = { audience, message };
			      if (scope === "current") payload.grade = selectedGrade;
			      else if (scope === "all") {
			        // بدون grade => لكل الصفوف
			      } else {
			        payload.grade = scope;
			      }
			      const result = await apiFetch("/api/owner/notifications/broadcast", {
			        method: "POST",
			        body: JSON.stringify(payload)
			      });
			      alert(`تم إرسال الرسالة إلى ${Number(result.count || 0)} طالب.`);
			    } catch (err) {
			      alert(err.message || "تعذر إرسال الرسالة.");
			    }
			  });

			  ownerOpenWhatsapp?.addEventListener("click", () => {
			    const message = String(ownerMessageText?.value || "").trim();
			    const phone = String(ownerMessagePhone?.value || "").trim();
			    if (!phone) {
			      alert("اكتب رقم الطالب أولاً.");
			      return;
			    }
			    const url = whatsappUrlFor(phone, message);
			    if (!url) {
			      alert("رقم غير صالح.");
			      return;
			    }
			    const popup = window.open(url, "_blank");
			    if (!popup) window.location.href = url;
			    apiFetch("/api/owner/whatsapp/log", {
			      method: "POST",
			      body: JSON.stringify({ phone, message, source: "alerts", bulk: false })
			    }).catch(() => {});
			  });

			  ownerProgressReload?.addEventListener("click", async () => {
			    try {
			      await loadOwnerStudentsProgress();
			      alert("تم تحديث قائمة غير المكتملين.");
			    } catch (err) {
			      alert(err.message || "تعذر تحميل المتابعة.");
			    }
			  });

		  ownerStudents?.addEventListener("click", async (event) => {
		    const btn = event.target.closest(".owner-code-btn");
		    if (!btn) return;
		    try {
		      const studentId = btn.dataset.studentId;
	      const studentName = btn.dataset.studentName || "";
	      const result = await apiFetch(`/api/owner/students/${studentId}/access-code`, {
	        method: "POST"
	      });
	      ownerIssuedCodes.set(Number(studentId), {
	        code: result.code,
	        expiresAt: result.expiresAt
	      });
	      renderOwnerStudents(studentSearch?.value || "");
	      alert(
	        `كود الدخول المؤقت للطالب ${studentName} هو: ${result.code}\n` +
	        `صالح لمدة 24 ساعة من وقت الإصدار.\n` +
	        `ينتهي في: ${formatExpiryDate(result.expiresAt)}\n` +
	        `الوقت المتبقي الآن: ${formatRemainingFromIso(result.expiresAt)}`
	      );
		    } catch (err) {
		      alert(`تعذر إصدار الكود: ${err.message}`);
		    }
		  });

		  ownerAlertsList?.addEventListener("click", async (event) => {
		    const msgBtn = event.target.closest(".owner-msg-student-btn");
		    if (msgBtn) {
		      try {
		        if (!canNotificationsSend) {
		          alert("ليس لديك صلاحية إرسال إشعارات داخل المنصة.");
		          return;
		        }
		        const studentId = Number(msgBtn.dataset.studentId);
		        const studentPhone = msgBtn.dataset.studentPhone || "";
		        const item = ownerAlertsComputedCache.find((x) => Number(x.studentId) === studentId);
		        const suggested = item?.message || "";
		        const message = prompt("اكتب الرسالة للطالب (إشعار داخل المنصة):", suggested);
		        if (!message) return;
		        await apiFetch("/api/owner/notifications/to-student", {
		          method: "POST",
		          body: JSON.stringify({ studentId, phone: studentPhone, message })
		        });
		        alert("تم إرسال الرسالة للطالب.");
		        loadOwnerMessagesLog().catch(() => {});
		      } catch (err) {
		        alert(err.message || "تعذر إرسال الرسالة.");
		      }
		      return;
		    }

		    const waBtn = event.target.closest(".owner-wa-student-btn");
		    if (waBtn) {
		      const phone = String(waBtn.dataset.studentPhone || "").trim();
		      const studentId = Number(waBtn.dataset.studentId || 0);
		      const item = ownerAlertsComputedCache.find((x) => Number(x.studentId) === studentId) || null;
		      const suggested = item?.message || "";
		      const message = prompt("رسالة واتساب (يمكنك تعديلها):", suggested);
		      if (!message) return;
		      const url = whatsappUrlFor(phone, message);
		      if (!url) {
		        alert("رقم غير صالح.");
		        return;
		      }
		      const popup = window.open(url, "_blank");
		      if (!popup) window.location.href = url;
		      apiFetch("/api/owner/whatsapp/log", {
		        method: "POST",
		        body: JSON.stringify({ studentId: studentId || null, phone, message, source: "alerts", bulk: false })
		      }).catch(() => {});
		      return;
		    }
		  });

	  ownerApp.addEventListener("click", async (event) => {
	    const copyBtn = event.target.closest(".copy-code-btn");
	    if (copyBtn) {
      const code = copyBtn.dataset.code || "";
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        alert("تم نسخ الكود.");
      } catch (_err) {
        alert(`الكود: ${code}`);
      }
      return;
    }

    const deleteCodeBtn = event.target.closest(".delete-code-btn");
    if (deleteCodeBtn) {
      const studentId = Number(deleteCodeBtn.dataset.studentId);
      if (!studentId) return;
      const ok = await showOwnerConfirm("هل تريد حذف/إلغاء الكود الحالي؟");
      if (!ok) return;
      try {
        await apiFetch(`/api/owner/students/${studentId}/access-code`, { method: "DELETE" });
        // تحديث سريع للأكواد
        const students = await apiFetch("/api/owner/students");
        syncOwnerStudents(students);
        renderOwnerStudents(studentSearch?.value || "");
        alert("تم حذف الكود.");
      } catch (err) {
        alert(`تعذر حذف الكود: ${err.message}`);
      }
      return;
    }

    const btn = event.target.closest(".danger-btn");
    if (!btn) return;
    const type = btn.dataset.deleteType;
    const id = Number(btn.dataset.deleteId);
    if (!id || !type) return;
    const ok = await showOwnerConfirm("هل أنت متأكد من الحذف؟ لا يمكن التراجع.");
    if (!ok) return;
    try {
      let endpoint = "";
      if (type === "course") endpoint = `/api/owner/courses/${id}`;
      if (type === "lesson") endpoint = `/api/owner/lessons/${id}`;
      if (type === "assessment") endpoint = `/api/owner/assessments/${id}`;
      if (!endpoint) return;
      await apiFetch(endpoint, { method: "DELETE" });
      await loadOwnerData();
      alert("تم الحذف بنجاح.");
    } catch (err) {
      alert(`تعذر الحذف: ${err.message}`);
    }
  });

		  studentSearch?.addEventListener("input", () => {
		    renderOwnerStudents(studentSearch.value || "");
		  });

		  alertsSearch?.addEventListener("input", () => {
		    renderOwnerAlerts(alertsSearch.value || "");
		  });

		  alertsFilterType?.addEventListener("change", () => {
		    renderOwnerAlerts(alertsSearch?.value || "");
		  });

		  alertsSendRemindersPlatform?.addEventListener("click", async () => {
		    try {
		      if (!canNotificationsSend) {
		        alert("ليس لديك صلاحية إرسال إشعارات داخل المنصة.");
		        return;
		      }
		      if (!canAlertsView) {
		        alert("ليس لديك صلاحية مشاهدة الطلاب غير المكتملين.");
		        return;
		      }

		      if (!ownerProgressMeta.loaded || ownerProgressMeta.grade !== selectedGrade) {
		        await loadOwnerStudentsProgress();
		      } else {
		        renderOwnerAlerts(alertsSearch?.value || "");
		      }

		      const items = Array.isArray(ownerAlertsComputedCache) ? ownerAlertsComputedCache : [];
		      if (!items.length) {
		        alert("لا يوجد طلاب غير مكتملين حسب الفلتر الحالي.");
		        return;
		      }

		      const ok = await showOwnerConfirm(`سيتم إرسال تذكير داخل المنصة إلى ${items.length} طالب. هل تريد المتابعة؟`);
		      if (!ok) return;

		      const btn = alertsSendRemindersPlatform;
		      const originalText = btn?.textContent || "";
		      if (btn) btn.disabled = true;

		      let sent = 0;
		      let failed = 0;
		      for (const it of items) {
		        try {
		          await apiFetch("/api/owner/notifications/to-student", {
		            method: "POST",
		            body: JSON.stringify({ studentId: it.studentId, phone: it.phone, message: it.message })
		          });
		          sent += 1;
		        } catch (_err) {
		          failed += 1;
		        }
		        if (btn) btn.textContent = `جاري الإرسال... ${sent + failed}/${items.length}`;
		      }

		      if (btn) {
		        btn.disabled = false;
		        btn.textContent = originalText || "إرسال تذكير للغير مكتملين (داخل المنصة)";
		      }

		      alert(`تم الإرسال: ${sent} | فشل: ${failed}`);
		      loadOwnerMessagesLog().catch(() => {});
		    } catch (err) {
		      alert(err.message || "تعذر إرسال التذكيرات.");
		      if (alertsSendRemindersPlatform) alertsSendRemindersPlatform.disabled = false;
		    }
		  });

		  alertsShowWhatsappLinks?.addEventListener("click", async () => {
		    try {
		      if (!canAlertsView) {
		        alert("ليس لديك صلاحية مشاهدة الطلاب غير المكتملين.");
		        return;
		      }
		      if (!ownerProgressMeta.loaded || ownerProgressMeta.grade !== selectedGrade) {
		        await loadOwnerStudentsProgress();
		      } else {
		        renderOwnerAlerts(alertsSearch?.value || "");
		      }

		      const items = Array.isArray(ownerAlertsComputedCache) ? ownerAlertsComputedCache : [];
		      if (!items.length) {
		        if (alertsWhatsappLinks) alertsWhatsappLinks.innerHTML = "<p class='empty'>لا يوجد روابط واتساب.</p>";
		        return;
		      }

		      if (alertsWhatsappLinks) {
		        alertsWhatsappLinks.innerHTML = items
		          .map((it) => {
		            const url = whatsappUrlFor(it.phone, it.message);
		            const safeUrl = url || "#";
		            return `
		              <article class="item">
		                <h4>${it.student?.full_name || "-"}</h4>
		                <p>رقم الطالب: <strong>${it.phone || "-"}</strong></p>
		                <p class="guardian-phone">رقم ولي الأمر: ${it.guardianPhone || "-"}</p>
		                ${url ? `<a class="copy-code-btn" href="${safeUrl}" target="_blank" rel="noopener">فتح واتساب</a>` : "<p class='empty'>رقم غير صالح.</p>"}
		              </article>
		            `;
		          })
		          .join("");
		      }

		      apiFetch("/api/owner/whatsapp/log", {
		        method: "POST",
		        body: JSON.stringify({ bulk: true, count: items.length, source: "alerts" })
		      }).catch(() => {});
		    } catch (err) {
		      alert(err.message || "تعذر تجهيز روابط واتساب.");
		    }
		  });

		  alertsCopyWhatsappLinks?.addEventListener("click", async () => {
		    try {
		      const items = Array.isArray(ownerAlertsComputedCache) ? ownerAlertsComputedCache : [];
		      const links = items
		        .map((it) => whatsappUrlFor(it.phone, it.message))
		        .filter(Boolean);
		      if (!links.length) {
		        alert("لا توجد روابط لنسخها.");
		        return;
		      }
		      await navigator.clipboard.writeText(links.join("\n"));
		      alert(`تم نسخ ${links.length} رابط واتساب.`);
		    } catch (_err) {
		      alert("تعذر النسخ. جرّب مرة أخرى.");
		    }
		  });

		  ownerMessagesLogReload?.addEventListener("click", () => {
		    loadOwnerMessagesLog().catch((err) => alert(err.message || "تعذر تحميل سجل الرسائل."));
		  });

		  ownerMessagesLogSearch?.addEventListener("input", () => {
		    renderOwnerMessagesLog();
		  });

		  function findGuardianPasswordInput(requestId, phone) {
		    if (!guardianRequestsList) return null;
		    return (
		      guardianRequestsList.querySelector(`.guardian-password-input[data-request-id="${Number(requestId) || 0}"]`) ||
		      guardianRequestsList.querySelector(`.guardian-password-input[data-phone="${String(phone || "")}"]`)
		    );
		  }

		  async function saveGuardianPassword(phone, password, requestId = null) {
		    if (!phone) {
		      alert("رقم ولي الأمر مطلوب.");
		      return false;
		    }
		    if (!password || String(password).length < 6) {
		      alert("كلمة السر لازم تكون 6 أحرف على الأقل.");
		      return false;
		    }
		    const result = await apiFetch("/api/owner/guardian/set-password", {
		      method: "POST",
		      body: JSON.stringify({
		        phone,
		        password,
		        requestId: requestId ? Number(requestId) : null
		      })
		    });
		    return result || { success: true };
		  }

		  guardianRequestsReload?.addEventListener("click", () => {
		    loadGuardianRequests().catch((err) => alert(err.message || "تعذر تحميل طلبات ولي الأمر."));
		  });

		  guardianRequestsSearch?.addEventListener("input", () => {
		    renderGuardianRequests();
		  });

		  guardianRequestsStatus?.addEventListener("change", () => {
		    loadGuardianRequests().catch((err) => alert(err.message || "تعذر تحميل طلبات ولي الأمر."));
		  });

		  guardianRequestsList?.addEventListener("click", async (event) => {
		    const actionBtn = event.target.closest("button");
		    if (!actionBtn) return;
		    const requestId = Number(actionBtn.dataset.requestId || 0);
		    const phone = String(actionBtn.dataset.phone || "").trim();
		    const input = findGuardianPasswordInput(requestId, phone);
		    const currentPass = String(input?.value || "").trim();

		    if (actionBtn.classList.contains("guardian-generate-btn")) {
		      const generated = makeGuardianPassword(8);
		      if (input) input.value = generated;
		      return;
		    }

		    if (actionBtn.classList.contains("guardian-save-btn")) {
		      try {
		        const result = await saveGuardianPassword(phone, currentPass, requestId || null);
		        if (!result) return;
		        alert("تم حفظ كلمة السر لولي الأمر.");
		        await loadGuardianRequests();
		      } catch (err) {
		        alert(err.message || "تعذر حفظ كلمة السر.");
		      }
		      return;
		    }

		    if (actionBtn.classList.contains("guardian-copy-btn")) {
		      if (!currentPass) {
		        alert("اكتب كلمة السر أولاً.");
		        return;
		      }
		      const msg = guardianMessageText(phone, currentPass);
		      try {
		        await navigator.clipboard.writeText(msg);
		        alert("تم نسخ الرسالة.");
		      } catch (_err) {
		        alert(msg);
		      }
		      return;
		    }

		    if (actionBtn.classList.contains("guardian-wa-btn")) {
		      if (!currentPass) {
		        alert("اكتب كلمة السر أولاً.");
		        return;
		      }
		      try {
		        const result = await saveGuardianPassword(phone, currentPass, requestId || null);
		        if (!result) return;
		        const url = whatsappUrlFor(phone, guardianMessageText(phone, currentPass));
		        if (!url) {
		          alert("رقم غير صالح.");
		          return;
		        }
		        const popup = window.open(url, "_blank");
		        if (!popup) window.location.href = url;
		        await loadGuardianRequests();
		      } catch (err) {
		        alert(err.message || "تعذر تجهيز رسالة واتساب.");
		      }
		      return;
		    }

		    if (actionBtn.classList.contains("guardian-sms-btn")) {
		      if (!currentPass) {
		        alert("اكتب كلمة السر أولاً.");
		        return;
		      }
		      try {
		        const result = await saveGuardianPassword(phone, currentPass, requestId || null);
		        if (!result) return;
		        const smsPhone = normalizePhoneDigits(phone);
		        const body = encodeURIComponent(guardianMessageText(phone, currentPass));
		        const smsUrl = `sms:${smsPhone}?body=${body}`;
		        window.location.href = smsUrl;
		        await loadGuardianRequests();
		      } catch (err) {
		        alert(err.message || "تعذر تجهيز رسالة SMS.");
		      }
		    }

		    if (actionBtn.classList.contains("guardian-confirm-btn")) {
		      try {
		        await apiFetch("/api/owner/guardian/confirm-reset", {
		          method: "POST",
		          body: JSON.stringify({ requestId })
		        });
		        alert("تم تأكيد الإرسال. الآن يمكن لولي الأمر إرسال طلب استعادة جديد عند الحاجة.");
		        await loadGuardianRequests();
		      } catch (err) {
		        alert(err.message || "تعذر تأكيد الإرسال.");
		      }
		    }
		  });

		  guardianManualGenerate?.addEventListener("click", () => {
		    if (guardianManualPassword) guardianManualPassword.value = makeGuardianPassword(8);
		  });

		  guardianManualSave?.addEventListener("click", async () => {
		    try {
		      const phone = String(guardianManualPhone?.value || "").trim();
		      const password = String(guardianManualPassword?.value || "").trim();
		      const result = await saveGuardianPassword(phone, password, null);
		      if (!result) return;
		      if (guardianManualMsg) {
		        guardianManualMsg.textContent = "تم حفظ كلمة السر بنجاح.";
		      }
		      loadGuardianRequests().catch(() => {});
		    } catch (err) {
		      alert(err.message || "تعذر حفظ كلمة السر.");
		    }
		  });

		  guardianManualCopy?.addEventListener("click", async () => {
		    const phone = String(guardianManualPhone?.value || "").trim();
		    const password = String(guardianManualPassword?.value || "").trim();
		    if (!phone || !password) {
		      alert("اكتب الرقم وكلمة السر أولاً.");
		      return;
		    }
		    const msg = guardianMessageText(phone, password);
		    try {
		      await navigator.clipboard.writeText(msg);
		      if (guardianManualMsg) guardianManualMsg.textContent = "تم نسخ الرسالة.";
		    } catch (_err) {
		      alert(msg);
		    }
		  });

		  guardianManualWhatsapp?.addEventListener("click", async () => {
		    const phone = String(guardianManualPhone?.value || "").trim();
		    const password = String(guardianManualPassword?.value || "").trim();
		    if (!phone || !password) {
		      alert("اكتب الرقم وكلمة السر أولاً.");
		      return;
		    }
		    try {
		      const result = await saveGuardianPassword(phone, password, null);
		      if (!result) return;
		      const url = whatsappUrlFor(phone, guardianMessageText(phone, password));
		      if (!url) {
		        alert("رقم غير صالح.");
		        return;
		      }
		      const popup = window.open(url, "_blank");
		      if (!popup) window.location.href = url;
		      if (guardianManualMsg) guardianManualMsg.textContent = "تم تجهيز رسالة واتساب.";
		      loadGuardianRequests().catch(() => {});
		    } catch (err) {
		      alert(err.message || "تعذر تجهيز واتساب.");
		    }
		  });

	  ownerQuizSearch?.addEventListener("input", () => {
	    renderOwnerDashboardByGrade();
	  });

  ownerHomeworkSearch?.addEventListener("input", () => {
    renderOwnerDashboardByGrade();
  });

	  ownerExamSearch?.addEventListener("input", () => {
	    renderOwnerDashboardByGrade();
	  });

	  paymentsSearch?.addEventListener("input", () => {
	    renderPaymentRequests(ownerPaymentRequestsCache);
	  });
	  paymentsKindFilter?.addEventListener("change", () => {
	    renderPaymentRequests(ownerPaymentRequestsCache);
	  });

	  subscribersSearch?.addEventListener("input", () => {
	    renderSubscribers(ownerSubscribersCache);
	  });
	  subscribersKindFilter?.addEventListener("change", () => {
	    renderSubscribers(ownerSubscribersCache);
	  });

	  auditReload?.addEventListener("click", () => {
	    loadOwnerAudit().catch((err) => alert(err.message || "تعذر تحميل السجل."));
	  });

			  gradeButtons.forEach((btn) => {
			    btn.addEventListener("click", () => {
			      selectedGrade = btn.dataset.grade || selectedGrade;
			      ownerProgressMeta.loaded = false;
			      ownerProgressByStudentId.clear();
			      gradeButtons.forEach((b) => b.classList.remove("active"));
			      btn.classList.add("active");
			      if (activeGradeLabel) activeGradeLabel.textContent = selectedGrade;
			      renderOwnerDashboardByGrade();
		      renderOwnerCourseMapsByGrade();
		      renderOwnerAlerts(alertsSearch?.value || "");
		      if (panels.alerts?.some((p) => p && !p.hidden)) loadOwnerStudentsProgress().catch(() => {});
		      if (panels.payments?.some((p) => p && !p.hidden)) loadOwnerPaymentRequests().catch(() => {});
		      if (panels.subscribers?.some((p) => p && !p.hidden)) loadOwnerSubscribers().catch(() => {});
		      if (panels.audit?.some((p) => p && !p.hidden)) loadOwnerAudit().catch(() => {});
		    });
		  });

		  ownerPaymentRequests?.addEventListener("click", async (event) => {
		    const btn = event.target.closest(".owner-approve-btn");
		    if (!btn) return;
		    if (!canPaymentsApprove) {
		      alert("ليس لديك صلاحية تأكيد الدفع.");
		      return;
		    }
		    const requestId = Number(btn.dataset.requestId);
		    if (!requestId) return;
		    const ok = await showOwnerConfirm("هل تريد تأكيد الدفع وفتح الاشتراك لهذا الطالب؟");
		    if (!ok) return;
	    try {
	      await apiFetch(`/api/owner/payment-requests/${requestId}/approve`, { method: "POST" });
	      alert("تم تفعيل الاشتراك.");
	      await loadOwnerPaymentRequests();
	      await loadOwnerSubscribers();
	    } catch (err) {
	      alert(err.message || "تعذر تأكيد الدفع.");
	    }
	  });

		  addSupervisorForm?.addEventListener("submit", async (e) => {
		    e.preventDefault();
		    if (!isOwner) return;
		    try {
		      const perms = Array.from(document.querySelectorAll('input[name="supervisor_perm"]:checked')).map((i) =>
		        String(i.value || "")
		      );
		      await apiFetch("/api/owner/supervisors", {
		        method: "POST",
		        body: JSON.stringify({
		          fullName: byId("supervisorName")?.value.trim() || "",
		          phone: byId("supervisorPhone")?.value.trim() || "",
		          password: byId("supervisorPassword")?.value || "",
		          permissions: perms
		        })
		      });
		      addSupervisorForm.reset();
		      await loadOwnerSupervisors();
		      alert("تمت إضافة المشرف.");
	    } catch (err) {
	      alert(err.message || "تعذر إضافة المشرف.");
	    }
	  });

		  ownerSupervisorsList?.addEventListener("click", async (event) => {
		    if (!isOwner) return;
		    const deleteBtn = event.target.closest(".owner-delete-supervisor-btn");
		    if (deleteBtn) {
		      const id = Number(deleteBtn.dataset.supervisorId);
		      if (!id) return;
		      const ok = await showOwnerConfirm("هل تريد حذف هذا المشرف؟");
		      if (!ok) return;
		      try {
		        await apiFetch(`/api/owner/supervisors/${id}`, { method: "DELETE" });
		        await loadOwnerSupervisors();
		      } catch (err) {
		        alert(err.message || "تعذر حذف المشرف.");
		      }
		      return;
		    }

		    const saveBtn = event.target.closest(".owner-save-supervisor-btn");
		    if (saveBtn) {
		      const id = Number(saveBtn.dataset.supervisorId);
		      if (!id) return;
		      const wrap = saveBtn.closest("article");
		      if (!wrap) return;
		      const perms = Array.from(wrap.querySelectorAll(".supervisor-perm:checked")).map((i) => String(i.value || ""));
		      const passInput = wrap.querySelector(".supervisor-new-pass");
		      const newPass = passInput ? String(passInput.value || "") : "";

		      const payload = { permissions: perms };
		      if (newPass.trim()) payload.password = newPass;

		      try {
		        await apiFetch(`/api/owner/supervisors/${id}`, {
		          method: "PUT",
		          body: JSON.stringify(payload)
		        });
		        await loadOwnerSupervisors();
		        alert("تم حفظ التعديلات.");
		      } catch (err) {
		        alert(err.message || "تعذر حفظ التعديلات.");
		      }
		    }
		  });

	  addCourseForm?.addEventListener("submit", async (e) => {
	    e.preventDefault();
	    try {
	      await apiFetch("/api/owner/courses", {
	        method: "POST",
	        body: JSON.stringify({
	          title: byId("courseTitle").value.trim(),
	          description: byId("courseDesc").value.trim(),
	          imageUrl: byId("courseImageUrl")?.value.trim() || "",
	          priceEgp: byId("coursePrice")?.value || "",
	          subject: byId("courseSubject")?.value || "",
	          grade: byId("courseGrade")?.value || ""
	        })
	      });
	      addCourseForm.reset();
	      await loadOwnerData();
	      alert("تمت إضافة الكورس");
	    } catch (err) {
	      const msg = String(err?.message || "");
	      if (msg === "Owner only" || msg === "Unauthorized" || msg === "Invalid token") {
	        alert("لازم تسجل دخول كـ مالك أولاً. افتح sign.html وسجّل برقم المالك وكلمة سر المالك ثم ارجع لصفحة owner.html.");
	      } else {
	        alert(msg || "تعذر إضافة الكورس.");
	      }
	    }
	  });

	  addLessonForm?.addEventListener("submit", async (e) => {
	    e.preventDefault();
	    try {
	      const isIndividual = String(lessonMode?.value || "course") === "individual";
	      await apiFetch("/api/owner/lessons", {
	        method: "POST",
	        body: JSON.stringify({
	          courseId: Number(lessonCourseId.value),
	          title: byId("lessonTitle").value.trim(),
	          description: byId("lessonDesc")?.value.trim() || "",
	          isIndividual,
	          imageUrl: isIndividual ? (byId("lessonImageUrl")?.value.trim() || "") : "",
	          priceEgp: isIndividual ? (byId("lessonPrice")?.value || "") : "",
	          videoUrl: byId("lessonVideo").value.trim(),
	          explainFileUrl: byId("lessonExplainFile").value.trim(),
	          solutionVideoUrl: byId("lessonSolutionVideo").value.trim(),
	          solutionFileUrl: byId("lessonSolutionFile").value.trim(),
	          position: Number(byId("lessonPosition").value || 1)
	        })
	      });
	      addLessonForm.reset();
	      if (lessonMode) lessonMode.value = "course";
	      updateLessonModeFields();
	      await loadOwnerData();
	      alert("تمت إضافة المحاضرة");
	    } catch (err) {
	      const msg = String(err?.message || "");
	      if (msg === "Owner only" || msg === "Unauthorized" || msg === "Invalid token") {
	        alert("لازم تسجل دخول كـ مالك أولاً. افتح sign.html وسجّل برقم المالك وكلمة سر المالك ثم ارجع لصفحة owner.html.");
	      } else {
	        alert(msg || "تعذر إضافة المحاضرة.");
	      }
	    }
	  });

  addAssessmentForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const lessonId = Number(assessmentLessonId?.value || 0);
      if (!lessonId) {
        alert("اختر الكورس ثم اختر المحاضرة أولاً.");
        return;
      }
      const durationMinutes = normalizeAssessmentDurationValue();
      const maxAttempts = normalizeAssessmentMaxAttemptsValue();
      await apiFetch("/api/owner/assessments", {
        method: "POST",
        body: JSON.stringify({
          lessonId,
          type: byId("assessmentType").value,
          title: byId("assessmentTitle").value.trim(),
          durationMinutes,
          maxAttempts
        })
      });
      addAssessmentForm.reset();
      normalizeAssessmentDurationValue();
      normalizeAssessmentMaxAttemptsValue();
      renderAssessmentLessonOptionsByCourse();
      await loadOwnerData();
      alert("تمت إضافة التقييم");
    } catch (err) {
      alert(err.message);
    }
  });

  assessmentCourseId?.addEventListener("change", () => {
    renderAssessmentLessonOptionsByCourse();
  });

  assessmentType?.addEventListener("change", () => {
    if (!assessmentDuration.value) assessmentDuration.value = "300";
    assessmentDuration.readOnly = false;
    normalizeAssessmentDurationValue();
    normalizeAssessmentMaxAttemptsValue();
  });
  assessmentDuration?.addEventListener("change", normalizeAssessmentDurationValue);
  assessmentDuration?.addEventListener("blur", normalizeAssessmentDurationValue);
  assessmentMaxAttempts?.addEventListener("change", normalizeAssessmentMaxAttemptsValue);
  assessmentMaxAttempts?.addEventListener("blur", normalizeAssessmentMaxAttemptsValue);
  assessmentType?.dispatchEvent(new Event("change"));

  function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((v) => String(v || "").trim());
  }

  function normalizeCorrectOptionCsv(value) {
    const v = String(value || "").trim().toUpperCase();
    if (["0", "1", "2", "3"].includes(v)) return Number(v);
    if (v === "A") return 0;
    if (v === "B") return 1;
    if (v === "C") return 2;
    if (v === "D") return 3;
    return -1;
  }

  uploadImageForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = byId("questionImageFile");

    if (!fileInput.files || !fileInput.files[0]) {
      alert("اختر صورة أولاً");
      return;
    }

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);

    try {
      const result = await apiFetch("/api/owner/upload-question-image", {
        method: "POST",
        body: formData
      });
      byId("questionImageUrl").value = result.imageUrl;
      alert("تم رفع الصورة بنجاح");
    } catch (err) {
      alert(err.message);
    }
  });

  addQuestionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/api/owner/questions", {
        method: "POST",
        body: JSON.stringify({
          assessmentId: Number(questionAssessmentId.value),
          text: byId("questionText").value.trim(),
          imageUrl: byId("questionImageUrl").value.trim(),
          optionA: byId("optionA").value.trim(),
          optionB: byId("optionB").value.trim(),
          optionC: byId("optionC").value.trim(),
          optionD: byId("optionD").value.trim(),
          correctOption: Number(byId("correctOption").value)
        })
      });
      addQuestionForm.reset();
      byId("questionImageUrl").value = "";
      alert("تمت إضافة السؤال");
    } catch (err) {
      alert(err.message);
    }
  });

  downloadQuestionCsvTemplate?.addEventListener("click", () => {
    const header = "text,imageUrl,optionA,optionB,optionC,optionD,correctOption";
    const sample = 'مثال سؤال,,اختيار A,اختيار B,اختيار C,اختيار D,A';
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importQuestionsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const assessmentId = Number(questionImportAssessmentId?.value || 0);
      if (!assessmentId) {
        alert("اختر التقييم أولاً.");
        return;
      }
      const file = questionImportCsvFile?.files?.[0];
      if (!file) {
        alert("اختر ملف CSV أولاً.");
        return;
      }

      const raw = await file.text();
      const lines = raw
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        alert("ملف CSV فارغ أو لا يحتوي صفوف أسئلة.");
        return;
      }

      const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
      const required = ["text", "imageurl", "optiona", "optionb", "optionc", "optiond", "correctoption"];
      const okHeader = required.every((k, idx) => header[idx] === k);
      if (!okHeader) {
        alert("ترتيب الأعمدة غير صحيح. استخدم قالب CSV الجاهز.");
        return;
      }

      const rows = [];
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 7) continue;
        const row = {
          text: cols[0] || "",
          imageUrl: cols[1] || "",
          optionA: cols[2] || "",
          optionB: cols[3] || "",
          optionC: cols[4] || "",
          optionD: cols[5] || "",
          correctOption: normalizeCorrectOptionCsv(cols[6])
        };
        if ((!row.text && !row.imageUrl) || !row.optionA || !row.optionB || !row.optionC || !row.optionD || row.correctOption < 0) {
          continue;
        }
        rows.push(row);
      }

      if (!rows.length) {
        alert("لا توجد صفوف صالحة للاستيراد.");
        return;
      }

      const result = await apiFetch("/api/owner/questions/bulk", {
        method: "POST",
        body: JSON.stringify({ assessmentId, rows })
      });
      importQuestionsForm.reset();
      alert(`تم استيراد ${Number(result.inserted || 0)} سؤال بنجاح.`);
    } catch (err) {
      alert(err.message || "تعذر استيراد ملف الأسئلة.");
    }
  });

	  loadOwnerData().catch((err) => {
	    alert(`تعذر تحميل البيانات: ${err.message}`);
	  });

	  setInterval(updateCodeCountdowns, 1000);
	  setInterval(updateGuardianCountdowns, 1000);
	  // تحديث قائمة الطلاب والأكواد دوريًا عشان الأكواد اللي بتتولد من "نسيت كلمة السر" تظهر فورًا للمالك/المشرف.
	  if (canStudentsRead) {
	    setInterval(() => {
	      apiFetch("/api/owner/students")
	        .then((students) => {
	          syncOwnerStudents(students);
	          renderOwnerStudents(studentSearch?.value || "");
	        })
	        .catch(() => {});
	    }, 8000);
	  }
	
	  // الافتراضي: أول لوحة متاحة حسب الصلاحيات
	  const priority = ["courses", "students", "forum", "guardian", "payments", "subscribers", "audit", "quiz", "homework", "exam"];
	  const firstAction = priority.find((a) => ownerSideMenu?.querySelector(`[data-owner-action="${a}"]`));
	  openOwnerPanel(firstAction || "courses");
	}

function initGuardianPage() {
  const guardianApp = byId("guardianApp");
  if (!guardianApp) return;

  if (getRole() !== "guardian") {
    window.location.href = "sign.html";
    return;
  }

  const guardianWelcome = byId("guardianWelcome");
  const guardianChildrenList = byId("guardianChildrenList");
  const guardianProgressTitle = byId("guardianProgressTitle");
  const guardianProgressSummary = byId("guardianProgressSummary");
  const guardianLessonsList = byId("guardianLessonsList");
  const guardianQuizList = byId("guardianQuizList");
  const guardianHomeworkList = byId("guardianHomeworkList");
  const guardianExamList = byId("guardianExamList");
  const guardianLogoutBtn = byId("guardianLogoutBtn");

  let childrenCache = [];
  let selectedChildId = 0;

  function statusBadge(ok, okText, badText) {
    return ok
      ? `<span class="badge ok">✅ ${okText}</span>`
      : `<span class="badge bad">❌ ${badText}</span>`;
  }

  function renderStatusRows(container, rows, opts = {}) {
    if (!container) return;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      container.innerHTML = `<p class="empty">${opts.emptyText || "لا يوجد بيانات."}</p>`;
      return;
    }
    container.innerHTML = list
      .map((row) => {
        const main = row.main || "-";
        const sub = row.sub ? `<span class="status-meta">${row.sub}</span>` : "";
        return `
          <article class="status-row">
            <div class="status-main">
              <strong>${main}</strong>
              ${sub}
            </div>
            ${row.badge || ""}
          </article>
        `;
      })
      .join("");
  }

  function renderChildren() {
    if (!guardianChildrenList) return;
    if (!childrenCache.length) {
      guardianChildrenList.innerHTML = "<p class='empty'>لا يوجد أبناء مرتبطون بهذا الرقم.</p>";
      return;
    }
    guardianChildrenList.innerHTML = childrenCache
      .map((child) => {
        const active = Number(child.id) === Number(selectedChildId) ? "active" : "";
        return `<button type="button" class="child-btn ${active}" data-child-id="${child.id}">${child.full_name || "-"} (${child.grade || "-"})</button>`;
      })
      .join("");
  }

  function renderSummary(lessons, assessments) {
    if (!guardianProgressSummary) return;
    const lessonTotal = lessons.length;
    const lessonOpened = lessons.filter((x) => x.opened).length;
    const quiz = assessments.filter((x) => x.type === "quiz");
    const homework = assessments.filter((x) => x.type === "homework");
    const exam = assessments.filter((x) => x.type === "exam");
    const attemptedCount = (arr) => arr.filter((x) => x.attempted).length;

    guardianProgressSummary.innerHTML = `
      <article class="summary-item"><p>المحاضرات المفتوحة</p><strong>${lessonOpened} / ${lessonTotal}</strong></article>
      <article class="summary-item"><p>الكويزات المحلولة</p><strong>${attemptedCount(quiz)} / ${quiz.length}</strong></article>
      <article class="summary-item"><p>الواجبات المحلولة</p><strong>${attemptedCount(homework)} / ${homework.length}</strong></article>
      <article class="summary-item"><p>الامتحانات المنجزة</p><strong>${attemptedCount(exam)} / ${exam.length}</strong></article>
    `;
  }

  function renderProgress(data) {
    const student = data?.student || {};
    const lessons = Array.isArray(data?.lessons) ? data.lessons : [];
    const assessments = Array.isArray(data?.assessments) ? data.assessments : [];

    if (guardianProgressTitle) {
      guardianProgressTitle.textContent = `تفاصيل المتابعة - ${student.full_name || "-"}`;
    }
    if (guardianWelcome) {
      guardianWelcome.textContent = `رقم الطالب: ${student.phone || "-"} | الصف: ${student.grade || "-"}`;
    }

    renderSummary(lessons, assessments);

    renderStatusRows(
      guardianLessonsList,
      lessons.map((l) => ({
        main: l.lessonTitle || "-",
        sub: `${l.courseTitle || "-"}${l.openedAt ? ` | آخر فتح: ${l.openedAt}` : ""}`,
        badge: statusBadge(!!l.opened, "تم الفتح", "لم يتم الفتح")
      })),
      { emptyText: "لا توجد محاضرات متاحة لهذا الطالب." }
    );

    const byType = (type) => assessments.filter((a) => String(a.type || "") === type);
    const assessmentRows = (rows, typeLabel) =>
      rows.map((a) => {
        const scoreText = a.attempted ? ` | الدرجة: ${Number(a.score || 0)} / ${Number(a.total || 0)}` : "";
        return {
          main: a.title || "-",
          sub: `${typeLabel} | ${a.lessonTitle || "-"}${scoreText}`,
          badge: statusBadge(!!a.attempted, "تم الحل", "لم يتم الحل")
        };
      });

    renderStatusRows(guardianQuizList, assessmentRows(byType("quiz"), "كويز"), { emptyText: "لا توجد كويزات." });
    renderStatusRows(guardianHomeworkList, assessmentRows(byType("homework"), "واجب"), { emptyText: "لا توجد واجبات." });
    renderStatusRows(guardianExamList, assessmentRows(byType("exam"), "امتحان"), { emptyText: "لا توجد امتحانات." });
  }

  async function loadProgress(childId) {
    const data = await apiFetch(`/api/guardian/progress?studentId=${Number(childId)}`);
    renderProgress(data);
  }

  async function loadChildren() {
    const data = await apiFetch("/api/guardian/children");
    childrenCache = Array.isArray(data?.children) ? data.children : [];
    selectedChildId = childrenCache.length ? Number(childrenCache[0].id) : 0;
    renderChildren();

    if (!selectedChildId) {
      if (guardianProgressTitle) guardianProgressTitle.textContent = "تفاصيل المتابعة";
      if (guardianProgressSummary) guardianProgressSummary.innerHTML = "";
      renderStatusRows(guardianLessonsList, [], { emptyText: "لا توجد بيانات." });
      renderStatusRows(guardianQuizList, [], { emptyText: "لا توجد بيانات." });
      renderStatusRows(guardianHomeworkList, [], { emptyText: "لا توجد بيانات." });
      renderStatusRows(guardianExamList, [], { emptyText: "لا توجد بيانات." });
      return;
    }

    await loadProgress(selectedChildId);
  }

  guardianChildrenList?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".child-btn");
    if (!btn) return;
    const childId = Number(btn.dataset.childId || 0);
    if (!childId || childId === selectedChildId) return;
    selectedChildId = childId;
    renderChildren();
    try {
      await loadProgress(childId);
    } catch (err) {
      alert(err.message || "تعذر تحميل متابعة الطالب.");
    }
  });

  guardianLogoutBtn?.addEventListener("click", () => {
    clearAuth();
    window.location.href = "sign.html";
  });

  loadChildren().catch((err) => {
    alert(err.message || "تعذر تحميل صفحة ولي الأمر.");
    if (isAuthErrorMessage(err?.message)) {
      clearAuth();
      window.location.href = "sign.html";
    }
  });
}

function initStudentPage() {
  const sideMenu = byId("sideMenu");
  if (!sideMenu) return;

  if (getMustChangePassword()) {
    window.location.href = "sign.html";
    return;
  }

  if (getRole() !== "student") {
    window.location.href = "sign.html";
    return;
  }

  const themeToggleBtn = byId("themeToggle");
  const studentThemeKey = "aftermainTheme";

  function applyStudentTheme(theme) {
    const isDark = theme === "dark";
    document.body.classList.toggle("theme-dark", isDark);
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = isDark
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
      themeToggleBtn.setAttribute("aria-label", isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي");
      themeToggleBtn.setAttribute("title", isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي");
    }
  }

  try {
    const savedTheme = localStorage.getItem(studentThemeKey) || "light";
    applyStudentTheme(savedTheme);
  } catch (_e) {
    applyStudentTheme("light");
  }

  themeToggleBtn?.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("theme-dark") ? "light" : "dark";
    try {
      localStorage.setItem(studentThemeKey, nextTheme);
    } catch (_e) {
      // ignore
    }
    applyStudentTheme(nextTheme);
  });

  const menuBtn = byId("menuToggle");
  const sidebarCollapseBtn = byId("sidebarCollapseBtn");
  const menuLinks = sideMenu.querySelectorAll("a[data-action]");
  const bodyEl = document.body;
  const mobileSidebarQuery = window.matchMedia("(max-width: 992px)");
  const compactCourseViewQuery = window.matchMedia("(max-width: 767px)");
  const sidebarStateKey = "studentSidebarCollapsed";

		  const panels = {
		    courses: byId("coursesPanel"),
		    individualLessons: byId("individualLessonsPanel"),
		    courseContent: byId("courseContentPanel"),
		    assessment: byId("assessmentPanel"),
		    myCourses: byId("myCoursesPanel"),
		    quizzes: byId("quizzesPanel"),
		    homework: byId("homeworkPanel"),
		    exams: byId("examsPanel"),
		    forum: byId("forumPanel"),
		    notifications: byId("notificationsPanel"),
		    account: byId("accountPanel")
		  };

  const coursesGrid = byId("coursesGrid");
  const coursesOrbitStage = byId("coursesOrbitStage");
  const orbitControlBtns = document.querySelectorAll(".orbit-control-btn");
  const siteFooter = document.querySelector(".site-footer");
	  const subjectProgressList = byId("subjectProgressList");
	  const courseContentTitle = byId("courseContentTitle");
	  const courseLessons = byId("courseLessons");
	  const backToCourses = byId("backToCourses");

  const assessmentTitle = byId("assessmentTitle");
  const assessmentTimer = byId("assessmentTimer");
  const assessmentMeta = byId("assessmentMeta");
  const assessmentQuestion = byId("assessmentQuestion");
  const assessmentOptions = byId("assessmentOptions");
  const questionProgress = byId("questionProgress");
  const prevQuestion = byId("prevQuestion");
  const nextQuestion = byId("nextQuestion");
  const finishAssessment = byId("finishAssessment");
  const assessmentResult = byId("assessmentResult");

	  const myCoursesList = byId("myCoursesList");
	  const individualLessonsList = byId("individualLessonsList");
		  const quizzesHistory = byId("quizzesHistory");
		  const homeworkHistory = byId("homeworkHistory");
		  const examsHistory = byId("examsHistory");
		  const studentForumForm = byId("studentForumForm");
		  const studentForumBody = byId("studentForumBody");
		  const studentForumImageFile = byId("studentForumImageFile");
		  const studentForumList = byId("studentForumList");
		  const notificationsList = byId("notificationsList");
		  const notificationsBadge = byId("notificationsBadge");
		  const markAllNotificationsRead = byId("markAllNotificationsRead");

  const studentName = byId("studentName");
  const studentPhone = byId("studentPhone");
  const guardianPhone = byId("guardianPhone");
  const studentGrade = byId("studentGrade");
  const studentGovernorate = byId("studentGovernorate");
  const studentBranch = byId("studentBranch");

	  let courses = [];
	  let activeCourseId = null;
	  let assessmentState = null;
	  let orbitIndex = 0;
	  let orbitRotation = 0;
	  let orbitCardEls = [];
	  let orbitDragged = false;
	  let orbitDragging = false;
	  let orbitStartX = 0;
	  let orbitStartY = 0;
	  let orbitAutoRaf = 0;
	  let orbitLastTs = 0;
	  let orbitPausedUntil = 0;
	  let orbitFocusTimer = 0;
	  let orbitManualStepTimer = 0;
	  let orbitIsFocusing = false;
	  let orbitLastCardW = 0;
	  let orbitLastCardH = 0;
		  let timerId = null;
		  let activeAction = "courses";
		  let notificationsCache = { loaded: false, rows: [], unreadCount: 0 };

	  const historyCache = {
	    quiz: { loaded: false, rows: [] },
	    homework: { loaded: false, rows: [] },
	    exam: { loaded: false, rows: [] }
	  };
	  const attemptById = new Map();

  function assessmentTypeLabel(type) {
    if (type === "quiz") return "كويز";
    if (type === "homework") return "واجب";
    if (type === "exam") return "امتحان";
    return type;
  }

  function clearTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function hideAllPanels() {
    Object.values(panels).forEach((panel) => {
      if (panel) panel.hidden = true;
    });
    assessmentResult.innerHTML = "";
  }

  function setStudentFooterHidden(hidden) {
    if (!siteFooter) return;
    siteFooter.hidden = !!hidden;
  }

  function isMobileSidebar() {
    return mobileSidebarQuery.matches;
  }

  function isCompactCoursesView() {
    return compactCourseViewQuery.matches;
  }

  function setDesktopSidebarCollapsed(collapsed) {
    const isCollapsed = !!collapsed;
    bodyEl.classList.toggle("sidebar-collapsed", isCollapsed);
    bodyEl.classList.toggle("sidebar-expanded", !isCollapsed);
    if (sidebarCollapseBtn) {
      sidebarCollapseBtn.setAttribute("aria-label", isCollapsed ? "تكبير القائمة" : "تصغير القائمة");
      sidebarCollapseBtn.setAttribute("title", isCollapsed ? "تكبير القائمة" : "تصغير القائمة");
    }
    try {
      localStorage.setItem(sidebarStateKey, isCollapsed ? "1" : "0");
    } catch (_e) {
      // ignore
    }
  }

  function applySidebarMode() {
    const saved = localStorage.getItem(sidebarStateKey);
    const collapsed = saved === null ? true : saved === "1";
    setDesktopSidebarCollapsed(collapsed);
    bodyEl.classList.remove("sidebar-mobile", "sidebar-mobile-open");
    sideMenu.classList.remove("open");
  }

  function selectMenu(action) {
    menuLinks.forEach((link) => link.classList.remove("selected"));
    const active = sideMenu.querySelector(`[data-action="${action}"]`);
    if (active) active.classList.add("selected");
  }

		  function openPanel(action) {
		    hideAllPanels();
		    activeAction = action;
		    setStudentFooterHidden(false);
		    bodyEl.classList.toggle("courses-active", action === "courses");
		    if (action !== "courses") {
		      stopAutoOrbit();
		      clearTimeout(orbitFocusTimer);
		      orbitIsFocusing = false;
		      clearOrbitEntering();
		    }

	    if (action === "courses") {
      panels.courses.hidden = false;
      requestAnimationFrame(() => {
        if (isCompactCoursesView()) {
          stopAutoOrbit();
          resetCoursesOrbitToList();
        } else {
          applyCoursesOrbit();
          startAutoOrbit();
        }
      });
    }

	    if (action === "individual-lessons") {
	      loadIndividualLessons();
	      panels.individualLessons.hidden = false;
	    }

    if (action === "my-courses") {
      loadMyCourses();
      panels.myCourses.hidden = false;
    }

    if (action === "quizzes") {
      loadHistory("quiz", quizzesHistory);
      panels.quizzes.hidden = false;
    }

    if (action === "homework") {
      loadHistory("homework", homeworkHistory);
      panels.homework.hidden = false;
    }

	    if (action === "exams") {
	      loadHistory("exam", examsHistory);
	      panels.exams.hidden = false;
	    }

	    if (action === "forum") {
	      loadStudentForumQuestions().catch((err) => alert(err.message || "تعذر تحميل المنتدى."));
	      panels.forum.hidden = false;
	    }

	    if (action === "notifications") {
	      loadNotifications(false).catch((err) => alert(err.message || "تعذر تحميل الإشعارات."));
	      panels.notifications.hidden = false;
	    }

    if (action === "account") {
      loadProfile();
      panels.account.hidden = false;
    }

	    selectMenu(action);
	  }

	  function studentForumStatusText(status) {
	    return String(status || "") === "answered" ? "تمت الإجابة" : "مفتوح";
	  }

	  function renderStudentForumQuestions(rows) {
	    if (!studentForumList) return;
	    const list = Array.isArray(rows) ? rows : [];
	    if (!list.length) {
	      studentForumList.innerHTML = "<p class='empty'>لا توجد أسئلة حتى الآن.</p>";
	      return;
	    }
	    studentForumList.innerHTML = list
	      .map((q) => {
	        const body = String(q.body || "").trim();
	        const image = String(q.image_url || "").trim();
	        return `
	          <article class="item">
	            <h4>#${q.id} - ${q.title || "-"}</h4>
	            <p>الحالة: <strong>${studentForumStatusText(q.status)}</strong></p>
	            ${body ? `<p>${body}</p>` : ""}
	            ${image ? `<img src="${image}" alt="صورة السؤال" style="max-width:220px;border-radius:10px;border:1px solid #ddd">` : ""}
	            <p>عدد الردود: ${Number(q.answers_count || 0)}</p>
	            <small>${q.created_at || "-"}</small>
	            <div style="margin-top:8px">
	              <button type="button" class="small-btn ghost" data-student-forum-open="${q.id}">عرض الردود</button>
	            </div>
	            <div id="studentForumAnswers-${q.id}" class="list" style="margin-top:8px"></div>
	          </article>
	        `;
	      })
	      .join("");
	  }

	  function renderStudentForumAnswers(questionId, answers) {
	    const holder = byId(`studentForumAnswers-${Number(questionId)}`);
	    if (!holder) return;
	    const list = Array.isArray(answers) ? answers : [];
	    if (!list.length) {
	      holder.innerHTML = "<p class='empty'>لا توجد ردود بعد.</p>";
	      return;
	    }
	    holder.innerHTML = list
	      .map((a) => `
	        <article class="item">
	          <p><strong>${a.author_role === "owner" ? "المالك" : "مشرف"}</strong></p>
	          ${a.body ? `<p>${a.body}</p>` : ""}
	          ${a.image_url ? `<img src="${a.image_url}" alt="صورة الرد" style="max-width:220px;border-radius:10px;border:1px solid #ddd">` : ""}
	          ${a.audio_url ? `<audio controls src="${a.audio_url}" style="width:100%;margin-top:6px"></audio>` : ""}
	          <small>${a.created_at || "-"}</small>
	        </article>
	      `)
	      .join("");
	  }

	  async function uploadStudentForumImage(file) {
	    const fd = new FormData();
	    fd.append("image", file);
	    const data = await apiFetch("/api/student/forum/upload-image", { method: "POST", body: fd });
	    return String(data?.imageUrl || "");
	  }

	  async function loadStudentForumQuestions() {
	    const rows = await apiFetch("/api/student/forum/questions");
	    renderStudentForumQuestions(rows || []);
	  }

	  function setNotificationsBadge(count) {
	    if (!notificationsBadge) return;
	    const n = Math.max(0, Number(count) || 0);
	    notificationsBadge.textContent = String(n);
	    notificationsBadge.hidden = n <= 0;
	  }

	  function renderNotifications(rows) {
	    if (!notificationsList) return;
	    const list = Array.isArray(rows) ? rows : [];
	    if (!list.length) {
	      notificationsList.innerHTML = "<p class='empty'>لا توجد إشعارات.</p>";
	      return;
	    }

	    notificationsList.innerHTML = list
	      .map((n) => {
	        const unread = !n.read_at;
	        const created = n.created_at || "";
	        return `
	          <article class="history-item ${unread ? "wrong" : "ok"}">
	            <h4>${unread ? "جديد" : "مقروء"}</h4>
	            <p>${n.message || "-"}</p>
	            <small>التاريخ: ${created}</small>
	            ${unread ? `<button type="button" class="small-btn ghost notif-read-btn" data-notif-id="${n.id}">تمييز كمقروء</button>` : ""}
	          </article>
	        `;
	      })
	      .join("");
	  }

	  async function loadNotifications(onlyBadge = false) {
	    const data = await apiFetch("/api/student/notifications?limit=50");
	    notificationsCache = {
	      loaded: true,
	      rows: data.notifications || [],
	      unreadCount: Number(data.unreadCount || 0)
	    };
	    setNotificationsBadge(notificationsCache.unreadCount);
	    if (!onlyBadge) renderNotifications(notificationsCache.rows);
	  }

	  function renderCoursesInto(container, list) {
	    if (!container) return;
	    container.innerHTML = "";

	    (list || []).forEach((course) => {
	      const card = document.createElement("article");
	      card.className = "course-card";
	      card.dataset.courseId = course.id;
	      const priceCents = Number(course.price_cents) || 0;
	      const subscribed = Boolean(course.isSubscribed);
	      const gradeText = course.grade ? `الصف: ${course.grade}` : "الصف: غير محدد";
	      const priceText = priceCents > 0 ? `${(priceCents / 100).toFixed(2)} جنيه` : "مجاني";
	      const pending = course.pendingRequest && course.pendingRequest.reference ? course.pendingRequest : null;
	      const pendingRemain = pending?.expires_at ? formatRemainingUntil(pending.expires_at) : "-";

	      card.innerHTML = `
	        <div class="card-media">
	          ${course.image_url ? `<img src="${optimizeImageUrl(course.image_url, 920)}" alt="${course.title}" loading="lazy" decoding="async">` : `<div class="media-placeholder">بدون صورة</div>`}
	        </div>
	        <div class="card-body">
	          <div class="card-head">
	            <h4>${course.title}</h4>
	            ${subscribed ? `<span class="subscribed-badge">مشترك</span>` : `<span class="price-badge">${priceText}</span>`}
	          </div>
	          <p class="course-grade">${gradeText}</p>
	          ${course.description ? `<p>${course.description}</p>` : ""}
	          ${
	            pending && !subscribed
	              ? `<div class="locked-note"><p>رقم مرجعي نشط: <strong>${pending.reference}</strong></p><p>المتبقي لانتهاء الصلاحية: <strong>${pendingRemain}</strong></p></div>`
	              : ""
	          }
	          <div class="card-actions">
	            <button type="button" class="small-btn course-enter-btn" data-course-id="${course.id}">الدخول إلى الكورس</button>
	            ${priceCents > 0 && !subscribed ? `<button type="button" class="small-btn ghost course-subscribe-btn" data-course-id="${course.id}">الاشتراك في الكورس</button>` : ""}
	          </div>
	        </div>
	      `;
	      container.appendChild(card);
	    });
	    setupCoursesOrbit();
	  }

	  function normalizeOrbitIndex(idx, total) {
	    if (!total) return 0;
	    return ((idx % total) + total) % total;
	  }

	  function pauseOrbit(ms = 120) {
	    orbitPausedUntil = Date.now() + Math.max(0, Number(ms) || 0);
	  }

	  function clearOrbitEntering() {
	    coursesOrbitStage?.classList.remove("is-focusing");
	    orbitCardEls.forEach((card) => card.classList.remove("is-entering"));
	  }

  function resetCoursesOrbitToList() {
    coursesOrbitStage?.classList.remove("is-auto", "is-dragging", "is-manual-step", "is-focusing");
    orbitCardEls = Array.from(coursesGrid?.querySelectorAll(".course-card") || []);
    orbitCardEls.forEach((card) => {
      card.classList.remove("is-focused", "is-entering");
      card.style.removeProperty("--orbit-transform");
      card.style.removeProperty("--depth-scale");
      card.style.removeProperty("width");
      card.style.removeProperty("maxHeight");
      card.style.removeProperty("transform");
      card.style.removeProperty("opacity");
      card.style.removeProperty("filter");
      card.style.removeProperty("zIndex");
      card.style.removeProperty("pointerEvents");
    });
  }

  function refreshOrbitCards() {
	    orbitCardEls = Array.from(coursesGrid?.querySelectorAll(".course-card") || []);
	    return orbitCardEls.length;
	  }

	  function applyCoursesOrbit() {
    if (!coursesGrid) return;
    if (isCompactCoursesView()) {
      stopAutoOrbit();
      resetCoursesOrbitToList();
      return;
    }
	    if (!orbitCardEls.length) refreshOrbitCards();
	    const total = orbitCardEls.length;
	    if (!total) return;
	    orbitIndex = normalizeOrbitIndex(orbitIndex, total);

	    const stageW = Math.max(320, coursesOrbitStage?.clientWidth || 900);
	    const stageH = Math.max(320, coursesOrbitStage?.clientHeight || 560);
	    const radius = Math.min(420, Math.max(210, stageW * 0.41));
	    const angleStep = 360 / total;
	    const cardW = Math.min(330, Math.max(182, stageW * 0.3));
	    const cardMaxH = Math.min(390, Math.max(270, stageH * 0.72));
	    const sizeChanged = Math.abs(cardW - orbitLastCardW) > 1 || Math.abs(cardMaxH - orbitLastCardH) > 1;
	    if (sizeChanged) {
	      orbitLastCardW = cardW;
	      orbitLastCardH = cardMaxH;
	    }
	    let topZ = -Infinity;
	    let focusedIdx = 0;

	    orbitCardEls.forEach((card, i) => {
	      const angle = orbitRotation + i * angleStep;
	      const rad = (angle * Math.PI) / 180;
	      const z = Math.cos(rad) * radius;
	      const front = (z + radius) / (2 * radius);
	      const scale = 0.72 + front * 0.3;
	      const opacity = 0.82 + front * 0.18;

	      if (z > topZ) {
	        topZ = z;
	        focusedIdx = i;
	      }

	      card.style.setProperty("--orbit-transform", `translate(-50%, -50%) rotateY(${angle.toFixed(2)}deg) translateZ(${radius.toFixed(1)}px) rotateY(${(-angle).toFixed(2)}deg)`);
	      card.style.transform = "var(--orbit-transform) translateZ(var(--pop-z, 0px)) scale(calc(var(--pop-scale, 1) * var(--depth-scale, 1)))";
	      card.style.setProperty("--depth-scale", scale.toFixed(3));
	      if (sizeChanged) {
	        card.style.width = `${cardW.toFixed(0)}px`;
	        card.style.maxHeight = `${cardMaxH.toFixed(0)}px`;
	      }
	      card.style.opacity = `${opacity.toFixed(3)}`;
	      card.style.filter = "none";
	      card.style.zIndex = `${1000 + Math.round(z)}`;
	      card.style.pointerEvents = "auto";
	      card.classList.remove("is-focused");
	    });
	    orbitCardEls[focusedIdx]?.classList.add("is-focused");
	  }

	  function rotateCoursesOrbit(step) {
    if (isCompactCoursesView()) return;
    const total = orbitCardEls.length || coursesGrid?.querySelectorAll(".course-card")?.length || 0;
	    if (!total) return;
	    pauseOrbit(850);
	    coursesOrbitStage?.classList.remove("is-auto");
	    coursesOrbitStage?.classList.add("is-manual-step");
	    clearTimeout(orbitManualStepTimer);
	    orbitManualStepTimer = setTimeout(() => {
	      coursesOrbitStage?.classList.remove("is-manual-step");
	    }, 1100);
	    orbitIndex = normalizeOrbitIndex(orbitIndex + step, total);
	    orbitRotation = -orbitIndex * (360 / total);
	    applyCoursesOrbit();
	  }

	  function setupCoursesOrbit() {
    refreshOrbitCards();
    if (isCompactCoursesView()) {
      resetCoursesOrbitToList();
      return;
    }
	    if (!orbitCardEls.length) return;
	    orbitIndex = normalizeOrbitIndex(orbitIndex, orbitCardEls.length);
	    orbitRotation = -orbitIndex * (360 / orbitCardEls.length);
	    applyCoursesOrbit();
	  }

	  function syncOrbitToFrontCard() {
	    const total = orbitCardEls.length;
	    if (!total) return;
	    const step = 360 / total;
	    orbitIndex = normalizeOrbitIndex(Math.round(-orbitRotation / step), total);
	    orbitRotation = -orbitIndex * step;
	  }

	  function stopAutoOrbit() {
	    if (orbitAutoRaf) cancelAnimationFrame(orbitAutoRaf);
	    orbitAutoRaf = 0;
	    coursesOrbitStage?.classList.remove("is-auto");
	  }

	  function autoOrbitTick(ts) {
	    if (!orbitAutoRaf) return;
	    const prev = orbitLastTs || ts;
	    orbitLastTs = ts;
	    const dt = Math.max(0, ts - prev);
	    const coursesVisible = !!panels.courses && !panels.courses.hidden;
	    const canAuto = coursesVisible && !orbitDragging && !orbitIsFocusing && Date.now() >= orbitPausedUntil;
	    coursesOrbitStage?.classList.toggle("is-auto", canAuto);
	    if (canAuto) {
	      orbitRotation += (dt / 1000) * 7.5;
	      applyCoursesOrbit();
	    }
	    orbitAutoRaf = requestAnimationFrame(autoOrbitTick);
	  }

	  function startAutoOrbit() {
    if (isCompactCoursesView()) return;
    if (orbitAutoRaf) return;
	    orbitLastTs = performance.now();
	    orbitAutoRaf = requestAnimationFrame(autoOrbitTick);
	  }

	  function focusCourseThenOpen(courseId) {
    const targetId = Number(courseId);
    if (!targetId) return;
    if (isCompactCoursesView()) {
      renderLessons(targetId);
      return;
    }
	    const idx = orbitCardEls.findIndex((c) => Number(c.dataset.courseId) === targetId);
	    if (idx < 0) {
	      renderLessons(targetId);
	      return;
	    }
	    orbitIsFocusing = true;
	    pauseOrbit(180);
	    clearTimeout(orbitFocusTimer);
	    clearOrbitEntering();
	    const step = 360 / orbitCardEls.length;
	    orbitIndex = idx;
	    orbitRotation = -idx * step;
	    applyCoursesOrbit();
	    const selected = orbitCardEls[idx];
	    selected?.classList.add("is-entering");
	    coursesOrbitStage?.classList.add("is-focusing");
	    orbitFocusTimer = setTimeout(() => {
	      clearOrbitEntering();
	      orbitIsFocusing = false;
	      renderLessons(targetId);
	    }, 520);
	  }

	  function buildSubjectProgressRows(courseList, attemptedAssessmentIds) {
	    const bySubject = new Map();
	    (courseList || []).forEach((course) => {
	      const subject = String(course?.subject || "بدون مادة").trim() || "بدون مادة";
	      if (!bySubject.has(subject)) {
	        bySubject.set(subject, { subject, lessonTotal: 0, lessonDone: 0, assessTotal: 0, assessDone: 0 });
	      }
	      const row = bySubject.get(subject);
	      (course.lessons || []).forEach((lesson) => {
	        row.lessonTotal += 1;
	        if (lesson?.opened) row.lessonDone += 1;
	        (lesson.files || []).forEach((file) => {
	          row.assessTotal += 1;
	          if (attemptedAssessmentIds.has(Number(file.id))) row.assessDone += 1;
	        });
	      });
	    });
	    return Array.from(bySubject.values());
	  }

	  function renderSubjectProgress(courseList, attemptedAssessmentIds = new Set()) {
	    if (!subjectProgressList) return;
	    const rows = buildSubjectProgressRows(courseList, attemptedAssessmentIds);
	    if (!rows.length) {
	      subjectProgressList.innerHTML = "";
	      return;
	    }
	    subjectProgressList.innerHTML = rows
	      .map((row) => {
	        const total = row.lessonTotal + row.assessTotal;
	        const done = row.lessonDone + row.assessDone;
	        const percent = total > 0 ? Math.round((done * 100) / total) : 0;
	        return `
	          <article class="subject-progress-card">
	            <div class="subject-progress-head">
	              <h4>${row.subject}</h4>
	              <span class="subject-progress-percent">${percent}%</span>
	            </div>
	            <div class="subject-progress-track">
	              <div class="subject-progress-fill" style="width:${percent}%"></div>
	            </div>
	            <p class="subject-progress-meta">المحاضرات: ${row.lessonDone}/${row.lessonTotal} | التقييمات: ${row.assessDone}/${row.assessTotal}</p>
	          </article>
	        `;
	      })
	      .join("");
	  }

	  function attemptedIdsFromLoadedHistory() {
	    const ids = new Set();
	    ["quiz", "homework", "exam"].forEach((type) => {
	      const rows = Array.isArray(historyCache[type]?.rows) ? historyCache[type].rows : [];
	      rows.forEach((row) => ids.add(Number(row.assessmentId)));
	    });
	    return ids;
	  }

  async function loadCourses() {
    courses = await apiFetch("/api/student/courses?scope=all");
    await Promise.all([
      ensureHistory("quiz").catch(() => []),
      ensureHistory("homework").catch(() => []),
      ensureHistory("exam").catch(() => [])
    ]);
    renderSubjectProgress(courses, attemptedIdsFromLoadedHistory());
    renderCoursesInto(coursesGrid, courses);
  }

  async function loadIndividualLessons() {
    const lessons = await apiFetch("/api/student/individual-lessons");
    if (!individualLessonsList) return;
    individualLessonsList.innerHTML = "";

    if (!Array.isArray(lessons) || lessons.length === 0) {
      individualLessonsList.innerHTML = "<p class='empty'>لا توجد محاضرات فردية متاحة لهذا الصف حالياً.</p>";
      return;
    }

    lessons.forEach((lesson) => {
      const block = document.createElement("article");
      block.className = "lesson-block";
      const priceCents = Number(lesson.price_cents) || 0;
      const priceText = `${(priceCents / 100).toFixed(2)} جنيه`;
      const isUnlocked = Boolean(lesson.isUnlocked);

      block.innerHTML = `
        <div class="lesson-head">
          <div class="lesson-media">
            ${lesson.image_url ? `<img src="${optimizeImageUrl(lesson.image_url, 880)}" alt="${lesson.title}" loading="lazy" decoding="async">` : `<div class="media-placeholder">بدون صورة</div>`}
          </div>
          <div class="lesson-meta">
            <div class="lesson-title-row">
              <h4>${lesson.title}</h4>
              <span class="price-badge">${priceText}</span>
              ${isUnlocked ? `<span class="subscribed-badge">مفتوح</span>` : `<span class="locked-badge">مغلق</span>`}
            </div>
            <p class="lesson-desc">الكورس: ${lesson.course_title || "-"} — المادة: ${lesson.course_subject || "-"}</p>
            ${lesson.description ? `<p class="lesson-desc">${lesson.description}</p>` : ""}
            <div class="lesson-actions">
              <button type="button" class="small-btn individual-enter-btn" data-course-id="${lesson.course_id}" data-lesson-id="${lesson.id}">الدخول للمحاضرة</button>
              ${!isUnlocked ? `<button type="button" class="small-btn ghost individual-subscribe-btn" data-lesson-id="${lesson.id}">الاشتراك في المحاضرة</button>` : ""}
            </div>
          </div>
        </div>
      `;

      individualLessonsList.appendChild(block);
    });
  }

	  function renderLessons(courseId) {
	    const course = courses.find((c) => Number(c.id) === Number(courseId));
	    if (!course) return;
	    stopAutoOrbit();
	    clearOrbitEntering();
	    orbitIsFocusing = false;
	    setStudentFooterHidden(true);
	    bodyEl.classList.remove("courses-active");
	    activeCourseId = Number(courseId);

	    hideAllPanels();
	    panels.courseContent.hidden = false;
	    courseContentTitle.textContent = course.title;
	    courseLessons.innerHTML = "";

	    course.lessons.forEach((lesson) => {
	      const block = document.createElement("article");
	      block.className = `lesson-block${lesson.isUnlocked ? "" : " locked-preview"}`;
	      block.dataset.lessonId = lesson.id;

	      const files = lesson.files || [];
	      const quiz = files.find((f) => f.type === "quiz");
	      const homework = files.find((f) => f.type === "homework");
	      const exam = files.find((f) => f.type === "exam");
	      const isUnlocked = Boolean(lesson.isUnlocked);
	      const coursePriceCents = Number(course.price_cents) || 0;

	      const hasExplainVideo = Boolean(String(lesson.video_url || "").trim() || lesson.has_video_url);
	      const hasExplainFile = Boolean(String(lesson.explain_file_url || "").trim() || lesson.has_explain_file_url);
	      const hasSolutionVideo = Boolean(String(lesson.solution_video_url || "").trim() || lesson.has_solution_video_url);
	      const hasSolutionFile = Boolean(String(lesson.solution_file_url || "").trim() || lesson.has_solution_file_url);

	      block.innerHTML = `
	        <div class="lesson-head">
	          <div class="lesson-media">
	            ${lesson.image_url ? `<img src="${optimizeImageUrl(lesson.image_url, 920)}" alt="${lesson.title}" loading="lazy" decoding="async">` : `<div class="media-placeholder">بدون صورة</div>`}
	          </div>
	          <div class="lesson-meta">
	            <div class="lesson-title-row">
	              <h4>${lesson.title}</h4>
	              ${isUnlocked ? `<span class="subscribed-badge">مفتوح</span>` : `<span class="locked-badge">مغلق</span>`}
	            </div>
	            ${lesson.description ? `<p class="lesson-desc">${lesson.description}</p>` : ""}
	            <div class="lesson-actions">
	              <button type="button" class="small-btn lesson-enter-btn" data-lesson-id="${lesson.id}">الدخول للمحاضرة</button>
	              ${coursePriceCents > 0 && !course.isSubscribed ? `<span class="hint-badge">لفتح المحتوى: اشترك في الكورس (أو من قسم المحاضرات الفردية إن كانت متاحة فرديًا)</span>` : ""}
	            </div>
	          </div>
	        </div>

	        ${
	          isUnlocked
	            ? `
	              <details class="lesson-part" open>
	                <summary>فيديو شرح ${lesson.title}</summary>
	                <div class="lesson-content">
	                  ${lesson.video_url ? `
	                  <div class="video-wrap">
	                    <iframe src="${lesson.video_url}" title="${lesson.title}" loading="lazy" allowfullscreen></iframe>
	                  </div>` : "<p class='empty'>لم يتم إضافة فيديو شرح بعد.</p>"}
	                  ${lesson.explain_file_url ? `<a class="small-btn ghost" href="${lesson.explain_file_url}" target="_blank" rel="noopener noreferrer">ملف فيديو الشرح</a>` : ""}
	                </div>
	              </details>
	              <details class="lesson-part">
	                <summary>فيديو حل ${lesson.title}</summary>
	                <div class="lesson-content">
	                  ${lesson.solution_video_url ? `
	                  <div class="video-wrap">
	                    <iframe src="${lesson.solution_video_url}" title="حل ${lesson.title}" loading="lazy" allowfullscreen></iframe>
	                  </div>` : "<p class='empty'>لم يتم إضافة فيديو حل بعد.</p>"}
	                  ${lesson.solution_file_url ? `<a class="small-btn ghost" href="${lesson.solution_file_url}" target="_blank" rel="noopener noreferrer">ملف فيديو الحل</a>` : ""}
	                </div>
	              </details>
	              <div class="files-row">
	                ${quiz ? `<button class="file-btn" data-assessment-id="${quiz.id}" data-type="quiz"><i class="fa-solid fa-file-circle-question"></i><span>ملف ${quiz.title}</span></button>` : ""}
	                ${homework ? `<button class="file-btn" data-assessment-id="${homework.id}" data-type="homework"><i class="fa-solid fa-file-lines"></i><span>ملف ${homework.title}</span></button>` : ""}
	                ${exam ? `<button class="file-btn" data-assessment-id="${exam.id}" data-type="exam"><i class="fa-solid fa-file-circle-check"></i><span>ملف ${exam.title}</span></button>` : ""}
	              </div>
	            `
	            : `
	              <div class="locked-note">
	                <p>المحتوى ظاهر للمعاينة فقط. اشترك لفتح الفيديوهات والملفات والكويز.</p>
	                ${coursePriceCents > 0 && !course.isSubscribed ? `<p>هذه المحاضرة ضمن اشتراك الكورس.</p>` : ""}
	              </div>

	              <details class="lesson-part" open>
	                <summary>فيديو شرح ${lesson.title}</summary>
	                <div class="lesson-content">
	                  ${
	                    hasExplainVideo
	                      ? `
	                        <div class="video-wrap locked-video" aria-hidden="true">
	                          <div class="locked-overlay">
	                            <i class="fa-solid fa-lock"></i>
	                            <span>فيديو الشرح مقفل</span>
	                          </div>
	                        </div>
	                      `
	                      : "<p class='empty'>لم يتم إضافة فيديو شرح بعد.</p>"
	                  }
	                  ${hasExplainFile ? `<button type="button" class="small-btn ghost locked-link" disabled>ملف فيديو الشرح (مقفل)</button>` : ""}
	                </div>
	              </details>

	              <details class="lesson-part">
	                <summary>فيديو حل ${lesson.title}</summary>
	                <div class="lesson-content">
	                  ${
	                    hasSolutionVideo
	                      ? `
	                        <div class="video-wrap locked-video" aria-hidden="true">
	                          <div class="locked-overlay">
	                            <i class="fa-solid fa-lock"></i>
	                            <span>فيديو الحل مقفل</span>
	                          </div>
	                        </div>
	                      `
	                      : "<p class='empty'>لم يتم إضافة فيديو حل بعد.</p>"
	                  }
	                  ${hasSolutionFile ? `<button type="button" class="small-btn ghost locked-link" disabled>ملف فيديو الحل (مقفل)</button>` : ""}
	                </div>
	              </details>

	              <div class="files-row">
	                ${quiz ? `<button class="file-btn" disabled data-locked="1" data-assessment-id="${quiz.id}" data-type="quiz"><i class="fa-solid fa-file-circle-question"></i><span>ملف ${quiz.title} (مقفل)</span></button>` : ""}
	                ${homework ? `<button class="file-btn" disabled data-locked="1" data-assessment-id="${homework.id}" data-type="homework"><i class="fa-solid fa-file-lines"></i><span>ملف ${homework.title} (مقفل)</span></button>` : ""}
	                ${exam ? `<button class="file-btn" disabled data-locked="1" data-assessment-id="${exam.id}" data-type="exam"><i class="fa-solid fa-file-circle-check"></i><span>ملف ${exam.title} (مقفل)</span></button>` : ""}
	              </div>
	            `
	        }
	      `;

	      courseLessons.appendChild(block);
	    });
	  }

	  async function openAssessment(assessmentId) {
	    const data = await apiFetch(`/api/student/assessment/${assessmentId}`);

	    const questionBox = panels.assessment?.querySelector(".question-box");
	    const nav = panels.assessment?.querySelector(".assessment-nav");
	    if (questionBox) questionBox.hidden = false;
	    if (nav) nav.hidden = false;
	    if (finishAssessment) finishAssessment.hidden = false;

	    assessmentState = {
	      id: data.id,
	      type: data.type,
      title: data.title,
      questions: data.questions,
      answers: new Array(data.questions.length).fill(null),
      index: 0,
      totalSeconds: (data.duration_minutes || 300) * 60,
      remaining: (data.duration_minutes || 300) * 60
    };

    hideAllPanels();
    panels.assessment.hidden = false;
    assessmentTitle.textContent = data.title;
    const remainText =
      Number(data.attemptsAllowed || 1) > 0
        ? `المحاولات المتبقية: ${Number(data.attemptsRemaining || 0)} / ${Number(data.attemptsAllowed || 1)}`
        : "";
    const firstScoreText = data.firstAttempt
      ? ` | الدرجة الرسمية (أول محاولة): ${Number(data.firstAttempt.score || 0)} / ${Number(data.firstAttempt.total || 0)}`
      : "";
    assessmentMeta.textContent = `${assessmentTypeLabel(data.type)}${remainText ? ` | ${remainText}` : ""}${firstScoreText}`;
    assessmentResult.innerHTML = "";
	    assessmentTimer.textContent = formatTime(assessmentState.remaining);

	    renderQuestion();
	    startTimer();
	  }

  function renderQuestion() {
    if (!assessmentState) return;

    const q = assessmentState.questions[assessmentState.index];
    questionProgress.textContent = `السؤال ${assessmentState.index + 1} من ${assessmentState.questions.length}`;
    assessmentQuestion.innerHTML = `${q.text || "سؤال بالصورة فقط"} <strong>(درجة ${q.score})</strong>`;
    assessmentOptions.innerHTML = "";

    if (q.imageUrl) {
      const img = document.createElement("img");
      img.src = q.imageUrl;
      img.alt = "صورة السؤال";
      img.className = "question-image";
      assessmentOptions.appendChild(img);
    }

    q.options.forEach((opt, i) => {
      const label = document.createElement("label");
      label.className = "quiz-option";
      label.innerHTML = `
        <input type="radio" name="assessment-option" value="${i}" ${assessmentState.answers[assessmentState.index] === i ? "checked" : ""}>
        <span>${opt}</span>
      `;
      assessmentOptions.appendChild(label);
    });

    prevQuestion.disabled = assessmentState.index === 0;
    nextQuestion.disabled = assessmentState.index === assessmentState.questions.length - 1;
  }

  function startTimer() {
    clearTimer();
    timerId = setInterval(() => {
      if (!assessmentState) return;

      assessmentState.remaining -= 1;
      assessmentTimer.textContent = formatTime(Math.max(assessmentState.remaining, 0));

      if (assessmentState.remaining <= 0) {
        clearTimer();
        submitAssessment(true);
      }
    }, 1000);
  }

  async function submitAssessment(force = false) {
    if (!assessmentState) return;

    if (!force) {
      const ok = confirm(`هل تريد تسليم ${assessmentTypeLabel(assessmentState.type)}؟`);
      if (!ok) return;
    }

    clearTimer();

    const answers = assessmentState.answers.map((chosenOption, idx) => ({
      questionId: assessmentState.questions[idx].id,
      chosenOption
    }));

	    const result = await apiFetch(`/api/student/assessment/${assessmentState.id}/submit`, {
	      method: "POST",
	      body: JSON.stringify({
	        answers,
	        spentSeconds: Math.max(0, assessmentState.totalSeconds - assessmentState.remaining)
	      })
	    });

	    assessmentResult.innerHTML = `
	      <div class="result-head">درجتك: ${result.score} / ${result.total}</div>
	      ${result.isFirstAttempt ? "" : `<p><strong>تنبيه:</strong> هذه ليست أول محاولة. الدرجة الرسمية تظل من أول محاولة.</p>`}
	      ${result.isFirstAttempt ? "" : `<p><strong>درجتك في هذه المحاولة:</strong> ${result.currentAttemptScore} / ${result.currentAttemptTotal}</p>`}
	      <p><strong>الوقت المستغرق:</strong> ${formatTime(result.spentSeconds)}</p>
	      <p><strong>المحاولات المتبقية:</strong> ${Number(result.attemptsRemaining || 0)} / ${Number(result.attemptsAllowed || 1)}</p>
	      <div class="wrong-list">
	        ${result.details.map((d) => `
	          <article class="wrong-item">
	            <p><strong>السؤال:</strong> ${d.question}</p>
	            <p><strong>إجابتك:</strong> ${d.chosenText}</p>
	            <p><strong>الإجابة الصحيحة:</strong> ${d.correctText}</p>
	          </article>
	        `).join("")}
	      </div>
	    `;
	    const t = String(result.assessmentType || "");
	    if (historyCache[t]) {
	      historyCache[t] = { loaded: false, rows: [] };
	      await ensureHistory(t).catch(() => {});
	    }
	    renderSubjectProgress(courses, attemptedIdsFromLoadedHistory());
	  }

	  function showAttemptResult(row) {
	    if (!row) return;
	    clearTimer();
	    assessmentState = null;

	    const questionBox = panels.assessment?.querySelector(".question-box");
	    const nav = panels.assessment?.querySelector(".assessment-nav");
	    if (questionBox) questionBox.hidden = true;
	    if (nav) nav.hidden = true;
	    if (finishAssessment) finishAssessment.hidden = true;

	    hideAllPanels();
	    panels.assessment.hidden = false;
	    assessmentTitle.textContent = row.assessmentTitle || "نتيجة التقييم";
	    assessmentMeta.textContent = assessmentTypeLabel(row.type);
	    assessmentTimer.textContent = formatTime(Number(row.spentSeconds || 0));

	    assessmentResult.innerHTML = `
	      <div class="result-head">جاب <strong>${row.score}</strong> من <strong>${row.total}</strong></div>
	      <p><strong>الطالب:</strong> ${row.studentName || "غير متوفر"}</p>
	      <p><strong>الكورس:</strong> ${row.courseTitle || "-"}</p>
	      <p><strong>المادة:</strong> ${row.courseSubject || "-"}</p>
	      <p><strong>الوقت المستغرق:</strong> ${formatTime(Number(row.spentSeconds || 0))}</p>
	      <p><strong>التاريخ:</strong> ${row.date || "-"}</p>
	      <div class="wrong-list">
	        ${(row.details || []).map((d) => `
	          <article class="wrong-item">
	            <p><strong>السؤال:</strong> ${d.question}</p>
	            <p><strong>إجابتك:</strong> ${d.chosenText}</p>
	            <p><strong>الإجابة الصحيحة:</strong> ${d.correctText}</p>
	          </article>
	        `).join("")}
	      </div>
	      <button type="button" class="small-btn ghost back-to-history">رجوع</button>
	    `;
	  }

	  async function ensureHistory(type) {
	    if (!historyCache[type]) return [];
	    if (historyCache[type].loaded) return historyCache[type].rows;
	    const rows = await apiFetch(`/api/student/history?type=${type}`);
	    historyCache[type] = { loaded: true, rows };
	    rows.forEach((r) => attemptById.set(Number(r.attemptId), r));
	    if (courses.length) renderSubjectProgress(courses, attemptedIdsFromLoadedHistory());
	    return rows;
	  }

	  async function loadHistory(type, container) {
	    const rows = await ensureHistory(type);
	    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = '<p class="empty">لا توجد نتائج بعد.</p>';
      return;
    }

		    rows.forEach((row) => {
		      const item = document.createElement("article");
		      item.className = `history-item ${row.score < row.total ? "wrong" : "ok"}`;
		      item.innerHTML = `
		        <h4>${row.assessmentTitle}</h4>
		        <p>الطالب: ${row.studentName || "غير متوفر"}</p>
		        <p>${row.courseTitle} - ${row.lessonTitle}</p>
		        <p>المادة: ${row.courseSubject || "-"}</p>
		        <p>الدرجة: ${row.score}/${row.total}</p>
		        <p>الوقت المستغرق: ${formatTime(row.spentSeconds)}</p>
		        <small>التاريخ: ${row.date}</small>
		        <button type="button" class="small-btn ghost view-attempt-btn" data-attempt-id="${row.attemptId}">عرض النتيجة</button>
		        <details class="history-detail">
		          <summary>عرض الغلطات والإجابات</summary>
		          <div class="detail-list">
		            ${row.details.map((d) => `
		              <div class="detail-item">
		                <p><strong>السؤال:</strong> ${d.question}</p>
		                <p><strong>إجابتك:</strong> ${d.chosenText}</p>
		                <p><strong>الصحيحة:</strong> ${d.correctText}</p>
		              </div>
		            `).join("")}
		          </div>
		        </details>
		      `;
		      container.appendChild(item);
		    });
		  }

  async function loadMyCourses() {
    const mine = await apiFetch("/api/student/courses?scope=mine");
    renderCoursesInto(myCoursesList, mine);
  }

  async function loadProfile() {
    const profile = await apiFetch("/api/student/profile");
    studentName.textContent = profile.full_name || "غير متوفر";
    studentPhone.textContent = profile.phone || "غير متوفر";
    guardianPhone.textContent = profile.guardian_phone || "غير متوفر";
    studentGrade.textContent = profile.grade || "غير متوفر";
    studentGovernorate.textContent = profile.governorate || "غير متوفر";
    studentBranch.textContent = profile.branch || "غير متوفر";
  }

  function closeStudentMenu() {
    sideMenu.classList.remove("open");
    menuBtn?.classList.remove("active");
    bodyEl.classList.remove("sidebar-mobile-open");
  }

  menuBtn?.addEventListener("click", (event) => {
    event.preventDefault();
  });

  sidebarCollapseBtn?.addEventListener("click", () => {
    const willCollapse = !bodyEl.classList.contains("sidebar-collapsed");
    setDesktopSidebarCollapsed(willCollapse);
  });

  document.addEventListener("click", (event) => {
    if (!isMobileSidebar()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (sideMenu.contains(target)) return;
    if (menuBtn?.contains(target)) return;
    closeStudentMenu();
  });

	  menuLinks.forEach((link) => {
	    link.addEventListener("click", (e) => {
	      const action = link.dataset.action;

	      if (action === "logout") {
        clearAuth();
        return;
      }

	      e.preventDefault();
	      openPanel(action);
        if (isMobileSidebar()) closeStudentMenu();
	    });
	  });

	  orbitControlBtns.forEach((btn) => {
	    btn.addEventListener("click", () => {
	      if (orbitIsFocusing) return;
	      const action = String(btn.dataset.orbitAction || "");
	      rotateCoursesOrbit(action === "prev" ? -1 : 1);
	    });
	  });

	  function getPointerX(e) {
	    if (e.touches?.length) return e.touches[0].clientX;
	    if (e.changedTouches?.length) return e.changedTouches[0].clientX;
	    return Number(e.clientX || 0);
	  }

	  function getPointerY(e) {
	    if (e.touches?.length) return e.touches[0].clientY;
	    if (e.changedTouches?.length) return e.changedTouches[0].clientY;
	    return Number(e.clientY || 0);
	  }

	  function onOrbitMove(e) {
	    if (!orbitDragging) return;
	    const x = getPointerX(e);
	    const y = getPointerY(e);
	    const dx = x - orbitStartX;
	    const dy = y - orbitStartY;
	    if (!orbitDragged && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) orbitDragged = true;
	    pauseOrbit(80);
	    orbitRotation += dx * 0.22;
	    orbitStartX = x;
	    orbitStartY = y;
	    applyCoursesOrbit();
	    if (orbitDragged) e.preventDefault();
	  }

	  function onOrbitEnd() {
	    if (!orbitDragging) return;
	    orbitDragging = false;
	    syncOrbitToFrontCard();
	    applyCoursesOrbit();
	    orbitPausedUntil = Date.now();
	    setTimeout(() => {
	      orbitDragged = false;
	    }, 0);
	    coursesOrbitStage?.classList.remove("is-dragging");
	    document.removeEventListener("mousemove", onOrbitMove);
	    document.removeEventListener("mouseup", onOrbitEnd);
	    document.removeEventListener("touchmove", onOrbitMove);
	    document.removeEventListener("touchend", onOrbitEnd);
	    document.removeEventListener("touchcancel", onOrbitEnd);
	  }

	  function onOrbitStart(e) {
    if (isCompactCoursesView()) return;
    if (!coursesOrbitStage || !orbitCardEls.length) return;
	    if (orbitIsFocusing) return;
	    const target = e.target;
	    if (!(target instanceof Element)) return;
	    if (target.closest("button, a, input, textarea, select, .card-actions")) return;
	    pauseOrbit(100);
	    orbitDragging = true;
	    orbitDragged = false;
	    orbitStartX = getPointerX(e);
	    orbitStartY = getPointerY(e);
	    coursesOrbitStage.classList.add("is-dragging");
	    document.addEventListener("mousemove", onOrbitMove, { passive: false });
	    document.addEventListener("mouseup", onOrbitEnd);
	    document.addEventListener("touchmove", onOrbitMove, { passive: false });
	    document.addEventListener("touchend", onOrbitEnd);
	    document.addEventListener("touchcancel", onOrbitEnd);
	  }

		  coursesOrbitStage?.addEventListener("mousedown", onOrbitStart);
		  coursesOrbitStage?.addEventListener("touchstart", onOrbitStart, { passive: true });
  window.addEventListener("resize", () => {
    applySidebarMode();
    if (isCompactCoursesView()) {
      stopAutoOrbit();
      resetCoursesOrbitToList();
    } else {
      applyCoursesOrbit();
      if (activeAction === "courses" && panels.courses && !panels.courses.hidden) startAutoOrbit();
    }
  });
	  if (typeof mobileSidebarQuery.addEventListener === "function") {
	    mobileSidebarQuery.addEventListener("change", applySidebarMode);
	  }
	  if (typeof compactCourseViewQuery.addEventListener === "function") {
	    compactCourseViewQuery.addEventListener("change", () => {
	      if (isCompactCoursesView()) {
	        stopAutoOrbit();
	        resetCoursesOrbitToList();
	      } else if (activeAction === "courses" && panels.courses && !panels.courses.hidden) {
	        setupCoursesOrbit();
	        startAutoOrbit();
	      }
	    });
	  }

	  studentForumForm?.addEventListener("submit", async (e) => {
	    e.preventDefault();
	    try {
	      const body = String(studentForumBody?.value || "").trim();
	      const imageFile = studentForumImageFile?.files?.[0] || null;
	      let imageUrl = "";
	      if (imageFile) imageUrl = await uploadStudentForumImage(imageFile);
	      await apiFetch("/api/student/forum/questions", {
	        method: "POST",
	        body: JSON.stringify({ body, imageUrl })
	      });
	      if (studentForumBody) studentForumBody.value = "";
	      if (studentForumImageFile) studentForumImageFile.value = "";
	      await loadStudentForumQuestions();
	      alert("تم إرسال السؤال بنجاح.");
	    } catch (err) {
	      alert(err.message || "تعذر إرسال السؤال.");
	    }
	  });

	  studentForumList?.addEventListener("click", async (e) => {
	    const btn = e.target.closest("[data-student-forum-open]");
	    if (!btn) return;
	    const id = Number(btn.getAttribute("data-student-forum-open"));
	    if (!id) return;
	    try {
	      const data = await apiFetch(`/api/student/forum/questions/${id}`);
	      renderStudentForumAnswers(id, data?.answers || []);
	    } catch (err) {
	      alert(err.message || "تعذر تحميل الردود.");
	    }
	  });

	  notificationsList?.addEventListener("click", async (e) => {
	    const btn = e.target.closest(".notif-read-btn");
	    if (!btn) return;
	    const id = Number(btn.dataset.notifId);
	    if (!id) return;
	    try {
	      await apiFetch(`/api/student/notifications/${id}/read`, { method: "POST" });
	      await loadNotifications(false);
	    } catch (err) {
	      alert(err.message || "تعذر تمييز الإشعار كمقروء.");
	    }
	  });

	  markAllNotificationsRead?.addEventListener("click", async () => {
	    try {
	      await apiFetch("/api/student/notifications/read-all", { method: "POST" });
	      await loadNotifications(false);
	    } catch (err) {
	      alert(err.message || "تعذر تمييز الكل كمقروء.");
	    }
	  });

	  // تحديث شارة الإشعارات بدون ما يفتح اللوحة
	  loadNotifications(true).catch(() => {});
	  setInterval(() => loadNotifications(true).catch(() => {}), 45000);

		  coursesGrid?.addEventListener("click", async (e) => {
		    if (orbitIsFocusing) return;
		    const subscribeBtn = e.target.closest(".course-subscribe-btn");
	    if (subscribeBtn) {
	      const courseId = Number(subscribeBtn.dataset.courseId);
	      try {
	        const result = await apiFetch("/api/student/subscribe/course", {
	          method: "POST",
	          body: JSON.stringify({ courseId })
	        });
	        if (result && result.status === "pending" && result.reference) {
	          const remain = result.expires_at ? formatRemainingUntil(result.expires_at) : "-";
	          alert(
	            `${result.message || "تم إنشاء/استرجاع رقم مرجعي."}\n` +
	            `رقم المرجع: ${result.reference}\n` +
	            `المتبقي لانتهاء الصلاحية: ${remain}\n` +
	            `ينتهي في: ${result.expires_at || "-"}`
	          );
	        } else {
	          alert(result.message || "تم إرسال طلب الاشتراك.");
	        }
	        await loadCourses();
	        await loadMyCourses();
	      } catch (err) {
	        alert(err.message || "تعذر الاشتراك.");
	      }
	      return;
	    }

	    const enterBtn = e.target.closest(".course-enter-btn");
	    if (enterBtn) {
	      focusCourseThenOpen(enterBtn.dataset.courseId);
	      return;
	    }

	    const card = e.target.closest(".course-card");
	    if (!card) return;
	    if (orbitDragging || orbitDragged) return;
	    focusCourseThenOpen(card.dataset.courseId);
  });

	  myCoursesList?.addEventListener("click", async (e) => {
	    const subscribeBtn = e.target.closest(".course-subscribe-btn");
	    if (subscribeBtn) {
	      const courseId = Number(subscribeBtn.dataset.courseId);
	      try {
	        const result = await apiFetch("/api/student/subscribe/course", {
	          method: "POST",
	          body: JSON.stringify({ courseId })
	        });
	        if (result && result.status === "pending" && result.reference) {
	          const remain = result.expires_at ? formatRemainingUntil(result.expires_at) : "-";
	          alert(
	            `${result.message || "تم إنشاء/استرجاع رقم مرجعي."}\n` +
	            `رقم المرجع: ${result.reference}\n` +
	            `المتبقي لانتهاء الصلاحية: ${remain}\n` +
	            `ينتهي في: ${result.expires_at || "-"}`
	          );
	        } else {
	          alert(result.message || "تم إرسال طلب الاشتراك.");
	        }
	        await loadCourses();
	        await loadMyCourses();
	      } catch (err) {
	        alert(err.message || "تعذر الاشتراك.");
	      }
	      return;
	    }

    const enterBtn = e.target.closest(".course-enter-btn");
    if (enterBtn) {
      renderLessons(enterBtn.dataset.courseId);
      return;
    }

    const card = e.target.closest(".course-card");
    if (!card) return;
    renderLessons(card.dataset.courseId);
  });

	  individualLessonsList?.addEventListener("click", async (e) => {
	    const subscribeBtn = e.target.closest(".individual-subscribe-btn");
	    if (subscribeBtn) {
	      const lessonId = Number(subscribeBtn.dataset.lessonId);
      try {
        const result = await apiFetch("/api/student/subscribe/lesson", {
          method: "POST",
          body: JSON.stringify({ lessonId })
        });
        if (result && result.status === "pending" && result.reference) {
          const remain = result.expires_at ? formatRemainingUntil(result.expires_at) : "-";
          alert(
            `${result.message || "تم إنشاء/استرجاع رقم مرجعي."}\n` +
            `رقم المرجع: ${result.reference}\n` +
            `المتبقي لانتهاء الصلاحية: ${remain}\n` +
            `ينتهي في: ${result.expires_at || "-"}`
          );
        } else {
          alert(result.message || "تم إرسال طلب الاشتراك.");
        }
        await loadCourses();
        await loadIndividualLessons();
      } catch (err) {
        alert(err.message || "تعذر الاشتراك.");
      }
      return;
    }

	    const enterBtn = e.target.closest(".individual-enter-btn");
	    if (!enterBtn) return;
		    const courseId = Number(enterBtn.dataset.courseId);
		    const lessonId = Number(enterBtn.dataset.lessonId);
		    const course = courses.find((c) => Number(c.id) === courseId);
		    const lesson = course?.lessons?.find((l) => Number(l.id) === lessonId);
		    if (lesson?.isUnlocked) {
		      apiFetch(`/api/student/lessons/${lessonId}/view`, { method: "POST" }).catch(() => {});
		      lesson.opened = true;
		      renderSubjectProgress(courses, attemptedIdsFromLoadedHistory());
		    }

		    renderLessons(courseId);
		    setTimeout(() => {
		      const el = courseLessons?.querySelector(`[data-lesson-id="${lessonId}"]`);
		      el?.scrollIntoView({ behavior: "smooth", block: "start" });
		    }, 0);
		  });

			  courseLessons?.addEventListener("click", async (e) => {
				    const enterLessonBtn = e.target.closest(".lesson-enter-btn");
				    if (enterLessonBtn) {
				      const lessonId = Number(enterLessonBtn.dataset.lessonId);
				      const course = courses.find((c) => Number(c.id) === Number(activeCourseId));
				      const lesson = course?.lessons?.find((l) => Number(l.id) === Number(lessonId));
				      if (lesson?.isUnlocked) {
				        apiFetch(`/api/student/lessons/${lessonId}/view`, { method: "POST" }).catch(() => {});
				        lesson.opened = true;
				        renderSubjectProgress(courses, attemptedIdsFromLoadedHistory());
				      }
				      const lessonBlock = courseLessons.querySelector(`[data-lesson-id="${lessonId}"]`);
				      if (lessonBlock) lessonBlock.scrollIntoView({ behavior: "smooth", block: "start" });
				      return;
				    }

			    const fileBtn = e.target.closest(".file-btn");
			    if (!fileBtn) return;
			    if (fileBtn.disabled || fileBtn.dataset.locked === "1") {
			      alert("لا يمكنك فتح هذا المحتوى إلا بعد الاشتراك.");
			      return;
			    }
			    const typeText = assessmentTypeLabel(fileBtn.dataset.type);
			    const ok = confirm(`هل تريد فتح ${typeText}؟`);
			    if (!ok) return;
	    const assessmentId = Number(fileBtn.dataset.assessmentId);
	    try {
	      await openAssessment(assessmentId);
	    } catch (err) {
	      alert(err?.message || "تعذر فتح التقييم.");
	    }
	  });

	  [quizzesHistory, homeworkHistory, examsHistory].forEach((container) => {
	    container?.addEventListener("click", (e) => {
	      const btn = e.target.closest(".view-attempt-btn");
	      if (!btn) return;
	      const attemptId = Number(btn.dataset.attemptId);
	      const row = attemptById.get(attemptId);
	      if (!row) return;
	      showAttemptResult(row);
	    });
	  });

	  panels.assessment?.addEventListener("click", (e) => {
	    const backBtn = e.target.closest(".back-to-history");
	    if (!backBtn) return;
	    openPanel(activeAction);
	  });

  assessmentOptions?.addEventListener("change", (e) => {
    if (!assessmentState) return;
    if (e.target.name !== "assessment-option") return;
    assessmentState.answers[assessmentState.index] = Number(e.target.value);
  });

  prevQuestion?.addEventListener("click", () => {
    if (!assessmentState || assessmentState.index === 0) return;
    assessmentState.index -= 1;
    renderQuestion();
  });

  nextQuestion?.addEventListener("click", () => {
    if (!assessmentState || assessmentState.index >= assessmentState.questions.length - 1) return;
    assessmentState.index += 1;
    renderQuestion();
  });

  finishAssessment?.addEventListener("click", async () => {
    try {
      await submitAssessment(false);
    } catch (err) {
      alert(err.message);
    }
  });

  backToCourses?.addEventListener("click", () => openPanel("courses"));

  panels.account?.addEventListener("click", (event) => {
    const item = event.target.closest(".account-item");
    if (!item) return;

    panels.account.querySelectorAll(".account-item").forEach((el) => {
      el.classList.remove("selected");
    });
    item.classList.add("selected");
  });

  loadCourses()
    .then(() => openPanel("courses"))
    .catch((err) => {
      alert(`تعذر تحميل بيانات الطالب: ${err.message}`);
      if (isAuthErrorMessage(err?.message)) {
        clearAuth();
        window.location.href = "sign.html";
      }
    });

  applySidebarMode();
}

initRegisterPage();
initLoginPage();
initGuardianPage();
initStudentPage();
initOwnerPage();
