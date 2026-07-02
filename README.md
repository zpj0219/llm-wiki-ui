# Hermes Agent 前端

Hongtai AI Hub 的 **Hermes Agent 客户前端**：知识库浏览、原件上传、OpenWebUI 风格对话。

对接 [`hermes-data`](../hermes-data) 部署的 Hermes Agent 与共享知识库卷。

## 架构

```
┌─────────────────┐     /api/*      ┌──────────────────┐
│  React UI :3000 │ ───────────────►│  BFF FastAPI :8000│
└─────────────────┘                 └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
         knowledge-base/          Hermes Gateway :8642        SQLite (app.db)
    raw/originals · wiki/          Sessions + Chat/SSE     用户 · Token · 对话
                    │
                    ▼
         Hermes Cron 定时任务（hermes-data）
    originals → fulltext → wiki ingest → qmd
```

| 能力 | 实现 |
|------|------|
| 原件上传 | `POST /api/upload/originals` → `raw/originals/maintenance/{category}/` |
| 知识库浏览 | 读取 `hermes-data` 挂载的 `wiki/`、`raw/` 目录 |
| 对话 | OpenWebUI 兼容 `/v1/chat/completions`（模型 `hermes-agent`，BFF 管理本地会话） |
| 应用数据 | SQLite — 用户认证、Token、本地对话会话与消息 |
| 后台处理 | 由 hermes-data 中 Cron Blueprint 完成，本应用不重复实现 |

## 前置条件

1. 启动 **hermes-data** Hermes 容器（Gateway `:8642`、Dashboard `:9119`）
2. 复制并配置环境变量：

```bash
cp .env.example .env
# HERMES_API_KEY 与 hermes-data/.env 中 API_SERVER_KEY 一致
```

## 快速开始

### Docker Compose

```bash
docker compose up --build
```

- 前端：http://localhost:3000
- BFF API：http://localhost:8000/docs

### 本地开发

**1. Hermes（hermes-data）**

```bash
cd ../hermes-data
docker compose up -d
```

**2. BFF 后端**

```bash
cd backend
pip install -r requirements.txt

# Windows 默认知识库路径
set KNOWLEDGE_BASE_ROOT=C:\Docker\hermes-data\data\home\Documents\knowledge-base
set HERMES_API_KEY=与-hermes-data-API_SERVER_KEY-相同
set HERMES_GATEWAY_URL=http://localhost:8642
# 可选：DEFAULT_CHAT_MODEL=hermes-agent

uvicorn main:app --reload --port 8000
```

**3. 前端**

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

默认账号：`admin` / `admin123`

### Hermes 对话配置（OpenWebUI 同款）

1. 启动 hermes-data：`docker compose up -d`（Gateway `:8642`）
2. 复制 `.env.example` → `.env`，设置 `HERMES_API_KEY` 与 hermes-data 的 `API_SERVER_KEY` 一致
3. 前端 Chat 页选择模型（通常为 `hermes-agent`）即可流式对话

与 OpenWebUI 的差异：本应用用 BFF 管理本地 SQLite 会话，对话走 `/v1/chat/completions` 并携带完整历史消息。

## 原件上传路径

参照 `hermes-data` 中 `.wiki-schema.md`：

| 用户操作 | 写入路径 |
|----------|----------|
| 上传（默认） | `raw/originals/maintenance/{manuals\|procedures\|records\|faults}/` |
| 上传至 inbox | `raw/inbox/` |

上传后由 Hermes 定时任务自动处理：

- `ht-wiki-sync-fulltext` — 原件 → fulltext MD
- `ht-wiki-batch-ingest` — fulltext → wiki 结构化页
- `ht-wiki-qmd-index` — QMD 全文索引

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 知识库/Hermes 配置 |
| POST | `/api/upload/originals` | 上传原件（multipart） |
| GET | `/api/wiki/*` | 知识库浏览/编辑/搜索/图谱 |
| GET | `/api/chat/config` | 对话后端（hermes / unavailable） |
| POST | `/api/chat/sessions/{id}/messages/stream` | 流式对话（SSE） |

## 项目结构

```
llm-wiki-ui/
├── backend/                  # FastAPI BFF，详见 [backend/README.md](backend/README.md)
│   ├── config.py           # 知识库路径、Hermes Gateway、SQLite
│   ├── database.py         # SQLite 初始化与连接
│   ├── auth_store.py       # 用户认证与 Token
│   ├── chat_store.py       # 对话会话持久化
│   ├── knowledge_store.py  # 文件系统读写
│   ├── hermes_client.py    # Hermes Sessions/Chat 客户端
│   ├── chat_service.py     # 本地会话 + Hermes 绑定
│   └── routers/
│       ├── upload.py
│       ├── wiki.py
│       └── chat.py
└── frontend/
    └── src/
        ├── components/wiki/WikiUploadPanel.tsx
        └── services/uploadApi.ts · chatApi.ts
```

## License

MIT
