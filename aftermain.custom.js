// Student page custom interactions.
// Keep future UI behavior additions here to avoid touching the large js.js file.
(() => {
  const menu = document.getElementById("studentRadialMenu");
  const mainBtn = document.getElementById("studentRadialMainBtn");
  const openOfficialBtn = document.getElementById("radialOpenOfficial");
  const openSupportBtn = document.getElementById("radialOpenSupport");

  if (!menu || !mainBtn || !openOfficialBtn || !openSupportBtn) {
    window.StudentCustom = window.StudentCustom || {};
    return;
  }
  const DRAG_THRESHOLD = 6;

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let userPlaced = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getMenuSize() {
    const rect = menu.getBoundingClientRect();
    return { width: rect.width || 60, height: rect.height || 60 };
  }

  function getPointerPoint(event) {
    if (event.touches && event.touches.length) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        pageX: event.touches[0].clientX,
        pageY: event.touches[0].clientY
      };
    }
    if (event.changedTouches && event.changedTouches.length) {
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY,
        pageX: event.changedTouches[0].clientX,
        pageY: event.changedTouches[0].clientY
      };
    }
    return { x: event.clientX, y: event.clientY, pageX: event.clientX, pageY: event.clientY };
  }

  function setMenuPosition(pageX, pageY) {
    const { width, height } = getMenuSize();
    const minX = 8;
    const minY = 8;
    const maxX = window.innerWidth - width - 8;
    const maxY = window.innerHeight - height - 8;
    const clampedX = clamp(pageX, minX, Math.max(minX, maxX));
    const clampedY = clamp(pageY, minY, Math.max(minY, maxY));

    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;
    menu.style.right = "auto";
  }

  function rectOverlapArea(a, b) {
    const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return x * y;
  }

  function collectObstacles() {
    const selectors = [".topbar", "#sideMenu", ".site-footer"];
    const nodes = selectors.flatMap((s) => Array.from(document.querySelectorAll(s)));
    return nodes
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 2 && r.height > 2);
  }

  function autoPlaceMenu() {
    const { width, height } = getMenuSize();
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const candidates = [
      { x: pad, y: pad },
      { x: vw - width - pad, y: pad },
      { x: pad, y: vh - height - pad },
      { x: vw - width - pad, y: vh - height - pad }
    ];
    const obstacles = collectObstacles();

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const box = { left: c.x, top: c.y, right: c.x + width, bottom: c.y + height };
      let score = 0;
      for (const ob of obstacles) score += rectOverlapArea(box, ob);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    setMenuPosition(best.x, best.y);
  }

  function setStage(stage) {
    menu.dataset.stage = stage;
  }

  function closeOptions() {
    menu.classList.remove("open");
    setStage("root");
    mainBtn.setAttribute("aria-expanded", "false");
  }

  function onDragMove(event) {
    if (!dragging) return;
    event.preventDefault();
    const p = getPointerPoint(event);
    const nextX = p.pageX - dragOffsetX;
    const nextY = p.pageY - dragOffsetY;

    if (!moved) {
      if (Math.abs(p.x - startX) >= DRAG_THRESHOLD || Math.abs(p.y - startY) >= DRAG_THRESHOLD) {
        moved = true;
      }
    }

    setMenuPosition(nextX, nextY);
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    userPlaced = true;
    menu.classList.remove("dragging");
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    document.removeEventListener("touchmove", onDragMove);
    document.removeEventListener("touchend", onDragEnd);
    document.removeEventListener("touchcancel", onDragEnd);
  }

  function onDragStart(event) {
    const p = getPointerPoint(event);
    const rect = menu.getBoundingClientRect();

    dragging = true;
    moved = false;
    startX = p.x;
    startY = p.y;
    dragOffsetX = p.pageX - rect.left;
    dragOffsetY = p.pageY - rect.top;
    menu.classList.add("dragging");

    document.addEventListener("mousemove", onDragMove, { passive: false });
    document.addEventListener("mouseup", onDragEnd);
    document.addEventListener("touchmove", onDragMove, { passive: false });
    document.addEventListener("touchend", onDragEnd);
    document.addEventListener("touchcancel", onDragEnd);
  }

  mainBtn.addEventListener("mousedown", onDragStart);
  mainBtn.addEventListener("touchstart", onDragStart, { passive: true });

  mainBtn.addEventListener("click", (event) => {
    if (moved) {
      event.preventDefault();
      moved = false;
      return;
    }
    const open = menu.classList.toggle("open");
    if (!open) setStage("root");
    mainBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  openSupportBtn.addEventListener("click", (event) => {
    event.preventDefault();
    menu.classList.add("open");
    setStage("support");
    mainBtn.setAttribute("aria-expanded", "true");
  });

  openOfficialBtn.addEventListener("click", (event) => {
    event.preventDefault();
    menu.classList.add("open");
    setStage("official");
    mainBtn.setAttribute("aria-expanded", "true");
  });

  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target)) {
      closeOptions();
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) {
      closeOptions();
    }
  });

  window.addEventListener("resize", () => {
    if (!userPlaced) {
      autoPlaceMenu();
      return;
    }
    const left = parseFloat(menu.style.left || "0") || menu.getBoundingClientRect().left;
    const top = parseFloat(menu.style.top || "0") || menu.getBoundingClientRect().top;
    setMenuPosition(left, top);
  });

  autoPlaceMenu();

  window.StudentCustom = window.StudentCustom || {};
  window.StudentCustom.radialMenu = {
    close: closeOptions
  };
})();
