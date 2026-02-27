(() => {
  const formOrder = ["phone-password", "phone-code", "parent-progress", "register", "forgot"];

  const panelContent = {
    "phone-password": {
      chip: "دخول اعتيادي",
      title: "الدخول بكلمة السر",
      text: "اكتب رقم الهاتف وكلمة السر للوصول السريع إلى حسابك الشخصي."
    },
    "phone-code": {
      chip: "دخول سريع",
      title: "الدخول عبر الكود",
      text: "إذا وصلك كود دخول، استخدمه مع رقم الهاتف لإتمام تسجيل الدخول."
    },
    "parent-progress": {
      chip: "متابعة ولي الأمر",
      title: "متابعة تقدم نجلك",
      text: "من حساب ولي الأمر تقدر تتابع الأداء الدراسي والحضور والتقارير بسهولة."
    },
    register: {
      chip: "إنشاء حساب",
      title: "حساب جديد",
      text: "أنشئ حسابك الآن للوصول إلى جميع خدمات المنصة."
    },
    forgot: {
      chip: "استعادة",
      title: "نسيت كلمة السر؟",
      text: "أدخل رقم الهاتف وسنرسل لك خطوات استعادة كلمة السر."
    }
  };

  const state = {
    activeForm: "phone-password",
    activeMode: "phone-password"
  };

  const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
  const forms = Array.from(document.querySelectorAll(".auth-form"));
  const stage = document.querySelector(".form-stage");
  const quickLinks = Array.from(document.querySelectorAll("[data-open-form]"));
  const bottomLinks = document.getElementById("bottomLinks");
  const parentForgotWrap = document.getElementById("parentForgotWrap");
  const parentActionNote = document.getElementById("parentActionNote");
  const parentResetSubmit = document.getElementById("parentResetSubmit");
  const codeSuccessModal = document.getElementById("codeSuccessModal");
  const codeSuccessContinue = document.getElementById("codeSuccessContinue");
  const changePasswordModal = document.getElementById("changePasswordModal");
  const changePasswordForm = document.getElementById("changePasswordForm");
  const changePasswordCancel = document.getElementById("changePasswordCancel");
  const newPasswordInput = document.getElementById("new-password");
  const confirmNewPasswordInput = document.getElementById("confirm-new-password");

  const panelChip = document.getElementById("panelChip");
  const panelTitle = document.getElementById("panelTitle");
  const panelText = document.getElementById("panelText");

  function setPanel(formKey) {
    const content = panelContent[formKey] || panelContent["phone-password"];
    panelChip.textContent = content.chip;
    panelTitle.textContent = content.title;
    panelText.textContent = content.text;
  }

  function syncBottomLinks() {
    const showLinks = state.activeForm === "phone-password";
    bottomLinks.classList.toggle("is-hidden", !showLinks);
  }

  function setParentNote(message = "") {
    if (!parentActionNote) return;
    parentActionNote.textContent = message;
    parentActionNote.hidden = !message;
  }

  function setParentForgotOpen(open) {
    if (!parentForgotWrap) return;
    parentForgotWrap.hidden = !open;
  }

  function updateModeButtons() {
    modeButtons.forEach((btn) => {
      const isActive = btn.dataset.mode === state.activeMode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
  }

  function switchForm(nextForm, modeToActivate = null) {
    if (!formOrder.includes(nextForm) || nextForm === state.activeForm) {
      return;
    }

    const currentIndex = formOrder.indexOf(state.activeForm);
    const nextIndex = formOrder.indexOf(nextForm);
    stage.dataset.motion = nextIndex >= currentIndex ? "forward" : "backward";

    forms.forEach((form) => {
      const shouldActivate = form.dataset.form === nextForm;
      form.classList.toggle("is-active", shouldActivate);
      form.setAttribute("aria-hidden", String(!shouldActivate));
    });

    state.activeForm = nextForm;
    if (nextForm !== "parent-progress") {
      setParentForgotOpen(false);
      setParentNote("");
    }

    if (modeToActivate) {
      state.activeMode = modeToActivate;
    } else if (["phone-password", "phone-code", "parent-progress"].includes(nextForm)) {
      state.activeMode = nextForm;
    }

    updateModeButtons();
    syncBottomLinks();
    setPanel(nextForm);
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      switchForm(mode, mode);
    });
  });

  quickLinks.forEach((link) => {
    link.addEventListener("click", () => {
      switchForm(link.dataset.openForm);
    });
  });

  document.querySelectorAll("[data-parent-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.parentAction;
      if (action === "forgot") {
        setParentForgotOpen(true);
        setParentNote("");
        return;
      }
      if (action === "first-time") {
        setParentForgotOpen(false);
        setParentNote("لو رقمك مسجل كولي أمر، سيتم إرسال طلب كلمة السر للمالك.");
      }
    });
  });

  if (parentResetSubmit) {
    parentResetSubmit.addEventListener("click", () => {
      const payload = {
        guardian_name: document.getElementById("parent-reset-name")?.value || "",
        guardian_phone: document.getElementById("parent-reset-phone")?.value || "",
        has_whatsapp: document.getElementById("parent-has-whatsapp")?.checked || false
      };
      console.log("Parent reset request:", payload);
      setParentNote("تم تجهيز طلب استعادة كلمة السر. اربطه لاحقًا بالـ backend.");
    });
  }

  forms.forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      const formType = form.dataset.form;

      if (formType === "phone-code") {
        const phone = String(payload.phone || "").trim();
        const code = String(payload.code || "").trim();
        if (!phone || !code) return;

        // Simulate successful code verification (replace with backend check later).
        if (codeSuccessModal) codeSuccessModal.hidden = false;
        return;
      }

      console.log("Form submitted:", formType, payload);
      // Backend integration hook (fetch/axios) goes here.
    });
  });

  codeSuccessContinue?.addEventListener("click", () => {
    if (codeSuccessModal) codeSuccessModal.hidden = true;
    if (changePasswordModal) changePasswordModal.hidden = false;
    setTimeout(() => newPasswordInput?.focus(), 0);
  });

  changePasswordCancel?.addEventListener("click", () => {
    if (changePasswordModal) changePasswordModal.hidden = true;
    changePasswordForm?.reset();
  });

  codeSuccessModal?.addEventListener("click", (event) => {
    if (event.target === codeSuccessModal) {
      codeSuccessModal.hidden = true;
    }
  });

  changePasswordModal?.addEventListener("click", (event) => {
    if (event.target === changePasswordModal) {
      changePasswordModal.hidden = true;
    }
  });

  changePasswordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const newPassword = String(newPasswordInput?.value || "");
    const confirmPassword = String(confirmNewPasswordInput?.value || "");

    if (newPassword.length < 6) {
      alert("كلمة السر الجديدة لازم تكون 6 أحرف على الأقل.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("تأكيد كلمة السر غير مطابق.");
      return;
    }

    console.log("Password changed with code flow.");
    alert("تم حفظ كلمة السر الجديدة بنجاح.");
    if (changePasswordModal) changePasswordModal.hidden = true;
    changePasswordForm.reset();
  });

  updateModeButtons();
  syncBottomLinks();
  setPanel(state.activeForm);
})();
