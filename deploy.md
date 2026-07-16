# LLM-Wiki UI 部署指南

适用版本：**v1.0.0**

本文说明生产 Docker 部署、本地开发、离线交付、升级、备份和故障排查。项目依赖 `hermes-data` 提供 Hermes Gateway、Webhook 和共享知识库。

## 1. 部署架构

生产镜像包含三个部分：

- React 构建后的静态文件。
- nginx，对外监听容器 `80`，提供静态页面并代理 `/api`。
- FastAPI BFF，由 uvicorn 在容器内监听 `127.0.0.1:8000`。

```text
浏览器 :3000
    │
    ▼
llm-wiki-ui 容器
nginx :80 ─────► FastAPI :8000
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
共享知识库      Hermes :8642      SQLite
raw / wiki      Chat / Models      app.db
        │
        └──────── Hermes Webhook :8644（结晶）
```

## 2. 前置条件

| 项目 | 要求 |
|------|------|
| 操作系统 | Linux、macOS 或 Windows Docker Desktop |
| Docker | Docker Engine + Compose v2 |
| 内存 | 本应用建议至少 2 GB；Hermes 与模型资源另计 |
| 端口 | 默认对外 `3000`；Hermes 使用 `8642` 和 `8644` |
| 知识库 | 宿主机可读写的 `knowledge-base` 目录 |
| 密钥 | Gateway API Key；启用结晶时还需 Webhook HMAC Secret |

部署前先确认：

```bash
docker compose version
curl http://localhost:8642/health
```

## 3. 推荐目录布局

```text
/opt/hongtai/                 # Windows 可使用 C:\Docker\
├── hermes-data/
│   ├── .env
│   ├── docker-compose.yml
│   └── data/home/Documents/knowledge-base/
└── llm-wiki-ui/
    ├── .env
    ├── docker-compose.yml
    ├── Dockerfile
    ├── deploy/
    └── data/
```

默认 Compose 假设 `hermes-data` 与 `llm-wiki-ui` 并列放置。

## 4. 环境变量

```bash
cd llm-wiki-ui
cp .env.example .env
```

### 必须确认

```env
# 与 hermes-data/.env 的 API_SERVER_KEY 完全一致
HERMES_API_KEY=your-api-server-key

# 知识库宿主机路径
HERMES_KB_PATH=../hermes-data/data/home/Documents/knowledge-base

# 需要对话结晶时配置，与 Hermes crystallize 路由一致
HERMES_WEBHOOK_SECRET=your-crystallize-secret
```

### 常用可选项

```env
USE_HERMES_CHAT=auto
DEFAULT_CHAT_MODEL=hermes-agent
HERMES_WEBHOOK_ROUTE=crystallize
APP_PORT=3000
USER_MANAGEMENT_MODE=local
```

### 本地与容器地址差异

| 服务 | 本地运行 FastAPI | Docker Compose 默认值 |
|------|------------------|-----------------------|
| Gateway | `http://localhost:8642` | `http://host.docker.internal:8642` |
| Webhook | `http://localhost:8644` | `http://host.docker.internal:8644` |

`docker-compose.yml` 使用 `host.docker.internal` 访问宿主机上的 Hermes。Linux 环境通过 `extra_hosts` 映射 `host-gateway`。

如果 Hermes 在另一台内网主机上，修改 `docker-compose.yml`：

```yaml
environment:
  HERMES_GATEWAY_URL: http://192.168.1.20:8642
  HERMES_WEBHOOK_URL: http://192.168.1.20:8644
```

## 5. 启动生产环境

### 5.1 启动 Hermes

```bash
cd ../hermes-data
docker compose up -d
docker compose ps
curl http://localhost:8642/health
```

启用结晶时还应确认 Hermes 配置中已经注册 `crystallize` Webhook 路由，并监听 `8644`。

### 5.2 构建并启动 UI

```bash
cd ../llm-wiki-ui
docker compose up -d --build
docker compose ps
```

### 5.3 访问

| 服务 | 默认地址 |
|------|----------|
| Web UI | http://localhost:3000 |
| 健康检查 | http://localhost:3000/api/health |
| OpenAPI | http://localhost:3000/api/docs |

默认账号：

- `admin` / `admin123`
- `user` / `user123`

首次登录后修改默认密码。

## 6. 部署验证

### 容器与健康检查

```bash
docker compose ps
docker compose logs --tail=100
curl http://localhost:3000/api/health
```

健康接口应包含：

```json
{
  "status": "ok",
  "service": "llm-wiki-ui-bff",
  "useHermesChat": true
}
```

### 功能检查

1. 登录 Web UI。
2. 知识库工作台可以读取实体、主题、摘要和结晶目录。
3. 文件管理可以打开文本文件预览。
4. 关系图可以加载、搜索、缩放和拖拽节点。
5. 对话页可以获取模型并完成流式回复。
6. 结晶按钮可以打开确认弹窗并返回“任务已提交”。

### 容器内连通性

如对话或结晶失败，可从 UI 容器检查宿主机服务：

```bash
docker exec llm-wiki-ui curl -f http://host.docker.internal:8642/health
```

Webhook 可能不提供公开健康接口，可通过 Hermes 日志和一次实际结晶请求验证 `8644`。

## 7. 数据持久化

Compose 挂载：

```yaml
volumes:
  - ${HERMES_KB_PATH}:/data/knowledge-base:rw
  - ./data:/var/lib/llm-wiki-ui
```

| 宿主机路径 | 容器路径 | 内容 |
|------------|----------|------|
| `HERMES_KB_PATH` | `/data/knowledge-base` | 原件、全文、Wiki 和结晶文件 |
| `./data/` | `/var/lib/llm-wiki-ui` | `app.db`：用户、Token、对话和结晶提交记录 |

`docker compose down` 不会删除绑定目录中的数据。

### 备份

停止写入后备份最稳妥：

```bash
docker compose stop
cp data/app.db "data/app.db.backup-$(date +%Y%m%d-%H%M%S)"
docker compose start
```

Windows PowerShell：

```powershell
docker compose stop
Copy-Item data\app.db data\app.db.backup
docker compose start
```

知识库由 `hermes-data` 侧统一备份。

## 8. 本地开发

开发环境通常只使用 Docker 启动 Hermes，本项目的前后端直接运行。

### 8.1 后端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export KNOWLEDGE_BASE_ROOT=../../hermes-data/data/home/Documents/knowledge-base
export HERMES_GATEWAY_URL=http://localhost:8642
export HERMES_API_KEY=your-api-server-key
export HERMES_WEBHOOK_URL=http://localhost:8644
export HERMES_WEBHOOK_SECRET=your-crystallize-secret

uvicorn main:app --reload --port 8000
```

PowerShell：

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:KNOWLEDGE_BASE_ROOT="C:\Docker\hermes-data\data\home\Documents\knowledge-base"
$env:HERMES_GATEWAY_URL="http://localhost:8642"
$env:HERMES_API_KEY="your-api-server-key"
$env:HERMES_WEBHOOK_URL="http://localhost:8644"
$env:HERMES_WEBHOOK_SECRET="your-crystallize-secret"

uvicorn main:app --reload --port 8000
```

### 8.2 前端

```bash
cd frontend
npm ci
npm run dev
```

Vite 在 `5173` 提供页面，并将 `/api` 代理到 `8000`。

## 9. 升级

升级前先备份 `data/app.db`。

### 跟随分支升级

```bash
git pull
docker compose up -d --build
docker compose ps
```

### 使用版本 Tag

```bash
git fetch --tags
git checkout v1.0.0
docker compose up -d --build
```

应用启动时会自动创建缺失表和字段，并同步上传清单。

## 10. 回滚

```bash
docker compose down
git checkout <上一个版本标签>
cp <对应版本数据库备份> data/app.db
docker compose up -d --build
```

如果只是前端或无数据库结构变化，可以保留现有数据库；正式环境仍建议使用版本对应备份。

## 11. 离线部署

### 11.1 有网构建机

```bash
cd llm-wiki-ui
docker compose build
docker tag llm-wiki-ui:latest llm-wiki-ui:v1.0.0
docker save -o llm-wiki-ui-v1.0.0.tar llm-wiki-ui:v1.0.0
```

Hermes 镜像也需要一并导出：

```bash
docker save -o hermes-agent.tar nousresearch/hermes-agent:latest
```

### 11.2 离线包

```text
offline-bundle/
├── images/
│   ├── llm-wiki-ui-v1.0.0.tar
│   └── hermes-agent.tar
├── llm-wiki-ui/
│   ├── docker-compose.yml
│   ├── .env
│   └── data/
└── hermes-data/
    ├── docker-compose.yml
    ├── .env
    └── data/
```

源码仓库中的 `.gitignore` 会忽略 `*.tar`。镜像文件作为发布制品单独交付，不提交 Git。

### 11.3 离线目标机

```bash
docker load -i images/hermes-agent.tar
docker load -i images/llm-wiki-ui-v1.0.0.tar
docker tag llm-wiki-ui:v1.0.0 llm-wiki-ui:latest

cd hermes-data
docker compose up -d

cd ../llm-wiki-ui
docker compose up -d
```

离线机已经加载镜像后不要使用 `--build`，否则 Docker 可能尝试下载基础镜像。

## 12. 运维命令

```bash
# 状态
docker compose ps

# UI 日志
docker compose logs -f

# Hermes 日志
docker logs -f hermes

# 重启
docker compose restart

# 重新创建容器
docker compose up -d --force-recreate

# 停止但保留数据
docker compose down

# 查看当前镜像
docker image inspect llm-wiki-ui:latest
```

## 13. 常见问题

### 页面可以打开，但发送消息立即“对话中断”

依次检查：

1. `HERMES_API_KEY` 是否与 `API_SERVER_KEY` 一致。
2. Hermes Gateway `8642` 是否健康。
3. UI 容器能否访问 `host.docker.internal:8642`。
4. Hermes 自身是否已经配置可用的 LLM Provider 和对应 API Key。

若 Hermes 日志出现：

```text
No API key configured for provider 'custom'
```

问题位于 `hermes-data` 的模型 Provider 配置，而不是 `llm-wiki-ui`。应在 Hermes 运行环境中配置对应 Provider 所需的 Key 或 Base URL。

### 对话可用，但结晶按钮不可用

检查：

- `.env` 中 `HERMES_WEBHOOK_SECRET` 是否非空。
- Secret 是否与 Hermes `crystallize` 路由一致。
- Webhook 服务是否监听 `8644`。
- `HERMES_WEBHOOK_ROUTE` 是否为正确路由名。

### 结晶请求失败并显示在确认弹窗中

查看 UI 容器和 Hermes 日志：

```bash
docker compose logs --tail=200
docker logs --tail=200 hermes
```

常见原因包括 Secret 不一致、Webhook 地址错误、路由未注册或 Hermes Agent 无法写入知识库。

### 知识库为空

```bash
docker compose config
docker exec llm-wiki-ui ls -la /data/knowledge-base
```

确认 `HERMES_KB_PATH` 指向真实目录。Windows Docker Desktop 还需要允许共享对应磁盘或目录。

### SQLite 数据丢失

确认 Compose 中存在：

```yaml
- ./data:/var/lib/llm-wiki-ui
```

不要使用未备份的 `docker compose down -v` 或手动删除 `data/`。

### 端口 3000 被占用

在 `.env` 设置：

```env
APP_PORT=3001
```

然后重新创建容器：

```bash
docker compose up -d
```

### Docker 构建无法访问镜像仓库或 npm

- 配置 Docker 镜像加速和网络代理。
- 在有网机器构建后使用离线镜像交付。
- 不要把本地 `node_modules` 复制进生产镜像。

## 14. 发布前检查

创建版本 Tag 前执行根目录 [RELEASE.md](RELEASE.md) 中的完整清单。

最少验证：

```bash
cd frontend && npm ci && npm run build && cd ..
python3 -m py_compile backend/*.py backend/routers/*.py
docker compose config
git diff --check
git status --short
```
