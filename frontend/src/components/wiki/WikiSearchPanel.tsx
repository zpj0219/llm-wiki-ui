import { useState, useEffect } from 'react';
import { Search, Loader2, FileText, Database, Layers, Tag, Box } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { searchWiki, getWikiStats } from '@/services/wikiApi';
import type { WikiSearchResult, WikiStats } from '@shared/types';

type WikiSearchPanelProps = {
  onOpenPage?: (relPath: string) => void;
  refreshKey?: number;
};

const STAT_ITEMS: {
  key: keyof WikiStats;
  label: string;
  icon: typeof Database;
}[] = [
  { key: 'rawFiles', label: 'raw', icon: Database },
  { key: 'wikiFlatMd', label: '平铺', icon: Layers },
  { key: 'sources', label: 'sources', icon: Box },
  { key: 'entities', label: 'entities', icon: Tag },
  { key: 'topics', label: 'topics', icon: Tag },
];

export function WikiSearchPanel({ onOpenPage, refreshKey = 0 }: WikiSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WikiSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<WikiStats | null>(null);

  useEffect(() => {
    getWikiStats().then(setStats).catch(() => setStats(null));
  }, [refreshKey]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await searchWiki(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="w-full px-4 py-4 space-y-4">
        {stats && (
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">知识库概况</CardTitle>
              <CardDescription className="text-xs">知识库文件统计</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {STAT_ITEMS.map(({ key, label, icon: Icon }) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                      <p className="text-sm font-semibold tabular-nums">{stats[key]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索页面标题、正文或关键词…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">找到 {results.length} 条结果</p>
            <div className="space-y-2">
              {results.map((r) => (
                <button
                  key={r.relPath}
                  type="button"
                  className="w-full text-left rounded-lg border bg-card p-4 shadow-sm hover:bg-accent/50 hover:border-primary/20 transition-colors"
                  onClick={() => {
                    onOpenPage?.(r.relPath);
                    window.dispatchEvent(new CustomEvent('llm-wiki:open-page', { detail: r.relPath }));
                  }}
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    {r.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                    {r.snippet}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono">{r.relPath}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {query && !searching && results.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">未找到匹配结果</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
