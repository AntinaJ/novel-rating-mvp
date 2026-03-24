const express = require("express");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const cors = require("cors");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = 3000;
const JWT_SECRET = "novel_rating_sqlite_secret";
const ADMIN_PANEL_PASSWORD = "admin123";
const dbPath = path.join(__dirname, "novel-rating.db");
const db = new DatabaseSync(dbPath);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nowIso = () => new Date().toISOString();
const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const weightedScoreFrom = (avg, ratingCount, commentCount, globalAvg = 0) => {
  const m = 20;
  const bayesian = ratingCount > 0 ? (ratingCount / (ratingCount + m)) * avg + (m / (ratingCount + m)) * globalAvg : globalAvg;
  const commentWeight = clamp(Math.log10(commentCount + 1) * 0.12, 0, 0.4);
  return Number(clamp(bayesian + commentWeight, 0, 5).toFixed(2));
};

const normalizeCoverUrl = (title, coverImagePath, coverUrl) => {
  if (coverImagePath) return `/uploads/${path.basename(coverImagePath)}`;
  const raw = String(coverUrl || "").trim();
  // Force local static cover for 庆余年 (no external dependency).
  if (title === "庆余年") return "/qingyinian-cover.svg";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return `/api/covers/proxy?url=${encodeURIComponent(raw)}`;
  }
  return raw || "/fallback-cover.svg";
};

const createTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      platform TEXT NOT NULL,
      genres_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT NOT NULL,
      cover_image_path TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS books_pending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      platform TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      submitter_nickname TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, book_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      parent_id INTEGER NULL,
      likes_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

const ensureColumns = () => {
  const pendingColumns = db.prepare("PRAGMA table_info(books_pending)").all().map((c) => c.name);
  if (!pendingColumns.includes("status")) {
    db.exec("ALTER TABLE books_pending ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';");
  }
  if (!pendingColumns.includes("reviewed_at")) {
    db.exec("ALTER TABLE books_pending ADD COLUMN reviewed_at TEXT NOT NULL DEFAULT '';");
  }
  const bookColumns = db.prepare("PRAGMA table_info(books)").all().map((c) => c.name);
  if (!bookColumns.includes("submitter_nickname")) {
    db.exec("ALTER TABLE books ADD COLUMN submitter_nickname TEXT NOT NULL DEFAULT '';");
  }
};

const seedData = () => {
  const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync("123456", 10);
    db.prepare(
      "INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, ?, ?)"
    ).run("demo", passwordHash, "admin", nowIso());
  }

  const bookCount = db.prepare("SELECT COUNT(*) as c FROM books").get().c;
  if (bookCount === 0) {
    const books = [
      ["诡秘之主", "爱潜水的乌贼", "起点", JSON.stringify(["玄幻", "悬疑"]), "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80", "蒸汽与机械并存的世界，少年在命运洪流中追寻真相。"],
      ["将进酒", "唐酒卿", "晋江", JSON.stringify(["言情"]), "https://images.unsplash.com/photo-1495640388908-05fa85288e61?auto=format&fit=crop&w=400&q=80", "乱世风云中，权谋与情感交织，少年将军一步步走向巅峰。"],
      ["我在废土世界扫垃圾", "有花在野", "番茄", JSON.stringify(["科幻"]), "https://images.unsplash.com/photo-1524578271613-d550eacf6090?auto=format&fit=crop&w=400&q=80", "灾变之后的废土世界，普通人也能在微光中寻找意义。"],
      ["庆余年", "猫腻", "起点", JSON.stringify(["玄幻"]), "/qingyinian-cover.svg", "少年身世神秘，在庙堂与江湖之间书写传奇。"],
      ["天官赐福", "墨香铜臭", "晋江", JSON.stringify(["言情"]), "https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=400&q=80", "神官与鬼王历经千年纠葛，守护心中最珍贵之人。"]
    ];
    const stmt = db.prepare(
      "INSERT INTO books(title, author, platform, genres_json, cover_url, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    books.forEach((b) => stmt.run(...b, nowIso(), nowIso()));
  }
  db.prepare(
    `UPDATE books
     SET cover_url = '/qingyinian-cover.svg', updated_at = ?
     WHERE title = '庆余年'
       AND (cover_image_path = '' OR cover_image_path IS NULL)`
  ).run(nowIso());
};

const auth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "请先登录。" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(payload.userId);
    if (!user) return res.status(401).json({ message: "登录状态已失效。" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "登录状态已失效。" });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "需要管理员权限。" });
  next();
};

const adminPanelAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "请先登录管理员后台。" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload || payload.type !== "admin-panel") {
      return res.status(401).json({ message: "管理员登录状态已失效。" });
    }
    next();
  } catch {
    res.status(401).json({ message: "管理员登录状态已失效。" });
  }
};

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.get("/api/covers/proxy", async (req, res) => {
  try {
    const source = String(req.query.url || "").trim();
    if (!source) return res.status(400).json({ message: "缺少封面链接。" });
    let parsed = null;
    try {
      parsed = new URL(source);
    } catch {
      return res.status(400).json({ message: "封面链接格式不合法。" });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "仅支持 http/https 图片链接。" });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*,*/*;q=0.8"
      }
    });
    clearTimeout(timer);
    if (!response.ok) return res.status(502).sendFile(path.join(__dirname, "public", "fallback-cover.svg"));
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ message: "链接不是图片资源，请粘贴图片直链。" });
    }
    const arrayBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(arrayBuffer));
  } catch {
    res.status(502).sendFile(path.join(__dirname, "public", "fallback-cover.svg"));
  }
});

app.post("/api/auth/register", (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();
    if (!username || !password) return res.status(400).json({ message: "用户名和密码不能为空。" });
    if (username.length < 3) return res.status(400).json({ message: "用户名至少 3 个字符。" });
    if (password.length < 6) return res.status(400).json({ message: "密码至少 6 位。" });
    const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (exists) return res.status(409).json({ message: "用户名已存在。" });
    const passwordHash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO users(username, password_hash, role, created_at) VALUES (?, ?, 'user', ?)")
      .run(username, passwordHash, nowIso());
    res.status(201).json({ message: "注册成功，请登录。" });
  } catch {
    res.status(500).json({ message: "注册失败，请稍后重试。" });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "").trim();
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ message: "用户名或密码错误。" });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch {
    res.status(500).json({ message: "登录失败，请稍后重试。" });
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PANEL_PASSWORD) {
    return res.status(401).json({ message: "管理员密码错误。" });
  }
  const token = jwt.sign({ type: "admin-panel" }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

app.get("/api/books", (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = clamp(Number(req.query.pageSize) || 9, 1, 30);
    const q = String(req.query.q || "").trim();
    const platform = String(req.query.platform || "").trim();
    const genre = String(req.query.genre || "").trim();

    const params = [];
    const where = [];
    if (q) {
      where.push("(title LIKE ? OR author LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (platform) {
      where.push("platform = ?");
      params.push(platform);
    }
    if (genre) {
      where.push("genres_json LIKE ?");
      params.push(`%${genre}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) as c FROM books ${whereSql}`).get(...params).c;
    const rows = db
      .prepare(`SELECT * FROM books ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);

    const globalAvg = db.prepare("SELECT AVG(score) as avg FROM ratings").get().avg || 0;
    const data = rows.map((book) => {
      const r = db.prepare("SELECT AVG(score) as avg, COUNT(*) as c FROM ratings WHERE book_id = ?").get(book.id);
      const c = db.prepare("SELECT COUNT(*) as c FROM comments WHERE book_id = ? AND status = 'normal'").get(book.id).c;
      const avg = Number((r.avg || 0).toFixed(2));
      const ratingCount = r.c || 0;
      return {
        id: book.id,
        title: book.title,
        author: book.author,
        platform: book.platform,
        genres: parseJson(book.genres_json, []),
        coverUrl: normalizeCoverUrl(book.title, book.cover_image_path, book.cover_url),
        description: book.description,
        averageRating: avg,
        weightedScore: weightedScoreFrom(avg, ratingCount, c, globalAvg),
        ratingCount,
        shortCommentCount: c
      };
    }).sort((a, b) => b.weightedScore - a.weightedScore || b.shortCommentCount - a.shortCommentCount);

    res.json({ data, page, pageSize, total, hasMore: page * pageSize < total });
  } catch {
    res.status(500).json({ message: "获取书籍列表失败。" });
  }
});

app.get("/api/books/:id", (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId);
    if (!book) return res.status(404).json({ message: "书籍不存在。" });

    const ratings = db.prepare("SELECT score FROM ratings WHERE book_id = ?").all(bookId);
    const allComments = db
      .prepare(
        `SELECT c.*, u.username
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.book_id = ? AND c.status = 'normal'
         ORDER BY c.created_at DESC`
      )
      .all(bookId);
    const globalAvg = db.prepare("SELECT AVG(score) as avg FROM ratings").get().avg || 0;
    const avg = ratings.length ? ratings.reduce((s, item) => s + item.score, 0) / ratings.length : 0;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach((r) => {
      dist[r.score] += 1;
    });

    const roots = allComments.filter((c) => !c.parent_id);
    const replies = allComments.filter((c) => c.parent_id);
    const replyMap = new Map();
    replies.forEach((item) => {
      const key = String(item.parent_id);
      if (!replyMap.has(key)) replyMap.set(key, []);
      replyMap.get(key).push({
        id: item.id,
        content: item.content,
        username: item.username,
        likeCount: parseJson(item.likes_json, []).length,
        liked: false,
        createdAt: item.created_at
      });
    });

    res.json({
      id: book.id,
      title: book.title,
      author: book.author,
      platform: book.platform,
      genres: parseJson(book.genres_json, []),
      coverUrl: normalizeCoverUrl(book.title, book.cover_image_path, book.cover_url),
      description: book.description,
      averageRating: Number(avg.toFixed(2)),
      weightedScore: weightedScoreFrom(avg, ratings.length, allComments.length, globalAvg),
      ratingCount: ratings.length,
      shortCommentCount: allComments.length,
      distribution: [1, 2, 3, 4, 5].map((score) => ({
        score,
        count: dist[score],
        percent: ratings.length ? Number(((dist[score] / ratings.length) * 100).toFixed(1)) : 0
      })),
      comments: roots.map((c) => ({
        score: db.prepare("SELECT score FROM ratings WHERE user_id = ? AND book_id = ?").get(c.user_id, bookId)?.score || null,
        id: c.id,
        content: c.content,
        username: c.username,
        likeCount: parseJson(c.likes_json, []).length,
        liked: false,
        createdAt: c.created_at,
        replies: replyMap.get(String(c.id)) || []
      }))
    });
  } catch {
    res.status(500).json({ message: "获取书籍详情失败。" });
  }
});

app.get("/api/books/:id/my-rating", auth, (req, res) => {
  const item = db.prepare("SELECT score FROM ratings WHERE user_id = ? AND book_id = ?").get(req.user.id, Number(req.params.id));
  res.json({ score: item ? item.score : null });
});

app.get("/api/books/:id/rating-personality", auth, (req, res) => {
  const userAgg = db.prepare("SELECT AVG(score) as avg, COUNT(*) as c FROM ratings WHERE user_id = ?").get(req.user.id);
  const globalAgg = db.prepare("SELECT AVG(score) as avg FROM ratings").get();
  const userAvg = Number(userAgg.avg || 0);
  const globalAvg = Number(globalAgg.avg || 0);
  let label = "中性型评分者";
  if (userAgg.c > 0 && userAvg <= globalAvg - 0.4) label = "严格型评分者";
  if (userAgg.c > 0 && userAvg >= globalAvg + 0.4) label = "宽松型评分者";
  res.json({ label, userAvg: Number(userAvg.toFixed(2)), globalAvg: Number(globalAvg.toFixed(2)), sampleSize: userAgg.c || 0 });
});

app.post("/api/books/:id/ratings", auth, (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const score = Number(req.body.score);
    if (![1, 2, 3, 4, 5].includes(score)) return res.status(400).json({ message: "评分必须是 1 到 5 的整数。" });
    const book = db.prepare("SELECT id FROM books WHERE id = ?").get(bookId);
    if (!book) return res.status(404).json({ message: "书籍不存在。" });
    const existing = db.prepare("SELECT * FROM ratings WHERE user_id = ? AND book_id = ?").get(req.user.id, bookId);
    if (existing) {
      const limit = new Date(existing.updated_at).getTime() + 24 * 60 * 60 * 1000;
      if (Date.now() < limit) {
        const remain = Math.ceil((limit - Date.now()) / (60 * 1000));
        return res.status(429).json({ message: `24小时内只能修改一次同一本书评分，还需等待约 ${remain} 分钟。` });
      }
      db.prepare("UPDATE ratings SET score = ?, updated_at = ? WHERE id = ?").run(score, nowIso(), existing.id);
    } else {
      db.prepare("INSERT INTO ratings(user_id, book_id, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(req.user.id, bookId, score, nowIso(), nowIso());
    }
    res.json({ message: "评分提交成功。" });
  } catch {
    res.status(500).json({ message: "评分提交失败。" });
  }
});

app.post("/api/books/:id/comments", auth, (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const content = String(req.body.content || "").trim();
    const parentId = req.body.parentId ? Number(req.body.parentId) : null;
    if (!content) return res.status(400).json({ message: "评论内容不能为空。" });
    if (content.length > 300) return res.status(400).json({ message: "评论内容不能超过 300 字。" });
    const book = db.prepare("SELECT id FROM books WHERE id = ?").get(bookId);
    if (!book) return res.status(404).json({ message: "书籍不存在。" });
    if (parentId) {
      const parent = db.prepare("SELECT id, book_id FROM comments WHERE id = ?").get(parentId);
      if (!parent || parent.book_id !== bookId) return res.status(400).json({ message: "回复目标不存在。" });
    }
    db.prepare(
      "INSERT INTO comments(book_id, user_id, content, parent_id, likes_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, '[]', 'normal', ?, ?)"
    ).run(bookId, req.user.id, content, parentId, nowIso(), nowIso());
    res.status(201).json({ message: parentId ? "回复成功。" : "评论发布成功。" });
  } catch {
    res.status(500).json({ message: "评论发布失败。" });
  }
});

app.post("/api/books/pending", (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const author = String(req.body.author || "").trim();
    const platform = String(req.body.platform || "").trim();
    const description = String(req.body.description || "").trim();
    const coverUrl = String(req.body.coverUrl || "").trim();
    const submitterNickname = String(req.body.submitterNickname || "").trim();
    const validPlatforms = ["起点", "晋江", "长佩", "番茄", "其他"];
    if (!title || !author) return res.status(400).json({ message: "书名和作者为必填项。" });
    if (!validPlatforms.includes(platform)) return res.status(400).json({ message: "平台来源不合法。" });
    db.prepare(
      `INSERT INTO books_pending(title, author, platform, description, cover_url, submitter_nickname, status, reviewed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?)`
    ).run(title, author, platform, description, coverUrl, submitterNickname, nowIso());
    res.status(201).json({ message: "投稿成功，等待管理员审核。" });
  } catch {
    res.status(500).json({ message: "投稿失败，请稍后重试。" });
  }
});

app.get("/api/books/pending/my-submissions", (req, res) => {
  try {
    const nickname = String(req.query.nickname || "").trim();
    const limit = clamp(Number(req.query.limit) || 10, 1, 50);
    if (!nickname) return res.status(400).json({ message: "请提供提交人昵称。" });
    const rows = db
      .prepare(
        `SELECT id, title, author, platform, status, created_at, reviewed_at
         FROM books_pending
         WHERE submitter_nickname = ?
         ORDER BY id DESC
         LIMIT ?`
      )
      .all(nickname, limit)
      .map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        platform: row.platform,
        status: row.status,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at || ""
      }));
    res.json({ data: rows });
  } catch {
    res.status(500).json({ message: "查询投稿记录失败。" });
  }
});

app.post("/api/comments/:id/like", auth, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare("SELECT * FROM comments WHERE id = ? AND status = 'normal'").get(id);
  if (!comment) return res.status(404).json({ message: "评论不存在。" });
  const likes = parseJson(comment.likes_json, []);
  const idx = likes.indexOf(req.user.id);
  if (idx >= 0) likes.splice(idx, 1);
  else likes.push(req.user.id);
  db.prepare("UPDATE comments SET likes_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(likes), nowIso(), id);
  res.json({ liked: idx < 0, likeCount: likes.length });
});

app.get("/api/profile/overview", auth, (req, res) => {
  const ratings = db
    .prepare(
      `SELECT r.id, r.score, r.updated_at, b.id as book_id, b.title as book_title
       FROM ratings r JOIN books b ON b.id = r.book_id
       WHERE r.user_id = ?
       ORDER BY r.updated_at DESC`
    )
    .all(req.user.id);
  const comments = db
    .prepare(
      `SELECT c.id, c.content, c.created_at, b.id as book_id, b.title as book_title
       FROM comments c JOIN books b ON b.id = c.book_id
       WHERE c.user_id = ? AND c.status = 'normal'
       ORDER BY c.created_at DESC`
    )
    .all(req.user.id);
  const readBooksMap = new Map();
  ratings.forEach((item) => {
    if (!readBooksMap.has(item.book_id)) {
      readBooksMap.set(item.book_id, { id: item.book_id, title: item.book_title, score: item.score, updatedAt: item.updated_at });
    }
  });
  res.json({
    readBooks: Array.from(readBooksMap.values()),
    ratingHistory: ratings.map((item) => ({
      id: item.id,
      score: item.score,
      updatedAt: item.updated_at,
      book: { id: item.book_id, title: item.book_title }
    })),
    myComments: comments.map((item) => ({
      id: item.id,
      content: item.content,
      createdAt: item.created_at,
      book: { id: item.book_id, title: item.book_title }
    }))
  });
});

app.post("/api/admin/books", auth, adminOnly, (req, res) => {
  const { title, author, platform, genres, coverUrl, description } = req.body;
  if (!title || !author || !platform) return res.status(400).json({ message: "title/author/platform 为必填。" });
  const info = db.prepare(
    "INSERT INTO books(title, author, platform, genres_json, cover_url, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    title,
    author,
    platform,
    JSON.stringify(Array.isArray(genres) ? genres : []),
    coverUrl || "",
    description || "",
    nowIso(),
    nowIso()
  );
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/admin/books/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const book = db.prepare("SELECT id FROM books WHERE id = ?").get(id);
  if (!book) return res.status(404).json({ message: "书籍不存在。" });
  const payload = {
    title: req.body.title,
    author: req.body.author,
    platform: req.body.platform,
    cover_url: req.body.coverUrl,
    description: req.body.description,
    genres_json: req.body.genres ? JSON.stringify(Array.isArray(req.body.genres) ? req.body.genres : []) : undefined
  };
  const current = db.prepare("SELECT * FROM books WHERE id = ?").get(id);
  db.prepare(
    "UPDATE books SET title = ?, author = ?, platform = ?, genres_json = ?, cover_url = ?, description = ?, updated_at = ? WHERE id = ?"
  ).run(
    payload.title ?? current.title,
    payload.author ?? current.author,
    payload.platform ?? current.platform,
    payload.genres_json ?? current.genres_json,
    payload.cover_url ?? current.cover_url,
    payload.description ?? current.description,
    nowIso(),
    id
  );
  res.json({ message: "更新成功。" });
});

app.post("/api/admin/books/:id/cover", auth, adminOnly, upload.single("cover"), (req, res) => {
  const id = Number(req.params.id);
  const book = db.prepare("SELECT id FROM books WHERE id = ?").get(id);
  if (!book) return res.status(404).json({ message: "书籍不存在。" });
  if (!req.file) return res.status(400).json({ message: "缺少文件。" });
  db.prepare("UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?")
    .run(req.file.path, nowIso(), id);
  res.json({ coverUrl: `/uploads/${path.basename(req.file.path)}` });
});

app.get("/api/admin/library-books", adminPanelAuth, (req, res) => {
  const keyword = String(req.query.q || "").trim();
  const limit = clamp(Number(req.query.limit) || 20, 1, 100);
  const where = keyword ? "WHERE title LIKE ? OR author LIKE ?" : "";
  const rows = keyword
    ? db.prepare(
      `SELECT id, title, author, platform, cover_url, cover_image_path, updated_at
       FROM books ${where}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`
    ).all(`%${keyword}%`, `%${keyword}%`, limit)
    : db.prepare(
      `SELECT id, title, author, platform, cover_url, cover_image_path, updated_at
       FROM books
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`
    ).all(limit);
  res.json({
    data: rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      platform: row.platform,
      coverUrl: normalizeCoverUrl(row.title, row.cover_image_path, row.cover_url),
      hasCustomCover: Boolean(row.cover_image_path),
      updatedAt: row.updated_at
    }))
  });
});

app.post("/api/admin/library-books/:id/cover", adminPanelAuth, upload.single("cover"), (req, res) => {
  const id = Number(req.params.id);
  const book = db.prepare("SELECT id, title, cover_url FROM books WHERE id = ?").get(id);
  if (!book) return res.status(404).json({ message: "书籍不存在。" });
  if (!req.file) return res.status(400).json({ message: "缺少文件。" });
  db.prepare("UPDATE books SET cover_image_path = ?, updated_at = ? WHERE id = ?")
    .run(req.file.path, nowIso(), id);
  res.json({
    message: `《${book.title}》封面已更新。`,
    coverUrl: `/uploads/${path.basename(req.file.path)}`
  });
});

app.get("/api/admin/pending-books", adminPanelAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM books_pending WHERE status = 'pending' ORDER BY id DESC")
    .all()
    .map((item) => ({
      id: item.id,
      title: item.title,
      author: item.author,
      platform: item.platform,
      description: item.description,
      coverUrl: item.cover_url,
      submitterNickname: item.submitter_nickname,
      createdAt: item.created_at
    }));
  res.json({ data: rows });
});

app.post("/api/admin/pending-books/:id/approve", adminPanelAuth, (req, res) => {
  const id = Number(req.params.id);
  const pending = db.prepare("SELECT * FROM books_pending WHERE id = ?").get(id);
  if (!pending) return res.status(404).json({ message: "待审核记录不存在。" });
  if (pending.status !== "pending") return res.status(400).json({ message: "该投稿已审核，请刷新列表。" });
  db.prepare(
    "INSERT INTO books(title, author, platform, genres_json, cover_url, cover_image_path, description, submitter_nickname, created_at, updated_at) VALUES (?, ?, ?, '[]', ?, '', ?, ?, ?, ?)"
  ).run(
    pending.title,
    pending.author,
    pending.platform,
    pending.cover_url,
    pending.description,
    pending.submitter_nickname,
    nowIso(),
    nowIso()
  );
  db.prepare("UPDATE books_pending SET status = 'approved', reviewed_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ message: "已通过，已加入正式书库。" });
});

app.delete("/api/admin/pending-books/:id", adminPanelAuth, (req, res) => {
  const id = Number(req.params.id);
  const pending = db.prepare("SELECT id, status FROM books_pending WHERE id = ?").get(id);
  if (!pending) return res.status(404).json({ message: "待审核记录不存在。" });
  if (pending.status !== "pending") return res.status(400).json({ message: "该投稿已审核，请刷新列表。" });
  db.prepare("UPDATE books_pending SET status = 'rejected', reviewed_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ message: "已拒绝并删除该投稿。" });
});

app.delete("/api/admin/comments/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare("SELECT id FROM comments WHERE id = ?").get(id);
  if (!comment) return res.status(404).json({ message: "评论不存在。" });
  db.prepare("UPDATE comments SET status = 'deleted', updated_at = ? WHERE id = ?").run(nowIso(), id);
  res.json({ message: "评论已删除。" });
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

createTables();
ensureColumns();
seedData();
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`SQLite DB file: ${dbPath}`);
});
