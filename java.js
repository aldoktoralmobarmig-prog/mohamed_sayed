(() => {
  function clamp(n, a, b) {
    return Math.min(Math.max(n, a), b);
  }

  function initBackgroundPan() {
    const layer = document.getElementById("bgLinks");
    if (!layer) return;

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    let rafId = 0;
    let pan = 0; // px
    let velocity = 0; // px per frame
    let dragging = false;
    let startX = 0;
    let startPan = 0;
    let lastX = 0;
    let lastT = 0;

    function setPan(x) {
      pan = x;
      // keep number small
      if (Math.abs(pan) > 100000) pan = pan % 2000;
      layer.style.setProperty("--pan", `${pan}px`);
    }

    function step() {
      rafId = requestAnimationFrame(step);
      if (dragging) return;
      if (Math.abs(velocity) < 0.01) return;
      setPan(pan + velocity);
      velocity *= 0.92;
      velocity = clamp(velocity, -28, 28);
    }

    function startAnim() {
      if (!rafId) rafId = requestAnimationFrame(step);
    }

    function isInteractiveTarget(target) {
      return !!target.closest("a,button,input,textarea,select,details,summary,label");
    }

    window.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (isInteractiveTarget(e.target)) return;
      dragging = true;
      startX = e.clientX;
      startPan = pan;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      startAnim();
    });

    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      setPan(startPan + dx);

      const t = performance.now();
      const dt = Math.max(1, t - lastT);
      const vx = (e.clientX - lastX) / dt; // px/ms
      velocity = clamp(vx * 16, -28, 28);
      lastX = e.clientX;
      lastT = t;
    });

    function endDrag() {
      dragging = false;
    }

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    // Wheel: يساعد على تحريك الخلفية يمين/شمال على اللابتوب
    window.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) < 1) return;
        velocity += (-e.deltaY - e.deltaX) * 0.03;
        velocity = clamp(velocity, -28, 28);
        startAnim();
      },
      { passive: true }
    );

    setPan(0);
    startAnim();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initBackgroundPan();
  });
})();
