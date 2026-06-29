# llm-wiki-ui 移动端适配方案

> 基于当前代码库（React + Vite + Tailwind + shadcn/ui）的渐进增强方案。

---

## 现状诊断

| 区域 | 当前实现 | 移动端问题 |
|------|----------|------------|
| 全局壳层 `App.tsx` | 固定 18rem 侧栏 + `m-3` 主内容区 | 小屏横向空间不足，边距浪费 |
| `SiteHeader` | Chat 三列 grid；Wiki Tab 依赖侧栏展开 | 按钮/Tab 溢出、换行混乱 |
| `Chat` | 会话侧栏 `w-56` + 主对话区 | 双层侧栏占满宽度 |
| `WikiWorkbench` | 可拖拽文件树 + 编辑/预览 | 三栏嵌套，几乎不可用 |
| `WikiGraphView` | 画布 + 右侧设置面板 `w-52` | 固定尺寸，触控交互弱 |
| `Settings` | 已有 `md:` 响应式 | 相对最好，仅需微调 |
| `Login` | 已有 `max-w-sm` | 基本可用 |

**已有基础：**

- `index.html` 已配置 `viewport`
- `Login.tsx`、`Settings.tsx` 有部分 `sm:`/`md:` 断点
- Chat 输入区快捷键提示已用 `hidden sm:flex` 隐藏

---

## 总体策略

**推荐：渐进增强（Desktop-first → 移动断点重构）**，而非全面重写。

```
≥768px 桌面                          <768px 移动
─────────────────                    ─────────────────
持久侧栏                             Drawer 导航侧栏
内嵌二级侧栏                         Stack 单栏 + Sheet 抽屉
完整 Header 工具栏                   精简 Header + 溢出菜单
```

**核心原则：**

1. **同一时刻只显示一层导航**（全局导航 / 页面内导航 / 内容区）
2. **侧栏改 Drawer/Sheet**，不占内容全宽
3. **触控目标 ≥ 44px**，禁用 hover 依赖
4. **复杂页面（Workbench、Graph）采用「主从 Stack」**，而非并排

---

## 断点与基础设施

### 1. 统一断点

在 `tailwind.config.js` 中沿用 Tailwind 默认断点，可选扩展：

```js
screens: {
  sm: '640px',   // 大手机横屏
  md: '768px',   // 平板 / 移动↔桌面分界（主断点）
  lg: '1024px',  // 桌面舒适区（Workbench 可恢复双栏）
}
```

**主断点：`md (768px)`** — 低于此视为移动端。

### 2. 新增 `useMediaQuery` / `useIsMobile` Hook

```typescript
// hooks/useMediaQuery.ts
export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  // matchMedia + resize listener
}
```

用于控制 Drawer 开关、默认折叠状态，避免纯 CSS 难以处理的「选页后自动关 Drawer」逻辑。

### 3. 新增 shadcn Sheet 组件

项目已有 `Dialog`，但无 `Sheet`。移动端 Drawer 建议引入 Sheet 变体（基于 Radix Dialog），用于：

- 全局导航侧栏
- Chat 会话列表
- Wiki 文件树
- Graph 设置面板

---

## 分层改造方案

### Phase 1：全局壳层（优先级最高）

**目标文件：** `App.tsx`、`Sidebar.tsx`、`SiteHeader.tsx`、`index.css`

#### App 布局

```tsx
// 伪代码示意
<div className="app-shell flex h-full">
  {/* 桌面：内联侧栏 */}
  <aside className="hidden md:block ...">
    <Sidebar />
  </aside>

  {/* 移动：Sheet Drawer */}
  <Sheet open={navOpen} onOpenChange={setNavOpen}>
    <Sidebar onPageChange={(p) => { setCurrentPage(p); setNavOpen(false); }} />
  </Sheet>

  <div className="app-main flex-1 m-0 md:m-3 rounded-none md:rounded-xl ...">
    ...
  </div>
</div>
```

**具体调整：**

- 移动端：`m-0`、`rounded-none`、`border-0`（全屏沉浸）
- 移动端默认 `sidebarCollapsed = true`，桌面默认展开
- `useEffect` 监听 `matchMedia`，窗口从窄变宽时恢复桌面布局

#### SiteHeader 精简

| 元素 | 桌面 | 移动 |
|------|------|------|
| 侧栏触发器 | 折叠/展开 | 打开 Drawer |
| Wiki Tab | Header 居中 | 移入二级 Tab 栏或底部 Segmented Control |
| 刷新/上传/新建 | 文字按钮 | 图标按钮 + `title`，或收入 `⋯` 菜单 |
| Chat 模型选择 | Header 居中 | 移入输入区上方或 Sheet |
| Tagline 副标题 | 显示 | `hidden sm:block` 隐藏 |

Chat Header 的三列 grid 在移动端改为单列 flex：

```tsx
// 移动：<768px
'flex flex-col gap-2'
// 桌面：保持现有 grid
'md:grid md:grid-cols-[1fr_16rem_1fr]'
```

---

### Phase 2：Chat 页

**目标文件：** `Chat.tsx`

当前结构：`会话侧栏(w-56) + 主对话区`，移动端会变成「三层嵌套」。

**推荐模式：主从 Stack**

```
移动布局：
┌─────────────────────┐
│ Header [≡会话] [新建]│
├─────────────────────┤
│                     │
│   消息列表（全宽）    │
│                     │
├─────────────────────┤
│ 模型选择（可选一行）   │
│ 输入框 + 发送        │
└─────────────────────┘

点击 [≡会话] → 左侧 Sheet 滑出会话列表
```

**改动要点：**

- 会话侧栏 `<768px` 时 `hidden`，改用 Sheet
- 消息气泡 `max-w-[85%]` → 移动可改为 `max-w-[92%]`
- 已有 `hidden sm:flex` 的快捷键提示，保持即可
- 删除按钮在移动改为长按或滑动删除（可选，Phase 3）

---

### Phase 3：Wiki 工作台

**目标文件：** `WikiWorkbench.tsx`

当前：文件树（200–520px 可拖拽）+ 内容区（预览/编辑/反向链接）

**移动交互流：**

```
状态 A：文件列表（全屏）
  └─ 点击文件 → 状态 B

状态 B：文章阅读（全屏）
  ├─ 顶部 [← 返回] 面包屑 [⋮]
  ├─ Tab：预览 | 编辑 | 反向链接
  └─ 内容区

[⋮] 菜单：保存、局部图、上传
```

**实现方式（二选一）：**

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 状态机 `mobileView: 'tree' \| 'page'`** | 逻辑清晰，UX 好 | 需新增状态 |
| **B. 文件树 Sheet + 内容全宽** | 改动较小 | 选文件需多一步 |

推荐 **方案 A**，类似 Obsidian / Notion 移动版。

**额外调整：**

- 禁用移动端侧栏拖拽 resize（`pointer: coarse` 或 `useIsMobile`）
- 编辑区 `textarea` 移动端注意虚拟键盘顶起：输入区用 `pb-safe`（iOS safe area）
- Tab 栏可横向 scroll：`overflow-x-auto flex-nowrap`

---

### Phase 4：Wiki 图谱

**目标文件：** `WikiGraphView.tsx`

当前问题：

- 固定 `LAYOUT = { w: 960, h: 560 }`
- 右侧设置面板占宽
- 依赖 `onMouseEnter`、滚轮缩放

**改造：**

1. **画布尺寸动态化**：用 `ResizeObserver` 监听容器，替代固定 960×560
2. **设置面板**：`<md` 时改为底部 Sheet 或全屏 Dialog（点击 ⚙️ 打开）
3. **触控手势**：
   - 单指拖拽节点（已有 `onPointerDown`，需验证 touch）
   - 双指 pinch 缩放（可选；简化版仅保留 +/- 按钮）
   - 底部提示文字缩短：「单击选中 · 双击打开」
4. **工具栏**：顶部按钮保持 icon-only，`flex-wrap`

---

### Phase 5：Settings / Login / 通用组件

**Settings** — 已基本可用，补充：

- Tab 导航在移动已是横向 scroll，可加 `sticky top-0 bg-background z-10`
- 表单 `grid-cols-1 sm:grid-cols-2` 已有，保持

**Login** — 无需大改，确认输入框 `font-size ≥ 16px`（防止 iOS 自动缩放）

**Dialog / Upload** — 移动端 `max-w-lg` 改为 `max-w-[calc(100vw-2rem)]`

**Markdown 内容** — `prose-wiki` 表格/代码块确保 `overflow-x-auto`

---

## 推荐实施顺序

```
Week 1  基础设施 + 全局壳层
        ├── useIsMobile hook
        ├── Sheet 组件
        ├── App Drawer 导航
        └── SiteHeader 响应式

Week 2  Chat + Settings 收尾
        ├── 会话 Sheet
        └── Header 模型选择下沉

Week 3  Wiki Workbench
        ├── 移动主从 Stack
        └── Tab/工具栏精简

Week 4  Wiki Graph + polish
        ├── ResizeObserver 画布
        ├── 设置 Sheet
        ├── safe-area / touch 测试
        └── 真机回归
```

---

## 关键 CSS / 工具类

```css
/* index.css 补充 */
@supports (padding: env(safe-area-inset-bottom)) {
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
}

/* 移动端禁用 hover 残留（如 Chat 删除按钮） */
@media (hover: none) {
  .group-hover\:opacity-100 { opacity: 1; }
}
```

常用 Tailwind 模式：

- `hidden md:flex` / `md:hidden` — 桌面/移动组件切换
- `p-3 md:p-4` — 间距缩放
- `touch-manipulation` — 减少 300ms 延迟
- `min-h-[44px] min-w-[44px]` — 触控目标
- `min-h-svh` — 替代 `100vh`，避免 iOS 地址栏问题

---

## 测试清单

| 场景 | 设备/宽度 | 验证点 |
|------|-----------|--------|
| 导航 | 375px | Drawer 开闭、选页后自动关闭 |
| Chat | 375px | 会话切换、键盘弹出不遮挡输入 |
| Wiki 阅读 | 375px | 文件树→文章→返回流畅 |
| Wiki 编辑 | 375px | 虚拟键盘、保存按钮可达 |
| Graph | 390px | 画布填满、缩放可用、设置可开 |
| 横屏 | 667×375 | Header 不溢出 |
| iOS Safari | 真机 | safe-area、100vh 问题 |
| Android Chrome | 真机 | 地址栏收缩时布局稳定 |

---

## 可选增强（Phase 5+）

1. **PWA**：`manifest.json` + Service Worker，支持「添加到主屏幕」
2. **底部 Tab Bar**：Chat / Wiki / 设置 三入口（替代 Drawer，更接近原生 App）
3. **Pull-to-refresh**：Wiki 刷新索引
4. **Haptic feedback**：发送消息、保存成功（Capacitor 场景）

---

## 工作量估算

| 模块 | 预估工时 |
|------|----------|
| 基础设施 + App 壳层 | 1–2 天 |
| SiteHeader | 0.5 天 |
| Chat | 1 天 |
| Wiki Workbench | 2–3 天 |
| Wiki Graph | 1–2 天 |
| 测试与 polish | 1–2 天 |
| **合计** | **约 7–10 人天** |

---

## 总结

移动端适配的核心不是加几个 `@media`，而是：

1. **侧栏体系从「并排」改为「Drawer + 全宽主内容」**
2. **Wiki Workbench 改为「列表 → 详情」主从导航**
3. **Header 工具栏分级隐藏，复杂控件下沉到 Sheet 或内容区**
4. **Graph 画布动态尺寸 + 触控友好操作**

建议从 **Phase 1（App 壳层 + Sheet）** 开始；改完即可在手机上浏览 Chat 和 Settings；Wiki 工作台和图谱作为第二、三阶段推进。
