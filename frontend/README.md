# llm-wiki-ui 前端

React + TypeScript + Tailwind CSS + shadcn/ui 构建的知识库管理与 AI 对话界面。

## 模块一览

```
frontend/src/
├── main.tsx                          # ReactDOM 入口，挂载 #root
├── App.tsx                           # 根组件：路由、登录态、响应式布局
├── pages/
│   ├── Chat.tsx                      # 对话页（核心）：流式 SSE、会话管理、模型切换
│   ├── LLMWiki.tsx                   # 知识库标签页容器（权限感知）
│   ├── Login.tsx                     # 登录页
│   └── Settings.tsx                  # 设置页（通用/LLM-Wiki/帮助）
├── components/
│   ├── chat/
│   │   ├── ChatMarkdown.tsx          # Markdown 渲染（react-markdown）
│   │   └── ChatThinkingSteps.tsx     # 思考步骤折叠面板 + 模型处理计时
│   ├── layout/
│   │   ├── Sidebar.tsx               # 主导航侧栏（权限过滤）
│   │   ├── SiteHeader.tsx            # 页面顶栏（面包屑 + Tab + 操作按钮）
│   │   ├── UserAvatar.tsx            # 用户头像
│   │   └── UserInfo.tsx              # 用户信息卡片
│   ├── wiki/                         # 知识库组件
│   │   ├── WikiWorkbench.tsx         # 工作台：文件树 + Markdown 编辑/预览
│   │   ├── WikiRawFilesPanel.tsx     # 文件管理：上传、拖放、处理状态
│   │   ├── WikiGraphView.tsx         # 知识图谱：SVG 力导向图可视化
│   │   ├── WikiSearchPanel.tsx       # 概况统计：分类卡片、管线状态、重复检测
│   │   ├── WikiFileTree.tsx          # 递归文件树
│   │   ├── WikiMarkdownPreview.tsx   # Markdown 预览
│   │   ├── WikiPathBreadcrumb.tsx    # 路径面包屑
│   │   ├── wikiGraphForce.ts         # 力导向图模拟算法
│   │   ├── wikiGraphGrowth.ts        # 生长动画
│   │   └── obsidianGraphTheme.ts     # 图谱视觉主题
│   ├── settings/                     # 设置子组件
│   │   ├── GeneralSettingsTab.tsx    # 通用（主题/通知/退出登录）
│   │   ├── LlmWikiSettingsTab.tsx    # LLM-Wiki 配置
│   │   ├── HelpTab.tsx               # 使用帮助（权限感知）
│   │   ├── AccountManagementTab.tsx  # 用户管理
│   │   ├── AccountSettingsTab.tsx    # 账号设置
│   │   ├── ApiSettingsTab.tsx        # API 环境切换
│   │   ├── UserFormDialog.tsx        # 用户表单弹窗
│   │   └── UserPermissionsDialog.tsx # 权限配置弹窗
│   └── ui/                           # shadcn/ui 基础组件
├── services/                         # API 服务层
│   ├── api.ts                        # HTTP 基础封装（fetch + auth headers + 401 处理）
│   ├── authSession.ts                # 登录态管理（token 持久化、刷新、跨窗口同步）
│   ├── chatApi.ts                    # 对话 API（CRUD + SSE 流式 + 401 自动刷新）
│   ├── wikiApi.ts                    # 知识库 API（读写、图谱、搜索、下载）
│   ├── uploadApi.ts                  # 文件上传（XMLHttpRequest 进度反馈）
│   ├── users.ts                      # 用户管理 API
│   ├── generalSettings.ts            # 通用设置 localStorage 读写
│   ├── llmWikiSettings.ts            # LLM-Wiki 设置 localStorage 读写
│   └── wikiGraphFilter.ts            # 图谱筛选/降噪算法
├── shared/
│   ├── constants.ts                  # 页面常量、标签、STREAMING_PLACEHOLDER 约定
│   ├── types.ts                      # 共享类型定义
│   └── utils/
│       └── apiConfig.ts              # API 环境配置
├── contexts/
│   └── ChatHeaderExtras.tsx          # Chat 页顶栏扩展插槽 Context
├── lib/
│   └── utils.ts                      # 通用工具函数（cn、路径、分类标签）
└── styles/
    └── index.css                      # Tailwind 基础 + 全局样式 + prose 排版
```

## 核心实现

### App.tsx — 根组件

- **路由**：Login / LLMWiki / Chat / Settings / AccountManagement 五个页面，条件渲染
- **登录态**：localStorage + `AUTH_EXPIRED_EVENT` / `AUTH_STATE_CHANGED` 自定义事件
- **响应式**：`useIsMobile()` hook 监听 1024px 断点，桌面侧栏 / 移动端 Sheet 抽屉
- **跨窗口同步**：`storage` 事件监听其他窗口登录态变更
- **权限驱动**：登录后获取权限，决定默认首页和可见模块

### Chat.tsx — 对话页

**流式对话流程**：
1. 用户发送 → 构建 optimistic 消息（用户 + 空 assistant）→ 立即渲染
2. `streamChatMessageWithAuth()` → POST `/api/chat/sessions/:id/messages/stream` → SSE 逐 chunk 读取
3. `delta` 事件追加文本，`step` 事件更新思考步骤，`done`/`stopped` 持久化
4. 401 → 自动 refresh token → 重试；refresh 失败 → 广播登录失效

**流式占位符约定（STREAMING_PLACEHOLDER）**：

后端流式开始前写入 DB 的 assistant 消息 content 为约定占位符字符串，前端 `isStreamingMessage()` 检测到该值即展示 loading。流式完成/中断后后端替换为实际内容。

这解决了：
- 切换会话：切回后消息 content 仍是占位符 → 显示 loading（即使不在当前 SSE 流中）
- 刷新页面：占位符仍在 DB 中 → 重新加载会话后显示 loading（提示"对话中断"）
- 对话完成：后端已替换占位符为实际内容 → 正常显示

**消息渲染**：
- 用户消息：右侧对齐，深色气泡，`max-w-[92%]` / 桌面 `85%`
- 助手消息：左侧对齐，浅色气泡 + 头像图标，可能包含 `ChatThinkingSteps` + `ChatMarkdown`
- 模型中：最后一条 assistant 消息显示 loading spinner 和计时"模型处理中(xx秒)"

**会话管理**：
- 新建对话规则：已有空会话（messageCount=0）则直接跳转，不重复创建
- 删除：确认弹窗，级联删除关联消息

**模型处理计时**（ChatThinkingSteps）：

处理过程折叠面板在流式状态下显示实时计时器"模型处理中(xx秒)"，从第一个 step 的 `startedAt` 开始计时，每 200ms 刷新。完成后显示各步骤单独耗时。

### 知识库组件

**WikiWorkbench** — 工作台：
- 左侧文件树（桌面固定/移动 Sheet），右侧 Markdown 预览/编辑/反向链接 三 Tab
- 桌面侧栏可拖拽调整宽度，持久化至 localStorage

**WikiSearchPanel** — 概况：
- 顶部统计卡片（原件/Wiki/摘要/Entities/Topics）
- 文件分布条形图（纯 CSS，无图表库）
- 处理管线进度（阶段一原件→全文，阶段二全文→实体）
- 重复文件检测（MD5 分组展示）

**WikiGraphView** — 知识图谱：
- SVG 渲染力导向图（手动实现物理模拟，非 D3）
- 缩放/拖拽/节点拖拽固定/生长动画
- 局部图/全局图切换、节点组筛选

**WikiRawFilesPanel** — 文件管理：
- 三分类导航（文件/全文/暂存）+ 上传列表
- 拖放上传（支持文件夹结构保留）、并发队列（最多 3 个）
- 文件状态图标（待处理/全文已提取/已生成实体）

### 设置模块

- **通用**：主题切换（亮/暗/跟随系统）、通知开关、退出登录
- **LLM-Wiki**：知识库子目录、上下文字符上限、Query 只读模式、上传登记
- **帮助**：图文并茂的使用指南，权限感知（无权模块提示联系管理员）
- **用户管理**：管理员可见，用户 CRUD + 权限配置

### 响应式策略

```
CSS 层：
  html, body, #root: max-width:100%; overflow-x:hidden
  ScrollArea viewport: h-full + overflow-hidden

组件层：
  App Shell:          w-full max-w-full min-w-0
  页面内容:             flex-1 min-w-0 overflow-hidden
  对话消息:             min-w-0 + overflow-x-hidden + relative
  代码块:               whitespace-pre-wrap（移动端换行）
  输入框:               font-size: 16px（移动端防 iOS Safari 缩放）
```
