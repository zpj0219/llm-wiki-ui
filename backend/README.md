# llm-wiki-ui 后端

FastAPI BFF（Backend For Frontend），为 React 前端提供知识库管理、Hermes 对话代理、文件上传等功能。

## 模块一览

```
backend/
├── main.py               # FastAPI 入口，CORS，路由注册
├── config.py             # 环境变量 / 配置常量
├── database.py           # SQLite 初始化（users, auth_tokens, chat_sessions, chat_messages, user_permissions）
├── auth_store.py         # 用户登录 / token 校验 / 权限管理
├── chat_service.py       # 对话业务逻辑：会话 CRUD、消息收发、SSE 流式
├── chat_store.py         # 对话持久层：SQLite 读写 chat sessions/messages
├── hermes_client.py      # Hermes Gateway HTTP 客户端（/v1/chat/completions）
├── knowledge_store.py    # 知识库文件系统读写 + 统计 + 重复检测
├── wiki_index.py         # Wiki 页面反向链接索引
├── routers/
│   ├── auth.py           # /api/auth/* 登录/登出/token 刷新/用户管理
│   ├── chat.py           # /api/chat/* 对话 API + SSE 流式
│   ├── upload.py         # /api/upload/* 原件上传
│   └── wiki.py           # /api/wiki/* 知识库浏览/编辑/搜索/图谱/下载
└── data/
    └── app.db            # SQLite 数据库文件
```

## 核心实现

### main.py

- 启动时初始化知识库目录、SQLite 数据库、上传清单迁移
- 注册 CORS 中间件（允许所有来源）
- 挂载 4 个子路由：auth / chat / upload / wiki
- `/api/health` 健康检查，返回知识库路径和 Hermes 连接状态

### config.py

- `KNOWLEDGE_BASE_ROOT`：知识库文件系统路径，默认指向 `hermes-data/data/home/Documents/knowledge-base`
- `DATABASE_PATH`：SQLite 路径，默认 `backend/data/app.db`
- `HERMES_GATEWAY_URL`：Hermes 网关地址，默认 `http://localhost:8642`
- `HERMES_API_KEY`：与 hermes-data 中 `API_SERVER_KEY` 一致
- `DEFAULT_CHAT_MODEL`：默认模型 ID，默认 `hermes-agent`
- `USE_HERMES_CHAT`：auto/true/false 控制是否启用对话功能

### database.py

数据库表结构：
- `users`：用户名、密码哈希（PBKDF2 SHA256）、邮箱、是否激活、是否超级管理员
- `auth_tokens`：token + user_id + 过期时间 + token_version（密码修改后旧 token 失效）
- `chat_sessions`：会话 id、user_id、名称、模型、创建/更新时间
- `chat_messages`：消息 id、session_id、role、content、timestamp、sort_order
- `user_permissions`：7 项布尔权限字段

种子数据：`admin/admin123`（管理员）、`user/user123`（普通用户）。

### auth_store.py

- 登录：验证密码 → 生成 access_token（24h）+ refresh_token（7d），存入 auth_tokens 表
- 登出：清除当前 token，广播 `token_version` 使该用户所有旧 token 失效
- 刷新：refresh_token → 新 access_token，旧 token 删除
- 权限：每个用户对应 `user_permissions` 行，超级管理员绕过所有权限检查
- 修改密码后自增 `token_version`，强制所有旧 token 失效

### hermes_client.py

与 Hermes Gateway 通信的唯一通道：
- `chat_completions()` — 非流式对话（stream=false）
- `chat_completions_stream()` — SSE 流式对话（同步版）
- `chat_completions_stream_async()` — SSE 流式对话（异步版，FastAPI 使用）
- `list_models()` — 获取可用模型列表
- `health_check()` — 网关健康探测

通信协议：OpenAI 兼容的 `/v1/chat/completions`，Authorization Bearer token。

### chat_service.py

**会话管理**：
- 每个用户独立存储会话，支持 CRUD + 清空 + 模型切换
- 会话名称自动从首条用户消息截取（前 24 字符）

**流式对话架构**：

使用异步版 `stream_message_async()`，`async for` 迭代 Hermes SSE 流，每次迭代 `await` 归还控制权给事件循环，避免阻塞其他请求。

**流式中间写入与占位符约定**：

```
发送消息 → 立即写入 DB：用户消息 + 占位符 assistant（__STREAMING_PLACEHOLDER__...）
         → 流式 delta 到，每累积 ~80 字符增量更新 DB
         → 完成/停止/断连 → 替换占位符为最终内容
```

前端检测到占位符即展示 loading 状态，与当前是否正在 SSE 流式无关，解决刷新页面、切换会话后 loading 丢失的问题。

**停止 vs 断连**：
- 用户点击停止 → `/stop` 端点设内存标记 → 中断流式，写入已收到内容
- 浏览器刷新断开 → `finally` 块兜底写入已有内容

### chat_store.py

- `append_messages()`：批量插入用户 + assistant 消息，同时更新会话名称和 `updated_at`
- `update_last_message()`：用于流式中间阶段更新 assistant 消息内容
- 消息按 `sort_order` 排列，保证顺序

### knowledge_store.py

文件系统操作：
- `raw/originals/` — 原始上传文件
- `raw/fulltext/` — 全文索引
- `raw/inbox/` — 暂存区
- `wiki/entities/` `wiki/topics/` `wiki/sources/` — Wiki 分类页面

文件上传去重：SQLite manifest（`.upload_manifest.db`）记录 MD5 哈希，重复文件拒绝上传并返回已存在路径。

统计接口 `get_stats()`：按目录统计文件数量、未处理文件列表、MD5 重复文件组。

### wiki_index.py

反向链接索引：扫描 wiki/ 下所有 Markdown 文件，解析 `[[wikilink]]` 和 `[text](path)` 语法，建立出链/入链映射。支持局部图聚焦和全量图谱数据。
