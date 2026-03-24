const adminMsg = document.getElementById("adminMsg");
const adminLoginCard = document.getElementById("adminLoginCard");
const pendingBooksCard = document.getElementById("pendingBooksCard");
const pendingBookList = document.getElementById("pendingBookList");
const refreshPendingBtn = document.getElementById("refreshPendingBtn");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPassword = document.getElementById("adminPassword");
const pendingSearchInput = document.getElementById("pendingSearchInput");

const ADMIN_TOKEN_KEY = "novel_rating_admin_panel_token";
let allPendingItems = [];

const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || "";
const setAdminToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

const adminRequest = async (url, options = {}) => {
  const token = getAdminToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
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

const enterAdminPanel = async () => {
  adminLoginCard.classList.add("hidden");
  pendingBooksCard.classList.remove("hidden");
  await loadPendingBooks();
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

pendingSearchInput.oninput = applyPendingFilter;

if (getAdminToken()) {
  enterAdminPanel().catch((error) => {
    clearAdminToken();
    adminMsg.className = "mt-2 text-sm text-red-500";
    adminMsg.textContent = error.message;
  });
}
