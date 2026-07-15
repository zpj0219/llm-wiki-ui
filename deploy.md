# llm-wiki-ui 部署指南

本文档说明 **llm-wiki-ui**（Hongtai AI Hub 客户前端）的 **Docker 生产部署**。日常开发请在本机直接跑 Node / Python，不使用 Docker。

> 产品定位与 API 说明请参阅 [README.md](README.md)。  
> Hermes Agent 运行时部署请参阅 [hermes-data/deploy.md](../hermes-data/deploy.md)。

---

## 目录

1. [架构与前置条件](#1-架构与前置条件)
2. [环境要求](#2-环境要求)
3. [克隆与目录结构](#3-克隆与目录结构)
4. [配置环境变量](#4-配置环境变量)
5. [生产部署](#5-生产部署)
6. [本地开发（非 Docker）](#6-本地开发非-docker)
7. [部署验证](#7-部署验证)
8. [数据持久化](#8-数据持久化)
9. [升级与维护](#9-升级与维护)
10. [无网 / 离线本地部署](#10-无网--离线本地部署)
11. [部署检查清单](#11-部署检查清单)
12. [常见问题](#12-常见问题)

---

## 1. 架构与前置条件

llm-wiki-ui 是 **BFF + React 前端**，依赖已运行的 Hermes Agent（hermes-data）提供对话能力，并共享同一知识库目录。

```
┌─────────────────────────────────────────────────────────────┐
│  llm-wiki-ui（本仓库）                                        │
│  ┌──────────────┐   /api/*   ┌─────────────────────────┐   │
│  │ nginx + React│ ─────────► │ FastAPI BFF (uvicorn)   │   │
│  └──────────────┘            └───────────┬─────────────┘   │
└──────────────────────────────────────────┼─────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────┐
              │                            │                    │
              ▼                            ▼                    ▼
   knowledge-base/（共享卷）      Hermes Gateway :8642    SQLite app.db
   raw · wiki · fulltext           Chat / Sessions         用户 · 对话
              │
              ▼
   hermes-data Cron 流水线（原件 → fulltext → wiki → QMD）
```

**部署前必须先完成：**

1. [hermes-data](../hermes-data) 已启动且 Gateway 健康（`:8642`）
2. 知识库目录可访问（默认与 hermes-data 共用 `knowledge-base`）
3. 已获取 hermes-data 根目录 `.env` 中的 `API_SERVER_KEY`

---

## 2. 环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Linux / macOS / Windows（Docker Desktop） |
| Docker | Docker Engine + Compose v2，或 Docker Desktop（**仅生产部署需要**） |
| 内存 | 建议 ≥ 4 GB（本应用本身；Hermes 另计） |
| 磁盘 | 视知识库体量；SQLite 与应用日志占用较小 |
| 端口 | 生产默认 `3000` |
| 网络 | 构建时需能拉取 `node`、`python`、`nginx` 基础镜像 |

本地开发另需：Node.js 20+、Python 3.12+。

---

## 3. 克隆与目录结构

```bash
git clone <llm-wiki-ui-repo-url>
cd llm-wiki-ui
```

建议与 hermes-data 并列放置（默认知识库路径依赖此布局）：

```
Docker/
├── hermes-data/          # Hermes Agent 运行时
│   └── data/home/Documents/knowledge-base/
└── llm-wiki-ui/          # 本仓库
    ├── Dockerfile              # 生产单镜像
    ├── docker-compose.yml      # 生产编排（唯一 compose）
    ├── deploy/
    │   ├── nginx.conf
    │   └── start.sh
    ├── backend/
    ├── frontend/
    └── data/                   # 生产 SQLite 持久化（运行时生成）
```

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | **生产**：单镜像，nginx + BFF 同容器 |
| `Dockerfile` | 多阶段构建：前端静态资源 + Python BFF + nginx |
| `.env` | 密钥与知识库路径（勿提交 Git） |

---

## 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 必须与 hermes-data/.env 中 API_SERVER_KEY 完全一致
HERMES_API_KEY=your-api-server-key

USE_HERMES_CHAT=auto
DEFAULT_CHAT_MODEL=hermes-agent

# 知识库宿主机路径（默认指向并列的 hermes-data）
HERMES_KB_PATH=../hermes-data/data/home/Documents/knowledge-base

# 可选：生产对外端口（默认 3000）
# APP_PORT=3000
```

**重要说明：**

| 变量 | 本地 npm/uvicorn 开发 | Docker 生产 |
|------|----------------------|-------------|
| `HERMES_GATEWAY_URL` | `http://localhost:8642` | 由 compose **内置** `http://host.docker.internal:8642`，无需在 `.env` 改 |
| `HERMES_API_KEY` | 与 hermes-data 一致 | 同左，compose 从 `.env` 注入 |

若 Hermes 运行在**另一台机器**，编辑 `docker-compose.yml` 中 `HERMES_GATEWAY_URL`：

```yaml
HERMES_GATEWAY_URL: http://192.168.0.82:8642
```

---

## 5. 生产部署

单镜像包含 React 静态资源、nginx 反向代理与 FastAPI BFF。

### 5.1 启动 hermes-data

```bash
cd ../hermes-data
docker compose up -d
curl http://localhost:8642/health
```

### 5.2 构建并启动 llm-wiki-ui

```bash
cd ../llm-wiki-ui
docker compose up -d --build
```

### 5.3 访问

| 服务 | 地址 |
|------|------|
| Web UI | http://localhost:3000 |
| 健康检查 | http://localhost:3000/api/health |
| API 文档 | http://localhost:3000/api/docs |

默认账号：`admin` / `admin123`

### 5.4 生产 compose 要点

```yaml
# docker-compose.yml 核心配置
image: llm-wiki-ui:latest
container_name: llm-wiki-ui
ports:
  - "${APP_PORT:-3000}:80"
environment:
  HERMES_GATEWAY_URL: http://host.docker.internal:8642
  HERMES_API_KEY: ${HERMES_API_KEY}
volumes:
  - ${HERMES_KB_PATH}: /data/knowledge-base
  - ./data:/var/lib/llm-wiki-ui    # SQLite
```

容器内进程：

- `nginx :80` — 静态前端 + `/api` 反代
- `uvicorn :8000`（仅监听 127.0.0.1，不对外暴露）

---

## 6. 本地开发（非 Docker）

开发不使用 Docker。前后端分别启动，详见 [README.md](README.md#本地开发)。

```bash
# 终端 1 — BFF
cd backend
pip install -r requirements.txt
set HERMES_GATEWAY_URL=http://localhost:8642
set HERMES_API_KEY=<与-hermes-data-一致>
uvicorn main:app --reload --port 8000

# 终端 2 — 前端
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## 7. 部署验证

```bash
# 容器状态
docker compose ps
# STATUS 应为 healthy

# 健康检查
curl http://localhost:3000/api/health

# 期望 JSON 片段
# "status": "ok"
# "useHermesChat": true
# "hermesGateway": "http://host.docker.internal:8642"
```

浏览器验证：

1. 打开 http://localhost:3000 ，使用 `admin` / `admin123` 登录
2. **知识库**页可浏览 wiki / 原件目录
3. **对话**页选择 `hermes-agent` 模型，发送消息并确认流式回复

---

## 8. 数据持久化

| 路径（宿主机） | 容器内 | 内容 |
|----------------|--------|------|
| `HERMES_KB_PATH` | `/data/knowledge-base` | 知识库（与 hermes-data 共享） |
| `./data/` | `/var/lib/llm-wiki-ui/` | SQLite（用户、Token、对话会话） |

**备份建议：**

- 定期备份 `./data/app.db`
- 知识库由 hermes-data 侧统一备份（`knowledge-base/` 目录）

---

## 9. 升级与维护

```bash
# 拉取代码
git pull

# 重新构建并滚动重启
docker compose up -d --build

# 查看日志
docker logs -f llm-wiki-ui

# 停止
docker compose down
```

仅更新环境变量（不改镜像）：

```bash
docker compose up -d
```

---

## 10. 无网 / 离线本地部署

目标环境**无法访问公网**（或无法拉取 Docker Hub）时，在**有网机器**上预先构建并导出镜像，再拷贝到目标机加载运行。运行时仍可通过**局域网**访问 Hermes Gateway 或内网 LLM（若已配置）。

### 10.1 总体流程

```
有网机器（构建机）                    无网目标机（生产机）
─────────────────                  ─────────────────
1. docker compose build            4. 拷贝离线包（U 盘 / 内网共享）
2. docker save → .tar              5. docker load
3. 打包配置 + data 目录            6. docker compose up -d（勿加 --build）
```

需同时离线部署 **hermes-data**（Hermes Agent）与 **llm-wiki-ui**，二者通过共享知识库目录和 Gateway API 对接。

### 10.2 有网机器：导出 llm-wiki-ui 镜像

```bash
cd llm-wiki-ui

# 构建生产镜像（需能访问 Docker Hub 或已配置镜像加速）
docker compose build

# 导出为 tar（约 500MB～1GB，视基础镜像层而定）
docker save -o llm-wiki-ui.tar llm-wiki-ui:latest
```

**Windows PowerShell：**

```powershell
cd C:\Docker\llm-wiki-ui
docker compose build
docker save -o llm-wiki-ui.tar llm-wiki-ui:latest
```

### 10.3 有网机器：导出 hermes-data 镜像（依赖项）

llm-wiki-ui 对话功能依赖 Hermes Gateway，需一并离线迁移：

```bash
cd ../hermes-data

docker pull nousresearch/hermes-agent:latest
docker save -o hermes-agent.tar nousresearch/hermes-agent:latest
```

若 hermes-data 已在构建机运行，可同时备份 `./data` 卷（含 config、skills、知识库、`.env`）。

### 10.4 离线包内容清单

将以下文件拷贝至目标机（建议目录 `C:\Docker\` 或 `/opt/hongtai/`）：

| 内容 | 说明 |
|------|------|
| `llm-wiki-ui.tar` | llm-wiki-ui 生产镜像 |
| `hermes-agent.tar` | Hermes Agent 官方镜像 |
| `llm-wiki-ui/` 仓库 | 至少含 `docker-compose.yml`、`.env`、`deploy/` |
| `hermes-data/` 仓库 | 至少含 `docker-compose.yml`、`data/`、`.env` |

最小文件集（不含 Git 历史）：

```
offline-bundle/
├── images/
│   ├── llm-wiki-ui.tar
│   └── hermes-agent.tar
├── llm-wiki-ui/
│   ├── docker-compose.yml
│   ├── .env
│   └── data/                  # 可为空，首次运行自动生成 app.db
└── hermes-data/
    ├── docker-compose.yml
    ├── .env
    └── data/                  # Hermes 配置 + 知识库
```

### 10.5 无网目标机：加载镜像

```bash
docker load -i images/llm-wiki-ui.tar
docker load -i images/hermes-agent.tar

# 确认镜像已存在
docker images | grep -E 'llm-wiki-ui|hermes-agent'
```

**Windows PowerShell：**

```powershell
docker load -i images\llm-wiki-ui.tar
docker load -i images\hermes-agent.tar
docker images
```

### 10.6 无网目标机：启动 hermes-data

```bash
cd hermes-data
docker compose up -d

curl http://localhost:8642/health
```

确保 `hermes-data/.env` 中 `API_SERVER_KEY` 已设置；LLM 密钥在 `hermes-data/data/.env`（若使用内网 LM Studio，配置对应 `BASE_URL`）。

### 10.7 无网目标机：启动 llm-wiki-ui

```bash
cd llm-wiki-ui

cp .env.example .env
# 编辑 .env：HERMES_API_KEY 与 hermes-data 的 API_SERVER_KEY 一致

# 已 load 镜像后，勿加 --build（会尝试拉基础镜像）
docker compose up -d
```

**Windows PowerShell：**

```powershell
cd C:\Docker\llm-wiki-ui
docker compose up -d
```

访问 http://localhost:3000 ，验证方式同 [§7 部署验证](#7-部署验证)。

### 10.8 纯本地非 Docker 方式（备选）

目标机**未安装 Docker**、但可运行 Node.js + Python 时，将整个仓库与 `node_modules`、Python venv 一并拷贝：

```bash
# 有网机器预先安装依赖
cd llm-wiki-ui/backend && pip install -r requirements.txt -t vendor
cd ../frontend && npm ci

# 打包 backend/vendor、frontend/node_modules 与源码到目标机
```

目标机启动：

```bash
# BFF
cd backend
set KNOWLEDGE_BASE_ROOT=C:\Docker\hermes-data\data\home\Documents\knowledge-base
set HERMES_GATEWAY_URL=http://localhost:8642
set HERMES_API_KEY=<API_SERVER_KEY>
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# 前端（另开终端，需先 npm run build）
cd frontend
npm run build
npx vite preview --host 0.0.0.0 --port 5173
```

生产环境更推荐 Docker 单镜像方式；此路径适合临时演示或无法安装 Docker Desktop 的 Windows 工控机。

### 10.9 离线环境注意事项

| 项目 | 说明 |
|------|------|
| **不要** 在无网机执行 `--build` | 会尝试拉取 `node`/`python` 基础镜像而失败 |
| 先 `docker load` 再 `docker compose up -d` | 使用已有本地镜像 `llm-wiki-ui:latest` |
| Gateway 地址 | 同机部署 Hermes 时用 `host.docker.internal:8642`；异机部署改为 Hermes 主机局域网 IP |
| LLM 对话 | 无公网时需 hermes-data 配置**内网 LLM**（LM Studio、Ollama 等） |
| 版本升级 | 在有网机重新 build → save → 目标机 load → 重启容器 |
| 镜像标签 | 导出前可用 `docker tag llm-wiki-ui:latest llm-wiki-ui:v1.0.0` 便于版本管理 |

### 10.10 离线升级

```bash
# 有网机构建新版本
docker compose build
docker save -o llm-wiki-ui-v1.1.0.tar llm-wiki-ui:latest

# 无网机
docker compose down
docker load -i llm-wiki-ui-v1.1.0.tar
docker compose up -d
```

---

## 11. 部署检查清单

- [ ] hermes-data 已启动，`curl http://localhost:8642/health` 返回正常
- [ ] `.env` 中 `HERMES_API_KEY` 与 hermes-data 的 `API_SERVER_KEY` 一致
- [ ] `HERMES_KB_PATH` 指向有效知识库目录
- [ ] 生产 compose 中 `HERMES_GATEWAY_URL` 不是 `localhost`（容器内无效）
- [ ] `docker compose ps` 显示 `healthy`
- [ ] http://localhost:3000/api/health 中 `useHermesChat: true`
- [ ] 可登录、浏览知识库、流式对话
- [ ] 无网部署时已在目标机 `docker load` 且 `docker images` 可见 `llm-wiki-ui:latest`
- [ ] 无网部署使用 `docker compose up -d`，未加 `--build`

---

## 12. 常见问题

### 构建失败：无法连接 auth.docker.io

Docker Hub 网络不通。可尝试：

- Docker Desktop → Settings → Docker Engine 配置镜像加速
- 检查代理设置（Settings → Proxies）
- 网络恢复后重试 `docker compose build`

### 启动报错：`exec /start.sh: no such file or directory`

Windows 下 shell 脚本 CRLF 换行导致。当前 `Dockerfile` 已用 `sed` 去除 `\r`；若仍出现，请重新 `--build`：

```bash
docker compose up -d --build
```

### 对话不可用 / Hermes 连接失败

1. 确认 hermes-data Gateway 运行：`curl http://localhost:8642/health`
2. 确认 `HERMES_API_KEY` 与 `API_SERVER_KEY` 一致
3. 查看 `/api/health` 中 `hermesGateway` 地址是否正确
4. 容器内不要用 `localhost:8642`，应使用 `host.docker.internal:8642` 或局域网 IP

### 知识库目录为空

检查 `HERMES_KB_PATH` 是否指向 hermes-data 的知识库：

```bash
# Windows 示例
HERMES_KB_PATH=../hermes-data/data/home/Documents/knowledge-base
```

路径相对于 `docker-compose.yml` 所在目录解析。

### 端口 3000 被占用

在 `.env` 中修改：

```env
APP_PORT=8080
```

---

## 附录：Compose 命令速查

| 场景 | 命令 |
|------|------|
| 生产启动 | `docker compose up -d --build` |
| **离线生产启动** | `docker load` 后 `docker compose up -d`（勿 `--build`） |
| 导出镜像 | `docker save -o llm-wiki-ui.tar llm-wiki-ui:latest` |
| 导入镜像 | `docker load -i llm-wiki-ui.tar` |
| 生产停止 | `docker compose down` |
| 生产日志 | `docker logs -f llm-wiki-ui` |
| 本地开发 | 见 [§6](#6-本地开发非-docker) / README（不使用 Docker） |

## 附录：预拉基础镜像

```powershell
docker pull node:20-alpine
docker pull python:3.12-slim
docker compose build --pull=false
```
