import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getWikiGraph } from '@/services/wikiApi';
import {
  filterWikiGraph,
  recalcDegrees,
  type WikiGraphFilterOptions,
  type WikiGraphGroup,
} from '@/services/wikiGraphFilter';
import type { WikiGraphEdge, WikiGraphNode } from '@shared/types';
import {
  buildHopDistanceMap,
  createForceSimNodes,
  growthPhysicsCalm,
  hopLatencyMs,
  layoutSizeForNodeCount,
  mergeSimWithNodes,
  packingMetrics,
  placeNodeRelativeToStructure,
  repulsionForNodeCount,
  simToPositionMap,
  tickForceSimulation,
  type ForceSimNode,
} from './wikiGraphForce';
import {
  computeRevealSequence,
  edgeEndpoints,
  getEdgeDraw,
  getNodePop,
  getNodePopScale,
  growthAnimationEndMs,
  type RevealSequence,
} from './wikiGraphGrowth';
import {
  GRAPH_PHYSICS,
  obsidianNodeRadius,
  truncateGraphLabel,
} from './obsidianGraphTheme';
import { useGraphTheme } from './useGraphTheme';
import { FilePreviewDialog } from './FilePreviewDialog';
import { resolveWikiRelPath } from './wikiPathResolve';
import { WIKI_OPEN_PAGE_EVENT } from './WikiMarkdownPreview';
import {
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Settings2,
  RotateCcw,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionTrigger } from '@/components/ui/accordion';

type WikiGraphViewProps = {
  onOpenPage: (relPath: string) => void;
  refreshKey?: number;
  focusPath?: string | null;
  /** 为 true 时（如工作台「局部图」）才切入局部图；默认全局图 */
  forceLocalGraph?: boolean;
};

/** 基础画布；点多时 layoutSizeForNodeCount 会放大可用区域 */
const BASE_LAYOUT = { w: 960, h: 560 };
/** 当前力学/视图尺寸（可随节点数放大） */
const LAYOUT: { w: number; h: number } = { w: BASE_LAYOUT.w, h: BASE_LAYOUT.h };
/** 缩放低于此值时隐藏全局标签（看不清），悬停/选中仍显示 */
const LABEL_MIN_ZOOM = 0.55;

/**
 * 生长阶段自动缩放：
 * - 早期（少量点）放大，让节点可读
 * - 随点数推进逐渐缩小
 * - 收束到 1.0 = 看清整块 viewBox / 圆形布局全貌
 */
function growthAutoScaleForCount(visibleCount: number, totalCount: number): number {
  const n = Math.max(1, visibleCount);
  const total = Math.max(n, totalCount, 1);
  // 进度 0→1：用平方缓入，前半段保持放大，后半段加速拉远
  const t = Math.min(1, (n - 1) / Math.max(1, total - 1));
  const eased = t * t;

  // 极少点时额外抬一点（1–3 个点更清晰）
  const startBoost = n <= 3 ? 3.05 : n <= 8 ? 2.55 : 2.2;
  const start = Math.min(3.2, startBoost);
  const end = 1.0; // 全貌
  const scale = start + (end - start) * eased;
  return Math.min(3.2, Math.max(1, scale));
}

/** 以画布中心为锚点的缩放（不平移构图中心） */
function transformCenteredScale(scale: number): { scale: number; tx: number; ty: number } {
  const s = Math.min(4, Math.max(0.15, scale));
  const cx = LAYOUT.w / 2;
  const cy = LAYOUT.h / 2;
  return {
    scale: s,
    tx: cx * (1 - s),
    ty: cy * (1 - s),
  };
}

const STORAGE_KEY = 'llm_wiki_graph_prefs';

const FILTERABLE_GROUPS = ['entities', 'topics', 'sources'] as const satisfies readonly WikiGraphGroup[];

const GROUP_LABELS: Record<(typeof FILTERABLE_GROUPS)[number], string> = {
  entities: '实体',
  topics: '主题',
  sources: '摘要',
};

type GraphPrefs = {
  localMode: boolean;
  depth: number;
  hideOrphans: boolean;
  showAllLabels: boolean;
  animate: boolean;
  growAnimation: boolean;
  linkDistance: number;
  repulsion: number;
  groups: Record<WikiGraphGroup, boolean>;
  /** 节点标签不透明度 0.2–1 */
  labelOpacity: number;
  /** 节点半径倍率 0.1–5 */
  nodeSizeScale: number;
  /** 连线粗细倍率 0.5–2.5 */
  edgeWidthScale: number;
};

const DEFAULT_PREFS: GraphPrefs = {
  localMode: false,
  depth: 2,
  hideOrphans: false,
  showAllLabels: true,
  animate: true,
  growAnimation: true,
  linkDistance: GRAPH_PHYSICS.linkDistance,
  repulsion: GRAPH_PHYSICS.repulsion,
  groups: { entities: true, topics: true, sources: true, flat: true },
  labelOpacity: 1,
  nodeSizeScale: 1,
  edgeWidthScale: 1,
};

function loadPrefs(): GraphPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<GraphPrefs>;
    const merged = { ...DEFAULT_PREFS, ...parsed, groups: { ...DEFAULT_PREFS.groups, ...parsed.groups } };
    merged.groups.flat = true;
    merged.nodeSizeScale = Math.min(5, Math.max(0.1, merged.nodeSizeScale));
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(p: GraphPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/**
 * 屏幕坐标 → viewBox 坐标。
 * SVG 默认 preserveAspectRatio=xMidYMid meet 会等比缩放并 letterbox，
 * 不能直接用 rect 宽高线性映射，否则上下/左右方向会跟手漂移。
 */
function clientToViewBox(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / LAYOUT.w, rect.height / LAYOUT.h) || 1;
  const contentW = LAYOUT.w * scale;
  const contentH = LAYOUT.h * scale;
  const offsetX = (rect.width - contentW) / 2;
  const offsetY = (rect.height - contentH) / 2;
  return {
    x: (clientX - rect.left - offsetX) / scale,
    y: (clientY - rect.top - offsetY) / scale,
  };
}

function clientToGraph(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  transform: { scale: number; tx: number; ty: number }
): { x: number; y: number } {
  const v = clientToViewBox(clientX, clientY, svg);
  return {
    x: (v.x - transform.tx) / transform.scale,
    y: (v.y - transform.ty) / transform.scale,
  };
}

export function WikiGraphView({
  onOpenPage: _onOpenPageProp,
  refreshKey = 0,
  focusPath = null,
  forceLocalGraph = false,
}: WikiGraphViewProps) {
  void _onOpenPageProp; // 预览改为弹窗；保留 prop 兼容旧调用

  const graphTheme = useGraphTheme();
  const [rawNodes, setRawNodes] = useState<WikiGraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<WikiGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<GraphPrefs>(loadPrefs);
  const [search, setSearch] = useState('');
  const [focusId, setFocusId] = useState<string | null>(focusPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** 拖拽中的节点：用于强制高亮自身 + 一跳邻居 */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** 双击预览栈：点实体链接再叠一层新弹窗 */
  const [previewStack, setPreviewStack] = useState<string[]>([]);
  /** 预览打开时避免图每帧 setState 拆掉弹窗内点击（mousedown→mouseup 间 DOM 被替换） */
  const previewStackRef = useRef<string[]>([]);
  previewStackRef.current = previewStack;
  /**
   * 生长动画自动缩放：仅在生长期间、且用户未手动改缩放时生效。
   * 用户滚轮/缩放按钮/重置视图后置 false，直到下次播放生长再打开。
   */
  const growthAutoZoomRef = useRef(true);
  const lastAutoZoomCountRef = useRef(-1);
  const [showSettings, setShowSettings] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  /** 画布尺寸变更时触发 viewBox 重渲染 */
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [growthFrame, setGrowthFrame] = useState(0);
  const [growthPlaying, setGrowthPlaying] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ForceSimNode[]>([]);
  const alphaRef = useRef(1);
  const panRef = useRef({ active: false, x: 0, y: 0, tx: 0, ty: 0 });
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  /** 手动识别双击：pointer capture 时原生 dblclick 有时不可靠 */
  const lastNodeTapRef = useRef<{ id: string; t: number } | null>(null);
  /** 拖拽波源：松手后仍保留一段时间，远跳邻居按延时陆续受力 */
  const impulseRef = useRef<{ id: string; startMs: number } | null>(null);
  const growthStartRef = useRef(0);
  const revealSeqRef = useRef<RevealSequence>({ order: [], delays: new Map(), orderIndex: new Map() });
  const growthRafRef = useRef(0);
  const growthPlayingRef = useRef(false);
  /** 生长动画中已「出生」参与力学的节点 */
  const spawnedIdsRef = useRef<Set<string> | null>(null);
  const initialGrowthDoneRef = useRef(false);
  /**
   * 标签相对节点的方位槽位（0–7）。运动中锁定，静止后再做避让重排。
   * 0右 1左 2上 3下 4右上 5右下 6左上 7左下
   */
  const labelSideRef = useRef<Map<string, number>>(new Map());
  const layoutSettledRef = useRef(false);
  const [layoutSettled, setLayoutSettled] = useState(false);

  const centerOnNode = useCallback((nodeId: string) => {
    const p = simRef.current.find((n) => n.id === nodeId);
    if (!p) return;
    // 居中会改缩放，视为用户接管
    growthAutoZoomRef.current = false;
    setTransform({
      scale: 1.35,
      tx: LAYOUT.w / 2 - p.x * 1.35,
      ty: LAYOUT.h / 2 - p.y * 1.35,
    });
  }, []);

  const playGrowthAnimation = useCallback(
    (nodeList: WikiGraphNode[], edgeList: WikiGraphEdge[], force = false) => {
      if (nodeList.length === 0) return;
      if (!force && !prefs.growAnimation) {
        growthStartRef.current = 0;
        growthPlayingRef.current = false;
        spawnedIdsRef.current = null;
        setGrowthPlaying(false);
        setGrowthFrame((n) => n + 1);
        return;
      }

      cancelAnimationFrame(growthRafRef.current);
      revealSeqRef.current = computeRevealSequence(
        nodeList,
        edgeList,
        prefs.localMode ? focusId : null
      );
      // 生长开始：尚未出生任何点；出现时再按当前结构落位
      spawnedIdsRef.current = new Set();
      growthStartRef.current = performance.now();
      growthPlayingRef.current = true;
      alphaRef.current = 1;
      layoutSettledRef.current = false;
      setLayoutSettled(false);
      // 重新生长：清掉旧方位锁定，避免沿用上一轮布局
      labelSideRef.current.clear();
      // 每次播放生长重新启用自动缩放（用户中途改缩放会关掉）
      growthAutoZoomRef.current = true;
      lastAutoZoomCountRef.current = -1;
      setTransform(transformCenteredScale(growthAutoScaleForCount(1, nodeList.length)));
      setGrowthPlaying(true);
      setGrowthFrame((n) => n + 1);

      const endMs = growthAnimationEndMs(revealSeqRef.current);
      const tick = () => {
        const elapsed = performance.now() - growthStartRef.current;
        // 预览打开时不刷 growthFrame，避免无关重渲打断弹窗点击
        if (previewStackRef.current.length === 0) {
          setGrowthFrame((n) => n + 1);
        }
        // 生长中自动缩放：仅在可见点数变化时更新（避免每帧 setTransform）
        if (growthAutoZoomRef.current && growthPlayingRef.current) {
          const count = Math.max(1, spawnedIdsRef.current?.size ?? 1);
          if (count !== lastAutoZoomCountRef.current) {
            lastAutoZoomCountRef.current = count;
            const target = growthAutoScaleForCount(count, nodeList.length);
            setTransform((t) => {
              if (!growthAutoZoomRef.current) return t;
              // 向目标平滑靠拢，减少突兀跳变
              const next = t.scale + (target - t.scale) * 0.65;
              if (Math.abs(next - t.scale) < 0.004) return t;
              return transformCenteredScale(next);
            });
          }
        }
        if (elapsed < endMs) {
          growthRafRef.current = requestAnimationFrame(tick);
        } else {
          // 收尾：漏网的点按当前结构落位，再交给全图力学
          const spawned = spawnedIdsRef.current ?? new Set<string>();
          for (const n of simRef.current) {
            if (spawned.has(n.id)) continue;
            if (spawned.size === 0) {
              n.x = LAYOUT.w / 2;
              n.y = LAYOUT.h / 2;
              n.vx = 0;
              n.vy = 0;
            } else {
              placeNodeRelativeToStructure(
                n,
                simRef.current,
                edgeList,
                spawned,
                LAYOUT.w,
                LAYOUT.h,
                packingMetrics(Math.max(1, spawned.size), LAYOUT.w, LAYOUT.h, prefs.linkDistance)
                  .linkDistance
              );
            }
            spawned.add(n.id);
          }
          growthPlayingRef.current = false;
          spawnedIdsRef.current = null;
          // 生长结束：扩张铺满圆画布时拉远到全貌（scale=1 即整块 viewBox）
          // 仅当用户未手动接管缩放时执行
          if (growthAutoZoomRef.current) {
            const overview = transformCenteredScale(1);
            const fromScale = lastAutoZoomCountRef.current > 0
              ? growthAutoScaleForCount(
                  Math.max(1, lastAutoZoomCountRef.current),
                  nodeList.length
                )
              : 1.6;
            // 短动画拉远，贴合「最后扩张那一下」
            const zoomOutStart = performance.now();
            const zoomOutMs = 520;
            const zoomFrom = Math.max(1, fromScale);
            const zoomStep = () => {
              if (!growthAutoZoomRef.current) return;
              const u = Math.min(1, (performance.now() - zoomOutStart) / zoomOutMs);
              // ease-out cubic
              const e = 1 - Math.pow(1 - u, 3);
              const s = zoomFrom + (1 - zoomFrom) * e;
              setTransform(transformCenteredScale(s));
              if (u < 1) {
                requestAnimationFrame(zoomStep);
              } else {
                growthAutoZoomRef.current = false;
                setTransform(overview);
              }
            };
            requestAnimationFrame(zoomStep);
          } else {
            growthAutoZoomRef.current = false;
          }
          // 生长结束：压低残余动能与 alpha，避免突然恢复全力度造成整图一抖
          for (const n of simRef.current) {
            if (n.fixed) continue;
            n.vx *= 0.25;
            n.vy *= 0.25;
          }
          // 生长结束后给一点扩张动能，让斥力把中心团撑开铺满画布
          alphaRef.current = Math.max(0.22, Math.min(alphaRef.current, 0.35));
          layoutSettledRef.current = false;
          setLayoutSettled(false);
          setGrowthPlaying(false);
        }
      };
      growthRafRef.current = requestAnimationFrame(tick);
    },
    [prefs.growAnimation, prefs.localMode, prefs.linkDistance, focusId]
  );

  useEffect(() => {
    if (!focusPath) return;
    setFocusId(focusPath);
    setSelectedId(focusPath);
    if (forceLocalGraph) {
      setPrefs((p) => ({ ...p, localMode: true }));
      window.setTimeout(() => centerOnNode(focusPath), 400);
    }
  }, [focusPath, forceLocalGraph, centerOnNode]);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    initialGrowthDoneRef.current = false;
    void getWikiGraph().then((g) => {
      if (cancelled) return;
      setRawNodes(g.nodes);
      setRawEdges(g.edges);
      setLoading(false);
      alphaRef.current = 1;
      impulseRef.current = null;
      spawnedIdsRef.current = null;
      growthPlayingRef.current = false;
      const size = layoutSizeForNodeCount(g.nodes.length, BASE_LAYOUT.w, BASE_LAYOUT.h);
      LAYOUT.w = size.w;
      LAYOUT.h = size.h;
      setLayoutEpoch((n) => n + 1);
      simRef.current = createForceSimNodes(g.nodes, LAYOUT.w, LAYOUT.h);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filterOpts: WikiGraphFilterOptions = useMemo(
    () => ({
      focusId: prefs.localMode ? focusId : null,
      depth: prefs.depth,
      hideOrphans: prefs.hideOrphans,
      search,
      groups: prefs.groups,
    }),
    [prefs, focusId, search]
  );

  const { nodes, edges } = useMemo(() => {
    const filtered = filterWikiGraph(rawNodes, rawEdges, filterOpts);
    return {
      nodes: recalcDegrees(filtered.nodes, filtered.edges),
      edges: filtered.edges,
    };
  }, [rawNodes, rawEdges, filterOpts]);

  /** 图跳数：1–4 跳参与力度/延时，>4 或不可达不受牵引影响 */
  const hopMap = useMemo(
    () => buildHopDistanceMap(
      nodes.map((n) => n.id),
      edges,
      4
    ),
    [nodes, edges]
  );

  /** 预览弹窗路径种子：稳定引用，避免每次 render 新数组触发 entries 请求风暴 */
  const previewKnownPaths = useMemo(
    () => rawNodes.map((n) => n.relPath).filter(Boolean),
    [rawNodes]
  );

  useEffect(() => {
    const size = layoutSizeForNodeCount(nodes.length, BASE_LAYOUT.w, BASE_LAYOUT.h);
    if (size.w !== LAYOUT.w || size.h !== LAYOUT.h) {
      const dx = size.w / 2 - LAYOUT.w / 2;
      const dy = size.h / 2 - LAYOUT.h / 2;
      // 画布放大后平移已有点，保持相对中心，避免整团偏到角落
      if (dx !== 0 || dy !== 0) {
        for (const n of simRef.current) {
          n.x += dx;
          n.y += dy;
        }
      }
      LAYOUT.w = size.w;
      LAYOUT.h = size.h;
      setLayoutEpoch((n) => n + 1);
      setPositions(new Map(simToPositionMap(simRef.current)));
    }
    simRef.current = mergeSimWithNodes(simRef.current, nodes, LAYOUT.w, LAYOUT.h);
    revealSeqRef.current = computeRevealSequence(
      nodes,
      edges,
      prefs.localMode ? focusId : null
    );
    alphaRef.current = 1;
  }, [nodes, edges, prefs.localMode, focusId]);

  /** 首次加载自动播放一次 */
  useEffect(() => {
    if (loading || nodes.length === 0 || initialGrowthDoneRef.current) return;
    initialGrowthDoneRef.current = true;
    playGrowthAnimation(nodes, edges);
  }, [loading, nodes, edges, playGrowthAnimation]);

  useEffect(() => {
    return () => cancelAnimationFrame(growthRafRef.current);
  }, []);

  useEffect(() => {
    if (nodes.length === 0) {
      setPositions(new Map());
      return;
    }

    const hopMax = 4;
    const hopLatencyBaseMs = 90;
    const hopLatencyGrowth = 2;
    const hopLatencyRampMs = 70;
    // 有效最远跳（hopMax）延时 + 缓入 + 余量：波结束后不再门控
    const impulseMaxMs =
      hopLatencyMs(hopMax, { maxHop: hopMax, baseMs: hopLatencyBaseMs, growth: hopLatencyGrowth }) +
      hopLatencyRampMs +
      400;

    const pack = packingMetrics(
      simRef.current.length || nodes.length,
      LAYOUT.w,
      LAYOUT.h,
      prefs.linkDistance
    );
    const baseSimCfg: {
      width: number;
      height: number;
      linkDistance: number;
      repulsion: number;
      centerStrength: number;
      linkStrength: number;
      hopMap: typeof hopMap;
      hopMax: number;
      hopDecay: number;
      hopLatencyBaseMs: number;
      hopLatencyGrowth: number;
      hopLatencyRampMs: number;
      forceScale?: number;
      velocityDamping?: number;
      collisionPasses?: number;
      hopSpatialFloor?: number;
      packingMinGap?: number;
      packingCenterScale?: number;
      impulseSourceId?: string | null;
      impulseStartMs?: number;
      nowMs?: number;
    } = {
      width: LAYOUT.w,
      height: LAYOUT.h,
      // 按面积自动拉大理想边长，用户滑条仍作下限/基准
      linkDistance: pack.linkDistance,
      repulsion:
        repulsionForNodeCount(prefs.repulsion, simRef.current.length || nodes.length) *
        pack.repulsionScale,
      centerStrength: GRAPH_PHYSICS.centerStrength,
      linkStrength: GRAPH_PHYSICS.linkStrength * (nodes.length > 60 ? 0.78 : 1),
      hopMap,
      hopMax,
      hopDecay: 0.5,
      hopLatencyBaseMs,
      hopLatencyGrowth,
      hopLatencyRampMs,
      hopSpatialFloor: 0.22,
      packingMinGap: pack.minGap,
      packingCenterScale: pack.centerScale,
    };

    const withImpulse = (cfg: typeof baseSimCfg): typeof baseSimCfg => {
      const impulse = impulseRef.current;
      if (!impulse) return cfg;
      const now = performance.now();
      if (now - impulse.startMs > impulseMaxMs) {
        impulseRef.current = null;
        return cfg;
      }
      return {
        ...cfg,
        impulseSourceId: impulse.id,
        impulseStartMs: impulse.startMs,
        nowMs: now,
      };
    };

    if (!prefs.animate) {
      // 关闭动画时一次性跑到位
      let alpha = Math.max(alphaRef.current, 1);
      const cool = nodes.length > 80 ? 0.988 : 0.972;
      for (let t = 0; t < 400 && alpha > 0.002; t++) {
        tickForceSimulation(simRef.current, edges, alpha, withImpulse(baseSimCfg));
        alpha *= cool;
      }
      alphaRef.current = alpha;
      setPositions(new Map(simToPositionMap(simRef.current)));
      return;
    }

    let raf = 0;
    let alive = true;

    const spawnDueNodes = () => {
      const spawned = spawnedIdsRef.current;
      if (!spawned || !growthPlayingRef.current) return;
      const elapsed = performance.now() - growthStartRef.current;
      const seq = revealSeqRef.current;
      const byId = new Map(simRef.current.map((n) => [n.id, n]));
      let any = false;
      for (const id of seq.order) {
        if (spawned.has(id)) continue;
        const delay = seq.delays.get(id) ?? 0;
        if (elapsed < delay) break;
        const node = byId.get(id);
        if (!node) {
          spawned.add(id);
          continue;
        }
        if (spawned.size === 0) {
          // 首个点：放中心附近
          node.x = LAYOUT.w / 2 + (Math.random() - 0.5) * 8;
          node.y = LAYOUT.h / 2 + (Math.random() - 0.5) * 8;
          node.vx = 0;
          node.vy = 0;
        } else {
          placeNodeRelativeToStructure(
            node,
            simRef.current,
            edges,
            spawned,
            LAYOUT.w,
            LAYOUT.h,
            packingMetrics(Math.max(1, spawned.size), LAYOUT.w, LAYOUT.h, prefs.linkDistance)
              .linkDistance
          );
        }
        spawned.add(id);
        any = true;
      }
      if (any) {
        // 新点入场局部回温：点数越多越弱，避免后期整图持续抖动
        const calm = growthPhysicsCalm(spawned.size);
        alphaRef.current = Math.max(alphaRef.current, calm.reheat);
        // 大图时压掉已有点的残余速度，防止连锁“沸腾”
        if (spawned.size > 28) {
          const keep = spawned.size > 55 ? 0.35 : 0.55;
          for (const n of simRef.current) {
            if (!spawned.has(n.id) || n.fixed) continue;
            n.vx *= keep;
            n.vy *= keep;
          }
        }
      }
    };

    const step = () => {
      if (!alive) return;

      // 预览弹窗打开时冻结力学与 React 刷新。
      // 否则每帧 setPositions 会重渲整树，弹窗内链接在 mousedown/up 之间被拆掉，
      // 表现为「关系图还在动时点实体没反应，静止后才能点」。
      if (previewStackRef.current.length > 0) {
        raf = requestAnimationFrame(step);
        return;
      }

      // 生长：到期的点按当前结构落位后加入力学
      if (growthPlayingRef.current) spawnDueNodes();

      const dragging = dragRef.current != null;
      let alpha = alphaRef.current;
      if (dragging) alpha = Math.max(alpha, 0.25);

      const spawned = spawnedIdsRef.current;
      const growing = growthPlayingRef.current && spawned != null;
      const activeSim = growing
        ? simRef.current.filter((n) => spawned!.has(n.id))
        : simRef.current;
      const activeEdges = growing
        ? edges.filter((e) => spawned!.has(e.source) && spawned!.has(e.target))
        : edges;

      if (activeSim.length > 0 && (alpha > 0.002 || dragging || impulseRef.current != null || growing)) {
        const calm = growing ? growthPhysicsCalm(activeSim.length) : null;
        // 生长后期不再抬高 tick 地板；拖拽仍保持跟手传导
        const tickAlpha = dragging
          ? Math.max(alpha, 0.25)
          : growing
            ? Math.max(alpha, calm!.tickAlphaFloor)
            : alpha;
        // 生长期：整体 soft，但仍按面积保持斥力，避免后期中心堆叠
        const activePack = packingMetrics(
          activeSim.length,
          LAYOUT.w,
          LAYOUT.h,
          prefs.linkDistance
        );
        const repulsion = growing
          ? prefs.repulsion *
            activePack.repulsionScale *
            Math.max(0.55, Math.min(1.2, 36 / Math.sqrt(Math.max(8, activeSim.length))))
          : repulsionForNodeCount(prefs.repulsion, activeSim.length) * activePack.repulsionScale;

        tickForceSimulation(
          activeSim,
          activeEdges,
          tickAlpha,
          withImpulse({
            ...baseSimCfg,
            linkDistance: activePack.linkDistance,
            repulsion,
            packingMinGap: activePack.minGap,
            packingCenterScale: growing
              ? Math.min(activePack.centerScale, activeSim.length > 28 ? 0.12 : 0.35)
              : activePack.centerScale,
            forceScale: calm?.forceScale ?? 1,
            velocityDamping: calm?.velocityDamping ?? 0.82,
            collisionPasses: calm?.collisionPasses,
            // 生长后期进一步减弱中心引力
            centerStrength:
              GRAPH_PHYSICS.centerStrength * (growing && activeSim.length > 28 ? 0.4 : 1),
            hopSpatialFloor: growing ? 0.28 : 0.22,
          })
        );
        if (dragging) {
          alphaRef.current = Math.max(alpha * 0.995, 0.2);
        } else if (growing && calm) {
          // 生长中按点数加速冷却，允许落到很低；下个点 spawn 再轻回温
          alphaRef.current = Math.max(alpha * calm.coolRate, calm.alphaFloor);
        } else {
          alphaRef.current = alpha * (nodes.length > 80 ? 0.988 : 0.972);
        }
        setPositions(new Map(simToPositionMap(simRef.current)));
      }

      // 布局是否“静止”：运动中不重排标签方位，避免文字左右乱跳
      // 注意：alpha 冷却后模拟可能停转，vx/vy 会“冻住”，不能只靠速度阈值
      let maxSpeed = 0;
      for (const n of simRef.current) {
        if (n.fixed) continue;
        maxSpeed = Math.max(maxSpeed, Math.hypot(n.vx, n.vy));
      }
      const alphaNow = alphaRef.current;
      // 力已经很弱时清掉残余速度，避免永远判定为未静止
      if (!growing && !dragging && impulseRef.current == null && alphaNow < 0.02) {
        for (const n of simRef.current) {
          if (n.fixed) continue;
          n.vx *= 0.5;
          n.vy *= 0.5;
          if (Math.hypot(n.vx, n.vy) < 0.08) {
            n.vx = 0;
            n.vy = 0;
          }
        }
        maxSpeed = Math.min(maxSpeed, 0.08);
      }
      const settled =
        !growing &&
        !dragging &&
        impulseRef.current == null &&
        (
          // 冷却到位即视为静止（即使还有一点点冻住的速度）
          alphaNow < 0.012 ||
          (alphaNow < 0.04 && maxSpeed < 0.2)
        );
      if (settled !== layoutSettledRef.current) {
        // 刚进入静止：清空方位锁定，做一次完整避让重排（不再全卡右侧）
        if (settled) {
          labelSideRef.current.clear();
        }
        layoutSettledRef.current = settled;
        setLayoutSettled(settled);
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [nodes, edges, hopMap, prefs.animate, prefs.linkDistance, prefs.repulsion]);

  /**
   * 高亮焦点：仅拖拽 / 悬停时弱化其它点。
   * 注意：选中态 alone 不进入 dim 模式，否则松手后会“半透明不恢复”。
   */
  const highlightFocusId = draggingId ?? hoverId;

  /** 焦点节点 + 一跳邻居；无焦点时 null 表示全部正常显示 */
  const nodeHighlightSet = useMemo(() => {
    if (!highlightFocusId) return null;
    const set = new Set<string>([highlightFocusId]);
    for (const e of edges) {
      if (e.source === highlightFocusId) set.add(e.target);
      if (e.target === highlightFocusId) set.add(e.source);
    }
    return set;
  }, [highlightFocusId, edges]);
  const labelPlacements = useMemo(() => {
    type Box = { left: number; right: number; top: number; bottom: number };
    type Placement = { x: number; y: number; textAnchor: 'start' | 'middle' | 'end' };
    const placed = new Map<string, Placement>();
    const occupied: Box[] = [];
    const fontSize = graphTheme.labelFontSize;
    const labelHeight = fontSize + 2;
    const charWidth = fontSize * 0.62;
    const margin = 3;
    // 运动中（生长/拖拽/未静止）只跟随节点坐标，不切换左右上下方位
    const allowSideResolve = layoutSettled && draggingId == null && !growthPlaying;

    const intersects = (a: Box, b: Box) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const makeBox = (x: number, y: number, textAnchor: Placement['textAnchor'], text: string): Box => {
      const w = Math.max(10, text.length * charWidth);
      if (textAnchor === 'start') {
        return { left: x - margin, right: x + w + margin, top: y - labelHeight / 2 - margin, bottom: y + labelHeight / 2 + margin };
      }
      if (textAnchor === 'end') {
        return { left: x - w - margin, right: x + margin, top: y - labelHeight / 2 - margin, bottom: y + labelHeight / 2 + margin };
      }
      return { left: x - w / 2 - margin, right: x + w / 2 + margin, top: y - labelHeight / 2 - margin, bottom: y + labelHeight / 2 + margin };
    };

    const candidatesFor = (p: { x: number; y: number }, r: number, off: number): Placement[] => [
      { x: p.x + r + off, y: p.y, textAnchor: 'start' },
      { x: p.x - r - off, y: p.y, textAnchor: 'end' },
      { x: p.x, y: p.y - r - off, textAnchor: 'middle' },
      { x: p.x, y: p.y + r + off, textAnchor: 'middle' },
      { x: p.x + r + off, y: p.y - r * 0.9, textAnchor: 'start' },
      { x: p.x + r + off, y: p.y + r * 0.9, textAnchor: 'start' },
      { x: p.x - r - off, y: p.y - r * 0.9, textAnchor: 'end' },
      { x: p.x - r - off, y: p.y + r * 0.9, textAnchor: 'end' },
    ];

    const scoreNode = (node: WikiGraphNode) => {
      const isDrag = draggingId === node.id;
      const isHovered = hoverId === node.id || isDrag;
      const isSelected = selectedId === node.id && !hoverId && !draggingId;
      const active = isHovered || isSelected;
      const degree = node.degree ?? 0;
      return (active ? 10_000 : 0) + degree;
    };
    const sortedNodes = [...nodes].sort((a, b) => scoreNode(b) - scoreNode(a));
    const liveIds = new Set(nodes.map((n) => n.id));
    for (const id of [...labelSideRef.current.keys()]) {
      if (!liveIds.has(id)) labelSideRef.current.delete(id);
    }

    for (const node of sortedNodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const isHovered = hoverId === node.id;
      const isSelected = selectedId === node.id && !hoverId;
      const active = isHovered || isSelected;
      const degree = node.degree ?? 0;
      // 缩太小时全局标签看不清：只保留悬停/选中
      const zoomOk = transform.scale >= LABEL_MIN_ZOOM;
      const showLabel = active || (zoomOk && (prefs.showAllLabels || degree >= 1));
      if (!showLabel) continue;
      const text = truncateGraphLabel(node.label);
      const r = obsidianNodeRadius(degree, active) * prefs.nodeSizeScale;
      const off = graphTheme.labelOffsetX;
      const candidates = candidatesFor(p, r, off);
      const sticky = labelSideRef.current.get(node.id) ?? 0;

      let picked: Placement;
      let side = sticky;

      if (!allowSideResolve) {
        // 未静止：锁定上次方位（新点默认右侧），只更新跟随坐标
        side = sticky;
        picked = candidates[side] ?? candidates[0]!;
        if (!labelSideRef.current.has(node.id)) labelSideRef.current.set(node.id, side);
      } else {
        // 静止后：做避让重排。无 sticky 时（刚静止清空）从右侧起扫；
        // 有 sticky 时优先原方位，被挡再换。
        const hasSticky = labelSideRef.current.has(node.id);
        const order = hasSticky
          ? [sticky, ...candidates.map((_, i) => i).filter((i) => i !== sticky)]
          : candidates.map((_, i) => i);
        let chosen: Placement | null = null;
        let bestOverlap = Infinity;
        let bestIdx = order[0] ?? 0;
        // 先找完全不重叠；找不到则选重叠最少的
        for (const idx of order) {
          const cand = candidates[idx]!;
          const box = makeBox(cand.x, cand.y, cand.textAnchor, text);
          let hits = 0;
          for (const o of occupied) {
            if (intersects(o, box)) hits += 1;
          }
          if (hits === 0) {
            chosen = cand;
            side = idx;
            occupied.push(box);
            break;
          }
          if (hits < bestOverlap) {
            bestOverlap = hits;
            bestIdx = idx;
          }
        }
        if (!chosen) {
          chosen = candidates[bestIdx] ?? candidates[0]!;
          side = bestIdx;
          occupied.push(makeBox(chosen.x, chosen.y, chosen.textAnchor, text));
        }
        picked = chosen;
        labelSideRef.current.set(node.id, side);
      }

      placed.set(node.id, picked);
    }
    return placed;
  }, [
    nodes,
    positions,
    hoverId,
    selectedId,
    draggingId,
    growthPlaying,
    layoutSettled,
    prefs.showAllLabels,
    prefs.nodeSizeScale,
    transform.scale,
    graphTheme.labelFontSize,
    graphTheme.labelOffsetX,
  ]);

  const isEdgeDirectlyConnected = useCallback(
    (e: WikiGraphEdge) => {
      const focus = draggingId ?? hoverId;
      if (!focus) return true;
      return e.source === focus || e.target === focus;
    },
    [draggingId, hoverId]
  );

  const reheatLayout = useCallback(() => {
    for (const n of simRef.current) n.fixed = false;
    impulseRef.current = null;
    alphaRef.current = 1;
    layoutSettledRef.current = false;
    setLayoutSettled(false);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      // 用户手动缩放 → 关闭生长自动缩放
      growthAutoZoomRef.current = false;
      const delta = e.deltaY > 0 ? 0.9 : 1.11;
      const g = clientToGraph(e.clientX, e.clientY, svg, transform);
      setTransform((t) => {
        const newScale = Math.min(4, Math.max(0.15, t.scale * delta));
        const v = clientToViewBox(e.clientX, e.clientY, svg);
        return {
          scale: newScale,
          tx: v.x - g.x * newScale,
          ty: v.y - g.y * newScale,
        };
      });
    },
    [transform]
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as Element).closest('[data-graph-node]')) return;
      const svg = svgRef.current;
      const v = svg ? clientToViewBox(e.clientX, e.clientY, svg) : { x: e.clientX, y: e.clientY };
      panRef.current = {
        active: true,
        x: v.x,
        y: v.y,
        tx: transform.tx,
        ty: transform.ty,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [transform.tx, transform.ty]
  );

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current && svgRef.current) {
        const drag = dragRef.current;
        if (!drag.moved) {
          const dx = e.clientX - drag.x;
          const dy = e.clientY - drag.y;
          if (dx * dx + dy * dy > 16) drag.moved = true; // >4px 视为拖动
        }
        const g = clientToGraph(e.clientX, e.clientY, svgRef.current, transform);
        const node = simRef.current.find((n) => n.id === drag.id);
        // 未超过阈值时不移动点，保留双击手感
        if (node && drag.moved) {
          // 硬跟随鼠标：fixed 节点在 tick 中不再夹回边界，避免发黏
          node.x = g.x;
          node.y = g.y;
          node.vx = 0;
          node.vy = 0;
          node.fixed = true;
          // 必须回温，否则 alpha 冷却后其它点完全不动
          alphaRef.current = Math.max(alphaRef.current, 0.28);
          if (layoutSettledRef.current) {
            layoutSettledRef.current = false;
            setLayoutSettled(false);
          }
          setPositions(new Map(simToPositionMap(simRef.current)));
        }
        return;
      }
      if (!panRef.current.active || !svgRef.current) return;
      const v = clientToViewBox(e.clientX, e.clientY, svgRef.current);
      setTransform((t) => ({
        ...t,
        tx: panRef.current.tx + (v.x - panRef.current.x),
        ty: panRef.current.ty + (v.y - panRef.current.y),
      }));
    },
    [transform]
  );

  const rawNodesRef = useRef(rawNodes);
  rawNodesRef.current = rawNodes;

  const resolvePreviewPath = useCallback((relPath: string) => {
    if (!relPath) return relPath;
    const known = rawNodesRef.current.map((n) => n.relPath).filter(Boolean);
    return known.length > 0 ? resolveWikiRelPath(relPath, known) : relPath;
  }, []);

  const openNodePreview = useCallback(
    (relPath: string) => {
      if (!relPath) return;
      const resolved = resolvePreviewPath(relPath);
      setPreviewStack([resolved]);
    },
    [resolvePreviewPath]
  );

  const openLinkedPreview = useCallback(
    (relPath: string) => {
      if (!relPath) return;
      const resolved = resolvePreviewPath(relPath);
      setPreviewStack((stack) => {
        if (stack.length === 0) return [resolved];
        if (stack[stack.length - 1] === resolved) return stack;
        return [...stack, resolved];
      });
    },
    [resolvePreviewPath]
  );

  // 全局事件：弹窗内 wikilink 按钮一定能打开新层（不依赖 props 是否过期）
  // 与 onOpenLinkedPage 双通道时：同一次点击两次 push 会用路径去重
  useEffect(() => {
    const onOpen = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path !== 'string' || !path) return;
      // 仅当已有预览栈时，把事件当作“弹窗内跳转”
      if (previewStackRef.current.length === 0) return;
      const resolved = resolvePreviewPath(path);
      setPreviewStack((stack) => {
        if (stack.length === 0) return stack;
        if (stack[stack.length - 1] === resolved) return stack;
        return [...stack, resolved];
      });
    };
    window.addEventListener(WIKI_OPEN_PAGE_EVENT, onOpen);
    return () => window.removeEventListener(WIKI_OPEN_PAGE_EVENT, onOpen);
  }, [resolvePreviewPath]);

  const onCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    const draggedId = drag?.id ?? null;
    const wasDragMove = Boolean(drag?.moved);
    if (draggedId) {
      const node = simRef.current.find((n) => n.id === draggedId);
      if (node) {
        // 松手后保持钉住：否则中心力/连线会把点弹回原位
        node.fixed = true;
        node.vx = 0;
        node.vy = 0;
      }
      // 仅真正拖动后才强回温；轻点/双击不扰动布局
      if (wasDragMove) {
        alphaRef.current = Math.max(alphaRef.current, 0.35);
      }

      // 双击打开预览（未拖动）
      if (!wasDragMove) {
        const now = performance.now();
        const last = lastNodeTapRef.current;
        if (last && last.id === draggedId && now - last.t < 380) {
          lastNodeTapRef.current = null;
          openNodePreview(node?.relPath ?? draggedId);
        } else {
          lastNodeTapRef.current = { id: draggedId, t: now };
        }
      } else {
        lastNodeTapRef.current = null;
      }
    }
    dragRef.current = null;
    setDraggingId(null);
    // 松手后退出 dim 模式：清掉拖拽带来的 hover 锁定
    setHoverId((h) => (draggedId && h === draggedId ? null : h));
    panRef.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [openNodePreview]);

  const onNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current ?? (e.currentTarget.closest('svg') as SVGSVGElement | null);
    const now = performance.now();
    dragRef.current = { id: nodeId, x: e.clientX, y: e.clientY, moved: false };
    impulseRef.current = { id: nodeId, startMs: now };
    setDraggingId(nodeId);
    setHoverId(nodeId);
    setSelectedId(nodeId);
    // 立刻钉在当前图坐标，避免按下后第一帧被力学拉走
    const node = simRef.current.find((n) => n.id === nodeId);
    if (node) {
      node.vx = 0;
      node.vy = 0;
      node.fixed = true;
    }
    alphaRef.current = Math.max(alphaRef.current, 0.3);
    // 捕获挂在 svg 上，保证拖出节点外仍收到 move/up
    svg?.setPointerCapture(e.pointerId);
  }, []);

  const onNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      if (prefs.localMode) setFocusId(nodeId);
      centerOnNode(nodeId);
    },
    [prefs.localMode, centerOnNode]
  );

  const updatePref = <K extends keyof GraphPrefs>(key: K, value: GraphPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (key === 'linkDistance' || key === 'repulsion') alphaRef.current = 1;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        构建关系图…
      </div>
    );
  }

  if (rawNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm p-6 bg-background text-muted-foreground">
        暂无 wiki/ 页面。请使用 [[wikilink]] 建立链接。
      </div>
    );
  }

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const growthActive = prefs.growAnimation && growthStartRef.current > 0;
  const growthElapsed = growthActive ? performance.now() - growthStartRef.current : Infinity;
  void growthFrame;
  const revealSeq = revealSeqRef.current;

  return (
    <div className="flex h-full min-h-0 gap-0 border border-border rounded-none overflow-hidden bg-background">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-card">
          <Input
            placeholder="搜索节点…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-36 text-sm"
          />
          <div className="flex gap-0.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                growthAutoZoomRef.current = false;
                setTransform((t) => ({ ...t, scale: Math.min(4, t.scale * 1.12) }));
              }}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                growthAutoZoomRef.current = false;
                setTransform((t) => ({ ...t, scale: Math.max(0.15, t.scale * 0.88) }));
              }}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                growthAutoZoomRef.current = false;
                setTransform({ scale: 1, tx: 0, ty: 0 });
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={reheatLayout} title="重新布局">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={growthPlaying || nodes.length === 0}
            onClick={() => playGrowthAnimation(nodes, edges, true)}
            title="按顺序逐个显示节点并建立连线"
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            播放生长动画
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => setShowSettings((s) => !s)}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative flex-1 min-h-[360px]">
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              当前筛选无节点。请调整搜索、分组或局部图深度。
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${LAYOUT.w} ${LAYOUT.h}`}
              data-layout-epoch={layoutEpoch}
              className="absolute inset-0 w-full h-full touch-none select-none"
              style={{ background: graphTheme.canvas }}
              onWheel={onWheel}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            >
              <g transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.scale})`}>
                {edges.map((e) => {
                  const { fromId, toId } = edgeEndpoints(e.source, e.target, revealSeq.orderIndex);
                  const from = positions.get(fromId);
                  const to = positions.get(toId);
                  if (!from || !to) return null;

                  const showGrowth = growthActive;
                  const fromPop = showGrowth ? getNodePop(growthElapsed, revealSeq.delays.get(fromId) ?? 0) : 1;
                  const toPop = showGrowth ? getNodePop(growthElapsed, revealSeq.delays.get(toId) ?? 0) : 1;
                  if (showGrowth && (fromPop <= 0 || toPop <= 0)) return null;

                  const edgeDraw = showGrowth
                    ? getEdgeDraw(growthElapsed, e.source, e.target, revealSeq.orderIndex)
                    : 1;
                  if (showGrowth && edgeDraw <= 0) return null;

                  const x2 = from.x + (to.x - from.x) * edgeDraw;
                  const y2 = from.y + (to.y - from.y) * edgeDraw;

                  const lit = isEdgeDirectlyConnected(e);
                  const focusForEdge = draggingId ?? hoverId;
                  const edgeHighlighted = Boolean(focusForEdge && lit);
                  const stroke = focusForEdge
                    ? edgeHighlighted
                      ? graphTheme.edgeHighlight
                      : graphTheme.edgeMuted
                    : graphTheme.edgeDefault;
                  return (
                    <line
                      key={`${e.source}-${e.target}`}
                      x1={from.x}
                      y1={from.y}
                      x2={x2}
                      y2={y2}
                      stroke={stroke}
                      strokeOpacity={showGrowth ? edgeDraw : 1}
                      strokeWidth={
                        (edgeHighlighted
                          ? graphTheme.edgeWidthHighlight
                          : graphTheme.edgeWidthDefault) * prefs.edgeWidthScale
                      }
                    />
                  );
                })}
                {nodes.map((node) => {
                  const p = positions.get(node.id);
                  if (!p) return null;

                  const showGrowth = growthActive;
                  const delay = revealSeq.delays.get(node.id) ?? 0;
                  const pop = showGrowth ? getNodePop(growthElapsed, delay) : 1;
                  if (showGrowth && pop <= 0) return null;

                  const scale = showGrowth ? getNodePopScale(pop) : 1;
                  const isDragged = draggingId === node.id;
                  const isHovered = hoverId === node.id || isDragged;
                  const isSelected = selectedId === node.id && !hoverId && !draggingId;
                  const active = isHovered || isSelected || isDragged;
                  const lit = !nodeHighlightSet || nodeHighlightSet.has(node.id);
                  const degree = node.degree ?? 0;
                  const r = obsidianNodeRadius(degree, active) * scale * prefs.nodeSizeScale;
                  const zoomOk = transform.scale >= LABEL_MIN_ZOOM;
                  const showLabel = active || (zoomOk && (prefs.showAllLabels || degree >= 1));
                  const labelText = truncateGraphLabel(node.label);
                  const baseOpacity = lit ? graphTheme.nodeOpacityDefault : graphTheme.nodeOpacityMuted;
                  const labelOpacity = showGrowth ? Math.min(1, pop * 1.4) : 1;
                  const nodeFill = isHovered
                    ? graphTheme.nodeHoverFill
                    : lit && isSelected
                      ? graphTheme.nodeFillHover
                      : graphTheme.nodeFill;
                  const labelFill = isHovered
                    ? graphTheme.labelFillHover
                    : lit
                      ? graphTheme.labelFill
                      : graphTheme.labelFillMuted;
                  const labelPlacement =
                    labelPlacements.get(node.id) ?? {
                      x: p.x + r + graphTheme.labelOffsetX,
                      y: p.y,
                      textAnchor: 'start' as const,
                    };

                  return (
                    <g
                      key={node.id}
                      data-graph-node
                      style={{ cursor: 'grab', opacity: baseOpacity * (showGrowth ? Math.min(1, pop * 1.2) : 1) }}
                      onMouseEnter={() => {
                        if (!dragRef.current) setHoverId(node.id);
                      }}
                      onMouseLeave={() => {
                        if (!dragRef.current) setHoverId(null);
                      }}
                      onPointerDown={(ev) => onNodePointerDown(ev, node.id)}
                      onClick={() => onNodeClick(node.id)}
                      onDoubleClick={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openNodePreview(node.relPath);
                      }}
                    >
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={r}
                        fill={nodeFill}
                        stroke={isHovered ? graphTheme.nodeHoverFill : graphTheme.nodeStroke}
                        strokeWidth={isHovered ? 1.5 : 0}
                      />
                      {showLabel && (
                        <text
                          x={labelPlacement.x}
                          y={labelPlacement.y}
                          dominantBaseline="middle"
                          textAnchor={labelPlacement.textAnchor}
                          fontSize={graphTheme.labelFontSize}
                          fill={labelFill}
                          opacity={labelOpacity * prefs.labelOpacity}
                          className="pointer-events-none"
                          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        >
                          {labelText}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-border shrink-0 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>
            {nodes.length} 节点 · {edges.length} 边
            {prefs.localMode && focusId ? ` · 局部深度 ${prefs.depth}` : ' · 全局'}
          </span>
          {selectedNode ? (
            <span className="truncate max-w-md">
              已选：<strong>{selectedNode.label}</strong>（双击预览）
            </span>
          ) : (
            <span>单击选中 · 双击打开 · 拖拽节点 · 滚轮以光标为中心缩放</span>
          )}
        </div>
      </div>

      {showSettings && (
        <aside className="w-52 sm:w-56 border-l border-border shrink-0 overflow-y-auto p-3 space-y-2 text-sm bg-card text-foreground">
          <Accordion defaultOpen className="border-b border-border pb-2">
            <AccordionTrigger className="text-xs font-medium text-foreground hover:no-underline py-1">
              筛选
            </AccordionTrigger>
            <AccordionContent className="space-y-0 pt-1">
              <label className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs">局部图模式</span>
                <Switch
                  checked={prefs.localMode}
                  onCheckedChange={(v) => updatePref('localMode', v)}
                />
              </label>
              {FILTERABLE_GROUPS.map((g) => (
                <label key={g} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-2 h-2 rounded-full bg-muted-foreground"
                      style={{ background: graphTheme.nodeFill }}
                    />
                    {GROUP_LABELS[g]}
                  </span>
                  <Switch
                    checked={prefs.groups[g]}
                    onCheckedChange={(v) => updatePref('groups', { ...prefs.groups, [g]: v })}
                  />
                </label>
              ))}
            </AccordionContent>
          </Accordion>

          <Accordion defaultOpen className="border-b border-border pb-2">
            <AccordionTrigger className="text-xs font-medium text-foreground hover:no-underline py-1">
              外观设置
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">
                  文本透明度：{Math.round(prefs.labelOpacity * 100)}%
                </Label>
                <Slider
                  min={20}
                  max={100}
                  step={5}
                  value={[Math.round(prefs.labelOpacity * 100)]}
                  onValueChange={([v]) => updatePref('labelOpacity', (v ?? 100) / 100)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">节点大小：{prefs.nodeSizeScale.toFixed(1)}×</Label>
                <Slider
                  min={10}
                  max={500}
                  step={10}
                  value={[Math.round(prefs.nodeSizeScale * 100)]}
                  onValueChange={([v]) =>
                    updatePref('nodeSizeScale', Math.min(5, Math.max(0.1, (v ?? 100) / 100)))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">连线粗细：{prefs.edgeWidthScale.toFixed(1)}×</Label>
                <Slider
                  min={50}
                  max={250}
                  step={10}
                  value={[Math.round(prefs.edgeWidthScale * 100)]}
                  onValueChange={([v]) => updatePref('edgeWidthScale', (v ?? 100) / 100)}
                />
              </div>

              <div className="space-y-1 pt-1 border-t border-border">
                <label className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs">隐藏孤立节点</span>
                  <Switch checked={prefs.hideOrphans} onCheckedChange={(v) => updatePref('hideOrphans', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs">显示全部标签</span>
                  <Switch checked={prefs.showAllLabels} onCheckedChange={(v) => updatePref('showAllLabels', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs">物理动画</span>
                  <Switch checked={prefs.animate} onCheckedChange={(v) => updatePref('animate', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs">生长动画</span>
                  <Switch
                    checked={prefs.growAnimation}
                    onCheckedChange={(v) => updatePref('growAnimation', v)}
                  />
                </label>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">链接距离：{prefs.linkDistance}</Label>
                <Slider min={40} max={200} step={5} value={[prefs.linkDistance]} onValueChange={([v]) => updatePref('linkDistance', v ?? 100)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">斥力：{prefs.repulsion}</Label>
                <Slider min={2000} max={12000} step={200} value={[prefs.repulsion]} onValueChange={([v]) => updatePref('repulsion', v ?? 5200)} />
              </div>
            </AccordionContent>
          </Accordion>

          {prefs.localMode && (
            <div className="space-y-1">
              <Label className="text-xs">局部深度：{prefs.depth}</Label>
              <Slider min={0} max={4} step={1} value={[prefs.depth]} onValueChange={([v]) => updatePref('depth', v ?? 2)} />
              {focusId && (
                <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs mt-1" onClick={() => centerOnNode(focusId)}>
                  居中当前焦点
                </Button>
              )}
            </div>
          )}
        </aside>
      )}

      {previewStack.map((path, index) => {
        const isTop = index === previewStack.length - 1;
        return (
          <FilePreviewDialog
            // index+path：同层不 remount；允许栈内同路径再次打开
            key={`preview-${index}-${path}`}
            open
            relPath={path}
            zIndex={80 + index * 10}
            showBackdrop={isTop}
            knownPaths={previewKnownPaths}
            onOpenChange={(open) => {
              if (!open) {
                // 关掉该路径所在层及之上（避免 index 闭包过期）
                setPreviewStack((stack) => {
                  const i = stack.lastIndexOf(path);
                  if (i < 0) return stack.slice(0, Math.max(0, stack.length - 1));
                  return stack.slice(0, i);
                });
              }
            }}
            onOpenLinkedPage={openLinkedPreview}
          />
        );
      })}
    </div>
  );
}
