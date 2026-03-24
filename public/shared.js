const API = {
  books: "/api/books",
  register: "/api/auth/register",
  login: "/api/auth/login",
  me: "/api/auth/me",
  profileOverview: "/api/profile/overview"
};

const authStore = {
  tokenKey: "novel_rating_token",
  userKey: "novel_rating_user",
  getToken() {
    return localStorage.getItem(this.tokenKey);
  },
  setToken(token) {
    localStorage.setItem(this.tokenKey, token);
  },
  clearToken() {
    localStorage.removeItem(this.tokenKey);
  },
  getUser() {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser(user) {
    localStorage.setItem(this.userKey, JSON.stringify(user));
  },
  clearUser() {
    localStorage.removeItem(this.userKey);
  },
  clearAll() {
    this.clearToken();
    this.clearUser();
  }
};

const authModalState = {
  mode: "login"
};

const request = async (url, options = {}) => {
  const token = authStore.getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "请求失败");
  }
  return data;
};

const setupAuthUI = () => {
  const authArea = document.getElementById("authArea");
  const authModal = document.getElementById("authModal");
  const authTitle = document.getElementById("authTitle");
  const authForm = document.getElementById("authForm");
  const authUsername = document.getElementById("authUsername");
  const authPassword = document.getElementById("authPassword");
  const authMessage = document.getElementById("authMessage");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const switchAuthModeBtn = document.getElementById("switchAuthModeBtn");
  const closeAuthModal = document.getElementById("closeAuthModal");

  const openModal = (mode) => {
    authModalState.mode = mode;
    authTitle.textContent = mode === "login" ? "登录" : "注册";
    authSubmitBtn.textContent = mode === "login" ? "登录" : "注册";
    switchAuthModeBtn.textContent =
      mode === "login" ? "没有账号？去注册" : "已有账号？去登录";
    authMessage.textContent = "";
    authForm.reset();
    authModal.classList.remove("hidden");
    authModal.classList.add("flex");
  };

  const closeModal = () => {
    authModal.classList.remove("flex");
    authModal.classList.add("hidden");
  };

  const renderAuthArea = () => {
    const user = authStore.getUser();
    if (!user) {
      authArea.innerHTML = `
        <a href="/admin.html" class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100">管理员</a>
        <button id="loginBtn" class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100">登录</button>
        <button id="registerBtn" class="rounded-lg bg-brand-700 px-3 py-2 text-sm text-white hover:bg-brand-600">注册</button>
      `;
      document.getElementById("loginBtn").onclick = () => openModal("login");
      document.getElementById("registerBtn").onclick = () => openModal("register");
      return;
    }

    authArea.innerHTML = `
      <a href="/admin.html" class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100">管理后台</a>
      <a href="/profile.html" class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100">个人中心</a>
      <span class="text-sm text-slate-600">你好，${user.username}</span>
      <button id="logoutBtn" class="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100">退出</button>
    `;
    document.getElementById("logoutBtn").onclick = () => {
      authStore.clearAll();
      renderAuthArea();
      if (typeof window.onAuthChanged === "function") {
        window.onAuthChanged(null);
      }
    };
  };

  switchAuthModeBtn.onclick = () => {
    openModal(authModalState.mode === "login" ? "register" : "login");
  };

  closeAuthModal.onclick = closeModal;
  authModal.onclick = (e) => {
    if (e.target === authModal) closeModal();
  };

  authForm.onsubmit = async (e) => {
    e.preventDefault();
    authMessage.textContent = "";
    const username = authUsername.value.trim();
    const password = authPassword.value.trim();

    try {
      if (authModalState.mode === "register") {
        const res = await request(API.register, {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        authMessage.classList.remove("text-red-500");
        authMessage.classList.add("text-emerald-600");
        authMessage.textContent = res.message || "注册成功，请登录。";
        openModal("login");
        return;
      }

      const data = await request(API.login, {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      authStore.setToken(data.token);
      authStore.setUser(data.user);
      closeModal();
      renderAuthArea();
      if (typeof window.onAuthChanged === "function") {
        window.onAuthChanged(data.user);
      }
    } catch (error) {
      authMessage.classList.remove("text-emerald-600");
      authMessage.classList.add("text-red-500");
      authMessage.textContent = error.message;
    }
  };

  renderAuthArea();
  return { renderAuthArea };
};

window.request = request;
window.authStore = authStore;
window.setupAuthUI = setupAuthUI;
window.API = API;
