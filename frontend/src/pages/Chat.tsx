import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  clearChatSession,
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  sendChatMessage,
} from '@/services/chatApi';
import type { ChatMessage, ChatSession, ChatSessionSummary } from '@shared/types';

function truncateName(name: string, max = 20): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type ChatPageProps = {
  newSessionTrigger?: number;
};

export function ChatPage({ newSessionTrigger = 0 }: ChatPageProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

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

  const handleNewSession = useCallback(async () => {
    setError(null);
    const res = await createChatSession();
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
    setInput('');
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    void loadSessions();
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
    setError(null);
    const res = await getChatSession(sessionId);
    if (!res.success || !res.session) {
      setError(res.error ?? '加载会话失败');
      return;
    }
    setCurrentSession(res.session);
  };

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
      const created = await createChatSession();
      if (!created.success || !created.session) {
        setError(created.error ?? '创建会话失败');
        return;
      }
      sessionId = created.session.id;
      setCurrentSessionId(sessionId);
      setCurrentSession(created.session);
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

    const optimisticUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setCurrentSession((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, optimisticUser] }
        : {
            id: sessionId!,
            name: '新对话',
            messages: [optimisticUser],
            createdAt: optimisticUser.timestamp,
            updatedAt: optimisticUser.timestamp,
          }
    );

    const res = await sendChatMessage(sessionId, text);
    setSending(false);

    if (!res.success || !res.session) {
      setError(res.error ?? '发送失败');
      setInput(text);
      void loadSessions(sessionId);
      return;
    }

    setCurrentSession(res.session);
    setSessions((prev) => {
      const exists = prev.some((s) => s.id === res.session!.id);
      const summary = {
        id: res.session!.id,
        name: res.session!.name,
        createdAt: res.session!.createdAt,
        updatedAt: res.session!.updatedAt,
        messageCount: res.session!.messages.length,
      };
      if (!exists) return [summary, ...prev];
      return prev.map((s) => (s.id === summary.id ? summary : s));
    });
  };

  const messages = currentSession?.messages ?? [];

  return (
    <div className="flex h-full min-h-0">
      {/* 会话侧栏 */}
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

        <ScrollArea className="flex-1 min-h-0">
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
                    'group flex items-center gap-1 rounded-md min-w-0',
                    currentSessionId === session.id ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void handleSelectSession(session.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-2 py-2 text-sm rounded-md min-w-0 text-left',
                      sidebarCollapsed && 'justify-center px-0',
                      currentSessionId === session.id
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    title={session.name}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{truncateName(session.name)}</span>
                    )}
                  </button>
                  {!sidebarCollapsed && sessions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => void handleDeleteSession(session.id)}
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* 主对话区 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {error && (
          <div className="shrink-0 mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          <div className="w-full px-4 py-6 space-y-6">
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
                <h2 className="text-lg font-medium mb-1">开始对话</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  输入问题并发送，助手将以 Markdown 格式回复（当前为 Mock 演示）。
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {message.role === 'assistant' && (
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
                      <MessageSquare className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-4 py-3 text-sm',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 border border-border'
                    )}
                  >
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    ) : (
                      <ChatMarkdown content={message.content} />
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
              ))
            )}
            {sending && (
              <div className="flex gap-3 justify-start">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="rounded-xl px-4 py-3 bg-muted/60 border border-border text-sm text-muted-foreground">
                  正在回复…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* 输入区 */}
        <div className="shrink-0 px-4 pb-4 pt-3 bg-gradient-to-t from-muted/30 via-background/80 to-transparent">
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
                placeholder="输入消息…"
                disabled={sending}
                rows={1}
                className="min-h-[52px] max-h-[200px] resize-none overflow-y-auto border-0 bg-transparent px-4 pt-3.5 pb-[52px] text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-2xl"
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-3 pb-3 pt-6 bg-gradient-to-t from-card via-card/95 to-transparent rounded-b-2xl">
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
                    className="size-9 rounded-full shadow-sm"
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || sending}
                    title="发送"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
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
