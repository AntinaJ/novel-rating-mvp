const bookGrid = document.getElementById("bookGrid");
const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const resultHint = document.getElementById("resultHint");
const platformFilter = document.getElementById("platformFilter");
const genreFilter = document.getElementById("genreFilter");
const applyFilterBtn = document.getElementById("applyFilterBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const openSubmitBookModalBtn = document.getElementById("openSubmitBookModalBtn");
const submitBookModal = document.getElementById("submitBookModal");
const closeSubmitBookModalBtn = document.getElementById("closeSubmitBookModalBtn");
const submitBookForm = document.getElementById("submitBookForm");
const submitBookMsg = document.getElementById("submitBookMsg");
const submitPlatform = document.getElementById("submitPlatform");
const platformPreview = document.getElementById("platformPreview");
const submitNicknameInput = document.getElementById("submitNickname");
const LATEST_PENDING_SUBMISSION_KEY = "novel_rating_latest_pending_submission";
const QUERY_NICKNAME_KEY = "novel_rating_query_nickname";

setupAuthUI();
let state = {
  page: 1,
  pageSize: 9,
  hasMore: false,
  q: "",
  platform: "",
  genre: ""
};

const renderStars = (score) => {
  const full = Math.round(score);
  return "★★★★★"
    .split("")
    .map((ch, idx) => `<span class="${idx < full ? "text-amber-500" : "text-slate-300"}">${ch}</span>`)
    .join("");
};

const renderBookCard = (book) => `
  <a href="/detail.html?id=${book.id}" class="book-card block">
    <img src="${book.coverUrl}" alt="${book.title}" class="h-52 w-full object-cover" onerror="this.onerror=null;this.src='/fallback-cover.svg';" />
    <div class="space-y-2 p-4">
      <h3 class="line-clamp-2 text-lg font-semibold text-slate-900">${book.title}</h3>
      <p class="text-sm text-slate-600">作者：${book.author}</p>
      <p class="text-sm text-slate-600">平台：${book.platform} · ${book.genres?.join("/") || "未分类"}</p>
      <div class="flex items-center justify-between">
        <span class="text-sm">${renderStars(book.averageRating)}</span>
        <span class="text-sm font-medium text-slate-700">${book.averageRating.toFixed(1)}</span>
      </div>
      <p class="text-sm text-slate-500">加权分 ${book.weightedScore.toFixed(1)} · 短评 ${book.shortCommentCount} 条</p>
    </div>
  </a>
`;

const platformTagMeta = {
  起点: { color: "text-orange-600", bg: "bg-orange-100", icon: "QD" },
  晋江: { color: "text-emerald-700", bg: "bg-emerald-100", icon: "JJ" },
  长佩: { color: "text-violet-700", bg: "bg-violet-100", icon: "CP" },
  番茄: { color: "text-rose-700", bg: "bg-rose-100", icon: "FQ" },
  其他: { color: "text-slate-700", bg: "bg-slate-100", icon: "OT" }
};

const renderPlatformPreview = () => {
  const platform = submitPlatform.value;
  if (!platform) {
    platformPreview.className = "md:col-span-2 text-sm text-slate-500";
    platformPreview.textContent = "平台标识：未选择";
    return;
  }
  const meta = platformTagMeta[platform] || platformTagMeta.其他;
  platformPreview.className = `md:col-span-2 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm ${meta.bg} ${meta.color}`;
  platformPreview.textContent = `${meta.icon} ${platform}`;
};

const buildQuery = () => {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.platform) params.set("platform", state.platform);
  if (state.genre) params.set("genre", state.genre);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  return `${API.books}?${params.toString()}`;
};

const loadBooks = async (reset = false) => {
  if (reset) {
    state.page = 1;
    bookGrid.innerHTML = `<div class="col-span-full rounded-lg bg-white p-4 text-slate-500">加载中...</div>`;
  }
  try {
    const result = await request(buildQuery(), { method: "GET" });
    const books = result.data || [];
    if (reset && books.length === 0) {
      bookGrid.innerHTML = '<div class="col-span-full rounded-lg bg-white p-4 text-slate-500">没有找到匹配结果。</div>';
      resultHint.textContent = state.q ? `关键词：${state.q}` : "";
      loadMoreBtn.classList.add("hidden");
      return;
    }
    if (reset) {
      bookGrid.innerHTML = books.map(renderBookCard).join("");
    } else {
      bookGrid.insertAdjacentHTML("beforeend", books.map(renderBookCard).join(""));
    }
    state.hasMore = result.hasMore;
    loadMoreBtn.classList.toggle("hidden", !state.hasMore);
    resultHint.textContent = `共 ${result.total} 本，当前第 ${state.page} 页`;
  } catch (error) {
    bookGrid.innerHTML = `<div class="col-span-full rounded-lg bg-white p-4 text-red-500">${error.message}</div>`;
  }
};

searchForm.onsubmit = (e) => {
  e.preventDefault();
  state.q = searchInput.value.trim();
  loadBooks(true);
};

applyFilterBtn.onclick = () => {
  state.platform = platformFilter.value;
  state.genre = genreFilter.value;
  loadBooks(true);
};

loadMoreBtn.onclick = () => {
  state.page += 1;
  loadBooks(false);
};

const openSubmitBookModal = () => {
  submitBookMsg.textContent = "";
  submitBookForm.reset();
  const latestRaw = localStorage.getItem(LATEST_PENDING_SUBMISSION_KEY);
  const queriedNickname = localStorage.getItem(QUERY_NICKNAME_KEY) || "";
  let latestNickname = "";
  if (latestRaw) {
    try {
      latestNickname = JSON.parse(latestRaw)?.submitterNickname || "";
    } catch {
      latestNickname = "";
    }
  }
  submitNicknameInput.value = queriedNickname || latestNickname;
  renderPlatformPreview();
  submitBookModal.classList.remove("hidden");
  submitBookModal.classList.add("flex");
};

const closeSubmitBookModal = () => {
  submitBookModal.classList.remove("flex");
  submitBookModal.classList.add("hidden");
};

const tryAutoOpenSubmitModal = () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("openSubmit") !== "1") return;
  openSubmitBookModal();
  params.delete("openSubmit");
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
};

openSubmitBookModalBtn.onclick = openSubmitBookModal;
closeSubmitBookModalBtn.onclick = closeSubmitBookModal;
submitBookModal.onclick = (e) => {
  if (e.target === submitBookModal) closeSubmitBookModal();
};

submitPlatform.onchange = renderPlatformPreview;
tryAutoOpenSubmitModal();

submitBookForm.onsubmit = async (e) => {
  e.preventDefault();
  submitBookMsg.className = "mt-3 text-sm text-slate-500";
  submitBookMsg.textContent = "提交中...";
  try {
    const payload = {
      title: document.getElementById("submitTitle").value.trim(),
      author: document.getElementById("submitAuthor").value.trim(),
      platform: document.getElementById("submitPlatform").value.trim(),
      description: document.getElementById("submitDescription").value.trim(),
      coverUrl: document.getElementById("submitCoverUrl").value.trim(),
      submitterNickname: document.getElementById("submitNickname").value.trim()
    };
    const result = await request("/api/books/pending", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    submitBookMsg.className = "mt-3 text-sm text-emerald-600";
    submitBookMsg.textContent = result.message || "提交成功，等待审核。";
    localStorage.setItem(
      "novel_rating_latest_pending_submission",
      JSON.stringify({
        ...payload,
        createdAt: new Date().toISOString()
      })
    );
    submitBookForm.reset();
    renderPlatformPreview();
    setTimeout(() => {
      window.location.href = "/pending-status.html";
    }, 600);
  } catch (error) {
    submitBookMsg.className = "mt-3 text-sm text-red-500";
    submitBookMsg.textContent = error.message;
  }
};

loadBooks(true);
