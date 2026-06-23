import { requestJson } from './api';
import type { ChatMessage, ChatSession, ChatSessionSummary } from '@shared/types';

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

export async function createChatSession(name?: string): Promise<{
  success: boolean;
  session?: ChatSession;
  error?: string;
}> {
  try {
    const res = await requestJson<ApiResult<{ session: ChatSession }>>('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { name } : {}),
    });
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
