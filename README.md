# 网文评分网站（SQLite 版）

本项目使用 SQLite 文件数据库，不需要 MongoDB、不需要 `.env`、不需要迁移命令。

## 1) 安装依赖

```bash
cd novel-rating-mvp
npm install
```

## 2) 启动项目

```bash
npm start
```

打开：`http://localhost:3000`

> 首次启动会自动在项目目录生成数据库文件：`novel-rating.db`，并自动初始化表与示例数据。

## 3) 代码结构

```text
novel-rating-mvp/
├─ server.js                         # Express + SQLite + 全部后端 API
├─ novel-rating.db                   # SQLite 数据库文件（启动后自动生成）
├─ public/
│  ├─ index.html / index.js          # 首页、筛选、分页加载更多
│  ├─ detail.html / detail.js        # 详情页、点赞、回复、评分人格
│  ├─ profile.html / profile.js      # 个人中心
│  ├─ admin.html / admin.js          # 管理后台（增改书、删评论、传封面）
│  ├─ shared.js                      # 登录状态与通用请求
│  └─ style.css
├─ uploads/                          # 上传封面图片目录（自动生成）
└─ data/                             # 仅保留旧 JSON 备份
```

## 4) 默认账号

- 用户名：`demo`
- 密码：`123456`
- 角色：`admin`（方便你零基础直接体验管理后台）

## 5) 已实现的关键能力

- 用户注册/登录（密码使用 bcrypt 算法加密）
- 首页搜索 + 平台/题材筛选 + 加载更多
- 详情页评分分布、评论、点赞、回复
- 评分人格提示（严格/中性/宽松）
- 个人中心（读过的书、评分历史、我的评论）
- 管理后台（新增/编辑书、删除评论、上传封面）
- 同一用户 24 小时内只能修改一次同一本书评分
