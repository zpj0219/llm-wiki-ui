export type WikiFileEntry = {
  relPath: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
};

export type WikiGraphNode = {
  id: string;
  label: string;
  relPath: string;
  group: 'entities' | 'topics' | 'sources' | 'flat';
  degree: number;
};

export type WikiGraphEdge = {
  source: string;
  target: string;
};

export type WikiSearchResult = {
  relPath: string;
  title: string;
  snippet: string;
  score: number;
};

export type WikiStats = {
  rawFiles: number;
  wikiFlatMd: number;
  sources: number;
  entities: number;
  topics: number;
  fulltextMd?: number;
  originalsPending?: number;
  originalsPendingPaths?: string[];
  duplicateGroups?: { md5: string; paths: string[] }[];
};

export type ChatRole = 'user' | 'assistant';

export type ChatStepStatus = 'running' | 'completed';

export type ChatStep = {
  id: string;
  label: string;
  status: ChatStepStatus;
  tool?: string;
  detail?: string;
  /** 步骤开始时间（ms），仅前端流式过程 */
  startedAt?: number;
  /** 步骤完成时间（ms） */
  completedAt?: number;
  /** 耗时（ms），完成时写入 */
  durationMs?: number;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  /** 仅前端流式过程展示，不持久化到 SQLite */
  steps?: ChatStep[];
};

export type ChatModel = {
  id: string;
  name: string;
};

export type ChatSession = {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  modelId?: string;
};

export type ChatSessionSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  modelId?: string;
};

export type OriginalStage = 'uploaded' | 'fulltext' | 'wiki';

export type OriginalsFileStatus = {
  relPath: string;
  filename: string;
  stage: OriginalStage;
  wikiPage?: string;
};

// ── 权限 ───────────────────────────────────────────────────────────

export type UserPermissions = {
  can_access_wiki_workbench: boolean;
  can_access_wiki_rawfiles: boolean;
  can_access_wiki_graph: boolean;
  can_access_wiki_search: boolean;
  can_access_chat: boolean;
  can_access_settings: boolean;
  can_manage_accounts: boolean;
};

export const PERMISSION_FIELDS: (keyof UserPermissions)[] = [
  'can_access_wiki_workbench',
  'can_access_wiki_rawfiles',
  'can_access_wiki_graph',
  'can_access_wiki_search',
  'can_access_chat',
  'can_access_settings',
  'can_manage_accounts',
];

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  can_access_wiki_workbench: true,
  can_access_wiki_rawfiles: true,
  can_access_wiki_graph: true,
  can_access_wiki_search: true,
  can_access_chat: true,
  can_access_settings: true,
  can_manage_accounts: false,
};

export const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  can_access_wiki_workbench: '知识库 · 工作台',
  can_access_wiki_rawfiles: '知识库 · 文件管理',
  can_access_wiki_graph: '知识库 · 关系图',
  can_access_wiki_search: '知识库 · 概况',
  can_access_chat: '对话',
  can_access_settings: '设置 · LLM-Wiki 配置',
  can_manage_accounts: '账号管理（管理员）',
};
