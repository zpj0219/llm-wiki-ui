import { useState } from 'react';
import { Search, Loader2, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { searchWiki, getWikiStats } from '@/services/wikiApi';
import type { WikiSearchResult, WikiStats } from '@shared/types';
import { useEffect } from 'react';

type WikiSearchPanelProps = {
  onOpenPage?: (relPath: string) => void;
  refreshKey?: number;
};

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
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Search className="h-5 w-5" />
            知识库搜索
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            全文检索 Wiki 页面标题与正文内容
          </p>
        </div>

        {stats && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">知识库概况</CardTitle>
              <CardDescription className="text-xs">Mock 数据统计</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <div>raw 文件：<strong>{stats.rawFiles}</strong></div>
              <div>wiki 平铺：<strong>{stats.wikiFlatMd}</strong></div>
              <div>sources：<strong>{stats.sources}</strong></div>
              <div>entities：<strong>{stats.entities}</strong></div>
              <div>topics：<strong>{stats.topics}</strong></div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="搜索设备、故障、工单号…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          />
          <Button onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">找到 {results.length} 条结果</p>
            {results.map((r) => (
              <button
                key={r.relPath}
                type="button"
                className="w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors"
                onClick={() => {
                  onOpenPage?.(r.relPath);
                  window.dispatchEvent(new CustomEvent('llm-wiki:open-page', { detail: r.relPath }));
                }}
              >
                <div className="flex items-center gap-2 font-medium text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {r.title}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.snippet}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">{r.relPath}</p>
              </button>
            ))}
          </div>
        )}

        {query && !searching && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">未找到匹配结果</p>
        )}
      </div>
    </ScrollArea>
  );
}
