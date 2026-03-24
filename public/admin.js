const adminMsg = document.getElementById("adminMsg");
const adminLoginCard = document.getElementById("adminLoginCard");
const pendingBooksCard = document.getElementById("pendingBooksCard");
const libraryCoverCard = document.getElementById("libraryCoverCard");
const pendingBookList = document.getElementById("pendingBookList");
const libraryBookList = document.getElementById("libraryBookList");
const refreshPendingBtn = document.getElementById("refreshPendingBtn");
const refreshLibraryBtn = document.getElementById("refreshLibraryBtn");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPassword = document.getElementById("adminPassword");
const pendingSearchInput = document.getElementById("pendingSearchInput");
const librarySearchInput = document.getElementById("librarySearchInput");

const ADMIN_TOKEN_KEY = "novel_rating_admin_panel_token";
let allPendingItems = [];
let allLibraryItems = [];

const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || "";
const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

const adminRequest = async (url, options = {}) => {
  const token = getAdminToken();
  const headers = { ...(options.headers || {}) };
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "请求失败");
  return data;
};

const renderPendingList = (items) => {
  if (!items.length) {
    pendingBookList.innerHTML = '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">当前没有待审核书籍。</p>';
    return;
  }
  pendingBookList.innerHTML = items
    .map(
      (item) => `
      <article class="rounded-lg border border-slate-200 p-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-lg font-semibold">${item.title}</h3>
          <span class="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">${item.platform}</span>
        </div>
        <p class="text-sm text-slate-600">作者：${item.author}</p>
        <p class="text-sm text-slate-600">提交人：${item.submitterNickname || "匿名"}</p>
        <p class="mt-2 whitespace-pre-line text-sm text-slate-700">${item.description || "暂无简介，欢迎补充"}</p>
        ${
          item.coverUrl
            ? `<p class="mt-2 break-all text-xs text-slate-500">封面链接：${item.coverUrl}</p>`
            : ""
        }
        <p class="mt-1 text-xs text-slate-500">提交时间：${new Date(item.createdAt).toLocaleString()}</p>
        <div class="mt-3 flex gap-2">
          <button data-approve-id="${item.id}" class="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500">通过</button>
          <button data-reject-id="${item.id}" class="rounded bg-rose-600 px-3 py-1 text-sm text-white hover:bg-rose-500">拒绝</button>
        </div>
      </article>
    `
    )
    .join("");

  pendingBookList.querySelectorAll("[data-approve-id]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await adminRequest(`/api/admin/pending-books/${btn.dataset.approveId}/approve`, { method: "POST" });
        adminMsg.className = "mt-2 text-sm text-emerald-600";
        adminMsg.textContent = "审核通过，已加入首页书库。";
        await loadPendingBooks();
      } catch (error) {
        adminMsg.className = "mt-2 text-sm text-red-500";
        adminMsg.textContent = error.message;
      }
    };
  });

  pendingBookList.querySelectorAll("[data-reject-id]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await adminRequest(`/api/admin/pending-books/${btn.dataset.rejectId}`, { method: "DELETE" });
        adminMsg.className = "mt-2 text-sm text-slate-600";
        adminMsg.textContent = "已拒绝该投稿。";
        await loadPendingBooks();
      } catch (error) {
        adminMsg.className = "mt-2 text-sm text-red-500";
        adminMsg.textContent = error.message;
      }
    };
  });
};

const renderLibraryList = (items) => {
  if (!items.length) {
    libraryBookList.innerHTML = '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">未找到匹配书籍。</p>';
    return;
  }
  libraryBookList.innerHTML = items
    .map(
      (item) => `
      <article class="rounded-lg border border-slate-200 p-3">
        <div class="mb-3 flex flex-wrap items-start gap-3">
          <img src="${item.coverUrl}" alt="${item.title}" class="h-24 w-16 rounded border border-slate-200 object-cover" onerror="this.onerror=null;this.src='/fallback-cover.svg';" />
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex flex-wrap items-center gap-2">
              <h3 class="text-base font-semibold">${item.title}</h3>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">${item.platform}</span>
              ${
                item.hasCustomCover
                  ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">已上传自定义封面</span>'
                  : '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">使用默认/外链封面</span>'
              }
            </div>
            <p class="text-sm text-slate-600">作者：${item.author}</p>
            <p class="mt-1 break-all text-xs text-slate-500">当前封面：${item.coverUrl}</p>
          </div>
        </div>
        <form data-cover-upload-form="${item.id}" class="flex flex-wrap items-center gap-2">
          <input data-cover-file="${item.id}" type="file" accept="image/*" class="text-sm" required />
          <button class="rounded bg-indigo-700 px-3 py-1 text-sm text-white hover:bg-indigo-600">上传并覆盖</button>
        </form>
      </article>
    `
    )
    .join("");

  libraryBookList.querySelectorAll("[data-cover-upload-form]").forEach((formEl) => {
    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = formEl.getAttribute("data-cover-upload-form");
      const fileInput = libraryBookList.querySelector(`[data-cover-file="${id}"]`);
      const file = fileInput?.files?.[0];
      if (!file) {
        adminMsg.className = "mt-2 text-sm text-red-500";
        adminMsg.textContent = "请先选择图片文件。";
        return;
      }
      const body = new FormData();
      body.append("cover", file);
      try {
        const result = await adminRequest(`/api/admin/library-books/${id}/cover`, {
          method: "POST",
          body
        });
        adminMsg.className = "mt-2 text-sm text-emerald-600";
        adminMsg.textContent = result.message || "封面上传成功。";
        await loadLibraryBooks();
      } catch (error) {
        adminMsg.className = "mt-2 text-sm text-red-500";
        adminMsg.textContent = error.message;
      }
    });
  });
};

const renderLibraryIdleState = () => {
  libraryBookList.innerHTML = '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">请输入书名或作者后再搜索，不默认展示全部书籍。</p>';
};

const applyPendingFilter = () => {
  const keyword = (pendingSearchInput.value || "").trim().toLowerCase();
  if (!keyword) {
    renderPendingList(allPendingItems);
    return;
  }
  const filtered = allPendingItems.filter((item) => {
    const title = (item.title || "").toLowerCase();
    const author = (item.author || "").toLowerCase();
    const submitter = (item.submitterNickname || "").toLowerCase();
    return title.includes(keyword) || author.includes(keyword) || submitter.includes(keyword);
  });
  renderPendingList(filtered);
};

const loadPendingBooks = async () => {
  const result = await adminRequest("/api/admin/pending-books");
  allPendingItems = result.data || [];
  applyPendingFilter();
};

const applyLibraryFilter = () => {
  const keyword = (librarySearchInput.value || "").trim().toLowerCase();
  if (!keyword) {
    allLibraryItems = [];
    renderLibraryIdleState();
    return;
  }
  const filtered = allLibraryItems.filter((item) => {
    const title = (item.title || "").toLowerCase();
    const author = (item.author || "").toLowerCase();
    return title.includes(keyword) || author.includes(keyword);
  });
  renderLibraryList(filtered);
};

const loadLibraryBooks = async () => {
  const keyword = (librarySearchInput.value || "").trim();
  if (!keyword) {
    allLibraryItems = [];
    renderLibraryIdleState();
    return;
  }
  const params = new URLSearchParams();
  params.set("q", keyword);
  params.set("limit", "100");
  const result = await adminRequest(`/api/admin/library-books?${params.toString()}`);
  allLibraryItems = result.data || [];
  applyLibraryFilter();
};

const enterAdminPanel = async () => {
  adminLoginCard.classList.add("hidden");
  pendingBooksCard.classList.remove("hidden");
  libraryCoverCard.classList.remove("hidden");
  await loadPendingBooks();
  renderLibraryIdleState();
};

adminLoginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const result = await adminRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: adminPassword.value.trim() })
    });
    setAdminToken(result.token);
    adminMsg.className = "mt-2 text-sm text-emerald-600";
    adminMsg.textContent = "管理员登录成功。";
    await enterAdminPanel();
  } catch (error) {
    clearAdminToken();
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  }
});

refreshPendingBtn.onclick = async () => {
  try {
    await loadPendingBooks();
    adminMsg.className = "mt-2 text-sm text-slate-600";
    adminMsg.textContent = "列表已刷新。";
  } catch (error) {
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  }
};

refreshLibraryBtn.onclick = async () => {
  try {
    await loadLibraryBooks();
    if ((librarySearchInput.value || "").trim()) {
      adminMsg.className = "mt-2 text-sm text-slate-600";
      adminMsg.textContent = "搜索结果已刷新。";
    } else {
      adminMsg.className = "mt-2 text-sm text-slate-600";
      adminMsg.textContent = "请输入关键词后再搜索。";
    }
  } catch (error) {
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  }
};

pendingSearchInput.oninput = applyPendingFilter;
librarySearchInput.onkeydown = (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  loadLibraryBooks().catch((error) => {
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  });
};

if (getAdminToken()) {
  enterAdminPanel().catch((error) => {
    clearAdminToken();
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  });
}
