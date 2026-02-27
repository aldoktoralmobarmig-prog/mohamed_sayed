(() => {
  const form = document.querySelector(".register-multi-step");
  if (!form) return;

  const steps = Array.from(form.querySelectorAll(".register-step"));
  if (!steps.length) return;

  const totalSteps = steps.length;
  let currentStep = 1;
  let reviewConfirmed = false;

  const prevBtn = document.getElementById("prevStepBtn");
  const nextBtn = document.getElementById("nextStepBtn");
  const reviewBtn = document.getElementById("reviewDataBtn");
  const submitBtn = document.getElementById("submitRegisterBtn");
  const reviewPanel = document.getElementById("reviewPanel");
  const reviewList = document.getElementById("reviewList");
  const reviewDoneBtn = document.getElementById("reviewDoneBtn");
  const stepLabel = document.getElementById("stepLabel");
  const progressFill = document.getElementById("stepProgressFill");

  const passwordInput = document.getElementById("paasword");
  const confirmPasswordInput = document.getElementById("confirmRegisterPassword");
  const passwordMismatchHint = document.getElementById("passwordMismatchHint");

  const noticeModal = document.getElementById("noticeModal");
  const noticeMessage = document.getElementById("noticeMessage");
  const noticeOkBtn = document.getElementById("noticeOkBtn");

  const nameInputs = [
    document.getElementById("firstname"),
    document.getElementById("secondname"),
    document.getElementById("thirdname"),
    document.getElementById("lastname")
  ].filter(Boolean);

  const reviewFields = [
    { id: "firstname", label: "الاسم الأول" },
    { id: "secondname", label: "الاسم الثاني" },
    { id: "thirdname", label: "الاسم الثالث" },
    { id: "lastname", label: "الاسم الأخير" },
    { id: "telm", label: "رقم الهاتف" },
    { id: "telf", label: "رقم ولي الأمر" },
    { id: "selectsaf", label: "الصف الدراسي" },
    { id: "selectedmoh", label: "المحافظة" },
    { id: "shopa", label: "الشعبة" },
    { id: "subject", label: "المادة" },
    { id: "email", label: "البريد الإلكتروني" },
    { id: "paasword", label: "كلمة السر" },
    { id: "confirmRegisterPassword", label: "تأكيد كلمة السر" }
  ];

  function showNotice(message) {
    if (!noticeModal || !noticeMessage) return;
    noticeMessage.textContent = String(message || "تحقق من البيانات.");
    noticeModal.hidden = false;
    setTimeout(() => noticeOkBtn?.focus(), 0);
  }

  function hideNotice() {
    if (noticeModal) noticeModal.hidden = true;
  }

  noticeOkBtn?.addEventListener("click", hideNotice);
  noticeModal?.addEventListener("click", (event) => {
    if (event.target === noticeModal) hideNotice();
  });

  function initPasswordToggles() {
    const toggles = form.querySelectorAll(".pass-toggle");
    toggles.forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        btn.innerHTML = isPassword
          ? '<i class="fa-regular fa-eye-slash"></i>'
          : '<i class="fa-regular fa-eye"></i>';
      });
    });
  }

  function initVisitedFieldColors() {
    const controls = form.querySelectorAll("input, select, textarea");
    controls.forEach((control) => {
      control.addEventListener("focus", () => {
        const field = control.closest(".field");
        field?.classList.remove("is-gray");
        control.classList.remove("is-gray");
      });
      control.addEventListener("blur", () => {
        const hasValue = String(control.value || "").trim().length > 0;
        const field = control.closest(".field");
        if (field) {
          field.classList.toggle("is-gray", hasValue);
        } else {
          control.classList.toggle("is-gray", hasValue);
        }
      });
    });
  }

  function stepControls(step) {
    const section = steps[step - 1];
    if (!section) return [];
    return Array.from(section.querySelectorAll("input, select, textarea"));
  }

  function isArabicName(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    return /^[\u0600-\u06FF\s]+$/.test(text);
  }

  function fieldLabel(control) {
    const section = control.closest(".field");
    const label = section?.querySelector("label");
    if (label) return String(label.textContent || "").trim();
    if (control.id === "selectsaf") return "الصف الدراسي";
    if (control.id === "selectedmoh") return "المحافظة";
    if (control.id === "shopa") return "الشعبة";
    if (control.id === "subject") return "المادة";
    return "هذا الحقل";
  }

  function validationMessageFor(control) {
    const label = fieldLabel(control);
    if (nameInputs.includes(control) && !isArabicName(control.value)) {
      return "الاسم لازم يكون باللغة العربية فقط.";
    }
    if (control.validity.valueMissing) return `من فضلك املأ حقل ${label}.`;
    if (control.validity.typeMismatch && control.type === "email") return "اكتب بريد إلكتروني صحيح.";
    if (control.validity.tooShort) return `${label} قصير جدًا.`;
    if (control.validity.tooLong) return `${label} أطول من المطلوب.`;
    if (control.validity.patternMismatch) return `صيغة ${label} غير صحيحة.`;
    return `تحقق من حقل ${label}.`;
  }

  function validateStep(step) {
    const controls = stepControls(step);
    for (const control of controls) {
      if (nameInputs.includes(control) && !isArabicName(String(control.value || ""))) {
        control.setCustomValidity("الاسم لازم يكون باللغة العربية فقط.");
      } else {
        control.setCustomValidity("");
      }
      if (!control.checkValidity()) {
        control.reportValidity();
        control.focus();
        return false;
      }
    }
    return true;
  }

  function syncPasswordMismatchUI() {
    if (!passwordInput || !confirmPasswordInput) return true;

    const pass = String(passwordInput.value || "");
    const confirm = String(confirmPasswordInput.value || "");
    const mismatch = pass.length > 0 && confirm.length > 0 && pass !== confirm;
    const reviewPass = document.getElementById("review-paasword");
    const reviewConfirm = document.getElementById("review-confirmRegisterPassword");

    confirmPasswordInput.setCustomValidity(mismatch ? "كلمة السر غير متطابقة." : "");
    passwordInput.classList.toggle("soft-error", mismatch);
    confirmPasswordInput.classList.toggle("soft-error", mismatch);
    passwordInput.closest(".field")?.classList.toggle("has-error", mismatch);
    confirmPasswordInput.closest(".field")?.classList.toggle("has-error", mismatch);
    reviewPass?.classList.toggle("soft-error", mismatch);
    reviewConfirm?.classList.toggle("soft-error", mismatch);
    reviewPass?.closest(".review-row")?.classList.toggle("has-error", mismatch);
    reviewConfirm?.closest(".review-row")?.classList.toggle("has-error", mismatch);
    if (passwordMismatchHint) passwordMismatchHint.hidden = !mismatch;

    return !mismatch;
  }

  function updateProgress(step) {
    if (stepLabel) stepLabel.textContent = `الخطوة ${step} من ${totalSteps}`;
    if (progressFill) {
      const percent = totalSteps > 1 ? ((step - 1) / (totalSteps - 1)) * 100 : 100;
      progressFill.style.width = `${percent}%`;
    }
  }

  function renderStep(step) {
    steps.forEach((section, index) => {
      const active = index + 1 === step;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });

    const isFirst = step === 1;
    const isLast = step === totalSteps;

    if (prevBtn) {
      prevBtn.hidden = isFirst;
      prevBtn.disabled = isFirst;
    }
    if (nextBtn) nextBtn.hidden = isLast;
    if (reviewBtn) reviewBtn.hidden = !isLast;
    if (submitBtn) submitBtn.hidden = !isLast;
    if (reviewPanel) reviewPanel.hidden = true;

    updateProgress(step);
  }

  function createReviewControl(source, id) {
    const isPasswordField = id === "paasword" || id === "confirmRegisterPassword";
    const isNumberField = id === "telm" || id === "telf";
    const isSelect = source.tagName === "SELECT";
    const control = isSelect ? document.createElement("select") : document.createElement("input");

    control.className = "review-input";
    control.id = `review-${id}`;
    control.required = !!source.required;

    if (isSelect) {
      Array.from(source.options).forEach((opt) => {
        const copy = document.createElement("option");
        copy.value = opt.value;
        copy.textContent = opt.textContent;
        copy.disabled = opt.disabled;
        control.appendChild(copy);
      });
      control.value = source.value;
    } else {
      control.type = source.type || "text";
      control.value = source.value;
      if (source.minLength > 0) control.minLength = source.minLength;
      if (source.maxLength > 0) control.maxLength = source.maxLength;
      if (source.pattern) control.pattern = source.pattern;
      if (source.inputMode) control.inputMode = source.inputMode;
      if (source.placeholder) control.placeholder = source.placeholder;
      if (isNumberField) {
        control.dir = "rtl";
        control.style.textAlign = "right";
      }
    }

    const sync = () => {
      source.value = control.value;
      source.dispatchEvent(new Event("input", { bubbles: true }));
      source.dispatchEvent(new Event("change", { bubbles: true }));
      syncPasswordMismatchUI();
    };
    control.addEventListener("input", sync);
    control.addEventListener("change", sync);

    if (!isPasswordField) return control;

    const wrap = document.createElement("div");
    wrap.className = "review-pass-wrap";
    wrap.appendChild(control);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "review-pass-toggle";
    toggle.setAttribute("aria-label", "إظهار أو إخفاء كلمة السر");
    toggle.innerHTML = '<i class="fa-regular fa-eye"></i>';
    toggle.addEventListener("click", () => {
      const show = control.type === "password";
      control.type = show ? "text" : "password";
      toggle.innerHTML = show
        ? '<i class="fa-regular fa-eye-slash"></i>'
        : '<i class="fa-regular fa-eye"></i>';
    });
    wrap.appendChild(toggle);
    return wrap;
  }

  function buildReview() {
    if (!reviewList) return;
    reviewList.innerHTML = "";

    reviewFields.forEach(({ id, label }) => {
      const source = document.getElementById(id);
      if (!source) return;

      const row = document.createElement("article");
      row.className = "review-row";

      const labelNode = document.createElement("label");
      labelNode.className = "review-label";
      labelNode.textContent = label;
      labelNode.setAttribute("for", `review-${id}`);

      const control = createReviewControl(source, id);
      row.appendChild(labelNode);
      row.appendChild(control);
      reviewList.appendChild(row);
    });
  }

  nextBtn?.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    currentStep = Math.min(totalSteps, currentStep + 1);
    renderStep(currentStep);
  });

  prevBtn?.addEventListener("click", () => {
    currentStep = Math.max(1, currentStep - 1);
    renderStep(currentStep);
  });

  reviewBtn?.addEventListener("click", () => {
    if (!validateStep(totalSteps)) return;
    if (!syncPasswordMismatchUI()) {
      showNotice("كلمة السر غير متطابقة.");
      confirmPasswordInput?.focus();
      return;
    }
    reviewConfirmed = false;
    buildReview();
    if (reviewPanel) reviewPanel.hidden = false;
  });

  reviewDoneBtn?.addEventListener("click", () => {
    if (!validateStep(totalSteps)) return;
    if (!syncPasswordMismatchUI()) {
      showNotice("كلمة السر غير متطابقة.");
      confirmPasswordInput?.focus();
      return;
    }
    if (reviewPanel) reviewPanel.hidden = true;
    reviewConfirmed = true;
  });

  form.addEventListener("submit", (event) => {
    if (!syncPasswordMismatchUI()) {
      event.preventDefault();
      showNotice("كلمة السر غير متطابقة.");
      confirmPasswordInput?.focus();
      return;
    }

    if (!reviewConfirmed) {
      event.preventDefault();
      showNotice("يجب مراجعة بياناتك قبل إنشاء الحساب.");
      if (currentStep !== totalSteps) {
        currentStep = totalSteps;
        renderStep(currentStep);
      }
      buildReview();
      if (reviewPanel) {
        reviewPanel.hidden = false;
        reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (!validateStep(totalSteps)) {
      event.preventDefault();
    }
  });

  form.addEventListener("input", () => {
    reviewConfirmed = false;
    syncPasswordMismatchUI();
  });

  passwordInput?.addEventListener("input", syncPasswordMismatchUI);
  confirmPasswordInput?.addEventListener("input", syncPasswordMismatchUI);

  initPasswordToggles();
  initVisitedFieldColors();
  renderStep(currentStep);
  syncPasswordMismatchUI();
})();

