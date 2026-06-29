import { useMemo, useState } from 'react';
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
    return `[${label}](wiki://${enc})`;
  });
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

function FrontmatterCard({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields);
  const [collapsed, setCollapsed] = useState(true);

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
                    (rawValue as string[]).join(', ')
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

// ── Main component ─────────────────────────────────────────────────

type WikiMarkdownPreviewProps = {
  content: string;
  onOpenPage?: (relPath: string) => void;
};

export function WikiMarkdownPreview({ content, onOpenPage }: WikiMarkdownPreviewProps) {
  const { fields, body } = useMemo(() => parseFrontmatter(content), [content]);

  const processed = useMemo(
    () => preprocessHighlights(preprocessWikilinks(body)),
    [body],
  );

  return (
    <div className="prose-wiki">
      <FrontmatterCard fields={fields} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('wiki://')) {
              const target = decodeURIComponent(href.slice(7));
              return (
                <button
                  type="button"
                  className="text-blue-600 hover:underline dark:text-blue-400 bg-transparent border-0 p-0 cursor-pointer font-inherit text-inherit"
                  onClick={() => {
                    const rel = target.includes('/') ? `wiki/${target}` : `wiki/${target}.md`;
                    onOpenPage?.(rel.endsWith('.md') ? rel : `${rel}.md`);
                  }}
                >
                  {children}
                </button>
              );
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
