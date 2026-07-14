/**
 * 把预览/wikilink 产出的粗路径解析成知识库真实 relPath。
 * 例：wiki/激光站.md → wiki/entities/激光站.md
 * 仅供打开页面链路使用，不改变 Markdown 渲染组件。
 */

export function normalizeWikiRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

function titleFromPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.endsWith('.md') ? base.slice(0, -3) : base;
}

function foldKey(s: string): string {
  return s
    .toLowerCase()
    // 去掉书名号、引号等装饰，便于 sources 标题匹配
    .replace(/[《》〈〉「」『』【】\[\]"'“”‘’]/g, '')
    .replace(/[_\-·•\s]/g, '')
    .trim();
}

/** 从展示名提取可检索标题（去书名号等） */
export function cleanWikiTitle(name: string): string {
  return name
    .replace(/[《》〈〉「」『』【】]/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

export function resolveWikiRelPath(
  requested: string,
  knownMdPaths: string[] = []
): string {
  const raw = normalizeWikiRel(requested);
  if (!raw) return raw;

  const paths = knownMdPaths.map(normalizeWikiRel).filter((p) => p.endsWith('.md'));
  const pathSet = new Set(paths.map((p) => p.toLowerCase()));

  const candidates: string[] = [];
  const push = (p: string) => {
    const n = normalizeWikiRel(p);
    if (!n) return;
    if (!candidates.some((c) => c.toLowerCase() === n.toLowerCase())) candidates.push(n);
  };

  // 标题猜测（从 wiki/标题.md 或裸标题）
  const titleGuess =
    raw
      .replace(/^wiki\//i, '')
      .replace(/\.md$/i, '')
      .split('/')
      .pop() ?? '';
  const cleanGuess = cleanWikiTitle(titleGuess);

  // 先放高优先级路径：entities/topics/sources（索引未就绪时也要能猜对）
  for (const title of [titleGuess, cleanGuess]) {
    if (!title) continue;
    push(`wiki/entities/${title}.md`);
    push(`wiki/topics/${title}.md`);
    push(`wiki/sources/${title}.md`);
  }

  push(raw);
  if (!raw.endsWith('.md')) push(`${raw}.md`);
  if (!raw.startsWith('wiki/')) {
    push(`wiki/${raw}`);
    push(raw.endsWith('.md') ? `wiki/${raw}` : `wiki/${raw}.md`);
  }
  if (!raw.includes('/')) {
    push(`wiki/${raw}.md`);
  }
  for (const title of [titleGuess, cleanGuess]) {
    if (!title) continue;
    push(`wiki/${title}.md`);
  }

  // 有索引：精确命中
  for (const c of candidates) {
    if (pathSet.has(c.toLowerCase())) {
      return paths.find((p) => p.toLowerCase() === c.toLowerCase()) ?? c;
    }
  }

  if (paths.length > 0) {
    const keys = [foldKey(titleFromPath(raw)), foldKey(titleGuess), foldKey(cleanGuess)].filter(
      Boolean
    );
    for (const key of keys) {
      const hits = paths.filter((p) => foldKey(titleFromPath(p)) === key);
      if (hits.length === 1) return hits[0]!;
      if (hits.length > 1) {
        const rank = (p: string) => {
          if (p.startsWith('wiki/entities/')) return 0;
          if (p.startsWith('wiki/topics/')) return 1;
          if (p.startsWith('wiki/sources/')) return 2;
          return 3;
        };
        return [...hits].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-CN'))[0]!;
      }
    }

    // 轻微模糊：包含匹配
    for (const key of keys) {
      if (key.length < 2) continue;
      const hits = paths.filter((p) => {
        const t = foldKey(titleFromPath(p));
        return t === key || t.includes(key) || key.includes(t);
      });
      if (hits.length === 1) return hits[0]!;
      if (hits.length > 1) {
        return [...hits].sort(
          (a, b) =>
            titleFromPath(a).length - titleFromPath(b).length || a.localeCompare(b, 'zh-CN')
        )[0]!;
      }
    }
  }

  // 索引未就绪：若原路径已经是 entities/topics/sources 下则原样返回
  if (
    raw.startsWith('wiki/entities/') ||
    raw.startsWith('wiki/topics/') ||
    raw.startsWith('wiki/sources/')
  ) {
    return raw.endsWith('.md') ? raw : `${raw}.md`;
  }

  // 索引未就绪：粗路径 wiki/标题.md → 优先猜 entities
  if (titleGuess || cleanGuess) {
    const t = cleanGuess || titleGuess;
    return `wiki/entities/${t}.md`;
  }

  return candidates.find((c) => c.endsWith('.md')) ?? (raw.endsWith('.md') ? raw : `${raw}.md`);
}
