const pendingInfo = document.getElementById("pendingInfo");
const clearLocalRecordBtn = document.getElementById("clearLocalRecordBtn");
const mySubmissionForm = document.getElementById("mySubmissionForm");
const mySubmissionNickname = document.getElementById("mySubmissionNickname");
const mySubmissionList = document.getElementById("mySubmissionList");

const STORAGE_KEY = "novel_rating_latest_pending_submission";
const QUERY_NICKNAME_KEY = "novel_rating_query_nickname";

const escapeHtml = (value) =>
  String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const render = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    pendingInfo.innerHTML = '<p class="text-slate-500">暂无本地投稿记录。你可以回首页继续添加新书。</p>';
    return;
  }
  let record = null;
  try {
    record = JSON.parse(raw);
  } catch {
    pendingInfo.innerHTML = '<p class="text-red-500">本地投稿记录损坏，请重新提交。</p>';
    return;
  }
  pendingInfo.innerHTML = `
    <p><span class="font-medium">书名：</span>${escapeHtml(record.title)}</p>
    <p class="mt-1"><span class="font-medium">作者：</span>${escapeHtml(record.author)}</p>
    <p class="mt-1"><span class="font-medium">平台：</span>${escapeHtml(record.platform)}</p>
    <p class="mt-1"><span class="font-medium">提交人：</span>${escapeHtml(record.submitterNickname || "匿名")}</p>
    <p class="mt-1"><span class="font-medium">提交时间：</span>${new Date(record.createdAt).toLocaleString()}</p>
    <p class="mt-2 whitespace-pre-line"><span class="font-medium">简介：</span>${escapeHtml(record.description || "暂无简介，欢迎补充")}</p>
  `;
  if (record.submitterNickname) {
    mySubmissionNickname.value = record.submitterNickname;
  }
};

clearLocalRecordBtn.onclick = () => {
  localStorage.removeItem(STORAGE_KEY);
  render();
};

const statusText = (status) => {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已拒绝";
  return "待审核";
};

const statusClass = (status) => {
  if (status === "approved") return "text-emerald-700 bg-emerald-100";
  if (status === "rejected") return "text-rose-700 bg-rose-100";
  return "text-amber-700 bg-amber-100";
};

const queryMySubmissions = async (nickname) => {
  const params = new URLSearchParams({ nickname, limit: "10" });
  const response = await fetch(`/api/books/pending/my-submissions?${params.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "查询失败");
  return data.data || [];
};

const renderMySubmissionList = (items) => {
  if (!items.length) {
    mySubmissionList.innerHTML = '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">没有查到该昵称的投稿记录。</p>';
    return;
  }
  mySubmissionList.innerHTML = items
    .map(
      (item) => `
      <article class="rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <div class="flex items-center justify-between gap-2">
          <p class="font-medium text-slate-800">${escapeHtml(item.title)} · ${escapeHtml(item.author)}</p>
          <span class="rounded-full px-2 py-1 text-xs ${statusClass(item.status)}">${statusText(item.status)}</span>
        </div>
        <p class="mt-1 text-slate-600">平台：${escapeHtml(item.platform)}</p>
        <p class="mt-1 text-xs text-slate-500">提交时间：${new Date(item.createdAt).toLocaleString()}</p>
        ${
          item.reviewedAt
            ? `<p class="mt-1 text-xs text-slate-500">审核时间：${new Date(item.reviewedAt).toLocaleString()}</p>`
            : ""
        }
      </article>
    `
    )
    .join("");
};

mySubmissionForm.onsubmit = async (e) => {
  e.preventDefault();
  const nickname = mySubmissionNickname.value.trim();
  if (!nickname) {
    mySubmissionList.innerHTML = '<p class="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">请先输入提交人昵称。</p>';
    return;
  }
  localStorage.setItem(QUERY_NICKNAME_KEY, nickname);
  mySubmissionList.innerHTML = '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">查询中...</p>';
  try {
    const items = await queryMySubmissions(nickname);
    renderMySubmissionList(items);
  } catch (error) {
    mySubmissionList.innerHTML = `<p class="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">${escapeHtml(error.message)}</p>`;
  }
};

render();
const lastQueryNickname = localStorage.getItem(QUERY_NICKNAME_KEY);
if (lastQueryNickname && !mySubmissionNickname.value) {
  mySubmissionNickname.value = lastQueryNickname;
}
if (mySubmissionNickname.value.trim()) {
  mySubmissionForm.dispatchEvent(new Event("submit"));
}
