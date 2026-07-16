# LLM-Wiki UI 后端

版本：**1.0.0**

后端是 FastAPI BFF（Backend For Frontend），负责用户认证、权限、知识库文件访问、上传、Wiki 索引、Hermes 对话代理、SSE 流式消息和对话结晶代理。

浏览器只访问 `/api/*`，不会直接持有 Hermes Gateway Token 或结晶 Webhook Secret。

## 目录结构

```text
backend/
├── main.py                 # FastAPI 入口、初始化和健康检查
├── config.py               # 环境变量
├── database.py             # SQLite 表结构、迁移和种子账号
├── auth_store.py           # 登录、Token、用户和权限
├── odoo_auth.py            # 可选 Odoo JWT SSO
├── chat_store.py           # 对话会话和消息持久化
├── chat_service.py         # 会话业务、Hermes 调用和 SSE 收尾
├── crystallize_store.py    # 结晶提交记录与重复检查
├── hermes_client.py        # Gateway、模型、SSE 和 Webhook 客户端
├── knowledge_store.py      # 知识库文件、上传清单、统计和状态
├── wiki_index.py           # Wikilink、反向链接、搜索和关系图索引
├── routers/
│   ├── auth.py
│   ├── chat.py
│   ├── upload.py
│   └── wiki.py
└── requirements.txt
```

`backend/data/` 是本地开发运行时目录，已被 Git 忽略。

## 启动流程

导入 `main.py` 时依次执行：

1. 创建知识库标准目录。
2. 初始化或迁移 SQLite 表结构。
3. 首次运行写入默认账号和权限。
4. 扫描 `raw/originals/`，同步上传 MD5 清单并移除失效记录。
5. 注册认证、对话、知识库和上传路由。

## 本地运行

```bash
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

API 文档：http://localhost:8000/api/docs

## 配置项

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `KNOWLEDGE_BASE_ROOT` | 自动推导到相邻 `hermes-data` | 知识库根目录 |
| `DATABASE_PATH` | `backend/data/app.db` | 用户、Token、对话和结晶记录数据库 |
| `HERMES_GATEWAY_URL` | `http://localhost:8642` | Hermes Gateway |
| `HERMES_API_KEY` | 空 | Gateway Bearer Token |
| `USE_HERMES_CHAT` | `auto` | `auto`、`true` 或 `false` |
| `DEFAULT_CHAT_MODEL` | `hermes-agent` | 默认逻辑模型 |
| `HERMES_WEBHOOK_URL` | Gateway 同主机的 `8644` | Hermes Webhook 地址 |
| `HERMES_WEBHOOK_SECRET` | 空 | 结晶 HMAC Secret |
| `HERMES_WEBHOOK_ROUTE` | `crystallize` | 结晶路由 |
| `USER_MANAGEMENT_MODE` | `local` | `local` 或 `odoo` |
| `ODOO_SSO_JWT_SECRET` | 空 | Odoo JWT 共享密钥 |

## SQLite 数据

| 表 | 内容 |
|----|------|
| `users` | 用户、密码哈希、账号来源和管理员标记 |
| `auth_tokens` | Access/Refresh Token、有效期和 `token_version` |
| `user_permissions` | 工作台、文件管理、关系图、概况、对话、设置和用户管理权限 |
| `chat_sessions` | 用户会话、模型、创建和更新时间 |
| `chat_messages` | 消息正文、角色、顺序、时间和回复耗时 |
| `crystallize_submissions` | 结晶消息 ID、正文指纹、主题、交付 ID 和提交时间 |

默认账号：

- 管理员：`admin` / `admin123`
- 普通用户：`user` / `user123`

数据库文件是运行时数据，不进入 Git。生产环境通过 `./data:/var/lib/llm-wiki-ui` 持久化。

## 认证与权限

### 本地模式

- 用户名和密码登录。
- 管理员可以创建、修改和删除普通用户。
- 管理员拥有全部模块权限。
- 修改用户密码或权限时递增 `token_version`，使旧 Token 失效。
- 当前产品只维护一个管理员，普通用户不支持赋予用户管理权限。

### Odoo 模式

- `USER_MANAGEMENT_MODE=odoo` 时启用 Odoo 入口行为。
- `/api/auth/odoo/callback` 验证 HS256 JWT，根据 `external_id` 查找或创建用户。
- Odoo 普通用户不能使用本地密码登录。
- 管理员账号仍可登录并查看用户列表。

## 对话链路

### 会话隔离

本地每个会话使用独立 Hermes Session Key：

```text
agent:main:webui:user:{user_id}:session:{session_id}
```

同一用户的新对话不会复用其他本地会话的 Hermes 上下文。

### SSE 流程

```text
收到用户消息
  → 写入用户消息和 assistant 占位符
  → 调用 Hermes /v1/chat/completions（stream=true）
  → 转发 started / step / delta
  → 每累计约 80 个 delta 片段更新 SQLite
  → 完成、停止、错误或断连时统一写入最终正文和 reply_duration_ms
  → 发送 done 或 stopped 最终会话
```

Hermes 返回错误时，后端先完成数据库收尾，再发送 `error` 和最终 `stopped` 事件，避免前端显示内容与历史记录不一致。

## 对话结晶

调用链：

```text
浏览器
  → POST /api/chat/crystallize
  → FastAPI 校验重复并生成 HMAC 请求
  → POST {HERMES_WEBHOOK_URL}/webhooks/{route}
  → Hermes 返回 202，Agent 异步写入知识库
```

关键规则：

- HMAC Secret 仅存在于后端环境变量，不返回给浏览器。
- 优先按同一 `message_id` 判断重复，再按规范化正文指纹判断。
- `topic` 不参与正文指纹计算。
- 正文指纹使用 MD5，定位为内网非对抗场景的精确重复检查，不作为加密或安全签名。
- 前端可以明确选择强制再次提交。

## 知识库与上传

### 上传目录

允许写入：

- `raw/originals/`
- `raw/originals/maintenance/manuals/`
- `raw/originals/maintenance/procedures/`
- `raw/originals/maintenance/records/`
- `raw/originals/maintenance/faults/`
- `raw/inbox/`

目标目录必须是 `raw/originals` 本身或其真实子目录，字符串伪前缀不会被接受。

### 上传清单

知识库根目录中的 `.upload_manifest.db` 保存原件路径、MD5、大小和上传时间。

- 上传前按 MD5 检查重复内容。
- 启动时补录外部直接放入的原件。
- 启动时删除文件已不存在的清单记录。
- 查重时会继续寻找同 MD5 的其他真实文件，不会被失效记录阻塞。

### 处理阶段

| 阶段 | 判断依据 |
|------|----------|
| `uploaded` | 原件位于 `raw/originals/` |
| `fulltext` | 对应 `raw/fulltext/maintenance/{category}/{stem}.md` 存在 |
| `wiki` | Wiki 页面通过来源字段、路径或文件名引用原件 |

## Wiki 索引

`wiki_index.py` 扫描 `wiki/**/*.md` 并构建：

- 页面内容与标题索引。
- Wikilink 出链与反向链接。
- 搜索数据。
- 关系图节点和边。
- 原件到 Wiki 页面的倒排引用。

同名文件名或 frontmatter 标题按以下顺序稳定解析：

1. `wiki/entities/`
2. `wiki/topics/`
3. `wiki/sources/`
4. 其他 Wiki 路径

完整路径链接始终优先指向指定文件。

## API 路由

| 前缀 | 主要能力 |
|------|----------|
| `/api/auth` | 登录、刷新、登出、账号配置、用户和权限、Odoo 回调 |
| `/api/chat` | 配置、模型、会话、消息、SSE、停止和结晶 |
| `/api/wiki` | 文件树、页面读取、编辑、搜索、关系图、统计、下载和文件管理删除 |
| `/api/upload` | 上传配置、原件目录和原件上传 |

具体请求与响应模型以 `/api/docs` 为准。

## 验证

```bash
python3 -m py_compile *.py routers/*.py
```

生产发布还应执行根目录 [RELEASE.md](../RELEASE.md) 中的验证清单。
