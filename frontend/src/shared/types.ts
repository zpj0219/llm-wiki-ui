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
};
