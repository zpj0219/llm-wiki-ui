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
  /**
   * 图距离（跳数）→ 斥力衰减表。key 为无序节点对 `minId\0maxId`。
   * 缺省时斥力不按跳数衰减（旧行为）。
   */
  hopMap?: Map<string, number>;
  /** BFS 最大有效跳数；hop≤此值参与力度/延时，超出或不可达系数为 0。默认 4 */
  hopMax?: number;
  /** 每多 1 跳，斥力乘以此系数。默认 0.5（减半） */
  hopDecay?: number;
  /**
   * 力传导波源节点 id（通常是正在拖拽 / 刚松手的点）。
   * 配合 impulseStartMs：越远跳数越晚才开始受力。
   */
  impulseSourceId?: string | null;
  /** 波源开始时间（performance.now()） */
  impulseStartMs?: number;
  /** 当前时间（performance.now()）；缺省时不做延时门控 */
  nowMs?: number;
  /** 2 跳起算的基础延时 ms。默认 90 */
  hopLatencyBaseMs?: number;
  /** 每多 1 跳，延时乘以此系数。默认 2 */
  hopLatencyGrowth?: number;
  /** 延时到期后力从 0→1 的缓入时长 ms。默认 70 */
  hopLatencyRampMs?: number;
  /**
   * 全局力缩放（斥力/拉力/中心/边界）。生长期点数增多时压低，避免整图抖。
   * 默认 1。
   */
  forceScale?: number;
  /** 速度阻尼系数，每步 v *= damping。默认 0.82；更大更稳、更黏 */
  velocityDamping?: number;
  /** 碰撞消解轮数；0 关闭。默认按节点数自适应 */
  collisionPasses?: number;
  /**
   * 跳数对「空间斥力」的下限。>hopMax 的点对仍保留此比例斥力，避免远点互不推开而挤中心。
   * 拖拽传导仍用 hop 延时门控。默认 0.22。
   */
  hopSpatialFloor?: number;
  /** 覆盖碰撞最小间距；缺省按节点数 */
  packingMinGap?: number;
  /** 覆盖中心力缩放；缺省按节点数自适应 */
  packingCenterScale?: number;
};

const DEFAULT_CONFIG: ForceSimConfig = {
  width: 960,
  height: 560,
  linkDistance: 88,
  repulsion: 8200,
  centerStrength: 0.006,
  linkStrength: 0.072,
  forceScale: 1,
  velocityDamping: 0.82,
  hopSpatialFloor: 0.22,
};

export type LayoutCircle = {
  cx: number;
  cy: number;
  /** 正圆半径（与铺满矩形的椭圆等面积） */
  radius: number;
  /** 兼容字段：正圆时 rx = ry = radius */
  rx: number;
  ry: number;
};

/** @deprecated 与 LayoutCircle 相同 */
export type LayoutEllipse = LayoutCircle;

/**
 * 按节点数扩展布局画布。点多时原先固定 960×560 + 内接圆太挤。
 */
export function layoutSizeForNodeCount(
  count: number,
  baseW = 960,
  baseH = 560
): { w: number; h: number } {
  const n = Math.max(1, count);
  // 约 25 点起放大，上限 ~3.2×，给大图更多铺开空间
  const scale = Math.min(3.2, Math.max(1, Math.sqrt(n / 25)));
  return {
    w: Math.round(baseW * scale),
    h: Math.round(baseH * scale),
  };
}

/**
 * 布局可用正圆区域。
 * 半径取「铺满矩形的椭圆」等面积：r = √(rx·ry)，
 * 960×560 时约 √(460×260)≈346（比内接圆 260 更大，比横拉椭圆更圆）。
 */
export function layoutCircleBounds(
  width: number,
  height: number,
  padding = 20
): LayoutCircle {
  const pad = Math.max(8, padding);
  const halfW = Math.max(40, width / 2 - pad);
  const halfH = Math.max(40, height / 2 - pad);
  // 与椭圆 π·halfW·halfH 等面积的正圆
  const radius = Math.max(40, Math.sqrt(halfW * halfH));
  return {
    cx: width / 2,
    cy: height / 2,
    radius,
    rx: radius,
    ry: radius,
  };
}

/** 将点约束在正圆内 */
function clampSimNode(n: ForceSimNode, width: number, height: number): void {
  const { cx, cy, radius } = layoutCircleBounds(width, height);
  const dx = n.x - cx;
  const dy = n.y - cy;
  const d = Math.hypot(dx, dy);
  if (d > radius && d > 1e-8) {
    const s = radius / d;
    n.x = cx + dx * s;
    n.y = cy + dy * s;
  }
}

/** 黄金角螺旋初始分布，节点落在正圆盘内 */
export function initialNodePosition(
  index: number,
  total: number,
  width: number,
  height: number
): { x: number; y: number } {
  const { cx, cy, radius } = layoutCircleBounds(width, height);
  if (total <= 1) return { x: cx, y: cy };
  const golden = Math.PI * (3 - Math.sqrt(5));
  const t = index + 0.5;
  const u = Math.sqrt(t / total) * 0.96;
  const angle = t * golden;
  return {
    x: cx + Math.cos(angle) * u * radius,
    y: cy + Math.sin(angle) * u * radius,
  };
}

/** 节点较多时提高斥力，减轻「全部吸到中心」 */
export function repulsionForNodeCount(base: number, count: number): number {
  if (count <= 30) return base;
  return base * Math.min(6.5, Math.sqrt(count / 28));
}

/**
 * 按画布面积与点数估算理想间距，用于连线距离 / 碰撞间隙 / 斥力。
 * 目标：点尽量铺满可用椭圆区域，而不是挤在中心。
 */
export function packingMetrics(
  count: number,
  width: number,
  height: number,
  baseLinkDistance = 88
): { linkDistance: number; minGap: number; repulsionScale: number; centerScale: number } {
  const n = Math.max(1, count);
  const { rx, ry } = layoutCircleBounds(width, height);
  const area = Math.PI * rx * ry;
  // 每点可用面积 → 理想最近邻间距
  const ideal = Math.sqrt(area / n);
  const linkDistance = Math.max(
    baseLinkDistance,
    Math.min(baseLinkDistance * 2.6, ideal * 0.92)
  );
  const minGap = Math.max(18, Math.min(48, ideal * 0.42));
  // 斥力 ~ 间距²：间距变大时需要更大 k 才能撑开
  const repulsionScale = Math.max(1, Math.min(8, (linkDistance / baseLinkDistance) ** 2 * Math.sqrt(n / 40)));
  // 点越多中心引力越弱，几乎只靠边与斥力铺开
  const centerScale = n <= 20 ? 1 : n <= 50 ? 0.45 : n <= 100 ? 0.18 : 0.08;
  return { linkDistance, minGap, repulsionScale, centerScale };
}

/**
 * 生长动画阶段的力学镇定参数：点数越多，回温越弱、冷却越快、力越软。
 * 早期仍保留足够吸合；后期避免「整图快速乱动」。
 */
export function growthPhysicsCalm(activeCount: number): {
  reheat: number;
  alphaFloor: number;
  coolRate: number;
  forceScale: number;
  velocityDamping: number;
  tickAlphaFloor: number;
  collisionPasses: number;
} {
  const n = Math.max(0, activeCount);
  if (n <= 12) {
    return {
      reheat: 0.4,
      alphaFloor: 0.08,
      coolRate: 0.985,
      forceScale: 1,
      velocityDamping: 0.82,
      tickAlphaFloor: 0.08,
      collisionPasses: 3,
    };
  }
  if (n <= 28) {
    return {
      reheat: 0.22,
      alphaFloor: 0.035,
      coolRate: 0.975,
      forceScale: 0.72,
      velocityDamping: 0.8,
      tickAlphaFloor: 0.03,
      collisionPasses: 2,
    };
  }
  if (n <= 55) {
    return {
      reheat: 0.12,
      alphaFloor: 0.015,
      coolRate: 0.96,
      forceScale: 0.5,
      velocityDamping: 0.78,
      tickAlphaFloor: 0.01,
      collisionPasses: 1,
    };
  }
  // 大图：新点几乎只靠落点 + 轻微邻接吸合，不再整图持续高温
  return {
    reheat: 0.06,
    alphaFloor: 0.004,
    coolRate: 0.94,
    forceScale: Math.max(0.28, 0.55 * Math.sqrt(40 / n)),
    velocityDamping: 0.76,
    tickAlphaFloor: 0,
    collisionPasses: 1,
  };
}

export function layoutTickCountForNodes(count: number): number {
  return Math.min(500, 60 + Math.floor(count * 2.5));
}

/** 消解过近节点；纵坐标接近时优先沿 Y 方向错开，避免挤成横条 */
export function resolveNodeCollisions(
  sim: ForceSimNode[],
  width: number,
  height: number,
  minGap = 24,
  passesOverride?: number
): void {
  const yFlatBand = 18;
  const passes =
    passesOverride !== undefined
      ? Math.max(0, Math.floor(passesOverride))
      : sim.length > 80
        ? 5
        : 3;
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

/**
 * 新节点出现时，相对当前已存在结构估算落点：
 * - 有已出现邻居：落在邻居质心附近（单邻居则大致按 linkDistance 外推）
 * - 没有：布局圆内随机
 */
export function placeNodeRelativeToStructure(
  node: ForceSimNode,
  sim: ForceSimNode[],
  edges: WikiGraphEdge[],
  activeIds: Set<string>,
  width: number,
  height: number,
  linkDistance = DEFAULT_CONFIG.linkDistance
): void {
  const neighborIds: string[] = [];
  for (const e of edges) {
    if (e.source === node.id && activeIds.has(e.target)) neighborIds.push(e.target);
    else if (e.target === node.id && activeIds.has(e.source)) neighborIds.push(e.source);
  }

  const byId = new Map(sim.map((n) => [n.id, n]));
  const neighbors = neighborIds
    .map((id) => byId.get(id))
    .filter((n): n is ForceSimNode => Boolean(n));

  if (neighbors.length === 0) {
    // 随机点（正圆盘内，避开正中心一点）
    const { cx, cy, radius } = layoutCircleBounds(width, height);
    const angle = Math.random() * Math.PI * 2;
    const u = 0.12 + Math.random() * 0.62;
    node.x = cx + Math.cos(angle) * u * radius;
    node.y = cy + Math.sin(angle) * u * radius;
  } else if (neighbors.length === 1) {
    const nb = neighbors[0]!;
    // 相对唯一邻居：在 linkDistance 附近找空位方向
    let bestAngle = Math.random() * Math.PI * 2;
    let bestScore = -Infinity;
    const samples = 10;
    for (let s = 0; s < samples; s++) {
      const angle = (Math.PI * 2 * s) / samples + Math.random() * 0.2;
      const candX = nb.x + Math.cos(angle) * linkDistance;
      const candY = nb.y + Math.sin(angle) * linkDistance;
      // 偏好离其它已激活点更远
      let minD = Infinity;
      for (const other of sim) {
        if (!activeIds.has(other.id) || other.id === nb.id) continue;
        const d = Math.hypot(other.x - candX, other.y - candY);
        if (d < minD) minD = d;
      }
      if (minD > bestScore) {
        bestScore = minD;
        bestAngle = angle;
      }
    }
    const jitter = linkDistance * (0.85 + Math.random() * 0.3);
    node.x = nb.x + Math.cos(bestAngle) * jitter;
    node.y = nb.y + Math.sin(bestAngle) * jitter;
  } else {
    // 多邻居：在邻居外围找空位，避免全落在质心导致中心堆叠
    let sx = 0;
    let sy = 0;
    for (const nb of neighbors) {
      sx += nb.x;
      sy += nb.y;
    }
    const mx = sx / neighbors.length;
    const my = sy / neighbors.length;
    const { cx, cy } = layoutCircleBounds(width, height);
    // 从质心沿「离开图中心」方向外推，帮助铺开
    let ox = mx - cx;
    let oy = my - cy;
    const ol = Math.hypot(ox, oy);
    if (ol < 1e-3) {
      const ang = Math.random() * Math.PI * 2;
      ox = Math.cos(ang);
      oy = Math.sin(ang);
    } else {
      ox /= ol;
      oy /= ol;
    }
    let bestX = mx + ox * linkDistance;
    let bestY = my + oy * linkDistance;
    let bestScore = -Infinity;
    const samples = 12;
    for (let s = 0; s < samples; s++) {
      const angle = (Math.PI * 2 * s) / samples + Math.random() * 0.15;
      const candX = mx + Math.cos(angle) * linkDistance * (0.9 + Math.random() * 0.35);
      const candY = my + Math.sin(angle) * linkDistance * (0.9 + Math.random() * 0.35);
      let minD = Infinity;
      for (const other of sim) {
        if (!activeIds.has(other.id)) continue;
        const d = Math.hypot(other.x - candX, other.y - candY);
        if (d < minD) minD = d;
      }
      // 偏好离已有点更远，并略偏好离画布中心更远
      const radial = Math.hypot(candX - cx, candY - cy);
      const score = minD + radial * 0.08;
      if (score > bestScore) {
        bestScore = score;
        bestX = candX;
        bestY = candY;
      }
    }
    node.x = bestX;
    node.y = bestY;
  }

  node.vx = 0;
  node.vy = 0;
  clampSimNode(node, width, height);
}

/** 无序节点对 key */
export function hopPairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

/**
 * 预计算节点间最短跳数（无向图 BFS）。
 * hop=1 直接相连；hop=2 中间隔 1 个点……
 */
export function buildHopDistanceMap(
  nodeIds: string[],
  edges: WikiGraphEdge[],
  maxHop = 4
): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  const hopMap = new Map<string, number>();
  for (const start of nodeIds) {
    const dist = new Map<string, number>([[start, 0]]);
    const queue: string[] = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi]!;
      const d = dist.get(u)!;
      if (d >= maxHop) continue;
      for (const v of adj.get(u) ?? []) {
        if (dist.has(v)) continue;
        const nd = d + 1;
        dist.set(v, nd);
        queue.push(v);
        if (v === start) continue;
        const key = hopPairKey(start, v);
        const prev = hopMap.get(key);
        if (prev === undefined || nd < prev) hopMap.set(key, nd);
      }
    }
  }
  return hopMap;
}

/**
 * 跳数衰减：hop=1 → 1，hop=2 → decay，hop=3 → decay² …
 * hop > maxHop 或不可达 → 0（不受牵引/跳数力影响）。
 */
export function hopAttenuation(
  hop: number | undefined,
  {
    maxHop = 4,
    decay = 0.5,
  }: { maxHop?: number; decay?: number } = {}
): number {
  if (hop === undefined || hop <= 0 || hop > maxHop) return 0;
  // hop 1 → decay^0 = 1；hop 2 → decay^1 = 0.5
  return decay ** Math.max(0, hop - 1);
}

/**
 * 跳数传导延时：hop=1 立即；hop=2 → base；hop=3 → base*growth；…
 * hop > maxHop 或不可达 → Infinity（永不触发）。
 */
export function hopLatencyMs(
  hop: number | undefined,
  {
    maxHop = 4,
    baseMs = 90,
    growth = 2,
  }: { maxHop?: number; baseMs?: number; growth?: number } = {}
): number {
  if (hop === undefined || hop <= 0 || hop > maxHop) return Number.POSITIVE_INFINITY;
  if (hop <= 1) return 0;
  return baseMs * growth ** (hop - 2);
}

/** 波源传播门控：0 尚未到达/超出范围，1 已完全作用 */
export function hopLatencyGate(
  elapsedMs: number,
  hop: number | undefined,
  {
    maxHop = 4,
    baseMs = 90,
    growth = 2,
    rampMs = 70,
  }: {
    maxHop?: number;
    baseMs?: number;
    growth?: number;
    rampMs?: number;
  } = {}
): number {
  // 超过有效跳数：完全不受拖拽传导影响
  if (hop === undefined || hop <= 0 || hop > maxHop) return 0;
  const delay = hopLatencyMs(hop, { maxHop, baseMs, growth });
  if (!Number.isFinite(delay) || elapsedMs <= delay) return 0;
  const ramp = Math.max(1, rampMs);
  return Math.min(1, (elapsedMs - delay) / ramp);
}

/** 单步力导向（Obsidian 式持续模拟） */
export function tickForceSimulation(
  sim: ForceSimNode[],
  edges: WikiGraphEdge[],
  alpha: number,
  cfg: Partial<ForceSimConfig> = {}
): void {
  const {
    width,
    height,
    linkDistance,
    repulsion,
    centerStrength,
    linkStrength,
    hopMap,
    hopMax = 4,
    hopDecay = 0.5,
    impulseSourceId = null,
    impulseStartMs = 0,
    nowMs,
    hopLatencyBaseMs = 90,
    hopLatencyGrowth = 2,
    hopLatencyRampMs = 70,
    forceScale = 1,
    velocityDamping = 0.82,
    collisionPasses,
    hopSpatialFloor = 0.22,
    packingMinGap,
    packingCenterScale,
  } = {
    ...DEFAULT_CONFIG,
    ...cfg,
  };
  // 生长期等场景可整体压低力；alpha 仍负责时间冷却
  const scaledAlpha = alpha * Math.max(0, forceScale);
  const byId = new Map(sim.map((n) => [n.id, n]));
  const useHopDecay = hopMap != null;
  const useImpulseLatency =
    Boolean(impulseSourceId) &&
    hopMap != null &&
    typeof nowMs === 'number' &&
    Number.isFinite(nowMs);
  const impulseElapsed = useImpulseLatency ? Math.max(0, nowMs! - impulseStartMs) : 0;

  const latencyOpts = {
    maxHop: hopMax,
    baseMs: hopLatencyBaseMs,
    growth: hopLatencyGrowth,
    rampMs: hopLatencyRampMs,
  };

  /** 节点相对波源的传导门控；无波源时为 1 */
  const gateFor = (nodeId: string): number => {
    if (!useImpulseLatency || !impulseSourceId) return 1;
    if (nodeId === impulseSourceId) return 1;
    const hop = hopMap!.get(hopPairKey(impulseSourceId, nodeId));
    return hopLatencyGate(impulseElapsed, hop, latencyOpts);
  };

  for (let i = 0; i < sim.length; i++) {
    for (let j = i + 1; j < sim.length; j++) {
      const a = sim[i];
      const b = sim[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy) || 0.01;
      // 几何衰减 1/r²。跳数只做「软衰减」：远跳仍保留 floor，保证空间铺开
      // （拖拽传导延时仍由 gateFor 控制，与布局斥力解耦）
      let force = (repulsion * scaledAlpha) / (dist * dist);
      if (useHopDecay) {
        const hop = hopMap!.get(hopPairKey(a.id, b.id));
        const att = hopAttenuation(hop, { maxHop: hopMax, decay: hopDecay });
        // hop>max 或不可达 att=0 → 用 floor；近跳仍可全量
        force *= Math.max(hopSpatialFloor, att);
      }
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
      // 波源传导延时：更远的点更晚才感受到这股力
      if (!a.fixed) {
        const ga = gateFor(a.id);
        a.vx -= dx * ga;
        a.vy -= dy * ga;
      }
      if (!b.fixed) {
        const gb = gateFor(b.id);
        b.vx += dx * gb;
        b.vy += dy * gb;
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
    const pull = ((dist - linkDistance) * linkStrength * scaledAlpha) / dist;
    dx *= pull;
    dy *= pull;
    if (!a.fixed) {
      const ga = gateFor(a.id);
      a.vx += dx * ga;
      a.vy += dy * ga;
    }
    if (!b.fixed) {
      const gb = gateFor(b.id);
      b.vx -= dx * gb;
      b.vy -= dy * gb;
    }
  }

  const bounds = layoutCircleBounds(width, height);
  const { cx, cy, radius } = bounds;
  // 点多时大幅减弱中心引力，主要靠斥力 + 边界铺满画布
  const autoCenter =
    sim.length <= 20 ? 1 : sim.length <= 50 ? 0.45 : sim.length <= 100 ? 0.18 : 0.08;
  const centerScale = packingCenterScale ?? autoCenter;
  const centerK = centerStrength * centerScale;
  for (const n of sim) {
    if (n.fixed) {
      // 拖拽中：硬钉在用户位置，不做边界回弹/衰减，避免“跟手发黏”
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx += (cx - n.x) * centerK * scaledAlpha;
    n.vy += (cy - n.y) * centerK * scaledAlpha;
    // 正圆软边界：接近边缘时沿径向往内推
    const dx = n.x - cx;
    const dy = n.y - cy;
    const d = Math.hypot(dx, dy) || 0.01;
    const q = d / radius;
    if (q > 0.88) {
      const overshoot = (q - 0.88) / 0.12;
      n.vx -= (dx / d) * overshoot * 1.15 * scaledAlpha;
      n.vy -= (dy / d) * overshoot * 1.15 * scaledAlpha;
    }
    const damp = Math.min(0.95, Math.max(0.5, velocityDamping));
    n.vx *= damp;
    n.vy *= damp;
    n.x += n.vx;
    n.y += n.vy;
    clampSimNode(n, width, height);
  }

  const minGap =
    packingMinGap ??
    (sim.length > 100 ? 20 : sim.length > 50 ? 24 : 28);
  resolveNodeCollisions(sim, width, height, minGap, collisionPasses);
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
