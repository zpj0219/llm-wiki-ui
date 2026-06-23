import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
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

type WikiMarkdownPreviewProps = {
  content: string;
  onOpenPage?: (relPath: string) => void;
};

export function WikiMarkdownPreview({ content, onOpenPage }: WikiMarkdownPreviewProps) {
  const processed = useMemo(
    () => preprocessHighlights(preprocessWikilinks(content)),
    [content]
  );

  return (
    <div className="prose-wiki">
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
