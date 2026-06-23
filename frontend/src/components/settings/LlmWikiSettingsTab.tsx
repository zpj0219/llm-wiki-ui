import { useState } from 'react';
import { FolderTree, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  KARPATHY_WIKI_GIST,
  KARPATHY_WIKI_TAGLINE,
  LLM_WIKI_SKILL_REPO,
} from '@shared/constants';
import {
  getLlmWikiSettings,
  saveLlmWikiSettings,
  type LlmWikiSettings,
} from '@/services/llmWikiSettings';

export function LlmWikiSettingsTab() {
  const [settings, setSettings] = useState<LlmWikiSettings>(() => getLlmWikiSettings());

  const update = (patch: Partial<LlmWikiSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveLlmWikiSettings(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            知识库路径
          </CardTitle>
          <CardDescription>
            Web 版当前使用后端 Mock 数据；以下配置与 EdgeModelStudio / llm-wiki-skill 目录约定对齐，供后续对接真实 Vault。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3 font-mono text-sm break-all">
            /data/knowledge-base/{settings.relativeRoot}/
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiki-root">Wiki 子目录名</Label>
            <Input
              id="wiki-root"
              value={settings.relativeRoot}
              onChange={(e) =>
                update({
                  relativeRoot:
                    e.target.value.replace(/\.\./g, '').replace(/^\/+|\/+$/g, '') || 'llm-wiki',
                })
              }
              placeholder="llm-wiki"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{KARPATHY_WIKI_TAGLINE}</CardTitle>
          <CardDescription>
            对齐{' '}
            <a href={LLM_WIKI_SKILL_REPO} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
              llm-wiki-skill
              <ExternalLink className="h-3 w-3" />
            </a>
            {' '}与{' '}
            <a href={KARPATHY_WIKI_GIST} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
              Karpathy LLM-Wiki
              <ExternalLink className="h-3 w-3" />
            </a>
            方法论
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="max-chars">注入上下文最大字符数</Label>
            <Input
              id="max-chars"
              type="number"
              min={2000}
              max={200000}
              step={1000}
              value={settings.maxContextChars}
              onChange={(e) =>
                update({
                  maxContextChars: Math.min(
                    200000,
                    Math.max(2000, parseInt(e.target.value, 10) || settings.maxContextChars)
                  ),
                })
              }
            />
            <p className="text-xs text-muted-foreground">控制 purpose.md、index.md 注入时的截断上限</p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label>Query 只读模式</Label>
              <p className="text-xs text-muted-foreground mt-0.5">禁止 query 结果写入 wiki/queries/</p>
            </div>
            <Switch
              checked={settings.chatQueryReadOnly}
              onCheckedChange={(checked) => update({ chatQueryReadOnly: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label>上传 raw 后登记 index.md</Label>
              <p className="text-xs text-muted-foreground mt-0.5">在 index 末尾追加本次上传路径</p>
            </div>
            <Switch
              checked={settings.appendRawRegisterToIndexOnUpload}
              onCheckedChange={(checked) => update({ appendRawRegisterToIndexOnUpload: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
