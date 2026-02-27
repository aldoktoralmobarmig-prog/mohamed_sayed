(() => {
  function bindTap(element, handler) {
    if (!element) return;
    element.addEventListener("click", handler);
    element.addEventListener(
      "touchend",
      (event) => {
        event.preventDefault();
        handler(event);
      },
      { passive: false }
    );
  }

  function initTabs(elements) {
    const { tabButtons, passwordTab, codeTab, guardianTab, forgotWrap, guardianForgotModal, guardianAccessModal, panelChip, panelTitle, panelText } = elements;

    function setLoginPanel(tab) {
      if (!panelChip || !panelTitle || !panelText) return;
      if (tab === "password") {
        panelChip.textContent = "دخول اعتيادي";
        panelTitle.textContent = "الدخول بكلمة السر";
        panelText.textContent = "اكتب رقم الهاتف وكلمة السر للوصول السريع إلى حسابك.";
        return;
      }
      if (tab === "code") {
        panelChip.textContent = "دخول سريع";
        panelTitle.textContent = "الدخول عبر الكود";
        panelText.textContent = "استخدم رقم الهاتف مع كود الدخول لإتمام تسجيل الدخول بسرعة.";
        return;
      }
      panelChip.textContent = "متابعة ولي الأمر";
      panelTitle.textContent = "متابعة تقدم نجلك";
      panelText.textContent = "من حساب ولي الأمر تقدر تتابع الأداء الدراسي والحضور والتقارير بسهولة.";
    }

    function activateTab(tab) {
      tabButtons.forEach((b) => b.classList.remove("active"));
      const targetBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
      if (targetBtn) targetBtn.classList.add("active");
      if (passwordTab) passwordTab.classList.toggle("active", tab === "password");
      if (codeTab) codeTab.classList.toggle("active", tab === "code");
      if (guardianTab) guardianTab.classList.toggle("active", tab === "guardian");
      if (forgotWrap) forgotWrap.hidden = tab === "guardian";
      if (tab !== "guardian" && guardianForgotModal) guardianForgotModal.hidden = true;
      if (tab !== "guardian" && guardianAccessModal) guardianAccessModal.hidden = true;
      setLoginPanel(tab);
    }

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => activateTab(btn.dataset.tab));
    });
    activateTab(document.querySelector(".tab-btn.active")?.dataset.tab || "password");

    return { activateTab, bindTap };
  }

  window.SignTabs = { initTabs, bindTap };
})();
