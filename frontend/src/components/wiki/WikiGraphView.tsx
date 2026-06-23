import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getWikiGraph } from '@/services/wikiApi';
import type { WikiGraphEdge, WikiGraphNode } from '@shared/types';

const GROUP_COLORS: Record<string, string> = {
  entities: '#3b82f6',
  topics: '#8b5cf6',
  sources: '#10b981',
  flat: '#6b7280',
};

type WikiGraphViewProps = {
  refreshKey?: number;
  focusPath?: string | null;
  onOpenPage?: (relPath: string) => void;
};

function layoutNodes(
  nodes: WikiGraphNode[],
  edges: WikiGraphEdge[],
  width: number,
  height: number,
  focusPath?: string | null
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cx = width / 2;
  const cy = height / 2;

  if (focusPath && nodes.some((n) => n.id === focusPath)) {
    positions.set(focusPath, { x: cx, y: cy });
    const neighbors = new Set<string>();
    for (const e of edges) {
      if (e.source === focusPath) neighbors.add(e.target);
      if (e.target === focusPath) neighbors.add(e.source);
    }
    const neighborList = [...neighbors];
    neighborList.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / Math.max(neighborList.length, 1);
      positions.set(id, { x: cx + 120 * Math.cos(angle), y: cy + 120 * Math.sin(angle) });
    });
    let ring = 2;
    for (const n of nodes) {
      if (!positions.has(n.id)) {
        const angle = (2 * Math.PI * ring) / nodes.length;
        positions.set(n.id, {
          x: cx + 200 * Math.cos(angle + ring),
          y: cy + 200 * Math.sin(angle + ring),
        });
        ring++;
      }
    }
  } else {
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      const r = Math.min(width, height) * 0.35;
      positions.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
  }
  return positions;
}

export function WikiGraphView({ refreshKey = 0, focusPath, onOpenPage }: WikiGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<WikiGraphNode[]>([]);
  const [edges, setEdges] = useState<WikiGraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [size, setSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(width, 400), height: Math.max(height, 300) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setLoading(true);
    getWikiGraph()
      .then((g) => {
        setNodes(g.nodes);
        setEdges(g.edges);
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const positions = useMemo(
    () => layoutNodes(nodes, edges, size.width, size.height, focusPath),
    [nodes, edges, size, focusPath]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        暂无关系图数据
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 relative bg-muted/20">
      <svg width={size.width} height={size.height} className="block">
        {edges.map((e, i) => {
          const s = positions.get(e.source);
          const t = positions.get(e.target);
          if (!s || !t) return null;
          return (
            <line
              key={`${e.source}-${e.target}-${i}`}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              opacity={0.6}
            />
          );
        })}
        {nodes.map((n) => {
          const pos = positions.get(n.id);
          if (!pos) return null;
          const color = GROUP_COLORS[n.group] ?? GROUP_COLORS.flat;
          const r = 6 + Math.min(n.degree, 8);
          const isFocus = focusPath === n.id;
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => onOpenPage?.(n.relPath)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={color}
                stroke={isFocus ? '#f59e0b' : 'transparent'}
                strokeWidth={isFocus ? 3 : 0}
                opacity={0.9}
              />
              <text
                x={pos.x}
                y={pos.y + r + 12}
                textAnchor="middle"
                className="fill-foreground text-[10px] pointer-events-none select-none"
              >
                {n.label.length > 12 ? `${n.label.slice(0, 11)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-[10px]">
        {Object.entries(GROUP_COLORS).map(([group, color]) => (
          <span key={group} className="flex items-center gap-1 bg-background/80 px-2 py-0.5 rounded border">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
            {group}
          </span>
        ))}
      </div>
    </div>
  );
}
