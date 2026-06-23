import type { WikiGraphEdge, WikiGraphNode } from '@shared/types';

export type WikiGraphGroup = 'entities' | 'topics' | 'sources' | 'flat';

export type WikiGraphFilterOptions = {
  /** 局部图中心；null = 全局 */
  focusId: string | null;
  /** 局部图深度 0=仅中心 1=一跳 … */
  depth: number;
  hideOrphans: boolean;
  search: string;
  groups: Record<WikiGraphGroup, boolean>;
};

export function computeLocalNodeIds(
  edges: WikiGraphEdge[],
  centerId: string,
  depth: number
): Set<string> {
  const included = new Set<string>([centerId]);
  let frontier = [centerId];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        const nb = e.source === id ? e.target : e.target === id ? e.source : null;
        if (nb && !included.has(nb)) {
          included.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return included;
}

export function filterWikiGraph(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  opts: WikiGraphFilterOptions
): { nodes: WikiGraphNode[]; edges: WikiGraphEdge[] } {
  let n = nodes;
  let e = edges;

  n = n.filter((node) => opts.groups[(node.group as WikiGraphGroup) ?? 'flat'] !== false);

  const q = opts.search.trim().toLowerCase();
  if (q) {
    const match = new Set(
      n
        .filter(
          (node) =>
            node.label.toLowerCase().includes(q) || node.relPath.toLowerCase().includes(q)
        )
        .map((node) => node.id)
    );
    if (match.size > 0) {
      const expanded = new Set<string>(match);
      for (const edge of e) {
        if (match.has(edge.source) || match.has(edge.target)) {
          expanded.add(edge.source);
          expanded.add(edge.target);
        }
      }
      n = n.filter((node) => expanded.has(node.id));
    } else {
      n = [];
    }
  }

  if (opts.focusId && n.some((node) => node.id === opts.focusId)) {
    const ids = computeLocalNodeIds(e, opts.focusId, opts.depth);
    n = n.filter((node) => ids.has(node.id));
  }

  const ids = new Set(n.map((node) => node.id));
  e = e.filter((edge) => ids.has(edge.source) && ids.has(edge.target));

  if (opts.hideOrphans) {
    const deg = new Map<string, number>();
    for (const node of n) deg.set(node.id, 0);
    for (const edge of e) {
      deg.set(edge.source, (deg.get(edge.source) ?? 0) + 1);
      deg.set(edge.target, (deg.get(edge.target) ?? 0) + 1);
    }
    n = n.filter((node) => (deg.get(node.id) ?? 0) > 0 || node.id === opts.focusId);
    const ids2 = new Set(n.map((node) => node.id));
    e = e.filter((edge) => ids2.has(edge.source) && ids2.has(edge.target));
  }

  return { nodes: n, edges: e };
}

export function recalcDegrees(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[]
): WikiGraphNode[] {
  const deg = new Map<string, number>();
  for (const n of nodes) deg.set(n.id, 0);
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }
  return nodes.map((n) => ({ ...n, degree: deg.get(n.id) ?? 0 }));
}
