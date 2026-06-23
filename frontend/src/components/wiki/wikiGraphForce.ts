import type { WikiGraphEdge, WikiGraphNode } from '@shared/types';

export type ForceSimNode = WikiGraphNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
};

export type ForceSimConfig = {
  width: number;
  height: number;
  linkDistance: number;
  repulsion: number;
  centerStrength: number;
  linkStrength: number;
};

const DEFAULT_CONFIG: ForceSimConfig = {
  width: 960,
  height: 560,
  linkDistance: 88,
  repulsion: 8200,
  centerStrength: 0.006,
  linkStrength: 0.072,
};

export type LayoutCircle = {
  cx: number;
  cy: number;
  radius: number;
};

/** 布局可用圆形区域（替代矩形裁剪） */
export function layoutCircleBounds(width: number, height: number, padding = 24): LayoutCircle {
  return {
    cx: width / 2,
    cy: height / 2,
    radius: Math.max(40, Math.min(width, height) / 2 - padding),
  };
}

function clampSimNode(n: ForceSimNode, width: number, height: number): void {
  const { cx, cy, radius } = layoutCircleBounds(width, height);
  const dx = n.x - cx;
  const dy = n.y - cy;
  const d = Math.hypot(dx, dy);
  if (d > radius && d > 0.01) {
    const s = radius / d;
    n.x = cx + dx * s;
    n.y = cy + dy * s;
  }
}

/** 黄金角螺旋初始分布，节点落在圆盘内 */
export function initialNodePosition(
  index: number,
  total: number,
  width: number,
  height: number
): { x: number; y: number } {
  const { cx, cy, radius } = layoutCircleBounds(width, height);
  if (total <= 1) return { x: cx, y: cy };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const maxR = radius * 0.96;
  const t = index + 0.5;
  const r = maxR * Math.sqrt(t / total);
  const angle = t * golden;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** 节点较多时提高斥力，减轻「全部吸到中心」 */
export function repulsionForNodeCount(base: number, count: number): number {
  if (count <= 40) return base;
  return base * Math.min(4, Math.sqrt(count / 40));
}

export function layoutTickCountForNodes(count: number): number {
  return Math.min(500, 60 + Math.floor(count * 2.5));
}

/** 消解过近节点；纵坐标接近时优先沿 Y 方向错开，避免挤成横条 */
export function resolveNodeCollisions(
  sim: ForceSimNode[],
  width: number,
  height: number,
  minGap = 24
): void {
  const yFlatBand = 18;
  const passes = sim.length > 80 ? 5 : 3;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < sim.length; i++) {
      for (let j = i + 1; j < sim.length; j++) {
        const a = sim[i];
        const b = sim[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= minGap) continue;
        const push = (minGap - dist) * 0.55;
        let nx = dx / dist;
        let ny = dy / dist;
        if (Math.abs(dy) < yFlatBand) {
          ny = dy >= 0 ? 1 : -1;
          nx = Math.abs(nx) < 0.15 ? (i % 2 === 0 ? 0.35 : -0.35) : nx * 0.35;
          const len = Math.hypot(nx, ny) || 1;
          nx /= len;
          ny /= len;
        }
        if (!a.fixed) {
          a.x -= nx * push;
          a.y -= ny * push;
          clampSimNode(a, width, height);
        }
        if (!b.fixed) {
          b.x += nx * push;
          b.y += ny * push;
          clampSimNode(b, width, height);
        }
      }
    }
  }
}

export function createForceSimNodes(
  nodes: WikiGraphNode[],
  width: number,
  height: number
): ForceSimNode[] {
  return nodes.map((n, i) => {
    const { x, y } = initialNodePosition(i, nodes.length, width, height);
    return {
      ...n,
      x,
      y,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });
}

/** 单步力导向（Obsidian 式持续模拟） */
export function tickForceSimulation(
  sim: ForceSimNode[],
  edges: WikiGraphEdge[],
  alpha: number,
  cfg: Partial<ForceSimConfig> = {}
): void {
  const { width, height, linkDistance, repulsion, centerStrength, linkStrength } = {
    ...DEFAULT_CONFIG,
    ...cfg,
  };
  const byId = new Map(sim.map((n) => [n.id, n]));

  for (let i = 0; i < sim.length; i++) {
    for (let j = i + 1; j < sim.length; j++) {
      const a = sim[i];
      const b = sim[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy) || 0.01;
      let force = (repulsion * alpha) / (dist * dist);
      const yFlatBand = 20;
      if (Math.abs(dy) < yFlatBand) {
        const t = 1 - Math.abs(dy) / yFlatBand;
        force *= 1 + 2.2 * t;
        const nx = dx / dist;
        let ny = dy / dist;
        if (Math.abs(ny) < 0.08) ny = j > i ? 1 : -1;
        const vy = ny >= 0 ? 1 : -1;
        const blend = 0.7 * t;
        const fx = nx * (1 - blend);
        const fy = vy * blend;
        const flen = Math.hypot(fx, fy) || 1;
        dx = (fx / flen) * force;
        dy = (fy / flen) * force;
      } else {
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
      }
      if (!a.fixed) {
        a.vx -= dx;
        a.vy -= dy;
      }
      if (!b.fixed) {
        b.vx += dx;
        b.vy += dy;
      }
    }
  }

  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const pull = ((dist - linkDistance) * linkStrength * alpha) / dist;
    dx *= pull;
    dy *= pull;
    if (!a.fixed) {
      a.vx += dx;
      a.vy += dy;
    }
    if (!b.fixed) {
      b.vx -= dx;
      b.vy -= dy;
    }
  }

  const circle = layoutCircleBounds(width, height);
  const { cx, cy, radius } = circle;
  for (const n of sim) {
    if (n.fixed) {
      n.vx = 0;
      n.vy = 0;
      clampSimNode(n, width, height);
      continue;
    }
    n.vx += (cx - n.x) * centerStrength * alpha;
    n.vy += (cy - n.y) * centerStrength * alpha;
    const dx = n.x - cx;
    const dy = n.y - cy;
    const d = Math.hypot(dx, dy) || 0.01;
    if (d > radius * 0.9) {
      const overshoot = (d - radius * 0.9) / radius;
      n.vx -= (dx / d) * overshoot * 1.1 * alpha;
      n.vy -= (dy / d) * overshoot * 1.1 * alpha;
    }
    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += n.vx;
    n.y += n.vy;
    clampSimNode(n, width, height);
  }

  const minGap = sim.length > 100 ? 18 : sim.length > 50 ? 20 : 24;
  resolveNodeCollisions(sim, width, height, minGap);
}

export function simToPositionMap(sim: ForceSimNode[]): Map<string, { x: number; y: number }> {
  return new Map(sim.map((n) => [n.id, { x: n.x, y: n.y }]));
}

export function mergeSimWithNodes(
  prev: ForceSimNode[],
  nodes: WikiGraphNode[],
  width: number,
  height: number
): ForceSimNode[] {
  const prevMap = new Map(prev.map((n) => [n.id, n]));
  const newcomers = nodes.filter((n) => !prevMap.has(n.id));
  let newIdx = 0;
  return nodes.map((n) => {
    const old = prevMap.get(n.id);
    if (old) return { ...old, ...n, fixed: old.fixed };
    const { x, y } = initialNodePosition(
      newIdx++,
      newcomers.length || nodes.length,
      width,
      height
    );
    return {
      ...n,
      x,
      y,
      vx: 0,
      vy: 0,
      fixed: false,
    };
  });
}
