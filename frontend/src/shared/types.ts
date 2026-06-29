export type WikiFileEntry = {
  relPath: string;
  isDirectory: boolean;
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
