# LLM-Wiki 知识库

基于 **Karpathy LLM-Wiki** 方法论的 Web 版互链知识库应用：用 Markdown + wikilink 构建可复利增长的知识体系。

参照 [EdgeModelStudio](https://github.com/) 前端架构构建。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui 风格组件 |
| 后端 | Python FastAPI（当前为 Mock 数据） |
| 部署 | Docker Compose（Nginx + Uvicorn） |

## 功能

- **用户登录**：参照 EdgeModelStudio 登录流程（JWT Bearer + localStorage 会话）
- **工作台**：Wiki 文件树浏览、Markdown 编辑/预览、反向链接
- **关系图**：基于 wikilink 的知识图谱可视化
- **搜索**：全文检索 Wiki 页面

## 快速开始

### Docker Compose（推荐）

```bash
docker compose up --build
```

- 前端：http://localhost:3000
- 后端 API：http://localhost:8000
- API 文档：http://localhost:8000/docs

### 本地开发

**后端：**

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**前端：**

```bash
cd frontend
npm install
npm run dev
```

前端开发服务器（:5173）会通过 Vite 代理将 `/api` 请求转发到后端。

**Mock 登录账号：**

| 用户名 | 密码 |
|--------|------|
| admin | admin123 |
| user | user123 |

## 项目结构

```
llm-wiki-ui/
├── frontend/          # React 前端
│   ├── src/
│   │   ├── components/   # UI 与 Wiki 组件
│   │   ├── pages/        # 页面
│   │   ├── services/     # API 客户端
│   │   └── shared/       # 常量与类型
│   └── Dockerfile
├── backend/           # FastAPI 后端
│   ├── main.py
│   ├── mock_data.py   # Mock 知识库数据
│   ├── wiki_index.py  # 索引/搜索/图谱
│   └── routers/
└── docker-compose.yml
```

## 架构说明

前端架构参照 EdgeModelStudio：

- **状态路由**：`PAGES` 常量 + `App.tsx` 页面切换（无 react-router）
- **布局**：Sidebar + SiteHeader + 圆角主内容区
- **API 层**：`services/wikiApi.ts` 封装 REST 请求
- **跨组件通信**：`CustomEvent`（如 `llm-wiki:open-page`）

后端当前使用内存 Mock 数据，包含通用知识库示例（entities / topics / sources 结构）。后续可替换为真实文件系统或数据库。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/me` | 当前用户（需 Bearer token） |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/wiki/entries` | 文件树列表 |
| GET | `/api/wiki/pages/{path}` | 读取页面 |
| PUT | `/api/wiki/pages/{path}` | 保存页面 |
| GET | `/api/wiki/backlinks/{path}` | 反向链接 |
| POST | `/api/wiki/search` | 全文搜索 |
| GET | `/api/wiki/graph` | 关系图数据 |
| GET | `/api/wiki/stats` | 知识库统计 |
| POST | `/api/wiki/refresh` | 刷新索引 |

## License

MIT
