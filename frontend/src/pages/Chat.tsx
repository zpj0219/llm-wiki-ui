import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { ChatThinkingSteps } from '@/components/chat/ChatThinkingSteps';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  clearChatSession,
  createChatSession,
  deleteChatSession,
  getChatConfig,
  getChatSession,
  listChatModels,
  listChatSessions,
  crystallizeChat,
  lookupCrystallize,
  streamChatMessageWithAuth,
  updateChatSessionModel,
} from '@/services/chatApi';
import { getAuthHeaders } from '@/services/authSession';
import { API_BASE } from '@/services/api';
import type { ChatMessage, ChatModel, ChatSession, ChatSessionSummary, ChatStep } from '@shared/types';
import { STREAMING_PLACEHOLDER } from '@shared/constants';
import { useChatHeaderExtras } from '@/contexts/ChatHeaderExtras';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

function formatReplyDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0.1, ms / 1000).toFixed(1)}s`;

  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function ReplyDurationBadge({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming) return;
    setNow(Date.now());
    const timerId = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timerId);
  }, [isStreaming]);

  const stepStarts = (message.steps ?? [])
    .map((step) => step.startedAt)
    .filter((time): time is number => time != null);
  const timestampStartedAt = Date.parse(message.timestamp);
  const startedAt = stepStarts.length > 0
    ? Math.min(...stepStarts)
    : Number.isFinite(timestampStartedAt)
      ? timestampStartedAt
      : now;
  const durationMs = isStreaming
    ? Math.max(0, now - startedAt)
    : message.replyDurationMs;

  if (durationMs == null) return null;
  return (
    <span className="inline-flex min-h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 leading-none text-primary/80 tabular-nums">
      <Clock3 className="h-3 w-3 shrink-0" />
      {formatReplyDuration(durationMs)}
    </span>
  );
}

function upsertChatStep(steps: ChatStep[], step: ChatStep): ChatStep[] {
  const now = Date.now();
  const idx = steps.findIndex((s) => s.id === step.id);
  if (idx >= 0) {
    const prev = steps[idx];
    const startedAt = prev.startedAt ?? step.startedAt ?? now;
    let completedAt = prev.completedAt ?? step.completedAt;
    if (step.status === 'completed' && completedAt == null) {
      completedAt = now;
    }
    const durationMs =
      completedAt != null && startedAt != null
        ? completedAt - startedAt
        : prev.durationMs;
    const next = [...steps];
    next[idx] = { ...prev, ...step, startedAt, completedAt, durationMs };
    return next;
  }
  const startedAt = step.startedAt ?? now;
  const completedAt =
    step.status === 'completed' ? (step.completedAt ?? now) : step.completedAt;
  const durationMs =
    completedAt != null && startedAt != null ? completedAt - startedAt : undefined;
  return [...steps, { ...step, startedAt, completedAt, durationMs }];
}

function completeInitStep(steps: ChatStep[]): ChatStep[] {
  const now = Date.now();
  return steps.map((s) =>
    s.id === '__hermes_init__' && s.status === 'running'
      ? {
          ...s,
          status: 'completed',
          label: '已接收问题，开始处理',
          completedAt: now,
          durationMs: s.startedAt != null ? now - s.startedAt : undefined,
        }
      : s
  );
}

function mergeSessionWithSteps(session: ChatSession, steps: ChatStep[]): ChatSession {
  if (!steps.length) return session;
  return {
    ...session,
    messages: session.messages.map((m, i, arr) =>
      m.role === 'assistant' && i === arr.length - 1
        ? { ...m, steps }
        : m
    ),
  };
}

type CrystallizeDraft = {
  messageId: string;
  topic: string;
  userQuestion: string;
  assistantContent: string;
  conversationId: string;
  duplicateHint?: string;
};

function useIsMobile() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => { const m = window.matchMedia('(max-width: 1023px)'); const h = (e: MediaQueryListEvent) => setV(e.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return v;
}

type ChatPageProps = {
  newSessionTrigger?: number;
};

export function ChatPage({ newSessionTrigger = 0 }: ChatPageProps) {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => isMobile);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  /** 正在流式生成中的会话 ID，null 表示没有进行中的流式 */
  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  const [crystallizingIds, setCrystallizingIds] = useState<Record<string, boolean>>({});
  const [crystallizeHints, setCrystallizeHints] = useState<Record<string, string>>({});
  const [crystallizeDraft, setCrystallizeDraft] = useState<CrystallizeDraft | null>(null);
  const [crystallizeTopic, setCrystallizeTopic] = useState('');
  const [crystallizeSubmitting, setCrystallizeSubmitting] = useState(false);
  const [crystallizeForce, setCrystallizeForce] = useState(false);
  const [crystallizeDupInfo, setCrystallizeDupInfo] = useState<string | null>(null);
  const [crystallizeError, setCrystallizeError] = useState<string | null>(null);
  const sending = streamingSessionId != null;

  /** 消息是否正在流式生成 — 由后端占位符约定驱动，切换会话/刷新后也能正确展示 */
  const isStreamingMessage = useCallback(
    (message: ChatMessage, index: number, messages: ChatMessage[]) => {
      // 传统逻辑：当前正在 SSE 流式中的最后一条
      if (
        streamingSessionId === currentSessionId &&
        message.role === 'assistant' &&
        index === messages.length - 1
      )
        return true;
      // 约定占位符逻辑：content 为占位符表示后端正在生成，无论是否当前会话
      return message.role === 'assistant' && message.content === STREAMING_PLACEHOLDER;
    },
    [streamingSessionId, currentSessionId],
  );
  const [error, setError] = useState<string | null>(null);
  const [chatProvider, setChatProvider] = useState<string>('…');
  const [hermesConnected, setHermesConnected] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('hermes-agent');
  const [defaultModel, setDefaultModel] = useState('hermes-agent');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamStepsRef = useRef<ChatStep[]>([]);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const applySessionUpdate = useCallback((session: ChatSession) => {
    setCurrentSession(session);
    setSessions((prev) => {
      const summary = {
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messages.length,
      };
      const exists = prev.some((s) => s.id === summary.id);
      if (!exists) return [summary, ...prev];
      return prev.map((s) => (s.id === summary.id ? summary : s));
    });
  }, []);

  const handleStop = useCallback(() => {
    // 通知后端这是主动停止，不是刷新断开
    if (currentSessionId) {
      fetch(`${API_BASE}/api/chat/sessions/${encodeURIComponent(currentSessionId)}/stop`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
    abortRef.current?.abort();
  }, [currentSessionId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadSessions = useCallback(async (selectId?: string | null) => {
    setLoading(true);
    setError(null);
    const res = await listChatSessions();
    if (!res.success) {
      setError(res.error ?? '加载会话失败');
      setLoading(false);
      return;
    }
    setSessions(res.sessions);

    let nextId = selectId ?? currentSessionId;
    if (nextId && !res.sessions.some((s) => s.id === nextId)) {
      nextId = null;
    }
    if (!nextId && res.sessions.length > 0) {
      nextId = res.sessions[0].id;
    }
    setCurrentSessionId(nextId);

    if (nextId) {
      const detail = await getChatSession(nextId);
      setCurrentSession(detail.success && detail.session ? detail.session : null);
    } else {
      setCurrentSession(null);
    }
    setLoading(false);
  }, [currentSessionId]);

  const chatReady = chatProvider === 'hermes' && hermesConnected;

  const loadChatMeta = useCallback(async () => {
    const [configRes, modelsRes] = await Promise.all([getChatConfig(), listChatModels()]);
    if (configRes.success) {
      if (configRes.provider) setChatProvider(configRes.provider);
      setHermesConnected(Boolean(configRes.hermesConnected));
      if (configRes.defaultModel) {
        setDefaultModel(configRes.defaultModel);
        setSelectedModelId((prev) =>
          prev === 'hermes-agent' && configRes.defaultModel ? configRes.defaultModel : prev
        );
      }
    }
    if (modelsRes.success && modelsRes.models.length > 0) {
      setModels(modelsRes.models);
      if (modelsRes.defaultModel) setDefaultModel(modelsRes.defaultModel);
    } else if (configRes.defaultModel) {
      setModels([{ id: configRes.defaultModel, name: configRes.defaultModel }]);
    }
  }, []);

  const handleNewSession = useCallback(async () => {
    setError(null);

    // 规则：如果已有未发过消息的空会话，直接跳转到那条，不新建
    const emptySession = sessions.find((s) => s.messageCount === 0);
    if (emptySession) {
      setCurrentSessionId(emptySession.id);
      setMobileSessionsOpen(false);
      const detail = await getChatSession(emptySession.id);
      if (detail.success && detail.session) {
        setCurrentSession(detail.session);
        if (detail.session.modelId) setSelectedModelId(detail.session.modelId);
      }
      setInput('');
      textareaRef.current?.focus();
      return;
    }

    const res = await createChatSession({ modelId: selectedModelId || defaultModel });
    if (!res.success || !res.session) {
      setError(res.error ?? '创建会话失败');
      return;
    }
    setSessions((prev) => [
      {
        id: res.session!.id,
        name: res.session!.name,
        createdAt: res.session!.createdAt,
        updatedAt: res.session!.updatedAt,
        messageCount: 0,
      },
      ...prev,
    ]);
    setCurrentSessionId(res.session.id);
    setCurrentSession(res.session);
    if (res.session.modelId) setSelectedModelId(res.session.modelId);
    setInput('');
    textareaRef.current?.focus();
  }, [defaultModel, selectedModelId, sessions]);

  useEffect(() => {
    void loadSessions();
    void loadChatMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastNewSessionTrigger = useRef(0);
  useEffect(() => {
    if (newSessionTrigger > 0 && newSessionTrigger !== lastNewSessionTrigger.current) {
      lastNewSessionTrigger.current = newSessionTrigger;
      void handleNewSession();
    }
  }, [newSessionTrigger, handleNewSession]);

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages, scrollToBottom]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setStreamingSessionId(null);
    setCurrentSessionId(sessionId);
    setMobileSessionsOpen(false);
    setError(null);
    const res = await getChatSession(sessionId);
    if (!res.success || !res.session) {
      setError(res.error ?? '加载会话失败');
      return;
    }
    setCurrentSession(res.session);
    if (res.session.modelId) setSelectedModelId(res.session.modelId);
  };

  const handleModelChange = useCallback(async (modelId: string) => {
    setSelectedModelId(modelId);
    if (!currentSessionId) return;
    setError(null);
    const res = await updateChatSessionModel(currentSessionId, modelId);
    if (!res.success) {
      setError(res.error ?? '更新模型失败');
      return;
    }
    if (res.session) setCurrentSession(res.session);
  }, [currentSessionId]);

  const { setExtras: setChatHeaderExtras } = useChatHeaderExtras();

  useEffect(() => {
    const options =
      models.length > 0
        ? models.map((m) => ({ value: m.id, label: m.name }))
        : [{ value: defaultModel, label: defaultModel }];
    setChatHeaderExtras(
      <div className="flex w-full max-w-[16rem] items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground shrink-0">模型</span>
        <Select
          value={selectedModelId || defaultModel}
          onValueChange={(v) => void handleModelChange(v)}
          options={options}
          disabled={!chatReady || sending}
          size="sm"
          className="flex-1 min-w-0"
        />
      </div>
    );
    return () => setChatHeaderExtras(null);
  }, [
    setChatHeaderExtras,
    selectedModelId,
    defaultModel,
    models,
    chatReady,
    sending,
    handleModelChange,
  ]);

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('确定删除该对话？')) return;
    setError(null);
    const res = await deleteChatSession(sessionId);
    if (!res.success) {
      setError(res.error ?? '删除失败');
      return;
    }
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    if (currentSessionId === sessionId) {
      const nextId = remaining[0]?.id ?? null;
      setCurrentSessionId(nextId);
      if (nextId) {
        const detail = await getChatSession(nextId);
        setCurrentSession(detail.session ?? null);
      } else {
        setCurrentSession(null);
      }
    }
  };

  const handleClearSession = async () => {
    if (!currentSessionId || !currentSession?.messages.length) return;
    if (!window.confirm('确定清空当前对话的所有消息？')) return;
    setError(null);
    const res = await clearChatSession(currentSessionId);
    if (!res.success || !res.session) {
      setError(res.error ?? '清空失败');
      return;
    }
    setCurrentSession(res.session);
    setSessions((prev) =>
      prev.map((s) =>
        s.id === res.session!.id
          ? { ...s, name: res.session!.name, updatedAt: res.session!.updatedAt, messageCount: 0 }
          : s
      )
    );
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      const created = await createChatSession({ modelId: selectedModelId || defaultModel });
      if (!created.success || !created.session) {
        setError(created.error ?? '创建会话失败');
        return;
      }
      sessionId = created.session.id;
      setCurrentSessionId(sessionId);
      setCurrentSession(created.session);
      if (created.session.modelId) setSelectedModelId(created.session.modelId);
      setSessions((prev) => [
        {
          id: created.session!.id,
          name: created.session!.name,
          createdAt: created.session!.createdAt,
          updatedAt: created.session!.updatedAt,
          messageCount: 0,
        },
        ...prev,
      ]);
    }

    setStreamingSessionId(sessionId!);
    setError(null);
    setInput('');
    requestAnimationFrame(() => adjustTextareaHeight());

    const messageStartedAt = Date.now();
    const userMsgId = `user-${messageStartedAt}`;
    const assistantId = `asst-${messageStartedAt}`;
    const now = new Date().toISOString();
    const optimisticUser: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: now,
    };
    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              optimisticUser,
              { id: assistantId, role: 'assistant', content: '', timestamp: now, steps: [] },
            ],
          }
        : {
            id: sessionId!,
            name: '新对话',
            messages: [
              optimisticUser,
              { id: assistantId, role: 'assistant', content: '', timestamp: now, steps: [] },
            ],
            createdAt: now,
            updatedAt: now,
          }
    );

    streamStepsRef.current = [];

    const abortController = new AbortController();
    abortRef.current = abortController;

    let doneOrStopped = false;
    const streamRes = await streamChatMessageWithAuth(
      sessionId,
      text,
      (event) => {
      if (event.type === 'started') {
        setCurrentSession((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === userMsgId ? event.userMessage : m
                ),
              }
            : prev
        );
      } else if (event.type === 'delta') {
        streamStepsRef.current = completeInitStep(streamStepsRef.current);
        setCurrentSession((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content + event.delta,
                        steps: completeInitStep(m.steps ?? []),
                      }
                    : m
                ),
              }
            : prev
        );
      } else if (event.type === 'step') {
        streamStepsRef.current = completeInitStep(
          upsertChatStep(streamStepsRef.current, event.step)
        );
        setCurrentSession((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.id === assistantId
                    ? { ...m, steps: streamStepsRef.current }
                    : m
                ),
              }
            : prev
        );
      } else if (event.type === 'done' || event.type === 'stopped') {
        doneOrStopped = true;
        const finalSteps = streamStepsRef.current;
        applySessionUpdate(mergeSessionWithSteps(event.session, finalSteps));
        streamStepsRef.current = [];
      } else if (event.type === 'error') {
        setError(event.message);
      }
    },
      abortController.signal
    );

    setStreamingSessionId(null);
    abortRef.current = null;

    if (streamRes.aborted && !doneOrStopped) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const detail = await getChatSession(sessionId);
      if (detail.success && detail.session) {
        const finalSteps = streamStepsRef.current;
        applySessionUpdate(mergeSessionWithSteps(detail.session, finalSteps));
      }
      streamStepsRef.current = [];
      return;
    }

    if (!streamRes.success) {
      setError(streamRes.error ?? '发送失败');
      setInput(text);
      void loadSessions(sessionId);
    }
  };



  // 仅用消息 id 签名作依赖：流式 delta 会每 token 换新 messages 数组，
  // 若依赖 messages 本身会把 /api/chat/crystallize/lookup 打成请求风暴。
  const crystallizeLookupKey = useMemo(() => {
    if (!currentSession?.messages?.length) return '';
    return currentSession.messages
      .filter((m) => m.role === 'assistant' && m.content && m.content !== STREAMING_PLACEHOLDER)
      .map((m) => m.id)
      .join('|');
  }, [currentSession?.messages]);

  useEffect(() => {
    if (!crystallizeLookupKey) return;
    // 流式输出过程中内容未定稿，等结束后再查一次即可
    if (streamingSessionId && streamingSessionId === currentSession?.id) return;
    const assistantIds = crystallizeLookupKey.split('|').filter(Boolean);
    if (!assistantIds.length) return;
    let cancelled = false;
    void lookupCrystallize({ messageIds: assistantIds }).then((res) => {
      if (cancelled || !res.success) return;
      setCrystallizeHints((prev) => {
        const next = { ...prev };
        for (const id of res.submittedMessageIds) {
          if (!next[id] || next[id] === '失败') next[id] = '已结晶';
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [crystallizeLookupKey, currentSession?.id, streamingSessionId]);

  const openCrystallizeConfirm = useCallback(
    (message: ChatMessage) => {
      if (!currentSession || message.role !== 'assistant') return;
      const content = message.content.trim();
      if (!content || content === STREAMING_PLACEHOLDER) return;
      if (crystallizingIds[message.id] || crystallizeSubmitting) return;

      const idx = currentSession.messages.findIndex((m) => m.id === message.id);
      let userQuestion = '';
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (currentSession.messages[i].role === 'user') {
            userQuestion = currentSession.messages[i].content.trim();
            break;
          }
        }
      }

      const topicBase =
        userQuestion.replace(/\s+/g, ' ').slice(0, 40) ||
        content.replace(/\s+/g, ' ').slice(0, 40) ||
        '对话结晶';
      const topic = topicBase.length >= 40 ? `${topicBase}…` : topicBase;

      setCrystallizeDraft({
        messageId: message.id,
        topic,
        userQuestion,
        assistantContent: content,
        conversationId: currentSession.id,
      });
      setCrystallizeTopic(topic);
      setCrystallizeForce(false);
      setCrystallizeDupInfo(
        crystallizeHints[message.id] === '已结晶' || crystallizeHints[message.id] === '已提交'
          ? '该条回复此前已提交过结晶，可修改主题后强制再提交。'
          : null
      );
      setCrystallizeError(null);
    },
    [currentSession, crystallizingIds, crystallizeSubmitting, crystallizeHints]
  );

  const closeCrystallizeConfirm = useCallback(() => {
    if (crystallizeSubmitting) return;
    setCrystallizeDraft(null);
    setCrystallizeTopic('');
    setCrystallizeForce(false);
    setCrystallizeDupInfo(null);
    setCrystallizeError(null);
  }, [crystallizeSubmitting]);

  const confirmCrystallize = useCallback(async () => {
    if (!crystallizeDraft) return;
    const topic = crystallizeTopic.trim();
    if (!topic) {
      setCrystallizeError('请填写结晶主题');
      return;
    }

    const messageId = crystallizeDraft.messageId;
    const crystallizeBody = [
      crystallizeDraft.userQuestion
        ? `## 用户问题\n${crystallizeDraft.userQuestion}`
        : '',
      `## 助手回复\n${crystallizeDraft.assistantContent}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    setCrystallizeSubmitting(true);
    setCrystallizingIds((prev) => ({ ...prev, [messageId]: true }));
    setCrystallizeHints((prev) => ({ ...prev, [messageId]: '' }));
    setCrystallizeError(null);

    const res = await crystallizeChat({
      topic,
      content: crystallizeBody,
      conversationId: crystallizeDraft.conversationId,
      messageId,
      source: 'llm-wiki-ui',
      force: crystallizeForce,
    });

    setCrystallizeSubmitting(false);
    setCrystallizingIds((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });

    if (!res.success) {
      if (res.duplicate) {
        const when = res.existing?.createdAt
          ? `（${new Date(res.existing.createdAt).toLocaleString('zh-CN')}）`
          : '';
        const tip =
          res.matchBy === 'message_id'
            ? `该条助手回复已结晶过${when}`
            : `相同对话正文已结晶过${when}（主题不参与去重）`;
        setCrystallizeDupInfo(`${tip}。如需重新沉淀，请勾选「强制再提交」。`);
        setCrystallizeHints((prev) => ({ ...prev, [messageId]: '已结晶' }));
        setCrystallizeError(null);
        return;
      }
      setCrystallizeError(res.error ?? '结晶化失败');
      setCrystallizeHints((prev) => ({
        ...prev,
        [messageId]: '失败',
      }));
      return;
    }

    setCrystallizeHints((prev) => ({
      ...prev,
      [messageId]: '已结晶',
    }));
    setCrystallizeDraft(null);
    setCrystallizeTopic('');
    setCrystallizeForce(false);
    setCrystallizeDupInfo(null);
    setCrystallizeError(null);
  }, [crystallizeDraft, crystallizeTopic, crystallizeForce]);

  const messages = currentSession?.messages ?? [];

  return (
    <div className="flex h-full min-w-0 min-h-0">
      {/* 移动端会话列表 Sheet */}
      <Sheet open={isMobile && mobileSessionsOpen} onOpenChange={setMobileSessionsOpen}>
        <SheetHeader>
          <SheetTitle>对话</SheetTitle>
          <SheetClose onClose={() => setMobileSessionsOpen(false)} />
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 w-full [&>[data-radix-scroll-area-viewport]]:!h-full">
          <div className="p-2 space-y-0.5">
            {loading && !sessions.length ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-2">暂无对话</p>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className={cn('group grid grid-cols-[1fr_auto] items-center gap-1 rounded-md pr-1', currentSessionId === session.id ? 'bg-accent' : 'hover:bg-accent/50')}>
                  <button type="button" onClick={() => void handleSelectSession(session.id)} className={cn('flex items-center gap-2 px-2 py-2 text-sm rounded-md min-w-0 text-left', currentSessionId === session.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')} title={session.name}>
                    <MessageSquare className="h-4 w-4 shrink-0" /><span className="truncate">{session.name}</span>
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100" onClick={() => void handleDeleteSession(session.id)} title="删除"><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Sheet>

      {/* 桌面端会话侧栏 */}
      {!isMobile && (
      <aside
        className={cn(
          'flex flex-col border-r border-border bg-muted/20 shrink-0 transition-[width] duration-200',
          sidebarCollapsed ? 'w-12' : 'w-56'
        )}
      >
        <div className="flex items-center justify-between gap-1 p-2 border-b border-border shrink-0">
          {!sidebarCollapsed && (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              对话
            </span>
          )}
          <div className={cn('flex items-center gap-0.5', sidebarCollapsed && 'mx-auto flex-col')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void handleNewSession()}
              title="新建对话"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? '展开' : '收起'}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 w-full [&>[data-radix-scroll-area-viewport]]:!h-full">
          <div className="p-2 space-y-0.5">
            {loading && !sessions.length ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              !sidebarCollapsed && (
                <p className="text-xs text-muted-foreground text-center py-6 px-2">
                  暂无对话，点击 + 开始
                </p>
              )
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group grid items-center gap-1 rounded-md pr-1',
                    sidebarCollapsed ? 'grid-cols-[1fr]' : 'grid-cols-[1fr_auto]',
                    currentSessionId === session.id ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void handleSelectSession(session.id)}
                    className={cn(
                      'flex items-center gap-2 px-2 py-2 text-sm rounded-md min-w-0 text-left',
                      sidebarCollapsed && 'justify-center px-0',
                      currentSessionId === session.id
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title={session.name}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{session.name}</span>
                    )}
                  </button>
                  {!sidebarCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => void handleDeleteSession(session.id)}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>
      )}

      {/* 主对话区 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* 移动端会话菜单按钮 */}
        {isMobile && (
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileSessionsOpen(true)}>
              <MessageSquare className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium truncate">{currentSession?.name ?? '对话'}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => void handleNewSession()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
        {error && (
          <div className="shrink-0 mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {!chatReady && chatProvider !== '…' && (
          <div className="shrink-0 mx-4 mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            AI 对话服务未连接。请检查 <code className="text-xs bg-muted px-1 rounded">.env</code> 中{' '}
            <code className="text-xs bg-muted px-1 rounded">HERMES_API_KEY</code> 配置，并确保 Hermes Gateway 运行在{' '}
            <code className="text-xs bg-muted px-1 rounded">:8642</code>。
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 w-full max-w-full [&>[data-radix-scroll-area-viewport]]:!h-full [&>[data-radix-scroll-area-viewport]]:!w-full [&>[data-radix-scroll-area-viewport]]:max-w-full">
          <div className="w-full max-w-full overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
            {loading && !messages.length ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">加载中…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/5 text-primary mb-4">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-medium mb-1">AI 对话</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  基于知识库内容的智能问答助手，输入你的问题即可获得精准回答。
                  {chatProvider !== '…' && !chatReady && (
                    <span className="block mt-1 text-xs opacity-80">
                      对话服务未连接，请检查配置
                    </span>
                  )}
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isStreamingReply = isStreamingMessage(message, index, messages);

                return (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-2 sm:gap-3 min-w-0',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                      {isStreamingReply ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[92%] sm:max-w-[85%] min-w-0 relative overflow-x-hidden rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 border border-border'
                    )}
                  >
                    {message.role === 'user' ? (
                      <ChatMarkdown content={message.content} variant="user" />
                    ) : (
                      <>
                        {message.steps && message.steps.length > 0 && (
                          <ChatThinkingSteps
                            steps={message.steps}
                            hasContent={message.content !== STREAMING_PLACEHOLDER && Boolean(message.content.trim())}
                            isStreaming={isStreamingReply}
                          />
                        )}
                        {message.content === STREAMING_PLACEHOLDER ? (
                          !message.steps?.length && (
                            <p className="text-muted-foreground leading-relaxed">
                              正在生成回复，可能需要一点时间，请稍候…
                            </p>
                          )
                        ) : message.content ? (
                          <ChatMarkdown content={message.content} />
                        ) : null}
                      </>
                    )}
                    {message.role === 'assistant' &&
                    (isStreamingReply || (
                      message.content && message.content !== STREAMING_PLACEHOLDER
                    )) ? (
                      <div className="mt-3 flex flex-col gap-1.5 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex min-h-5 min-w-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 leading-none text-primary/80">
                            <CircleAlert className="h-3 w-3 shrink-0" />
                            该内容由大模型生成，仅供参考，风险操作请务必核对
                          </span>
                          <ReplyDurationBadge message={message} isStreaming={isStreamingReply} />
                        </div>
                        {!isStreamingReply && (
                          <div className="flex flex-wrap items-end gap-x-1.5 gap-y-1">
                          <Button
                            type="button"
                            size="sm"
                            className={cn(
                              'h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium shadow-sm',
                              crystallizeHints[message.id] === '已结晶' ||
                                crystallizeHints[message.id] === '已提交'
                                ? 'border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90',
                              'disabled:opacity-70'
                            )}
                            disabled={Boolean(crystallizingIds[message.id])}
                            onClick={() => openCrystallizeConfirm(message)}
                            title="将本条对话沉淀到知识库"
                          >
                            {crystallizingIds[message.id] ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {crystallizingIds[message.id]
                              ? '结晶中'
                              : crystallizeHints[message.id] === '已结晶' ||
                                  crystallizeHints[message.id] === '已提交'
                                ? '已结晶'
                                : '结晶'}
                          </Button>
                          {crystallizeHints[message.id]?.includes('失败') && (
                            <span
                              className="max-w-[9rem] truncate text-destructive"
                              title={crystallizeHints[message.id]}
                            >
                              失败
                            </span>
                          )}
                          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] leading-none opacity-60 tabular-nums">
                            {formatDateTime(message.timestamp)}
                          </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p
                        className={cn(
                          'mt-1.5 whitespace-nowrap text-[10px] opacity-60 tabular-nums',
                          message.role === 'user'
                            ? 'text-primary-foreground text-right'
                            : 'text-muted-foreground'
                        )}
                      >
                        {formatDateTime(message.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* 输入区 */}
        <div className="shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3 bg-gradient-to-t from-muted/30 via-background/80 to-transparent">
          <div className="w-full">
            <div
              className={cn(
                'relative rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow',
                'focus-within:border-primary/35 focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/10'
              )}
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={chatReady ? '输入消息…' : '对话服务未连接…'}
                disabled={sending || !chatReady}
                rows={1}
                className="min-h-[48px] sm:min-h-[52px] max-h-[200px] resize-none overflow-y-auto border-0 bg-transparent px-3 pt-2.5 pb-[46px] sm:px-4 sm:pt-3.5 sm:pb-[52px] text-base sm:text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-2xl"
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 sm:gap-3 px-2 pb-2 pt-4 sm:px-3 sm:pb-3 sm:pt-6 bg-gradient-to-t from-card via-card/95 to-transparent rounded-b-2xl">
                <p className="pointer-events-auto hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground select-none">
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] leading-none">
                      Enter
                    </kbd>
                    发送
                  </span>
                  <span className="text-border">·</span>
                  <span className="inline-flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] leading-none">
                      Shift
                    </kbd>
                    <span className="text-muted-foreground/70">+</span>
                    <kbd className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] leading-none">
                      Enter
                    </kbd>
                    换行
                  </span>
                </p>

                <div className="pointer-events-auto ml-auto flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => void handleClearSession()}
                    disabled={!currentSession?.messages.length || sending}
                    title="清空对话"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    className={cn(
                      'size-9 rounded-full shadow-sm',
                      sending && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                    )}
                    onClick={() => (sending ? handleStop() : void handleSend())}
                    disabled={sending ? false : !input.trim() || !chatReady}
                    title={sending ? '停止生成' : '发送'}
                  >
                    {sending ? (
                      <Square className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={crystallizeDraft !== null}
        onOpenChange={(open) => {
          if (!open) closeCrystallizeConfirm();
        }}
        className="max-w-3xl"
      >
        <DialogContent className="max-h-[min(94vh,880px)] w-full max-w-[95vw] sm:max-w-3xl" onClose={closeCrystallizeConfirm}>
          <DialogHeader>
            <DialogTitle>确认结晶</DialogTitle>
            <DialogDescription>
              将本条对话沉淀到知识库（wiki/synthesis/sessions）。提交后由 Agent 异步写入。
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex min-h-0 flex-col space-y-3 overflow-hidden">
            <div className="shrink-0 space-y-1.5">
              <Label htmlFor="crystallize-topic">主题</Label>
              <Input
                id="crystallize-topic"
                value={crystallizeTopic}
                onChange={(e) => setCrystallizeTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!crystallizeSubmitting && crystallizeTopic.trim()) {
                      void confirmCrystallize();
                    }
                  }
                }}
                placeholder="结晶主题"
                maxLength={80}
                disabled={crystallizeSubmitting}
                autoFocus
              />
            </div>
            <div className="grid shrink-0 grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">会话</span>
              <span className="truncate font-mono text-[11px]" title={crystallizeDraft?.conversationId}>
                {crystallizeDraft?.conversationId ?? '—'}
              </span>
              <span className="text-muted-foreground">来源</span>
              <span>llm-wiki-ui</span>
              <span className="text-muted-foreground">目标</span>
              <span>wiki/synthesis/sessions/</span>
            </div>
            {crystallizeDraft?.userQuestion ? (
              <div className="shrink-0 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">用户问题</p>
                <p className="max-h-24 overflow-y-auto overscroll-contain rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                  {crystallizeDraft.userQuestion}
                </p>
              </div>
            ) : null}
            <div className="flex min-h-0 flex-1 flex-col space-y-1">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">助手回复</p>
                {crystallizeDraft ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {crystallizeDraft.assistantContent.length} 字
                  </span>
                ) : null}
              </div>
              <p className="min-h-[6rem] flex-1 overflow-y-auto overscroll-contain rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">
                {crystallizeDraft?.assistantContent ?? ''}
              </p>
            </div>
            {crystallizeDupInfo ? (
              <div className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
                {crystallizeDupInfo}
              </div>
            ) : (
              <p className="shrink-0 text-[11px] text-muted-foreground leading-relaxed">
                去重依据：对话正文字节指纹（MD5，不含主题）。仅改主题不会视为新内容。
              </p>
            )}
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground select-none">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border"
                checked={crystallizeForce}
                onChange={(e) => setCrystallizeForce(e.target.checked)}
                disabled={crystallizeSubmitting}
              />
              强制再提交（忽略重复检测）
            </label>
            {crystallizeError ? (
              <div className="shrink-0 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs leading-relaxed text-destructive">
                {crystallizeError}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeCrystallizeConfirm}
              disabled={crystallizeSubmitting}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void confirmCrystallize()}
              disabled={crystallizeSubmitting || !crystallizeTopic.trim()}
              className="gap-1.5"
            >
              {crystallizeSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {crystallizeSubmitting
                ? '提交中…'
                : crystallizeForce
                  ? '强制结晶'
                  : '确认结晶'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
