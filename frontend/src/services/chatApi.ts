import { getAuthHeaders } from './authSession';
import { API_BASE, requestJson } from './api';
import type { ChatMessage, ChatModel, ChatSession, ChatSessionSummary, ChatStep } from '@shared/types';

type ApiResult<T> = { success: boolean } & T;

export async function listChatSessions(): Promise<{
  success: boolean;
  sessions: ChatSessionSummary[];
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ sessions: ChatSessionSummary[] }>>('/api/chat/sessions');
    return { success: true, sessions: res.sessions };
  } catch (e) {
    return { success: false, sessions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createChatSession(options?: {
  name?: string;
  modelId?: string;
}): Promise<{
  success: boolean;
  session?: ChatSession;
  error?: string;
}> {
  try {
    const body: { name?: string; modelId?: string } = {};
    if (options?.name) body.name = options.name;
    if (options?.modelId) body.modelId = options.modelId;
    const res = await requestJson<ApiResult<{ session: ChatSession }>>('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { success: true, session: res.session };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateChatSessionModel(
  sessionId: string,
  modelId: string
): Promise<{ success: boolean; session?: ChatSession; error?: string }> {
  try {
    const res = await requestJson<ApiResult<{ session: ChatSession }>>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      }
    );
    return { success: true, session: res.session };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getChatSession(sessionId: string): Promise<{
  success: boolean;
  session?: ChatSession;
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ session: ChatSession }>>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}`
    );
    return { success: true, session: res.session };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteChatSession(sessionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await requestJson<ApiResult<Record<string, never>>>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function clearChatSession(sessionId: string): Promise<{
  success: boolean;
  session?: ChatSession;
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ session: ChatSession }>>(
      `/api/chat/sessions/${encodeURIComponent(sessionId)}/clear`,
      { method: 'POST' }
    );
    return { success: true, session: res.session };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendChatMessage(
  sessionId: string,
  content: string
): Promise<{
  success: boolean;
  session?: ChatSession;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  error?: string;
}> {
  try {
    const res = await requestJson<
      ApiResult<{
        session: ChatSession;
        userMessage: ChatMessage;
        assistantMessage: ChatMessage;
      }>
    >(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return {
      success: true,
      session: res.session,
      userMessage: res.userMessage,
      assistantMessage: res.assistantMessage,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ChatStreamEvent =
  | { type: 'started'; userMessage: ChatMessage }
  | { type: 'delta'; delta: string }
  | { type: 'step'; step: ChatStep }
  | { type: 'done'; session: ChatSession; assistantMessage: ChatMessage }
  | { type: 'stopped'; session: ChatSession; assistantMessage: ChatMessage }
  | { type: 'error'; message: string };

/** OpenWebUI 风格流式对话 — Hermes /v1/chat/completions SSE */
export async function streamChatMessage(
  sessionId: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; error?: string; aborted?: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/chat/sessions/${encodeURIComponent(sessionId)}/messages/stream`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
        signal,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { detail?: string }).detail ?? `HTTP ${res.status}`
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('无法读取流式响应');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return { success: true };
        try {
          onEvent(JSON.parse(payload) as ChatStreamEvent);
        } catch {
          /* ignore malformed chunk */
        }
      }
    }
    return { success: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { success: true, aborted: true };
    }
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getChatConfig(): Promise<{
  success: boolean;
  provider?: string;
  hermesConnected?: boolean;
  defaultModel?: string;
  error?: string;
}> {
  try {
    const res = await requestJson<
      ApiResult<{ provider: string; hermesConnected: boolean; defaultModel: string }>
    >('/api/chat/config');
    return {
      success: true,
      provider: res.provider,
      hermesConnected: res.hermesConnected,
      defaultModel: res.defaultModel,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listChatModels(): Promise<{
  success: boolean;
  models: ChatModel[];
  defaultModel?: string;
  error?: string;
}> {
  try {
    const res = await requestJson<
      ApiResult<{ models: ChatModel[]; defaultModel: string }>
    >('/api/chat/models');
    return {
      success: true,
      models: res.models,
      defaultModel: res.defaultModel,
    };
  } catch (e) {
    return { success: false, models: [], error: e instanceof Error ? e.message : String(e) };
  }
}
