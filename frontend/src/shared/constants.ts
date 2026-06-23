export const PAGES = {
  LOGIN: 'login',
  LLM_WIKI: 'llm-wiki',
  CHAT: 'chat',
  SETTINGS: 'settings',
} as const;

export type PageId = (typeof PAGES)[keyof typeof PAGES];

export const PAGE_LABELS: Record<PageId, string> = {
  [PAGES.LOGIN]: '登录',
  [PAGES.LLM_WIKI]: 'LLM-Wiki',
  [PAGES.CHAT]: '对话',
  [PAGES.SETTINGS]: '设置',
};

export type ApiEnvironment = 'LOCAL' | 'REMOTE';

export const API_ENVIRONMENTS = {
  LOCAL: {
    label: '本机',
    apiBase: '/api',
  },
  REMOTE: {
    label: '局域网',
    apiBase: 'http://192.168.1.100:8000/api',
  },
} as const;

export const DEFAULT_API_ENVIRONMENT: ApiEnvironment = 'LOCAL';

export type LLMWikiTab = 'workbench' | 'graph' | 'search';

export const LLM_WIKI_TABS: { id: LLMWikiTab; label: string }[] = [
  { id: 'workbench', label: '工作台' },
  { id: 'graph', label: '关系图' },
  { id: 'search', label: '搜索' },
];

/** 产品标语 — 统一文案 */
export const KARPATHY_WIKI_TAGLINE = '可复利增长的互链知识库';

export const LLM_WIKI_SKILL_REPO = 'https://github.com/sdyckjq-lab/llm-wiki-skill';
export const KARPATHY_WIKI_GIST =
  'https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f';

export type SettingsTab = 'general' | 'api' | 'llm-wiki' | 'account';

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'api', label: 'API 环境' },
  { id: 'llm-wiki', label: 'LLM-Wiki' },
  { id: 'account', label: '账户' },
];
