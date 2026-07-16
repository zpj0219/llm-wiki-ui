# LLM-Wiki UI 前端

版本：**1.0.0**

前端使用 React 18、TypeScript、Vite、Tailwind CSS、Radix UI 和 lucide-react，提供知识库、关系图、对话、设置与用户管理界面。

## 开发命令

```bash
npm ci
npm run dev
npm run build
npm run preview
```

- 开发地址：http://localhost:5173
- Vite 开发代理：`/api` → `http://localhost:8000`
- 生产环境：由 nginx 同源提供前端和 `/api`

前端没有运行时 API 地址切换页面。默认使用同源 API；特殊构建环境可以设置 `VITE_API_BASE`。

## 目录结构

```text
frontend/src/
├── App.tsx
├── main.tsx
├── pages/
│   ├── Login.tsx
│   ├── Chat.tsx
│   ├── LLMWiki.tsx
│   └── Settings.tsx
├── components/
│   ├── chat/
│   │   ├── ChatMarkdown.tsx
│   │   └── ChatThinkingSteps.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── SiteHeader.tsx
│   │   ├── UserAvatar.tsx
│   │   └── UserInfo.tsx
│   ├── settings/
│   │   ├── GeneralSettingsTab.tsx
│   │   ├── LlmWikiSettingsTab.tsx
│   │   ├── HelpTab.tsx
│   │   ├── AccountManagementTab.tsx
│   │   ├── AccountSettingsTab.tsx
│   │   ├── UserFormDialog.tsx
│   │   └── UserPermissionsDialog.tsx
│   ├── wiki/
│   │   ├── WikiWorkbench.tsx
│   │   ├── WikiRawFilesPanel.tsx
│   │   ├── WikiGraphView.tsx
│   │   ├── WikiSearchPanel.tsx
│   │   ├── FilePreviewDialog.tsx
│   │   ├── WikiMarkdownPreview.tsx
│   │   ├── WikiFileTree.tsx
│   │   ├── OriginalsDirTree.tsx
│   │   ├── wikiGraphForce.ts
│   │   ├── wikiGraphGrowth.ts
│   │   ├── wikiPathResolve.ts
│   │   └── useGraphTouchGestures.ts
│   └── ui/
├── services/
│   ├── api.ts
│   ├── authSession.ts
│   ├── chatApi.ts
│   ├── wikiApi.ts
│   ├── uploadApi.ts
│   ├── users.ts
│   └── wikiGraphFilter.ts
├── shared/
│   ├── constants.ts
│   └── types.ts
└── lib/utils.ts
```

## 页面与导航

### 登录

- 本地模式支持用户名密码登录。
- Odoo 模式支持 URL 中的 JWT 回调登录。
- Access Token 失效时自动使用 Refresh Token 重试。
- 多窗口通过浏览器事件同步登录状态。

### 主侧栏

- 按用户权限隐藏无权访问的模块。
- 账号卡片下方显示前端版本号。
- 移动端使用抽屉式导航。

### 设置

- 通用：主题、通知、版本信息和退出登录。
- LLM-Wiki：知识库显示偏好和相关本地设置。
- 帮助：按当前用户管理模式展示使用说明。
- 不提供 API 环境或远程服务器切换功能。

## 知识库模块

### 工作台

- 左侧按实体、主题、摘要、结晶分类展示 Wiki 文件。
- 右侧提供 Markdown 预览、编辑和反向链接。
- 支持从 Markdown Wikilink 打开其他页面。
- 支持从当前页面跳转关系图并聚焦节点。
- 桌面端可调整文件树宽度，移动端使用抽屉文件树。

### 文件管理

- 浏览 `raw/originals`、`raw/fulltext` 和 `raw/inbox`。
- 支持文件和文件夹拖放上传，最多三个任务并发。
- 展示待处理、全文已提取和已生成 Wiki 的状态。
- 支持文本类文件在线预览，二进制文件下载查看。
- 预览弹窗直接读取文件管理传入的真实路径，Markdown 内部链接独立使用 Wiki 标题解析。
- 文件和目录删除只在文件管理模块提供。

### 关系图

- SVG 二维力导向布局，不使用 D3。
- 节点分为实体、主题、摘要和其他组。
- 节点间受力按图跳数衰减，每增加一跳减半。
- 拖拽节点时高亮自身和一级邻居，其他节点降低透明度。
- 拖拽点紧跟指针；松开后恢复其他节点并向邻居传播衰减扰动。
- 支持搜索、分组筛选、局部图、标签透明度、节点大小和边宽设置。
- 生长动画支持随时终止并以扩散收尾；自动缩放按节点总数和动态画布计算。
- 移动端支持单指节点拖拽、画布平移、双指缩放和双击节点预览。

### 概况

- 展示原件、全文、实体、主题和摘要统计。
- 展示处理管线阶段和待处理文件。
- 展示分类分布与 MD5 重复文件组。
- 移动端卡片和内容区域限制宽度，避免横向溢出。

## 对话模块

### 会话与流式输出

1. 创建或选择本地会话。
2. 前端先插入用户消息和 assistant 占位消息。
3. `chatApi.ts` 读取后端 SSE。
4. `started` 更新用户消息，`step` 更新处理步骤，`delta` 追加正文。
5. `done` 或 `stopped` 使用后端最终会话覆盖本地状态。
6. 网络中止时重新读取会话，恢复后端已保存的部分正文。

后端写入的 `STREAMING_PLACEHOLDER` 用于刷新或切换会话后识别仍未完成的助手消息。

### 助手消息

- 正文使用 Markdown 渲染。
- 正文与底部信息区有独立间距和视觉分隔。
- 风险提示标签显示“该内容由大模型生成，仅供参考，风险操作请务必核对”。
- 耗时标签在生成过程中实时计时，完成后使用数据库中的 `replyDurationMs` 持久展示。
- 时间统一显示年月日和时分。
- 结晶按钮位于独立操作行。

### 对话结晶

- 点击结晶按钮先打开二次确认弹窗。
- 弹窗展示主题、会话 ID、用户问题和完整助手回复。
- 助手正文区域可单独滚动，弹窗外层不重复滚动。
- 提交失败和重复提示显示在确认弹窗内部。
- 打开弹窗和会话加载时查询已结晶状态。
- 重复判断支持同一消息和相同正文；主题不参与正文去重。
- 用户可以明确选择强制提交。
- 浏览器只调用 BFF，不直接调用 Hermes `8644` Webhook。

## API 与认证服务

`services/api.ts` 统一处理：

- 同源 URL 拼接。
- 认证请求头。
- `401` 后刷新 Token 并重试一次。
- 刷新失败时广播登录失效。
- 后端错误信息解析。

流式 SSE、上传进度和文件下载分别由专用服务处理，因为它们不能完全复用普通 JSON 请求封装。

## 响应式约定

- 主布局和页面容器必须使用 `min-w-0`，避免 Flex 子项撑宽。
- 页面级容器控制溢出，内部滚动区承担滚动。
- 对话代码块和长文本允许换行或局部横向滚动。
- 移动端输入框字号不低于 16px，避免 iOS 自动缩放。
- 关系图触摸逻辑位于 `useGraphTouchGestures.ts`，与桌面鼠标事件分离。

详见 [移动端适配说明](../mob.md)。

## 版本维护

版本号需要同时更新：

- `package.json`
- `package-lock.json`
- `src/shared/constants.ts`

发布前执行：

```bash
npm ci
npm run build
```

完整流程见 [RELEASE.md](../RELEASE.md)。
