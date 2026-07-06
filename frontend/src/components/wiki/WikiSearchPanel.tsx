import { useState, useEffect, useMemo } from 'react';
import { Database, Layers, Tag, Box, BarChart3, FileText, HardDrive, Clock, CheckCircle2, Copy } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getWikiStats } from '@/services/wikiApi';
import type { WikiStats } from '@shared/types';

type WikiSearchPanelProps = {
  onOpenPage?: (relPath: string) => void;
  refreshKey?: number;
};

const CATEGORIES: {
  key: 'rawFiles' | 'wikiFlatMd' | 'sources' | 'entities' | 'topics';
  label: string;
  icon: typeof Database;
  color: string;
}[] = [
  { key: 'rawFiles', label: '原始文件', icon: HardDrive, color: 'bg-blue-500' },
  { key: 'wikiFlatMd', label: 'Wiki 页面', icon: FileText, color: 'bg-emerald-500' },
  { key: 'sources', label: '摘要', icon: Box, color: 'bg-amber-500' },
  { key: 'entities', label: 'Entities', icon: Tag, color: 'bg-violet-500' },
  { key: 'topics', label: 'Topics', icon: Layers, color: 'bg-rose-500' },
];

function useIsMobile() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => { const m = window.matchMedia('(max-width: 1023px)'); const h = (e: MediaQueryListEvent) => setV(e.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return v;
}

export function WikiSearchPanel({ refreshKey = 0 }: WikiSearchPanelProps) {
  const isMobile = useIsMobile();
  const [stats, setStats] = useState<WikiStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getWikiStats()
      .then((s) => { setStats(s); setError(null); })
      .catch((e) => { setStats(null); setError(e instanceof Error ? e.message : String(e)); });
  }, [refreshKey]);

  const distribution = useMemo(() => {
    if (!stats) return [];
    const wikiTotal = (stats.sources || 0) + (stats.entities || 0) + (stats.topics || 0) + (stats.wikiFlatMd || 0);
    const maxVal = Math.max(stats.rawFiles || 0, wikiTotal, 1);
    return CATEGORIES.map((cat) => {
      const val = Number(stats[cat.key] ?? 0);
      const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
      return { ...cat, value: val, percent: pct };
    });
  }, [stats]);

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
        <p className="text-sm text-destructive font-medium">加载失败</p>
        <p className="text-xs text-muted-foreground text-center break-all">{error}</p>
        <button
          type="button"
          className="text-xs text-primary hover:underline mt-2"
          onClick={() => { setError(null); setStats(null); }}
        >
          重试
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const wikiTotal = (stats.sources || 0) + (stats.entities || 0) + (stats.topics || 0) + (stats.wikiFlatMd || 0);
  const totalFiles = (stats.rawFiles || 0) + wikiTotal;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="w-full max-w-full overflow-x-hidden px-4 py-4 space-y-4">
        {/* 顶部概览卡片 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {CATEGORIES.map(({ key, label, icon: Icon, color }) => (
            <div
              key={key}
              className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-sm"
            >
              <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${color} text-white`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                <p className="text-base font-bold tabular-nums">{stats[key] ?? 0}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 分布条形图 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              文件分布
            </CardTitle>
            <CardDescription className="text-xs">
              总计 {totalFiles} 个文件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {distribution.map(({ key, label, icon: Icon, color, value, percent }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>
                  <span className="tabular-nums font-medium">{value}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Wiki 子分类明细 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Wiki 内容明细
            </CardTitle>
            <CardDescription className="text-xs">
              entities · topics · sources 及平铺页面
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={isMobile ? 'space-y-2' : 'grid grid-cols-2 gap-3'}>
              {[
                { label: '摘要', value: stats.sources ?? 0, color: 'bg-amber-500', hint: '摘要页面' },
                { label: 'Entities', value: stats.entities ?? 0, color: 'bg-violet-500', hint: '实体页面' },
                { label: 'Topics', value: stats.topics ?? 0, color: 'bg-rose-500', hint: '主题页面' },
                { label: '平铺 Markdown', value: stats.wikiFlatMd ?? 0, color: 'bg-emerald-500', hint: 'wiki/ 下直接 .md' },
              ].map((item) => {
                const wikiMax = Math.max(wikiTotal, 1);
                const pct = Math.round((item.value / wikiMax) * 100);
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/60">{item.hint}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">{item.value}</p>
                      <div className="flex items-center gap-1 justify-end">
                        <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 处理管线状态 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              处理管线
            </CardTitle>
            <CardDescription className="text-xs">
              originals → fulltext → entities · topics · sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[10px] text-muted-foreground/70 pb-1">阶段一：原文 → 全文索引</p>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">已生成全文</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {Math.max(0, (stats.rawFiles ?? 0) - (stats.originalsPending ?? 0))}
              </span>
            </div>
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">未生成全文</span>
                <span className={`text-sm font-semibold tabular-nums ${(stats.originalsPending ?? 0) > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {stats.originalsPending ?? 0}
                </span>
              </div>
              {(stats.originalsPendingPaths ?? []).length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-border/50 max-h-32 overflow-y-auto space-y-0.5">
                  {stats.originalsPendingPaths!.map((p) => {
                    const display = p.startsWith('raw/originals/') ? p.slice('raw/originals/'.length) : p;
                    return (
                      <p key={p} className="text-[10px] text-muted-foreground/70 truncate leading-relaxed" title={p}>
                        {display}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
            {stats.rawFiles > 0 && (
              <div className="mt-2 mb-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>全文覆盖</span>
                  <span>{Math.round(Math.max(0, (stats.rawFiles - (stats.originalsPending ?? 0))) / Math.max(stats.rawFiles, 1) * 100)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.round(Math.max(0, (stats.rawFiles - (stats.originalsPending ?? 0))) / Math.max(stats.rawFiles, 1) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/70 pt-2 pb-1">阶段二：全文 → 实体 / 主题 / 摘要</p>
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">已提取实体 (entities + topics + sources)</span>
              <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {(stats.entities ?? 0) + (stats.topics ?? 0) + (stats.sources ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 重复文件 */}
        {(stats.duplicateGroups ?? []).length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Copy className="h-4 w-4 text-muted-foreground" />
                重复文件
              </CardTitle>
              <CardDescription className="text-xs">
                {stats.duplicateGroups!.length} 组内容相同的文件
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats.duplicateGroups!.map((group) => (
                <div key={group.md5} className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground/60 font-mono mb-1 truncate">
                    MD5: {group.md5}
                  </p>
                  {group.paths.map((p) => {
                    const display = p.startsWith('raw/originals/') ? p.slice('raw/originals/'.length) : p;
                    return (
                      <p key={p} className="text-[11px] text-muted-foreground truncate leading-relaxed" title={p}>
                        {display}
                      </p>
                    );
                  })}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

      </div>
    </ScrollArea>
  );
}
