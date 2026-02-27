(() => {
  const forgotSelector = "#forgotPasswordOpen, #forgotTextOpen, .forgot-link-word, .forgot-text";

  function handleForgotTap(event) {
    const target = event.target instanceof Element ? event.target.closest(forgotSelector) : null;
    if (!target) return;
    if (typeof window.openForgotModal !== "function") return;
    event.preventDefault();
    event.stopPropagation();
    window.openForgotModal(event);
  }

  document.addEventListener("pointerup", handleForgotTap, { passive: false });
  document.addEventListener("touchend", handleForgotTap, { passive: false });
})();
