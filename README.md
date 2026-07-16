# LLM-Wiki UI

当前版本：**v1.0.0**

LLM-Wiki UI 是 Hongtai AI Hub 的知识库与 AI 对话前端。项目采用 React、FastAPI、nginx 和 SQLite，连接 `hermes-data` 提供的 Hermes Gateway，并与 Hermes 共用同一套 `knowledge-base` 目录。

项目面向内网部署，主要提供知识库工作台、原件管理、关系图、知识概况、流式对话、对话结晶和本地用户管理能力。

## 核心能力

| 模块 | 能力 |
|------|------|
| 知识库工作台 | 浏览实体、主题、摘要和结晶文件；Markdown 预览、编辑、反向链接和局部关系图 |
| 文件管理 | 上传原始资料、保留目录结构、查看处理阶段、文本预览、下载和删除 |
| 关系图 | 二维力导向图、生长动画、搜索过滤、局部图、节点拖拽、自动缩放和移动端手势 |
| 知识概况 | 文件与 Wiki 数量统计、处理管线进度、分类分布和重复文件检查 |
| AI 对话 | Hermes 模型列表、SSE 流式输出、会话持久化、停止生成和回复耗时记录 |
| 对话结晶 | 二次确认、重复检测、强制提交，通过 BFF 代理 Hermes Webhook 异步写入知识库 |
| 用户与权限 | 本地账号、管理员、知识库子模块权限、对话与设置权限；可选 Odoo SSO 模式 |
| 响应式界面 | 桌面端侧栏布局，以及面向手机和平板的文件树、对话、概况和关系图交互 |

## 系统架构

```text
浏览器 :3000 / :5173
        │
        │ /api/*
        ▼
nginx + React ─────► FastAPI BFF :8000
                         │
            ┌────────────┼───────────────┐
            │            │               │
            ▼            ▼               ▼
 knowledge-base     Hermes Gateway    SQLite app.db
 raw / wiki         :8642 Chat/SSE     用户/Token/对话
            │
            └──── Hermes Webhook :8644（对话结晶）

hermes-data Cron：originals → fulltext → wiki → QMD 索引
```

前端不会直接调用 Hermes：

- 对话请求由 FastAPI BFF 转发到 Hermes Gateway `:8642`。
- 结晶请求由 FastAPI BFF 签名后转发到 Hermes Webhook `:8644`。
- 知识库文件由本项目和 `hermes-data` 通过共享目录共同访问。

## 目录要求

推荐将两个项目并列放置：

```text
hermes/
├── hermes-data/
│   └── data/home/Documents/knowledge-base/
└── llm-wiki-ui/
```

`llm-wiki-ui` 依赖：

1. `hermes-data` 已启动，Hermes Gateway 监听 `8642`。
2. 结晶功能启用时，Hermes Webhook 监听 `8644`。
3. 两个项目使用相同的知识库目录。
4. `HERMES_API_KEY` 与 `hermes-data/.env` 中的 `API_SERVER_KEY` 一致。
5. `HERMES_WEBHOOK_SECRET` 与 Hermes `crystallize` Webhook 路由密钥一致。

## Docker 快速部署

### 1. 配置环境变量

```bash
cp .env.example .env
```

至少确认以下配置：

```env
HERMES_API_KEY=与-hermes-data-API_SERVER_KEY-一致
HERMES_KB_PATH=../hermes-data/data/home/Documents/knowledge-base

# 使用结晶功能时配置
HERMES_WEBHOOK_SECRET=与-Hermes-crystallize-路由一致
```

### 2. 启动 Hermes

```bash
cd ../hermes-data
docker compose up -d
curl http://localhost:8642/health
```

### 3. 启动本项目

```bash
cd ../llm-wiki-ui
docker compose up -d --build
docker compose ps
```

访问地址：

| 服务 | 地址 |
|------|------|
| Web UI | http://localhost:3000 |
| 健康检查 | http://localhost:3000/api/health |
| API 文档 | http://localhost:3000/api/docs |

首次启动会创建本地 SQLite 数据库。默认账号：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `admin123` |
| 普通用户 | `user` | `user123` |

部署后应及时修改默认密码。

完整生产、离线和升级说明见 [deploy.md](deploy.md)。

## 本地开发

要求：Node.js 20+、Python 3.12+，并已启动 `hermes-data`。

### 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export KNOWLEDGE_BASE_ROOT=../../hermes-data/data/home/Documents/knowledge-base
export HERMES_GATEWAY_URL=http://localhost:8642
export HERMES_API_KEY=与-hermes-data-API_SERVER_KEY-一致
export HERMES_WEBHOOK_URL=http://localhost:8644
export HERMES_WEBHOOK_SECRET=与-Hermes-crystallize-路由一致

uvicorn main:app --reload --port 8000
```

Windows PowerShell 使用 `$env:变量名="值"` 设置环境变量。

### 前端

```bash
cd frontend
npm ci
npm run dev
```

开发地址为 http://localhost:5173。Vite 会将 `/api` 代理到 `http://localhost:8000`。

前端不提供运行时 API 地址切换功能。默认请求同源 `/api`；特殊部署可在构建时设置 `VITE_API_BASE`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HERMES_API_KEY` | 空 | Hermes Gateway Bearer Token，与 `API_SERVER_KEY` 一致 |
| `HERMES_GATEWAY_URL` | `http://localhost:8642` | 本地开发访问 Hermes Gateway 的地址 |
| `USE_HERMES_CHAT` | `auto` | `auto`、`true` 或 `false` |
| `DEFAULT_CHAT_MODEL` | `hermes-agent` | 默认逻辑模型 ID |
| `KNOWLEDGE_BASE_ROOT` | 自动推导 | 后端直接访问的知识库路径，本地开发使用 |
| `HERMES_KB_PATH` | 相邻 `hermes-data` 路径 | Docker 挂载到容器的宿主机知识库路径 |
| `DATABASE_PATH` | `backend/data/app.db` | 本地开发 SQLite 路径；Docker 中由 Compose 固定配置 |
| `HERMES_WEBHOOK_URL` | 从 Gateway 主机推导 `:8644` | 结晶 Webhook 服务地址 |
| `HERMES_WEBHOOK_SECRET` | 空 | 结晶 HMAC 密钥；为空时前端禁用结晶提交 |
| `HERMES_WEBHOOK_ROUTE` | `crystallize` | 结晶 Webhook 路由名 |
| `USER_MANAGEMENT_MODE` | `local` | `local` 或 `odoo` |
| `ODOO_SSO_JWT_SECRET` | 空 | Odoo SSO JWT 共享密钥 |
| `APP_PORT` | `3000` | Docker 对外端口 |

## 知识库目录

```text
knowledge-base/
├── raw/
│   ├── inbox/
│   ├── originals/maintenance/
│   │   ├── manuals/
│   │   ├── procedures/
│   │   ├── records/
│   │   └── faults/
│   └── fulltext/maintenance/
└── wiki/
    ├── entities/
    ├── topics/
    ├── sources/
    └── synthesis/sessions/
```

- 原件上传后由 Hermes 定时任务生成全文和 Wiki 页面。
- 文件内容使用 MD5 清单进行精确重复检查。
- 对话结晶的主题不参与重复判断，重复检测基于规范化后的提交正文。
- Wiki 同名标题按 `entities → topics → sources → 其他` 的固定优先级解析。

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 应用健康检查与运行配置摘要 |
| `POST` | `/api/auth/login` | 本地账号登录 |
| `POST` | `/api/auth/refresh` | 刷新访问令牌 |
| `GET` | `/api/wiki/entries` | 获取知识库文件树 |
| `GET` | `/api/wiki/graph` | 获取关系图节点和边 |
| `POST` | `/api/upload/originals` | 上传原始文件 |
| `GET` | `/api/chat/models` | 获取 Hermes 模型列表 |
| `POST` | `/api/chat/sessions/{id}/messages/stream` | SSE 流式对话 |
| `POST` | `/api/chat/sessions/{id}/stop` | 停止生成 |
| `POST` | `/api/chat/crystallize/lookup` | 查询对话是否已结晶 |
| `POST` | `/api/chat/crystallize` | 经 BFF 提交结晶任务 |

完整接口可在运行后访问 `/api/docs`。

## 项目结构

```text
llm-wiki-ui/
├── backend/                 # FastAPI BFF
├── frontend/                # React + TypeScript
├── deploy/                  # nginx 与容器启动脚本
├── data/                    # Docker 运行时 SQLite，Git 忽略
├── Dockerfile               # 前端构建 + Python/nginx 单镜像
├── docker-compose.yml       # 生产部署编排
├── deploy.md                # 部署指南
├── CHANGELOG.md             # 版本功能说明
└── RELEASE.md               # 发版检查清单
```

## 文档索引

- [生产、离线与升级部署](deploy.md)
- [后端模块说明](backend/README.md)
- [前端模块说明](frontend/README.md)
- [移动端适配说明](mob.md)
- [v1.0.0 功能说明](CHANGELOG.md)
- [打 Tag 前检查清单](RELEASE.md)

## 发布版本

当前正式版本为 `v1.0.0`。版本号同时维护在：

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/shared/constants.ts`
- `backend/main.py`
- `CHANGELOG.md`

请先完成 [RELEASE.md](RELEASE.md) 中的检查，再创建 Git Tag。
