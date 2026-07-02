# llm-wiki-ui 后端

FastAPI BFF（Backend For Frontend），为 React 前端提供知识库管理、Hermes 对话代理、文件上传等功能。

## 模块一览

```
backend/
├── main.py               # FastAPI 入口，CORS，路由注册
├── config.py             # 环境变量 / 配置常量
├── database.py           # SQLite 数据库初始化（用户表、token 表、chat 会话表）
├── auth_store.py         # 用户登录 / token 校验
├── chat_service.py       # 对话业务逻辑：会话 CRUD、消息收发、SSE 流
├── chat_store.py         # 对话持久层：SQLite 读写 chat sessions/messages
├── hermes_client.py      # Hermes Gateway HTTP 客户端（/v1/chat/completions）
├── knowledge_store.py    # 知识库文件系统读写 + 统计 + 重复检测
├── wiki_index.py         # Wiki 页面反向链接索引
├── routers/
│   ├── auth.py           # /api/auth/* 登录/登出
│   ├── chat.py           # /api/chat/* 对话 API + SSE 流式
│   ├── upload.py         # /api/upload/* 原件上传
│   └── wiki.py           # /api/wiki/* 知识库读写
└── uploads/              # 上传文件暂存目录
```

## 各模块实现思路

### main.py — 应用入口

- 初始化知识库目录 `ensure_kb_root()`
- 初始化 SQLite 数据库 `init_db()`
- 启动时迁移上传清单 `_migrate_manifest()`（扫描已有文件计算 MD5）
- 注册 CORS 中间件和 4 个子路由
- 提供 `/api/health` 健康检查

### hermes_client.py — Hermes 网关客户端

与 Hermes Gateway 通信的唯一通道：
- **chat_completions()** — 非流式对话（`POST /v1/chat/completions` stream=false）
- **chat_completions_stream()** — SSE 流式对话（同步版，供 CLI/脚本使用）
- **chat_completions_stream_async()** — SSE 流式对话（异步版，供 FastAPI 端点使用）
- **list_models()** — 获取可用模型列表
- **health_check()** — 网关健康探测

通信协议：OpenAI 兼容的 `/v1/chat/completions`，Authorization Bearer token。流式事件类型：
- `assistant.delta` / `message.delta` → 文本增量
- `tool.started` / `tool.completed` → 思考步骤
- 未识别的 SSE 事件 → 尝试从 `choices[0].delta.content` 提取文本

### chat_service.py — 对话服务

**会话管理**：基于 SQLite 的会话 CRUD，每个用户独立存储。
- Session 绑定 `X-Hermes-Session-Key` 头以实现 Hermes 侧会话连续性
- 自动从首条消息提取会话标题（截取前 20 字符）

**流式对话**：
- `stream_message()` — 同步版，使用 `httpx.Client.stream()` + `resp.iter_lines()`
- `stream_message_async()` — 异步版，使用 `httpx.AsyncClient.stream()` + `resp.aiter_lines()`

**审批支持**：当 Hermes 回复包含"批准/确认/授权"等关键词时，前端显示 `/approve once` `/approve deny` 快捷按钮。点击后以文本消息形式发送斜杠命令，由 Hermes 内部解析执行。

#### 异步流式架构（修复对话阻塞问题）

**问题根因**：早期 `routers/chat.py` 的 SSE 端点 `async def generate()` 由 Starlette 直接在**事件循环线程**中调用 `__anext__()` 执行。但内部使用了 `for event in sync_iterator`（没有 `await`），最终阻塞在 `httpx.Client.stream().iter_lines()` → `socket.recv()` 上等 Gateway 响应。uvicorn 单 worker 只有一个事件循环线程，一旦阻塞，**所有异步请求失去调度者，全部卡死**——即使线程池还空闲 39 个线程也没有任何作用，因为没有人去调度它们。

```
StreamingResponse(async def generate())
    │  Starlette 在事件循环线程里调用 __anext__()
    ▼
for event in sync_iterator   ← 没有 await！阻塞 __next__()
    │
    ▼
httpx.Client.stream().recv() ← 阻塞等 Gateway
    │
    ▼
事件循环线程死掉 → 全站阻塞 ❌
```

**修复方式**：三处 `for` → `async for`（commit `96fa0cc`）：

| 层 | 文件 | 改动 |
|---|------|------|
| 客户端 | `hermes_client.py` | 新增 `chat_completions_stream_async()`，`httpx.AsyncClient` + `aiter_lines()` |
| 服务 | `chat_service.py` | 新增 `stream_message_async()`，返回 `AsyncIterator` |
| 路由 | `routers/chat.py` | `stream_message` → `stream_message_async`，`for` → `async for` |

每次 `async for` 迭代都是 `await`，控制权归还事件循环，其他请求得以正常调度：

```
StreamingResponse(async def generate())
    │
    ▼
async for event in async_iterator   ← await！
    │  每轮迭代 await，事件循环空闲
    ▼
httpx.AsyncClient.arecv()  ← 异步 await，不阻塞
    │
    ▼
事件循环自由 → 其他请求正常处理 ✅
```

**停止 vs 断连的区分**：
- 用户点击停止 → `_session_stop_flags` 内存标记 → 立即中断，保存已收到内容
- 浏览器刷新断开 → `request.is_disconnected()` → 先保存已有内容，`asyncio.create_task` 后台继续收完整回复，最后 `update_last_message()` 补写 DB

同步版 `stream_message()` 保留不删，供非 FastAPI 场景（CLI 脚本、定时任务）使用。

### chat_store.py — 对话持久层

SQLite 表结构：
- `chat_sessions` — 会话元数据（id, user_id, name, model_id）
- `chat_messages` — 消息记录（id, session_id, role, content, timestamp）
- 消息以 JSON 数组形式关联查询，按时间升序排列

### knowledge_store.py — 知识库存储

**文件系统操作**：
- 遍历 `knowledge-base/` 目录树，解析 `raw/` 和 `wiki/` 子目录
- `raw/originals/` — 原始上传文件
- `raw/fulltext/` — 全文索引
- `wiki/entities/` `wiki/topics/` `wiki/sources/` — Wiki 实体/主题/来源

**文件上传去重**（SQLite manifest）：
- `.upload_manifest.db` 记录每个文件的 MD5 + 大小 + 上传时间
- 上传时先计算 MD5，查 manifest 是否存在，重复则拒绝
- 首次启动自动扫描已有文件补录 manifest

**统计接口**（`get_stats()`）：
- 按目录统计文件数量
- `originalsPending`：原始文件中尚未生成全文索引的数量
- 三层匹配判断"已处理"：① 全路径 stem 精确匹配 ② MD5 内容去重（重复文件） ③ 仅文件名匹配（跨目录）

### 审批追赶方案（未启用）

Hermes 的 `/v1/runs` API 理论上支持结构化审批事件（`approval.request` SSE），但由于 execute_code 在 sandbox 线程执行时丢失审批上下文（`notify_cb = None`），审批回调不稳定。

hermes-webui 的解决方案是把 Hermes 源码作为 Python 库引入同进程，直接调用 `tools.approval.resolve_gateway_approval()`，跳过 HTTP 边界。llm-wiki-ui 作为独立进程无法做到。当前回退为文本斜杠命令 `/approve once` 方案。
