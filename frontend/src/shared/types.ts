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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
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
