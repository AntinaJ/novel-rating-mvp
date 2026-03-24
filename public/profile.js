setupAuthUI();

const readBooks = document.getElementById("readBooks");
const ratingHistory = document.getElementById("ratingHistory");
const myComments = document.getElementById("myComments");

const renderList = (items, renderItem) => {
  if (!items || items.length === 0) return '<p class="text-sm text-slate-500">暂无数据。</p>';
  return items.map(renderItem).join("");
};

const loadProfile = async () => {
  if (!authStore.getToken()) {
    location.href = "/";
    return;
  }
  try {
    const data = await request(API.profileOverview);
    readBooks.innerHTML = renderList(
      data.readBooks,
      (item) => `<a class="mb-2 block rounded border p-2 hover:bg-slate-50" href="/detail.html?id=${item.id}">${item.title} · ${item.score}星</a>`
    );
    ratingHistory.innerHTML = renderList(
      data.ratingHistory,
      (item) => `<div class="mb-2 rounded border p-2">${item.book?.title || "未知书籍"} · ${item.score}星 · ${new Date(item.updatedAt).toLocaleString()}</div>`
    );
    myComments.innerHTML = renderList(
      data.myComments,
      (item) => `<div class="mb-2 rounded border p-2"><p class="text-sm text-slate-500">${item.book?.title || "未知书籍"}</p><p>${item.content}</p></div>`
    );
  } catch (error) {
    readBooks.innerHTML = `<p class="text-red-500">${error.message}</p>`;
  }
};

loadProfile();
