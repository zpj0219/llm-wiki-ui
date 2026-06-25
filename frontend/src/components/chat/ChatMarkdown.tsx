import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import 'highlight.js/styles/github-dark.css';

type ChatMarkdownProps = {
  content: string;
  className?: string;
  /** 用户气泡（深色背景）下的样式变体 */
  variant?: 'default' | 'user';
};

export function ChatMarkdown({ content, className, variant = 'default' }: ChatMarkdownProps) {
  if (!content.trim()) return null;

  return (
    <div
      className={cn(
        'prose-chat',
        variant === 'user' && 'prose-chat-user',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" {...props}>
              {children}
            </a>
          ),
          pre: ({ children, ...props }) => (
            <pre {...props}>{children}</pre>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
