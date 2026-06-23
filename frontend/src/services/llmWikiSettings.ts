export type LlmWikiSettings = {
  relativeRoot: string;
  maxContextChars: number;
  appendRawRegisterToIndexOnUpload: boolean;
  chatQueryReadOnly: boolean;
};

const STORAGE_KEY = 'llmWikiSettings';

const DEFAULTS: LlmWikiSettings = {
  relativeRoot: 'llm-wiki',
  maxContextChars: 32000,
  appendRawRegisterToIndexOnUpload: true,
  chatQueryReadOnly: true,
};

export function getLlmWikiSettings(): LlmWikiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLlmWikiSettings(settings: LlmWikiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
