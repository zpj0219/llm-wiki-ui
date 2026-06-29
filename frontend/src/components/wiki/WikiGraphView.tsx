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
  createForceSimNodes,
  layoutTickCountForNodes,
  mergeSimWithNodes,
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

const LAYOUT = { w: 960, h: 560 };
const STORAGE_KEY = 'llm_wiki_graph_prefs';

const FILTERABLE_GROUPS = ['entities', 'topics', 'sources'] as const satisfies readonly WikiGraphGroup[];

const GROUP_LABELS: Record<(typeof FILTERABLE_GROUPS)[number], string> = {
  entities: '实体',
  topics: '主题',
  sources: '来源',
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

function clientToGraph(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  transform: { scale: number; tx: number; ty: number }
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const vx = ((clientX - rect.left) / rect.width) * LAYOUT.w;
  const vy = ((clientY - rect.top) / rect.height) * LAYOUT.h;
  return {
    x: (vx - transform.tx) / transform.scale,
    y: (vy - transform.ty) / transform.scale,
  };
}

export function WikiGraphView({
  onOpenPage,
  refreshKey = 0,
  focusPath = null,
  forceLocalGraph = false,
}: WikiGraphViewProps) {
  const graphTheme = useGraphTheme();
  const [rawNodes, setRawNodes] = useState<WikiGraphNode[]>([]);
  const [rawEdges, setRawEdges] = useState<WikiGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<GraphPrefs>(loadPrefs);
  const [search, setSearch] = useState('');
  const [focusId, setFocusId] = useState<string | null>(focusPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [growthFrame, setGrowthFrame] = useState(0);
  const [growthPlaying, setGrowthPlaying] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ForceSimNode[]>([]);
  const alphaRef = useRef(1);
  const panRef = useRef({ active: false, x: 0, y: 0, tx: 0, ty: 0 });
  const dragRef = useRef<{ id: string } | null>(null);
  const growthStartRef = useRef(0);
  const revealSeqRef = useRef<RevealSequence>({ order: [], delays: new Map(), orderIndex: new Map() });
  const growthRafRef = useRef(0);
  const initialGrowthDoneRef = useRef(false);

  const centerOnNode = useCallback((nodeId: string) => {
    const p = simRef.current.find((n) => n.id === nodeId);
    if (!p) return;
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
        setGrowthFrame((n) => n + 1);
        return;
      }

      cancelAnimationFrame(growthRafRef.current);
      revealSeqRef.current = computeRevealSequence(
        nodeList,
        edgeList,
        prefs.localMode ? focusId : null
      );
      growthStartRef.current = performance.now();
      setGrowthPlaying(true);
      setGrowthFrame((n) => n + 1);

      const endMs = growthAnimationEndMs(revealSeqRef.current);
      const tick = () => {
        const elapsed = performance.now() - growthStartRef.current;
        setGrowthFrame((n) => n + 1);
        if (elapsed < endMs) {
          growthRafRef.current = requestAnimationFrame(tick);
        } else {
          setGrowthPlaying(false);
        }
      };
      growthRafRef.current = requestAnimationFrame(tick);
    },
    [prefs.growAnimation, prefs.localMode, focusId]
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

  useEffect(() => {
    simRef.current = mergeSimWithNodes(simRef.current, nodes, LAYOUT.w, LAYOUT.h);
    alphaRef.current = 1;
    revealSeqRef.current = computeRevealSequence(
      nodes,
      edges,
      prefs.localMode ? focusId : null
    );
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

    const simCfg = {
      width: LAYOUT.w,
      height: LAYOUT.h,
      linkDistance: prefs.linkDistance,
      repulsion: repulsionForNodeCount(prefs.repulsion, simRef.current.length),
      centerStrength: GRAPH_PHYSICS.centerStrength,
      linkStrength: GRAPH_PHYSICS.linkStrength,
    };

    if (!prefs.animate) {
      let alpha = Math.max(alphaRef.current, 1);
      const maxTicks = layoutTickCountForNodes(nodes.length);
      for (let t = 0; t < maxTicks && alpha > 0.002; t++) {
        tickForceSimulation(simRef.current, edges, alpha, simCfg);
        alpha *= nodes.length > 80 ? 0.988 : 0.972;
      }
      alphaRef.current = alpha;
      setPositions(new Map(simToPositionMap(simRef.current)));
      return;
    }

    let raf = 0;
    let alive = true;

    const step = () => {
      if (!alive) return;
      const alpha = alphaRef.current;
      if (alpha > 0.002) {
        tickForceSimulation(simRef.current, edges, alpha, {
          ...simCfg,
          repulsion: repulsionForNodeCount(prefs.repulsion, simRef.current.length),
        });
        alphaRef.current = alpha * (nodes.length > 80 ? 0.988 : 0.972);
        setPositions(new Map(simToPositionMap(simRef.current)));
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [nodes, edges, prefs.animate, prefs.linkDistance, prefs.repulsion]);

  /** 悬停时：仅当前节点 + 一跳邻居用于节点显隐 */
  const hoverNeighborIds = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const e of edges) {
      if (e.source === hoverId) set.add(e.target);
      if (e.target === hoverId) set.add(e.source);
    }
    return set;
  }, [hoverId, edges]);

  /** 选中时：节点高亮范围（无悬停时生效） */
  const selectedNeighborIds = useMemo(() => {
    if (!selectedId || hoverId) return null;
    const set = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [selectedId, hoverId, edges]);

  const nodeHighlightSet = hoverNeighborIds ?? selectedNeighborIds;
  const labelPlacements = useMemo(() => {
    type Box = { left: number; right: number; top: number; bottom: number };
    type Placement = { x: number; y: number; textAnchor: 'start' | 'middle' | 'end' };
    const placed = new Map<string, Placement>();
    const occupied: Box[] = [];
    const fontSize = graphTheme.labelFontSize;
    const labelHeight = fontSize + 2;
    const charWidth = fontSize * 0.62;
    const margin = 3;

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

    const scoreNode = (node: WikiGraphNode) => {
      const isHovered = hoverId === node.id;
      const isSelected = selectedId === node.id && !hoverId;
      const active = isHovered || isSelected;
      const degree = node.degree ?? 0;
      return (active ? 10_000 : 0) + degree;
    };
    const sortedNodes = [...nodes].sort((a, b) => scoreNode(b) - scoreNode(a));

    for (const node of sortedNodes) {
      const p = positions.get(node.id);
      if (!p) continue;
      const isHovered = hoverId === node.id;
      const isSelected = selectedId === node.id && !hoverId;
      const active = isHovered || isSelected;
      const degree = node.degree ?? 0;
      const showLabel = prefs.showAllLabels || active || degree >= 1;
      if (!showLabel) continue;
      const text = truncateGraphLabel(node.label);
      const r = obsidianNodeRadius(degree, active) * prefs.nodeSizeScale;
      const off = graphTheme.labelOffsetX;
      const candidates: Placement[] = [
        { x: p.x + r + off, y: p.y, textAnchor: 'start' },
        { x: p.x - r - off, y: p.y, textAnchor: 'end' },
        { x: p.x, y: p.y - r - off, textAnchor: 'middle' },
        { x: p.x, y: p.y + r + off, textAnchor: 'middle' },
        { x: p.x + r + off, y: p.y - r * 0.9, textAnchor: 'start' },
        { x: p.x + r + off, y: p.y + r * 0.9, textAnchor: 'start' },
        { x: p.x - r - off, y: p.y - r * 0.9, textAnchor: 'end' },
        { x: p.x - r - off, y: p.y + r * 0.9, textAnchor: 'end' },
      ];
      let picked: Placement | null = null;
      for (const cand of candidates) {
        const box = makeBox(cand.x, cand.y, cand.textAnchor, text);
        if (occupied.some((o) => intersects(o, box))) continue;
        picked = cand;
        occupied.push(box);
        break;
      }
      // 无空位时仍显示标签（默认右侧），不因遮挡隐藏
      if (!picked) {
        picked = candidates[0]!;
        occupied.push(makeBox(picked.x, picked.y, picked.textAnchor, text));
      }
      placed.set(node.id, picked);
    }
    return placed;
  }, [nodes, positions, hoverId, selectedId, prefs.showAllLabels, prefs.nodeSizeScale, graphTheme.labelFontSize, graphTheme.labelOffsetX]);

  const isEdgeDirectlyConnected = useCallback(
    (e: WikiGraphEdge) => {
      if (!hoverId) return true;
      return e.source === hoverId || e.target === hoverId;
    },
    [hoverId]
  );

  const reheatLayout = useCallback(() => {
    for (const n of simRef.current) n.fixed = false;
    alphaRef.current = 1;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const delta = e.deltaY > 0 ? 0.9 : 1.11;
      const g = clientToGraph(e.clientX, e.clientY, svg, transform);
      setTransform((t) => {
        const newScale = Math.min(4, Math.max(0.15, t.scale * delta));
        const rect = svg.getBoundingClientRect();
        const vx = ((e.clientX - rect.left) / rect.width) * LAYOUT.w;
        const vy = ((e.clientY - rect.top) / rect.height) * LAYOUT.h;
        return {
          scale: newScale,
          tx: vx - g.x * newScale,
          ty: vy - g.y * newScale,
        };
      });
    },
    [transform]
  );

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as Element).closest('[data-graph-node]')) return;
      panRef.current = {
        active: true,
        x: e.clientX,
        y: e.clientY,
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
        const g = clientToGraph(e.clientX, e.clientY, svgRef.current, transform);
        const node = simRef.current.find((n) => n.id === dragRef.current!.id);
        if (node) {
          node.x = g.x;
          node.y = g.y;
          node.vx = 0;
          node.vy = 0;
          node.fixed = true;
          setPositions(new Map(simToPositionMap(simRef.current)));
          alphaRef.current = Math.max(alphaRef.current, 0.15);
        }
        return;
      }
      if (!panRef.current.active) return;
      setTransform((t) => ({
        ...t,
        tx: panRef.current.tx + (e.clientX - panRef.current.x),
        ty: panRef.current.ty + (e.clientY - panRef.current.y),
      }));
    },
    [transform]
  );

  const onCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    panRef.current.active = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    dragRef.current = { id: nodeId };
    (e.currentTarget.closest('svg') as Element)?.setPointerCapture(e.pointerId);
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
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransform((t) => ({ ...t, scale: Math.min(4, t.scale * 1.12) }))}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.15, t.scale * 0.88) }))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setTransform({ scale: 1, tx: 0, ty: 0 })}>
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
                  const edgeHighlighted = Boolean(hoverId && lit);
                  const stroke = hoverId
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
                  const isHovered = hoverId === node.id;
                  const isSelected = selectedId === node.id && !hoverId;
                  const active = isHovered || isSelected;
                  const lit = !nodeHighlightSet || nodeHighlightSet.has(node.id);
                  const degree = node.degree ?? 0;
                  const r = obsidianNodeRadius(degree, active) * scale * prefs.nodeSizeScale;
                  const showLabel = prefs.showAllLabels || active || degree >= 1;
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
                      onMouseEnter={() => setHoverId(node.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onPointerDown={(ev) => onNodePointerDown(ev, node.id)}
                      onClick={() => onNodeClick(node.id)}
                      onDoubleClick={() => onOpenPage(node.relPath)}
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
              已选：<strong>{selectedNode.label}</strong>（双击打开）
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
    </div>
  );
}
