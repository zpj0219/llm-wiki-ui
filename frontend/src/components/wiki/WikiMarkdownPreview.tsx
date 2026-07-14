import { memo, useMemo, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Calendar, ChevronDown, Tag } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    const label = alias || target;
    const enc = encodeURIComponent(String(target).trim());
    return `[${label}](/__wiki__/${enc})`;
  });
}


/** 解析预览内 wikilink 的 href（兼容相对/绝对 /__wiki__/ 与 wiki://） */
function parseWikiHref(href: string | undefined | null): string | null {
  if (!href) return null;
  const raw = href.trim();

  // 相对路径：/__wiki__/Title
  if (raw.startsWith('/__wiki__/')) {
    try {
      return decodeURIComponent(raw.slice('/__wiki__/'.length));
    } catch {
      return raw.slice('/__wiki__/'.length);
    }
  }

  // 绝对 URL 被浏览器/解析器补全：http://localhost:3000/__wiki__/Title
  const absIdx = raw.indexOf('/__wiki__/');
  if (absIdx >= 0) {
    const rest = raw.slice(absIdx + '/__wiki__/'.length);
    // 去掉 hash/query
    const pathOnly = rest.split('#')[0]!.split('?')[0]!;
    try {
      return decodeURIComponent(pathOnly);
    } catch {
      return pathOnly;
    }
  }

  if (raw.startsWith('wiki://')) {
    try {
      return decodeURIComponent(raw.slice('wiki://'.length));
    } catch {
      return raw.slice('wiki://'.length);
    }
  }
  return null;
}

/** wikilink 目标 → 粗 relPath（再由 openPage / 弹窗 resolve 成真实路径） */
function wikiTargetToRelPath(target: string): string {
  const t = target.trim().replace(/\\/g, '/');
  if (!t) return t;
  if (t.startsWith('wiki/')) return t.endsWith('.md') ? t : `${t}.md`;
  if (t.includes('/')) {
    const withWiki = t.startsWith('wiki/') ? t : `wiki/${t}`;
    return withWiki.endsWith('.md') ? withWiki : `${withWiki}.md`;
  }
  return `wiki/${t}.md`;
}

/** 全局打开事件：关系图弹窗等场景不依赖 props 穿透也能收到 */
export const WIKI_OPEN_PAGE_EVENT = 'llm-wiki:open-preview-page';

export function emitWikiOpenPage(relPath: string): void {
  if (!relPath || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WIKI_OPEN_PAGE_EVENT, { detail: relPath }));
}

function preprocessHighlights(content: string): string {
  return content.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}

// ── Frontmatter parsing ────────────────────────────────────────────

export type FrontmatterData = {
  /** The raw key-value map parsed from YAML frontmatter */
  fields: Record<string, unknown>;
  /** The body content with frontmatter stripped */
  body: string;
};

/** Heuristic key labels that are date-like */
const DATE_LIKE_KEYS = new Set([
  'date', 'created', 'updated', 'modified', 'published',
  'date_created', 'date_modified', 'date_published',
]);

/** Keys whose values should render as badges */
const BADGE_LIKE_KEYS = new Set(['tags', 'tag', 'aliases', 'alias', 'categories', 'category']);

/** 可作为文档链接点击的 frontmatter 字段 */
const LINK_LIKE_KEYS = new Set([
  'sources',
  'source',
  'source_file',
  'related',
  'see_also',
  'see-also',
  'refs',
  'references',
]);

/**
 * Parse Obsidian-style YAML frontmatter (between leading `---` fences).
 * Handles simple scalars, inline arrays `[a, b]`, and block lists `- item`.
 * Returns the parsed fields and the remaining body text.
 */
export function parseFrontmatter(raw: string): FrontmatterData {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) return { fields: {}, body: raw };

  const secondFence = trimmed.indexOf('\n---', 3);
  if (secondFence === -1) return { fields: {}, body: raw };

  const fmBlock = trimmed.slice(3, secondFence).trim();
  const body = trimmed.slice(secondFence + 4).trimStart();

  const fields: Record<string, unknown> = {};

  // Split into logical lines (handle multi-line arrays)
  const lines = fmBlock.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Skip empty / comment lines
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    let value: string | string[] = line.slice(colonIdx + 1).trim();

    // Quoted string
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      fields[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      i++;
      continue;
    }

    // Block array (next lines start with `- `)
    if (value === '' || value === '[]') {
      const arr: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j]!;
        const match = nextLine.match(/^\s*-\s+(.+)$/);
        if (match) {
          arr.push(match[1]!.trim().replace(/^["']|["']$/g, ''));
          j++;
        } else {
          break;
        }
      }
      if (arr.length > 0) {
        fields[key] = arr;
        i = j;
        continue;
      }
      fields[key] = '';
      i++;
      continue;
    }

    // Simple scalar
    fields[key] = value;
    i++;
  }

  return { fields, body };
}

// ── Frontmatter display component ──────────────────────────────────

function FrontmatterCard({ fields, onOpenPage }: { fields: Record<string, unknown>; onOpenPage?: (relPath: string) => void }) {
  const entries = Object.entries(fields);
  const hasLinks = entries.some(([k]) => LINK_LIKE_KEYS.has(k.toLowerCase()));
  // 有 sources 等可点字段时默认展开，避免用户找不到
  const [collapsed, setCollapsed] = useState(!hasLinks);

  if (entries.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border bg-card/50 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
            collapsed ? '-rotate-90' : ''
          }`}
        />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          属性
        </span>
        {collapsed && (
          <span className="text-[11px] text-muted-foreground/50 ml-auto tabular-nums">
            {entries.length}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="divide-y divide-border/50 border-t">
          {entries.map(([key, rawValue]) => {
            const isDate = DATE_LIKE_KEYS.has(key.toLowerCase());
            const isBadge = BADGE_LIKE_KEYS.has(key.toLowerCase());

            return (
              <div
                key={key}
                className="flex items-start gap-3 px-4 py-2 text-xs"
              >
                <span className="shrink-0 w-24 font-medium text-muted-foreground pt-0.5 capitalize">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {isBadge && Array.isArray(rawValue) ? (
                    <span className="flex flex-wrap gap-1">
                      {(rawValue as string[]).map((v) => (
                        <span
                          key={v}
                          className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {v}
                        </span>
                      ))}
                    </span>
                  ) : isDate ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {String(rawValue)}
                    </span>
                  ) : Array.isArray(rawValue) ? (
                    LINK_LIKE_KEYS.has(key.toLowerCase()) && onOpenPage ? (
                      <span className="flex flex-wrap gap-1.5">
                        {(rawValue as string[]).map((v) => (
                          <button
                            key={v}
                            type="button"
                            className="text-left text-blue-600 hover:underline dark:text-blue-400"
                            title="打开关联文档"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const p = String(v);
                              onOpenPage?.(p);
                              emitWikiOpenPage(p);
                            }}
                          >
                            {String(v)}
                          </button>
                        ))}
                      </span>
                    ) : (
                      (rawValue as string[]).join(', ')
                    )
                  ) : LINK_LIKE_KEYS.has(key.toLowerCase()) && onOpenPage ? (
                    <button
                      type="button"
                      className="text-left text-blue-600 hover:underline dark:text-blue-400"
                      title="打开关联文档"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const p = String(rawValue);
                        onOpenPage?.(p);
                        emitWikiOpenPage(p);
                      }}
                    >
                      {String(rawValue)}
                    </button>
                  ) : (
                    String(rawValue)
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Draggable scroll table wrapper ──────────────────────────────────

function DraggableTable({ children, ...tableProps }: any) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    // Only start drag if content is actually scrollable
    if (el.scrollWidth <= el.clientWidth) return;
    dragging.current = true;
    startX.current = e.clientX;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - startX.current;
    el.scrollLeft = scrollLeft.current - dx;
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    const el = ref.current;
    if (el) {
      el.style.cursor = '';
      el.style.userSelect = '';
    }
  }, []);

  return (
    <div
      ref={ref}
      className="overflow-x-auto -mx-4 px-4 cursor-grab"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <table {...tableProps} className="w-auto min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

type WikiMarkdownPreviewProps = {
  content: string;
  onOpenPage?: (relPath: string) => void;
};

function WikiMarkdownPreviewInner({ content, onOpenPage }: WikiMarkdownPreviewProps) {
  const { fields, body } = useMemo(() => parseFrontmatter(content), [content]);

  const processed = useMemo(
    () => preprocessHighlights(preprocessWikilinks(body)),
    [body],
  );

  return (
    <div className="prose-wiki">
      <FrontmatterCard fields={fields} onOpenPage={onOpenPage} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        // 允许内部 wikilink 协议；默认会把非 http(s)/mailto 清空导致 href=""
        urlTransform={(url) => {
          // 绝对化后的内部链接仍保留（避免 href 被清掉）
          if (url.startsWith('wiki://') || url.startsWith('/__wiki__/') || url.includes('/__wiki__/')) {
            return url;
          }
          // 复用默认安全策略：危险协议变空
          const colon = url.indexOf(':');
          if (colon === -1) return url;
          const before = url.slice(0, colon);
          if (/^(https?|ircs?|mailto|xmpp)$/i.test(before)) return url;
          if (before.includes('/') || before.includes('?') || before.includes('#')) return url;
          return '';
        }}
        components={{
          table: ({ children, ...tableProps }: any) => (
            <DraggableTable {...tableProps}>
              {children}
            </DraggableTable>
          ),
          a: ({ href, children, ...props }: any) => {
            // 兼容相对/绝对 /__wiki__/ 与 wiki://
            const wikiTarget = parseWikiHref(href);
            if (wikiTarget != null) {
              const relPath = wikiTargetToRelPath(wikiTarget);
              return (
                <button
                  type="button"
                  data-wiki-link={relPath}
                  className="text-blue-600 hover:underline dark:text-blue-400 bg-transparent border-0 p-0 cursor-pointer font-inherit text-inherit"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // props 回调（工作台）+ 全局事件（关系图弹窗）双通道
                    onOpenPage?.(relPath);
                    emitWikiOpenPage(relPath);
                  }}
                >
                  {children}
                </button>
              );
            }
            // 空 href 是被 urlTransform 清掉的危险协议，绝不能当站内链接
            if (!href) {
              return <span className="text-blue-600 dark:text-blue-400">{children}</span>;
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

/** 内容与 onOpenPage 不变时跳过重渲，避免父级高频刷新拆掉点击中的链接按钮 */
export const WikiMarkdownPreview = memo(WikiMarkdownPreviewInner);
