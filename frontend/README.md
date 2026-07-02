# llm-wiki-ui 前端

React + TypeScript + Tailwind CSS + shadcn/ui，知识库管理 + Hermes Agent 对话界面。

## 模块一览

```
frontend/src/
├── main.tsx                    # ReactDOM 入口
├── App.tsx                     # 根组件：路由、侧栏、移动端适配
├── pages/
│   ├── Chat.tsx                # 对话页（核心）
│   ├── LLMWiki.tsx             # 知识库标签页容器
│   ├── Login.tsx               # 登录页
│   └── Settings.tsx            # 系统设置
├── components/
│   ├── chat/
│   │   ├── ChatMarkdown.tsx    # Markdown 渲染（react-markdown）
│   │   └── ChatThinkingSteps.tsx # 思考步骤折叠面板
│   ├── layout/
│   │   ├── Sidebar.tsx         # 主导航侧栏
│   │   ├── SiteHeader.tsx      # 页面顶栏（面包屑 + 操作按钮）
│   │   ├── UserAvatar.tsx      # 用户头像
│   │   └── UserInfo.tsx        # 用户信息卡片
│   ├── wiki/                   # 知识库组件
│   │   ├── WikiWorkbench.tsx   # 工作台（文件树 + 编辑/预览）
│   │   ├── WikiRawFilesPanel.tsx # 文件管理面板
│   │   ├── WikiGraphView.tsx   # 知识图谱可视化（SVG + 力导向）
│   │   ├── WikiSearchPanel.tsx # 概况统计面板
│   │   ├── WikiFileTree.tsx    # 文件树组件
│   │   ├── WikiMarkdownPreview.tsx # Markdown 预览
│   │   ├── WikiPathBreadcrumb.tsx  # 路径面包屑
│   │   └── wikiGraphForce.ts   # 力导向图算法
│   ├── ui/                     # shadcn/ui 基础组件
│   │   └── sidebar.tsx, sheet.tsx, scroll-area.tsx, tabs.tsx, ...
│   └── settings/               # 设置页子组件
├── services/                   # API 服务层
│   ├── api.ts                  # HTTP 基础封装（fetch + auth headers）
│   ├── authSession.ts          # 登录状态管理（localStorage + 事件）
│   ├── chatApi.ts              # 对话 API（CRUD + SSE 流）
│   ├── wikiApi.ts              # 知识库读写 API
│   └── uploadApi.ts            # 文件上传（XMLHttpRequest 进度）
├── shared/
│   └── types.ts                # 共享类型定义
├── styles/
│   └── index.css               # Tailwind 基础 + 全局样式 + prose 排版
└── lib/
    └── utils.ts                # 工具函数（cn, categoryLabel, ...）
```

## 各模块实现思路

### App.tsx — 根组件

- **移动端适配**：`useIsMobile()` hook 监听 `(max-width: 1023px)` 媒体查询
- **桌面端**：左侧固定侧栏（可折叠），主内容区自适应
- **移动端**：侧栏改为 shadcn/ui Sheet 抽屉，主内容区 `mx-0` 全宽
- **全局宽度约束**：`html/body/#root` 设置 `max-width:100%; overflow-x:hidden; overscroll-behavior-x:none; touch-action:pan-y pinch-zoom` 防止移动端横向溢出
- **页面切换**：LLMWiki / Chat / Settings 三个页面，条件渲染

### Chat.tsx — 对话页

**架构**：
- **左侧会话列表**：桌面端固定侧栏，移动端 Sheet 抽屉
- **主对话区**：消息流 + 输入框
- **顶栏**：模型选择器 + 新建对话按钮

**流式对话流程**：
1. `handleSend()` 构建 optimistic 消息（用户 + 空 assistant）→ 立即渲染
2. `streamChatMessage()` → SSE 读取 → 逐 delta 追加文本 → React `setCurrentSession` 增量更新
3. `done` / `stopped` → 持久化完整消息，更新会话列表摘要

**消息渲染**：
- 用户消息：右侧对齐，深色气泡，`max-w-[92%]`（移动端）/ `85%`（桌面端）
- 助手消息：左侧对齐，浅色气泡 + 头像图标
- 思考步骤：`ChatThinkingSteps` 折叠面板（工具调用进度）
- 内容：`ChatMarkdown`（react-markdown + remark-gfm + rehype-highlight）

**移动端适配**：
- 气泡 `min-w-0` + `overflow-x-hidden` + `relative` → `max-width` 真正生效，不被内容撑开
- 代码块 `whitespace-pre-wrap sm:whitespace-pre` → 移动端自动换行，桌面端横向滚动
- 消息容器 `px-3 py-4` / 桌面端 `sm:px-4 sm:py-6`
- 输入框 `text-base sm:text-sm` → 移动端 16px 防止 iOS Safari 聚焦缩放

**会话列表**：
- CSS Grid `grid-cols-[1fr_auto]`（展开）/ `grid-cols-[1fr]`（折叠）
- 标题 `truncate` 自动省略号，删除按钮始终可见（灰色，hover 变红）

### ChatMarkdown.tsx — Markdown 渲染

- `react-markdown` + `remark-gfm`（表格/任务列表）+ `rehype-raw`（内嵌 HTML）+ `rehype-highlight`（代码高亮）
- `prose-chat` 样式：`break-words` + `overflow-wrap: anywhere` 强制换行
- `<pre>` 代码块：`overflow-x-auto` + `touch-action: auto`（允许触摸滑动）
- `<table>` 包裹 `overflow-x-auto` 容器
- 链接 `target="_blank"` 新窗口打开

### 知识库组件

**WikiWorkbench** — 工作台：
- 左侧文件树（桌面端固定，移动端 Sheet），右侧 Markdown 编辑/预览（Tabs 切换）
- 支持反向链接展示、局部知识图谱跳转
- 桌面端侧栏可拖拽调整宽度（persisted to localStorage）

**WikiSearchPanel** — 概况：
- 顶部 5 色统计卡片（raw / wiki / sources / entities / topics）
- 文件分布条形图（纯 CSS 进度条，无图表库依赖）
- Wiki 内容明细（4 类百分比 + 数量）
- 处理管线状态卡片（全文覆盖进度条 + 实体提取统计）
- 重复文件检测卡片（同 MD5 多路径分组展示）

**WikiGraphView** — 知识图谱：
- SVG 渲染力导向图（`wikiGraphForce.ts` 手动实现）
- 缩放/拖拽/节点高亮/生长动画
- `viewBox` + `w-full h-full` 响应式适配

**WikiRawFilesPanel** — 文件管理：
- 文件列表 Grid `grid-cols-[40px_minmax(0,1fr)_auto]` 移动端，6 列桌面端
- 上传进度（XMLHttpRequest progress 事件）
- 重复文件检测（MD5 比对，提示"已存在于 xxx"）

### 移动端全局方案

```
CSS 层：
  html, body, #root: max-width:100%; overflow-x:hidden; touch-action:pan-y
  ScrollArea viewport: h-full + overflow-hidden（Radix 内部）

组件层：
  App Shell:      w-full max-w-full min-w-0
  页面内容:         flex-1 min-w-0 overflow-hidden
  消息气泡:         min-w-0 + overflow-x-hidden + relative
  代码块:           whitespace-pre-wrap（移动端换行）

输入框：
  font-size: 16px（移动端）→ 防止 iOS Safari 聚焦缩放
```
