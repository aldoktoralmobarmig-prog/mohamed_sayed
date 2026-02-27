(() => {
  const storageKey = "mainTheme";
  const toggleBtn = document.getElementById("mainThemeToggle");
  if (!toggleBtn) return;

  const applyTheme = (theme) => {
    const isDark = theme === "dark";
    document.body.classList.toggle("theme-dark", isDark);

    toggleBtn.innerHTML = isDark
      ? '<i class="fa-solid fa-sun"></i>'
      : '<i class="fa-solid fa-moon"></i>';

    const label = isDark ? "Light Mode" : "Dark Mode";
    toggleBtn.setAttribute("aria-label", label);
    toggleBtn.setAttribute("title", label);
  };

  const savedTheme = localStorage.getItem(storageKey) || "light";
  applyTheme(savedTheme);

  toggleBtn.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("theme-dark") ? "light" : "dark";
    localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  });
})();
