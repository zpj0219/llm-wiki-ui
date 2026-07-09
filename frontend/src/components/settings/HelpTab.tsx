import { useState } from 'react';
import {
  BookOpen,
  MessageSquare,
  FolderOpen,
  Network,
  Search,
  Upload,
  Settings,
  Shield,
  FileText,
  Zap,
  HelpCircle,
  Users,
  MousePointerClick,
  ArrowRight,
  ArrowLeft,
  Lock,
  AlertTriangle,
  Keyboard,
  Eye,
  PenLine,
  Link2,
  BarChart3,
  Download,
  Globe,
  Palette,
  ListChecks,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getStoredPermissions } from '@/services/authSession';
import type { UserPermissions } from '@shared/types';

type ModuleKey = 'chat' | 'workbench' | 'rawfiles' | 'graph' | 'search' | 'settings';

type ModuleDetail = {
  key: ModuleKey;
  icon: typeof MessageSquare;
  title: string;
  color: string;
  bg: string;
  desc: string;
  permissionKey?: keyof UserPermissions;
  tips: string[];
  /** 详细介绍页内容 */
  detailSections: {
    title: string;
    icon: typeof MessageSquare;
    content: string | string[];
  }[];
};

const MODULES: ModuleDetail[] = [
  {
    key: 'chat',
    icon: MessageSquare,
    title: '对话',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    permissionKey: 'can_access_chat',
    desc: '与 AI 实时流式对话，基于知识库内容回答问题。支持多轮对话、思考步骤展示、模型切换。',
    tips: [
      '按 Enter 发送，Shift+Enter 换行',
      '左侧可管理多个对话会话',
      '顶部下拉框切换 AI 模型',
      '点击停止按钮可中断生成',
    ],
    detailSections: [
      {
        title: '基本操作',
        icon: Keyboard,
        content: [
          '在底部输入框输入问题后按 Enter 键发送，AI 会基于知识库内容流式返回回答。',
          '如需换行，按 Shift + Enter 即可。',
          '生成过程中可点击红色停止按钮中断回复。',
        ],
      },
      {
        title: '会话管理',
        icon: ListChecks,
        content: [
          '左侧面板展示所有历史对话会话，点击可切换。',
          '点击 + 按钮新建会话，如果已有空会话则自动跳转，避免创建冗余会话。',
          '每个会话右上角悬停出现删除按钮，可删除不需要的对话。',
          '输入框左侧的清空按钮可清空当前会话全部消息。',
        ],
      },
      {
        title: '模型选择',
        icon: Globe,
        content: [
          '顶部"模型"下拉框可选择使用的 AI 模型，切换后当前会话后续消息使用新模型。',
          '模型列表由后端 Hermes Gateway 提供，需确保 Gateway 已正确配置 API Key。',
        ],
      },
    ],
  },
  {
    key: 'workbench',
    icon: BookOpen,
    title: '知识库 · 工作台',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    permissionKey: 'can_access_wiki_workbench',
    desc: '浏览和编辑 Wiki 知识库页面。支持 Markdown 预览、编辑、反向链接查看。',
    tips: [
      '左侧文件树选择页面进行浏览',
      '切换到"编辑"标签页可直接修改内容',
      '支持查看哪些页面链接到了当前页',
      '点击"局部图"可查看页面关联图谱',
    ],
    detailSections: [
      {
        title: '浏览页面',
        icon: Eye,
        content: [
          '左侧文件树按 entities（实体）、topics（主题）、sources（来源）三大分类组织知识库页面。',
          '点击任意页面即可在右侧预览区查看渲染后的 Markdown 内容，支持表格、代码高亮、图片等。',
          '顶部的面包屑导航展示当前页面在知识库中的路径结构。',
        ],
      },
      {
        title: '编辑页面',
        icon: PenLine,
        content: [
          '切换到"编辑"标签页可直接修改 Markdown 源码，支持标准 Markdown 语法。',
          '修改后点击右上角"保存"按钮提交，保存前会显示"未保存"标记。',
          '编辑操作会直接写入知识库文件系统，请谨慎操作。',
        ],
      },
      {
        title: '反向链接',
        icon: Link2,
        content: [
          '"反向链接"标签页列出所有链接到当前页面的其他 Wiki 页面，方便追踪知识关联。',
          '点击链接可快速跳转到对应页面。',
        ],
      },
    ],
  },
  {
    key: 'rawfiles',
    icon: FolderOpen,
    title: '知识库 · 文件管理',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    permissionKey: 'can_access_wiki_rawfiles',
    desc: '管理原件（PDF、Word、图片等）的上传、查看和下载。上传后的文件会由后台自动处理并纳入知识库。',
    tips: [
      '支持批量上传多种格式文件',
      '上传后自动进入处理流水线',
      '可查看每个文件所处的处理阶段',
      '支持下载原始文件',
    ],
    detailSections: [
      {
        title: '上传文件',
        icon: Upload,
        content: [
          '点击"上传文件"按钮选择文件，支持 PDF、Word、Excel、PPT、TXT、Markdown、图片、ZIP 等格式。',
          '上传时可选择目标分类（手册/规程/记录/故障），文件将存入对应目录。',
          '也可上传至 inbox 目录等待后续分类处理。',
        ],
      },
      {
        title: '处理流水线',
        icon: Zap,
        content: [
          '上传后的文件进入三阶段自动处理：fulltext（全文提取）→ wiki（结构化）→ qmd（全文索引）。',
          '每个文件的当前处理阶段可在文件状态中查看。',
          '处理由 Hermes 后台定时任务自动完成，无需手动触发。',
        ],
      },
      {
        title: '浏览与下载',
        icon: Download,
        content: [
          '文件树按目录结构展示所有已上传原件，支持文件夹展开/收起。',
          '点击文件名可直接下载原件到本地。',
          '部分二进制格式（.docx, .pdf, .png 等）不支持在线预览，需下载查看。',
        ],
      },
    ],
  },
  {
    key: 'graph',
    icon: Network,
    title: '知识库 · 关系图',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    permissionKey: 'can_access_wiki_graph',
    desc: '以可视化力导向图展示知识库中 entities、topics、sources 之间的关联关系。',
    tips: [
      '拖拽节点调整布局',
      '点击节点可跳转到对应页面',
      '支持局部图和全局图切换',
      '节点大小反映关联度高低',
    ],
    detailSections: [
      {
        title: '全局图',
        icon: Globe,
        content: [
          '默认展示整个知识库的全量关系图，所有 entities、topics、sources 节点及其连线。',
          '节点越大表示关联越多（degree 越高），颜色区分节点类型：entities / topics / sources。',
          '鼠标拖拽可平移画布，滚轮缩放，拖拽节点可调整布局位置。',
        ],
      },
      {
        title: '局部图',
        icon: Network,
        content: [
          '在工作台页面点击"局部图"按钮，可查看以当前页面为中心的子图。',
          '局部图仅展示与该页面直接关联的节点，便于聚焦分析。',
        ],
      },
      {
        title: '交互操作',
        icon: MousePointerClick,
        content: [
          '点击节点选中后可查看节点标签和路径信息。',
          '支持在设置中调整图谱渲染参数，适配不同性能的设备。',
        ],
      },
    ],
  },
  {
    key: 'search',
    icon: Search,
    title: '知识库 · 概况',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    permissionKey: 'can_access_wiki_search',
    desc: '知识库统计概览与全文搜索。查看各类型页面数量、原件处理状态等。',
    tips: [
      '搜索支持中文分词',
      '可查看知识库整体统计信息',
      '检测重复文件等异常情况',
      '按相关度排序搜索结果',
    ],
    detailSections: [
      {
        title: '统计概览',
        icon: BarChart3,
        content: [
          '展示知识库整体数据：原件数量、Wiki 页面数（扁平页 + sources + entities + topics）、全文文档数量。',
          '显示待处理原件列表及处理阶段分布。',
          '自动检测 MD5 重复文件并展示重复组。',
        ],
      },
      {
        title: '全文搜索',
        icon: Search,
        content: [
          '输入关键词搜索知识库全部页面，支持中文分词。',
          '搜索结果展示标题、内容摘要和匹配分数，按相关度排序。',
          '点击搜索结果可直接跳转到对应页面。',
        ],
      },
    ],
  },
  {
    key: 'settings',
    icon: Settings,
    title: '设置',
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    desc: '配置外观主题、通知偏好、知识库路径等个性化选项。',
    tips: [
      '支持浅色/深色/跟随系统三种主题',
      '可自定义 Wiki 子目录名',
      '调整对话上下文注入上限',
      '切换本机/局域网 API 环境',
    ],
    detailSections: [
      {
        title: '通用设置',
        icon: Palette,
        content: [
          '外观：切换浅色/深色主题，或选择跟随系统自动切换。',
          '通知：控制操作完成后的提示行为，可关闭减少干扰。',
          '账号：在此退出登录，或查看当前登录账号信息。',
        ],
      },
      {
        title: 'LLM-Wiki 配置',
        icon: FileText,
        content: [
          '知识库路径：自定义 Wiki 子目录名，对齐 llm-wiki-skill 的目录约定。',
          '上下文上限：控制 AI 对话时注入的 purpose.md / index.md 最大字符数。',
          'Query 只读模式：开启后禁止查询结果写入 wiki/queries/ 目录。',
          '上传登记：开启后上传原件时自动在 index.md 末尾追加文件路径记录。',
        ],
      },
    ],
  },
];

const FLOW_STEPS = [
  { icon: Upload, label: '上传原件', desc: '将 PDF、Word、图片等文件上传至知识库' },
  { icon: Zap, label: '自动处理', desc: '后台定时任务自动解析、全文提取、结构化' },
  { icon: FileText, label: 'Wiki 页面', desc: '生成结构化互链的 Wiki 知识页面' },
  { icon: MessageSquare, label: 'AI 对话', desc: '基于知识库内容进行智能问答' },
];

function hasAccess(
  isAdmin: boolean,
  perms: UserPermissions | null,
  permissionKey?: keyof UserPermissions,
): boolean {
  if (!permissionKey) return true; // 设置等无需权限
  if (isAdmin) return true;
  if (!perms) return true;
  return perms[permissionKey] !== false;
}

export function HelpTab() {
  const [detailModule, setDetailModule] = useState<ModuleDetail | null>(null);

  const perms = getStoredPermissions() as UserPermissions | null;
  const isAdmin = localStorage.getItem('isSuperUser') === 'true';

  // 详情页
  if (detailModule) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 -ml-2"
          onClick={() => setDetailModule(null)}
        >
          <ArrowLeft className="h-4 w-4" />
          返回模块列表
        </Button>

        {/* 模块标题 */}
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-primary/3 to-background">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${detailModule.bg} ${detailModule.color}`}>
                <detailModule.icon className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight">{detailModule.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{detailModule.desc}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 详细介绍 */}
        {detailModule.detailSections.map((section) => {
          const SecIcon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <SecIcon className="h-4 w-4 text-primary/70" />
                  {section.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {Array.isArray(section.content) ? (
                    section.content.map((text, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                        <span className="mt-2 block size-1.5 shrink-0 rounded-full bg-primary/40" />
                        {text}
                      </li>
                    ))
                  ) : (
                    <li className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                      <span className="mt-2 block size-1.5 shrink-0 rounded-full bg-primary/40" />
                      {section.content}
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // 模块列表页
  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-primary/3 to-background">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight">LLM-Wiki 使用指南</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                LLM-Wiki 是一套<strong>可复利增长的互链知识库系统</strong>，帮助你将散落的技术文档、运维手册、故障记录等原件，
                自动转化为结构化、可检索、可对话的智能知识库。AI 对话功能基于知识库内容提供精准回答，让知识真正"活"起来。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 数据流 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            工作流程
          </CardTitle>
          <CardDescription>从文件到知识，四步轻松搞定</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="relative flex flex-col items-center text-center p-4 rounded-xl border bg-muted/20">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground mb-1">{step.label}</span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                  {i < FLOW_STEPS.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/30" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 功能模块 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-blue-500" />
            功能模块介绍
          </CardTitle>
          <CardDescription>点击卡片查看详细使用说明</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              const canAccess = hasAccess(isAdmin, perms, mod.permissionKey);

              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => setDetailModule(mod)}
                  className="rounded-xl border p-4 space-y-3 hover:border-primary/40 hover:shadow-md transition-all text-left bg-card cursor-pointer relative group"
                >
                  {/* 无权限蒙层 */}
                  {!canAccess && (
                    <div className="absolute inset-0 rounded-xl bg-muted/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 shadow-sm">
                        <Lock className="h-4 w-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          该模块需要管理员开通权限，如有需要请联系管理员
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className={`flex size-9 items-center justify-center rounded-lg ${mod.bg} ${mod.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold">{mod.title}</h3>
                    {!canAccess && (
                      <Badge variant="outline" className="ml-auto border-amber-500/50 text-amber-600 text-[10px] h-5 gap-1">
                        <Lock className="h-3 w-3" />
                        无权限
                      </Badge>
                    )}
                    {canAccess && (
                      <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        点击查看详情 <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{mod.desc}</p>
                  <ul className="space-y-1.5">
                    {mod.tips.map((tip) => (
                      <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-0.5 block size-1.5 shrink-0 rounded-full bg-primary/40" />
                        {tip}
                      </li>
                    ))}
                  </ul>

                  {/* 无权限时底部固定提示条 */}
                  {!canAccess && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
                        当前账号未开通此模块，如需使用请联系管理员
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 权限说明 */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-500" />
            权限说明
          </CardTitle>
          <CardDescription>
            不同账号可以看到的模块可能不同，取决于管理员分配的权限
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Users className="h-8 w-8 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-medium">管理员可为普通用户配置以下权限：</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">对话</Badge>
                  知识库 AI 对话功能
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">工作台</Badge>
                  知识库页面浏览与编辑
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">文件管理</Badge>
                  原件上传与管理
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">关系图</Badge>
                  知识图谱可视化
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">概况</Badge>
                  统计与全文搜索
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">设置</Badge>
                  LLM-Wiki 及通用配置
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
            <HelpCircle className="h-5 w-5 shrink-0 text-primary/60 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong>如果你需要的模块不可见</strong>，说明当前账号未被授予该模块的访问权限。请联系你的系统管理员（拥有"账号管理"权限的用户）为你开通相应权限。
              </p>
              <p>
                默认情况下，新创建的普通用户拥有除"账号管理"之外的所有权限。管理员可在 <strong>设置 → 账号管理</strong> 中调整每个用户的具体权限。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center pb-4">
        <p className="text-[11px] text-muted-foreground">
          如遇问题或需要更多帮助，请联系系统管理员
        </p>
      </div>
    </div>
  );
}
