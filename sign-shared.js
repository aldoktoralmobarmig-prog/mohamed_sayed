(() => {
  const API_BASE = (() => {
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

  function byId(id) {
    return document.getElementById(id);
  }

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

  function getToken() {
    return localStorage.getItem("authToken") || "";
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
      response = await fetch(fullUrl, { ...options, headers });
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
      const fallback = rawText ? rawText.replace(/\s+/g, " ").trim().slice(0, 180) : `HTTP ${response.status}`;
      throw new Error(data.error || data.details || fallback || "Request failed");
    }

    return data;
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
        btn.innerHTML = isPassword ? '<i class="fa-regular fa-eye-slash"></i>' : '<i class="fa-regular fa-eye"></i>';
      });
    });
  }

  window.SignShared = {
    byId,
    setAuth,
    apiFetch,
    initPasswordToggles
  };
})();
