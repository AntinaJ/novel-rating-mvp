const detailRoot = document.getElementById("detailRoot");
const params = new URLSearchParams(window.location.search);
const bookId = Number(params.get("id"));

setupAuthUI();

const renderDistribution = (items) =>
  items
    .slice()
    .reverse()
    .map(
      (item) => `
      <div class="flex items-center gap-2">
        <span class="w-14 text-sm text-slate-600">${item.score} 星</span>
        <div class="h-2 flex-1 rounded bg-slate-200">
          <div class="h-2 rounded bg-brand-700" style="width:${item.percent}%"></div>
        </div>
        <span class="w-24 text-right text-sm text-slate-500">${item.count} 人 · ${item.percent}%</span>
      </div>
    `
    )
    .join("");

const renderComments = (comments) => {
  if (!comments.length) {
    return '<p class="rounded-lg bg-slate-100 p-3 text-sm text-slate-500">暂无评论，来抢沙发吧。</p>';
  }
  return comments
    .map(
      (item) => `
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
          <span>${item.username} · ${item.score ? `${item.score} 星` : "未评分"}</span>
          <span>${new Date(item.createdAt).toLocaleString()}</span>
        </div>
        <p class="whitespace-pre-line text-slate-700">${item.content}</p>
        <div class="mt-2 flex gap-2">
          <button data-like-id="${item.id}" class="comment-like rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">点赞 ${item.likeCount || 0}</button>
          <button data-reply-id="${item.id}" class="comment-reply rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">回复</button>
        </div>
        <div id="reply-box-${item.id}" class="mt-2 hidden">
          <textarea id="reply-input-${item.id}" class="input-base min-h-16" maxlength="300" placeholder="回复内容"></textarea>
          <button data-submit-reply="${item.id}" class="mt-2 rounded bg-brand-700 px-3 py-1 text-xs text-white">提交回复</button>
        </div>
        <div class="mt-2 space-y-2">
          ${(item.replies || [])
            .map(
              (r) => `
            <div class="rounded bg-slate-50 p-2 text-sm">
              <p class="text-slate-700">${r.username}：${r.content}</p>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
    )
    .join("");
};

const ratingButtons = (selected) =>
  [1, 2, 3, 4, 5]
    .map(
      (score) => `
      <button data-score="${score}" class="rate-btn rounded border px-3 py-2 text-sm ${
        score === selected
          ? "border-brand-700 bg-brand-50 text-brand-700"
          : "border-slate-300 text-slate-700 hover:bg-slate-100"
      }">
        ${score} 星
      </button>
    `
    )
    .join("");

const renderDetail = async () => {
  if (!bookId) {
    detailRoot.innerHTML = '<p class="rounded-lg bg-white p-4 text-red-500">参数错误，缺少书籍 ID。</p>';
    return;
  }

  detailRoot.innerHTML = '<p class="rounded-lg bg-white p-4 text-slate-500">加载中...</p>';

  try {
    const [book, me] = await Promise.all([
      request(`/api/books/${bookId}`),
      authStore.getToken() ? request("/api/auth/me").catch(() => null) : Promise.resolve(null)
    ]);

    let myScore = null;
    if (me) {
      const data = await request(`/api/books/${bookId}/my-rating`);
      myScore = data.score;
    }

    let personalityText = "";
    if (me) {
      const p = await request(`/api/books/${bookId}/rating-personality`);
      personalityText = `${p.label}（你的均分 ${p.userAvg} / 全站均分 ${p.globalAvg}）`;
    }

    detailRoot.innerHTML = `
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section class="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <img src="${book.coverUrl}" alt="${book.title}" class="mb-4 h-[28rem] w-full rounded-lg object-cover" onerror="this.onerror=null;this.src='/fallback-cover.svg';" />
          <h1 class="text-2xl font-bold text-slate-900">${book.title}</h1>
          <p class="mt-2 text-slate-600">作者：${book.author}</p>
          <p class="mt-1 text-slate-600">平台：<span class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-sm">${book.platform}</span></p>
          <p class="mt-4 whitespace-pre-line text-slate-700">${book.description || "暂无简介，欢迎补充"}</p>
        </section>
        <section class="space-y-4 lg:col-span-2">
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <div class="mb-3 flex items-end justify-between">
              <h2 class="text-xl font-semibold">综合评分</h2>
              <p class="text-sm text-slate-500">${book.ratingCount} 人评分</p>
            </div>
            <p class="text-5xl font-extrabold text-brand-700">${book.averageRating.toFixed(1)}</p>
            <p class="mb-4 text-sm text-slate-500">加权综合分：${book.weightedScore.toFixed(1)}</p>
            <div class="space-y-2">${renderDistribution(book.distribution)}</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="mb-3 text-lg font-semibold">我的评分</h3>
            <p class="mb-2 text-sm text-slate-500">${personalityText}</p>
            <div id="ratingBox" class="flex flex-wrap gap-2">
              ${
                me
                  ? ratingButtons(myScore)
                  : '<p class="text-sm text-slate-500">登录后可评分。</p>'
              }
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="mb-3 text-lg font-semibold">评论区</h3>
            <form id="commentForm" class="mb-4 ${
              me ? "" : "hidden"
            }">
              <textarea id="commentInput" class="input-base min-h-24" maxlength="300" placeholder="写下你的看法（最多300字）"></textarea>
              <button class="mt-2 rounded-lg bg-brand-700 px-4 py-2 text-white hover:bg-brand-600">发布评论</button>
            </form>
            <div id="commentList" class="space-y-3">${renderComments(book.comments)}</div>
          </div>
        </section>
      </div>
    `;

    const ratingBox = document.getElementById("ratingBox");
    ratingBox?.querySelectorAll(".rate-btn").forEach((btn) => {
      btn.onclick = async () => {
        const score = Number(btn.dataset.score);
        try {
          await request(`/api/books/${bookId}/ratings`, {
            method: "POST",
            body: JSON.stringify({ score })
          });
          await renderDetail();
        } catch (error) {
          alert(error.message);
        }
      };
    });

    const commentForm = document.getElementById("commentForm");
    const commentInput = document.getElementById("commentInput");
    commentForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = commentInput.value.trim();
      if (!content) return;
      try {
        await request(`/api/books/${bookId}/comments`, {
          method: "POST",
          body: JSON.stringify({ content })
        });
        commentInput.value = "";
        await renderDetail();
      } catch (error) {
        alert(error.message);
      }
    });

    detailRoot.querySelectorAll(".comment-like").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!authStore.getToken()) return alert("请先登录");
        try {
          await request(`/api/comments/${btn.dataset.likeId}/like`, { method: "POST" });
          await renderDetail();
        } catch (error) {
          alert(error.message);
        }
      });
    });

    detailRoot.querySelectorAll(".comment-reply").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!authStore.getToken()) return alert("请先登录");
        document.getElementById(`reply-box-${btn.dataset.replyId}`)?.classList.toggle("hidden");
      });
    });

    detailRoot.querySelectorAll("[data-submit-reply]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const parentId = btn.dataset.submitReply;
        const input = document.getElementById(`reply-input-${parentId}`);
        const content = input.value.trim();
        if (!content) return;
        try {
          await request(`/api/books/${bookId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content, parentId })
          });
          await renderDetail();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  } catch (error) {
    detailRoot.innerHTML = `<p class="rounded-lg bg-white p-4 text-red-500">${error.message}</p>`;
  }
};

window.onAuthChanged = () => {
  renderDetail();
};

renderDetail();
