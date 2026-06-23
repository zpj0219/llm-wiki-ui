export const PAGES = {
  LLM_WIKI: 'llm-wiki',
} as const;

export type PageId = (typeof PAGES)[keyof typeof PAGES];

export const PAGE_LABELS: Record<PageId, string> = {
  [PAGES.LLM_WIKI]: 'LLM-Wiki',
};

export type LLMWikiTab = 'workbench' | 'graph' | 'search';

export const LLM_WIKI_TABS: { id: LLMWikiTab; label: string }[] = [
  { id: 'workbench', label: '工作台' },
  { id: 'graph', label: '关系图' },
  { id: 'search', label: '搜索' },
];
