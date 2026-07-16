import type { UserPermissions } from './types';

export const PAGES = {
  LOGIN: 'login',
  LLM_WIKI: 'llm-wiki',
  CHAT: 'chat',
  ACCOUNT_MANAGEMENT: 'account-management',
  SETTINGS: 'settings',
} as const;

export type PageId = (typeof PAGES)[keyof typeof PAGES];

export const PAGE_LABELS: Record<PageId, string> = {
  [PAGES.LOGIN]: '登录',
  [PAGES.LLM_WIKI]: '知识库',
  [PAGES.CHAT]: '对话',
  [PAGES.ACCOUNT_MANAGEMENT]: '用户管理',
  [PAGES.SETTINGS]: '设置',
};

export type LLMWikiTab = 'workbench' | 'rawfiles' | 'graph' | 'search';

export const LLM_WIKI_TABS: { id: LLMWikiTab; label: string; permissionKey?: keyof UserPermissions }[] = [
  { id: 'workbench', label: '工作台', permissionKey: 'can_access_wiki_workbench' },
  { id: 'rawfiles', label: '文件管理', permissionKey: 'can_access_wiki_rawfiles' },
  { id: 'graph', label: '关系图', permissionKey: 'can_access_wiki_graph' },
  { id: 'search', label: '概况', permissionKey: 'can_access_wiki_search' },
];

/** Check if user has access to at least one wiki subtab. */
export function hasAnyWikiAccess(permissions: UserPermissions | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!permissions) return true;
  return (
    permissions.can_access_wiki_workbench ||
    permissions.can_access_wiki_rawfiles ||
    permissions.can_access_wiki_graph ||
    permissions.can_access_wiki_search
  );
}

/** 产品标语 — 统一文案 */
export const KARPATHY_WIKI_TAGLINE = 'LLM-Wiki · 可复利增长的互链知识库';

/** 前端应用版本号 */
export const APP_VERSION = '1.0.0';

/** 版本说明（设置 / 帮助中展示） */
export const APP_VERSION_NOTE = '正式版：对话结晶、知识库工作台、关系图与权限体系已就绪。';

/** 流式回复占位符 — 后端流式开始前写入 DB，完成/中断后替换为实际内容。前端检测到此值即展示 loading */
export const STREAMING_PLACEHOLDER = '__STREAMING_PLACEHOLDER__7f3a2b1c8d4e5f6a9b0c1d2e3f4a5b6c';

export const LLM_WIKI_SKILL_REPO = 'https://github.com/sdyckjq-lab/llm-wiki-skill';
export const KARPATHY_WIKI_GIST =
  'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f';

export type SettingsTab = 'general' | 'llm-wiki' | 'help';

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'llm-wiki', label: 'LLM-Wiki' },
];
