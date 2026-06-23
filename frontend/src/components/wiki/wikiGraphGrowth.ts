import type { WikiGraphEdge, WikiGraphNode } from '@shared/types';

/** 顺序播放：节点逐个蹦出，再建立连线 */
export const SEQUENTIAL_GROWTH = {
  /** 相邻两个节点开始蹦出的间隔 */
  nodeIntervalMs: 150,
  /** 单节点蹦出时长 */
  nodePopMs: 340,
  /** 新节点开始蹦出后，连线延迟 */
  edgeLagMs: 50,
  /** 连线绘制时长 */
  edgeDrawMs: 280,
} as const;

export type RevealSequence = {
  order: string[];
  delays: Map<string, number>;
  orderIndex: Map<string, number>;
};

export function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** 带回弹的缓动，用于节点「蹦出」 */
export function easeOutBack(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

export function growthProgress(elapsedMs: number, delayMs: number, durationMs: number): number {
  if (elapsedMs <= delayMs) return 0;
  return easeOutCubic((elapsedMs - delayMs) / durationMs);
}

/** BFS 从枢纽/焦点出发，决定逐个出现的顺序 */
export function computeRevealSequence(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  seedId?: string | null
): RevealSequence {
  const delays = new Map<string, number>();
  const orderIndex = new Map<string, number>();
  if (nodes.length === 0) return { order: [], delays, orderIndex };

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  const byDegree = [...nodes].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
  const seed =
    (seedId && nodes.some((n) => n.id === seedId) ? seedId : null) ?? byDegree[0]?.id ?? nodes[0].id;

  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [seed];
  seen.add(seed);

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const neighbors = (adj.get(id) ?? []).sort(
      (a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0)
    );
    for (const nb of neighbors) {
      if (!seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }

  for (const n of nodes) {
    if (!seen.has(n.id)) order.push(n.id);
  }

  order.forEach((id, i) => {
    orderIndex.set(id, i);
    delays.set(id, i * SEQUENTIAL_GROWTH.nodeIntervalMs);
  });

  return { order, delays, orderIndex };
}

/** @deprecated 兼容旧调用 */
export function computeNodeRevealDelays(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  seedId?: string | null
): Map<string, number> {
  return computeRevealSequence(nodes, edges, seedId).delays;
}

export function growthAnimationEndMs(seq: RevealSequence): number {
  const n = seq.order.length;
  if (n === 0) return 0;
  const lastDelay = (n - 1) * SEQUENTIAL_GROWTH.nodeIntervalMs;
  return lastDelay + SEQUENTIAL_GROWTH.nodePopMs + SEQUENTIAL_GROWTH.edgeLagMs + SEQUENTIAL_GROWTH.edgeDrawMs + 120;
}

/** 节点蹦出进度 0–1 */
export function getNodePop(elapsedMs: number, delayMs: number): number {
  return growthProgress(elapsedMs, delayMs, SEQUENTIAL_GROWTH.nodePopMs);
}

/** 节点蹦出缩放（可略大于 1 产生回弹） */
export function getNodePopScale(pop: number): number {
  if (pop <= 0) return 0;
  if (pop >= 1) return 1;
  return easeOutBack(pop);
}

/** 连线绘制进度：在后出现的节点开始蹦出后绘制 */
export function getEdgeDraw(
  elapsedMs: number,
  sourceId: string,
  targetId: string,
  orderIndex: Map<string, number>
): number {
  const si = orderIndex.get(sourceId) ?? 0;
  const ti = orderIndex.get(targetId) ?? 0;
  const laterOrder = Math.max(si, ti);
  const edgeDelay = laterOrder * SEQUENTIAL_GROWTH.nodeIntervalMs + SEQUENTIAL_GROWTH.edgeLagMs;
  return growthProgress(elapsedMs, edgeDelay, SEQUENTIAL_GROWTH.edgeDrawMs);
}

/** 连线起点应为先出现的节点，终点为后出现的节点 */
export function edgeEndpoints(
  sourceId: string,
  targetId: string,
  orderIndex: Map<string, number>
): { fromId: string; toId: string } {
  const si = orderIndex.get(sourceId) ?? 0;
  const ti = orderIndex.get(targetId) ?? 0;
  return si <= ti ? { fromId: sourceId, toId: targetId } : { fromId: targetId, toId: sourceId };
}

/** @deprecated */
export function getNodeGrowth(elapsedMs: number, delayMs: number): number {
  return getNodePop(elapsedMs, delayMs);
}

/** @deprecated */
export function getEdgeGrowth(elapsedMs: number, sourceDelay: number, targetDelay: number): number {
  const laterDelay = Math.max(sourceDelay, targetDelay) + SEQUENTIAL_GROWTH.edgeLagMs;
  return growthProgress(elapsedMs, laterDelay, SEQUENTIAL_GROWTH.edgeDrawMs);
}

/** @deprecated */
export function lerpFromCenter(
  cx: number,
  cy: number,
  x: number,
  y: number,
  t: number
): { x: number; y: number } {
  const p = easeOutCubic(t);
  return { x: cx + (x - cx) * p, y: cy + (y - cy) * p };
}
