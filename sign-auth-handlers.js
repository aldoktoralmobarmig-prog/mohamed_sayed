(() => {
  const S = window.SignShared;
  const T = window.SignTabs;
  if (!S || !T) return;

  function initSignAuthPage() {
    const passwordForm = document.querySelector("#passwordTab .login-form");
    const codeForm = S.byId("codeLoginForm");
    const guardianLoginForm = S.byId("guardianLoginForm");
    if (!passwordForm && !codeForm && !guardianLoginForm) return;

    const noticeModal = S.byId("noticeModal");
    const noticeMessage = S.byId("noticeMessage");
    const noticeOkBtn = S.byId("noticeOkBtn");

    const changePasswordModal = S.byId("changePasswordModal");
    const changePasswordModalClose = S.byId("changePasswordModalClose");
    const changeForm = S.byId("changePasswordForm");
    const newPasswordInput = S.byId("newPassword");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const passwordTab = S.byId("passwordTab");
    const codeTab = S.byId("codeTab");
    const guardianTab = S.byId("guardianTab");
    const guardianRequestAccessBtn = S.byId("guardianRequestAccessBtn");
    const guardianAccessModal = S.byId("guardianAccessModal");
    const guardianAccessModalClose = S.byId("guardianAccessModalClose");
    const guardianAccessSubmit = S.byId("guardianAccessSubmit");
    const guardianAccessPhoneInput = S.byId("guardianAccessPhone");
    const guardianAccessHasWhatsappInput = S.byId("guardianAccessHasWhatsapp");
    const guardianForgotToggleBtn = S.byId("guardianForgotToggleBtn");
    const guardianForgotModal = S.byId("guardianForgotModal");
    const guardianForgotModalClose = S.byId("guardianForgotModalClose");
    const guardianResetSubmit = S.byId("guardianResetSubmit");
    const forgotWrap = document.querySelector(".forgot-wrap");
    const forgotOpen = S.byId("forgotPasswordOpen");
    const forgotTextOpen = S.byId("forgotTextOpen");
    const forgotModal = S.byId("forgotModal");
    const forgotModalSubmit = S.byId("forgotModalSubmit");
    const forgotModalClose = S.byId("forgotModalClose");
    const recoveryPhoneInput = S.byId("forgotModalPhone");
    const recoveryEmailInput = S.byId("forgotModalEmail");
    const forgotHasWhatsappInput = S.byId("forgotHasWhatsapp");
    const panelChip = S.byId("panelChip");
    const panelTitle = S.byId("panelTitle");
    const panelText = S.byId("panelText");

    function showNotice(message) {
      if (!noticeModal || !noticeMessage) return;
      noticeMessage.textContent = String(message || "حدث خطأ.");
      noticeModal.hidden = false;
      setTimeout(() => noticeOkBtn?.focus(), 0);
    }

    function hideNotice() {
      if (noticeModal) noticeModal.hidden = true;
    }

    function markLoginSuccess(role) {
      const normalizedRole = String(role || "");
      if (normalizedRole !== "student" && normalizedRole !== "owner" && normalizedRole !== "supervisor") return;
      try {
        if (normalizedRole === "student") {
          sessionStorage.setItem("studentLoginSuccess", "1");
        } else {
          sessionStorage.setItem("ownerLoginSuccess", "1");
        }
      } catch (_e) {
        // ignore
      }
    }

    noticeOkBtn?.addEventListener("click", hideNotice);
    noticeModal?.addEventListener("click", (event) => {
      if (event.target === noticeModal) hideNotice();
    });

    S.initPasswordToggles();

    const { activateTab, bindTap } = T.initTabs({
      tabButtons,
      passwordTab,
      codeTab,
      guardianTab,
      forgotWrap,
      guardianForgotModal,
      guardianAccessModal,
      panelChip,
      panelTitle,
      panelText
    });

    passwordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = {
          phone: S.byId("phone")?.value.trim() || "",
          password: S.byId("password")?.value || ""
        };
        const result = await S.apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        S.setAuth(result.token, result.role, false, result.permissions || null);
        if (result.role === "owner" || result.role === "supervisor") {
          markLoginSuccess(result.role);
          window.location.href = "owner.html";
        } else if (result.role === "guardian") {
          window.location.href = "guardian.html";
        } else {
          markLoginSuccess(result.role);
          window.location.href = "aftermain.html";
        }
      } catch (err) {
        showNotice(`فشل تسجيل الدخول: ${err.message}`);
      }
    });

    guardianLoginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = {
          phone: S.byId("guardianPhoneLogin")?.value.trim() || "",
          password: S.byId("guardianPasswordLogin")?.value || ""
        };
        const result = await S.apiFetch("/api/guardian/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        S.setAuth(result.token, result.role, false, null);
        window.location.href = "guardian.html";
      } catch (err) {
        showNotice(`فشل دخول ولي الأمر: ${err.message}`);
      }
    });

    bindTap(guardianRequestAccessBtn, () => {
      if (!guardianAccessModal) return;
      if (guardianForgotModal) guardianForgotModal.hidden = true;
      guardianAccessModal.hidden = false;
      const phoneFromLogin = S.byId("guardianPhoneLogin")?.value.trim() || "";
      if (guardianAccessPhoneInput && phoneFromLogin && !guardianAccessPhoneInput.value) {
        guardianAccessPhoneInput.value = phoneFromLogin;
      }
      setTimeout(() => guardianAccessPhoneInput?.focus(), 0);
    });

    bindTap(guardianForgotToggleBtn, () => {
      if (!guardianForgotModal) return;
      guardianForgotModal.hidden = false;
      const phoneFromLogin = S.byId("guardianPhoneLogin")?.value.trim() || "";
      const resetInput = S.byId("guardianResetPhone");
      if (resetInput && phoneFromLogin && !resetInput.value) resetInput.value = phoneFromLogin;
      S.byId("guardianResetName")?.focus();
    });

    function openForgotModal(event = null) {
      if (event) event.preventDefault();
      if (forgotModal) forgotModal.hidden = false;
      setTimeout(() => recoveryPhoneInput?.focus(), 0);
      return false;
    }

    window.openForgotModal = openForgotModal;
    bindTap(forgotOpen, openForgotModal);
    bindTap(forgotTextOpen, openForgotModal);
    forgotTextOpen?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openForgotModal(event);
    });

    forgotWrap?.addEventListener("click", (event) => {
      const targetEl = event.target instanceof Element ? event.target : event.target?.parentElement;
      const trigger = targetEl?.closest(".forgot-link-word, .forgot-text");
      if (!trigger) return;
      openForgotModal(event);
    });

    forgotModalClose?.addEventListener("click", () => {
      if (forgotModal) forgotModal.hidden = true;
    });
    forgotModal?.addEventListener("click", (event) => {
      if (event.target === forgotModal) forgotModal.hidden = true;
    });

    guardianForgotModalClose?.addEventListener("click", () => {
      if (guardianForgotModal) guardianForgotModal.hidden = true;
    });
    guardianForgotModal?.addEventListener("click", (event) => {
      if (event.target === guardianForgotModal) guardianForgotModal.hidden = true;
    });

    guardianAccessModalClose?.addEventListener("click", () => {
      if (guardianAccessModal) guardianAccessModal.hidden = true;
    });
    guardianAccessModal?.addEventListener("click", (event) => {
      if (event.target === guardianAccessModal) guardianAccessModal.hidden = true;
    });

    changePasswordModalClose?.addEventListener("click", () => {
      if (changePasswordModal) changePasswordModal.hidden = true;
    });
    changePasswordModal?.addEventListener("click", (event) => {
      if (event.target === changePasswordModal) changePasswordModal.hidden = true;
    });

    guardianAccessSubmit?.addEventListener("click", async () => {
      try {
        const phone = guardianAccessPhoneInput?.value.trim() || "";
        const hasWhatsapp = !!guardianAccessHasWhatsappInput?.checked;
        if (!phone) {
          showNotice("اكتب رقم ولي الأمر أولًا.");
          return;
        }
        const result = await S.apiFetch("/api/guardian/request-access", {
          method: "POST",
          body: JSON.stringify({ phone, hasWhatsapp })
        });
        if (result?.alreadyHasPassword) {
          showNotice("هذا الرقم لديه كلمة سر بالفعل. لو ناسيها اضغط (نسيت كلمة السر؟).");
          return;
        }
        showNotice("تم إرسال الطلب للمالك. سيتم إرسال كلمة السر لرقم ولي الأمر بعد المراجعة.");
        if (guardianAccessModal) guardianAccessModal.hidden = true;
      } catch (err) {
        showNotice(err.message || "تعذر إرسال الطلب.");
      }
    });

    guardianResetSubmit?.addEventListener("click", async () => {
      try {
        const phone = S.byId("guardianResetPhone")?.value.trim() || "";
        const guardianName = S.byId("guardianResetName")?.value.trim() || "";
        const hasWhatsapp = !!S.byId("guardianHasWhatsapp")?.checked;
        if (!phone) {
          showNotice("اكتب رقم ولي الأمر أولًا.");
          return;
        }
        const result = await S.apiFetch("/api/guardian/request-password-reset", {
          method: "POST",
          body: JSON.stringify({ phone, guardianName, hasWhatsapp })
        });
        if (result?.blocked) {
          showNotice(result?.message || "لا يمكن تنفيذ الطلب الآن.");
          return;
        }
        if (hasWhatsapp && result?.whatsappUrl) {
          const popup = window.open(result.whatsappUrl, "_blank");
          if (!popup) window.location.href = result.whatsappUrl;
        }
        showNotice("تم ارسال بياناتك بنجاح سيتم التواصل معك.");
        if (guardianForgotModal) guardianForgotModal.hidden = true;
      } catch (err) {
        showNotice(err.message || "تعذر إرسال طلب الاستعادة.");
      }
    });

    codeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = {
          phone: S.byId("codePhone")?.value.trim() || "",
          code: S.byId("accessCode")?.value.trim() || ""
        };
        const result = await S.apiFetch("/api/auth/login-code", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        S.setAuth(result.token, result.role, true, result.permissions || null);
        showNotice("تم تسجيل دخولك بالكود بنجاح.");
        if (changePasswordModal) {
          changePasswordModal.hidden = false;
          setTimeout(() => newPasswordInput?.focus(), 0);
        }
      } catch (err) {
        showNotice(`فشل الدخول بالكود: ${err.message}`);
      }
    });

    changeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const newPassword = S.byId("newPassword")?.value || "";
        const confirmPassword = S.byId("confirmPassword")?.value || "";
        if (newPassword.length < 6) {
          showNotice("كلمة السر الجديدة لازم تكون 6 أحرف على الأقل.");
          return;
        }
        if (newPassword !== confirmPassword) {
          showNotice("تأكيد كلمة السر غير مطابق.");
          return;
        }
        const result = await S.apiFetch("/api/auth/change-password-with-code", {
          method: "POST",
          body: JSON.stringify({ newPassword })
        });
        S.setAuth(result.token, result.role, false, null);
        markStudentLoginSuccess(result.role);
        if (changePasswordModal) changePasswordModal.hidden = true;
        showNotice("تم تغيير كلمة السر بنجاح.");
        window.location.href = "aftermain.html";
      } catch (err) {
        showNotice(`تعذر تغيير كلمة السر: ${err.message}`);
      }
    });

    forgotModalSubmit?.addEventListener("click", async () => {
      try {
        const phone = recoveryPhoneInput?.value.trim() || "";
        const email = recoveryEmailInput?.value.trim() || "";
        const hasWhatsapp = !!forgotHasWhatsappInput?.checked;
        if (!phone) {
          showNotice("اكتب رقم الهاتف أولًا.");
          return;
        }
        if (!email) {
          showNotice("اكتب البريد الإلكتروني أولًا.");
          return;
        }
        const result = await S.apiFetch("/api/auth/request-reset-code", {
          method: "POST",
          body: JSON.stringify({ phone, email, hasWhatsapp })
        });
        activateTab("code");
        if (S.byId("codePhone")) S.byId("codePhone").value = phone;
        if (forgotModal) forgotModal.hidden = true;
        if (hasWhatsapp && result.whatsappUrl) {
          const popup = window.open(result.whatsappUrl, "_blank");
          if (!popup) window.location.href = result.whatsappUrl;
        }
        showNotice("تم إرسال كود الاستعادة بنجاح. ادخل الكود من تبويب الهاتف + الكود.");
      } catch (err) {
        showNotice(err.message || "تعذر إرسال الكود.");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSignAuthPage);
  } else {
    initSignAuthPage();
  }
})();
