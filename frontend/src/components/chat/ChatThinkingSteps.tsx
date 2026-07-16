import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ChatStep } from '@shared/types';

type ChatThinkingStepsProps = {
  steps: ChatStep[];
  /** 助手正文是否已有输出 */
  hasContent?: boolean;
  /** 是否仍在流式生成中 — 为 true 时显示模型计时 */
  isStreaming?: boolean;
  className?: string;
};

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function stepElapsedMs(step: ChatStep, now: number): number | null {
  if (step.durationMs != null) return step.durationMs;
  if (step.startedAt == null) return null;
  const end = step.completedAt ?? now;
  return Math.max(0, end - step.startedAt);
}

export function ChatThinkingSteps({ steps, hasContent = false, isStreaming = false, className }: ChatThinkingStepsProps) {
  const hasRunning = steps.some((s) => s.status === 'running');
  const showTimer = isStreaming || hasRunning;
  const [expanded, setExpanded] = useState(!hasContent);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (hasContent) {
      setExpanded(false);
    } else if (showTimer) {
      setExpanded(true);
    }
  }, [hasContent, showTimer]);

  useEffect(() => {
    if (!showTimer) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [showTimer]);

  if (steps.length === 0) return null;

  const totalMs = steps.reduce((sum, step) => {
    const elapsed = stepElapsedMs(step, now);
    return elapsed != null ? sum + elapsed : sum;
  }, 0);

  return (
    <div className={cn('mb-2 rounded-lg border border-border/60 bg-background/40', className)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="font-medium">
          {showTimer ? '模型处理中' : '处理过程'}
        </span>
        {!showTimer && totalMs > 0 && (
          <span className="ml-auto tabular-nums text-[10px] opacity-60 shrink-0">
            {formatDurationMs(totalMs)}
          </span>
        )}
        {showTimer && (
          <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin opacity-70" />
        )}
      </button>
      {expanded && (
        <ol className="px-3 pb-2.5 space-y-1.5 list-none">
          {steps.map((step) => {
            const elapsed = stepElapsedMs(step, now);
            return (
              <li
                key={step.id}
                className={cn(
                  'flex items-start gap-2 text-xs leading-relaxed',
                  step.status === 'running' ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-50" />
                <span className="min-w-0 flex-1 break-words">
                  {step.label}
                  {step.detail && (
                    <span className="block mt-0.5 text-[10px] opacity-70 font-mono truncate">
                      {step.detail}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 shrink-0 mt-0.5">
                  {elapsed != null && (
                    <span className="tabular-nums text-[10px] opacity-60">
                      {formatDurationMs(elapsed)}
                    </span>
                  )}
                  {step.status === 'running' && showTimer && (
                    <Loader2 className="h-3 w-3 animate-spin opacity-60" />
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
