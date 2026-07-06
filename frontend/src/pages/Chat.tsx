import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { ChatThinkingSteps } from '@/components/chat/ChatThinkingSteps';
import { Button } from '@/components/ui/button';
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
  streamChatMessage,
  updateChatSessionModel,
} from '@/services/chatApi';
import { getAuthHeaders } from '@/services/authSession';
import { API_BASE } from '@/services/api';
import type { ChatMessage, ChatModel, ChatSession, ChatSessionSummary, ChatStep } from '@shared/types';
import { useChatHeaderExtras } from '@/contexts/ChatHeaderExtras';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
      m.role === 'assistant' && i === arr.length - 1 ? { ...m, steps } : m
    ),
  };
}

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
  const [sending, setSending] = useState(false);
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
  }, [defaultModel, selectedModelId]);

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

    setSending(true);
    setError(null);
    setInput('');
    requestAnimationFrame(() => adjustTextareaHeight());

    const userMsgId = `user-${Date.now()}`;
    const assistantId = `asst-${Date.now()}`;
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

    const streamRes = await streamChatMessage(
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
        applySessionUpdate(mergeSessionWithSteps(event.session, streamStepsRef.current));
        streamStepsRef.current = [];
      } else if (event.type === 'error') {
        setError(event.message);
      }
    },
      abortController.signal
    );

    setSending(false);
    abortRef.current = null;

    if (streamRes.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const detail = await getChatSession(sessionId);
      if (detail.success && detail.session) {
        applySessionUpdate(mergeSessionWithSteps(detail.session, streamStepsRef.current));
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
              <Menu className="h-4 w-4" />
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
            Hermes Gateway 未连接。请在项目根目录 `.env` 中设置{' '}
            <code className="text-xs bg-muted px-1 rounded">HERMES_API_KEY</code>（与 hermes-data 的{' '}
            <code className="text-xs bg-muted px-1 rounded">API_SERVER_KEY</code> 一致），并确保 Gateway
            运行在 <code className="text-xs bg-muted px-1 rounded">:8642</code>。
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
                <h2 className="text-lg font-medium mb-1">Hermes Agent 对话</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  通过 Hermes Gateway 流式对话（OpenWebUI 兼容 /v1/chat/completions）。
                  {chatProvider !== '…' && (
                    <span className="block mt-1 text-xs opacity-80">
                      后端：{chatReady ? 'Hermes Agent' : 'Hermes 未连接'}
                      {selectedModelId ? ` · 模型 ${selectedModelId}` : ''}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isStreamingReply =
                  sending &&
                  message.role === 'assistant' &&
                  index === messages.length - 1;

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
                            hasContent={Boolean(message.content.trim())}
                          />
                        )}
                        {isStreamingReply && !message.content && !message.steps?.length ? (
                          <p className="text-muted-foreground leading-relaxed">
                            正在生成回复，可能需要一点时间，请稍候…
                          </p>
                        ) : message.content ? (
                          <ChatMarkdown content={message.content} />
                        ) : null}
                      </>
                    )}
                    <p
                      className={cn(
                        'text-[10px] mt-2 opacity-60',
                        message.role === 'user' ? 'text-primary-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {formatTime(message.timestamp)}
                    </p>
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
                placeholder={chatReady ? '输入消息…' : '请先配置 Hermes Gateway…'}
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
    </div>
  );
}
