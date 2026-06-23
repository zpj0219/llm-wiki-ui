/** 关系图视觉常量（颜色随应用主题 CSS 变量） */

export type GraphThemeColors = {
  canvas: string;
  nodeFill: string;
  nodeFillHover: string;
  nodeHoverFill: string;
  nodeStroke: string;
  labelFill: string;
  labelFillMuted: string;
  labelFillHover: string;
  edgeDefault: string;
  edgeMuted: string;
  edgeHighlight: string;
  nodeOpacityDefault: number;
  nodeOpacityMuted: number;
  labelFontSize: number;
  labelOffsetX: number;
  edgeWidthDefault: number;
  edgeWidthHighlight: number;
};

export const GRAPH_PHYSICS = {
  linkDistance: 88,
  repulsion: 8200,
  centerStrength: 0.006,
  linkStrength: 0.072,
  growthDurationMs: 480,
} as const;

const ACCENT = 'hsl(221.2 83.2% 53.3%)';
const ACCENT_SOFT = 'hsl(221.2 83.2% 65%)';

function cssHsl(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  return `hsl(${raw})`;
}

function cssHslAlpha(varName: string, alpha: number, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return fallback;
  return `hsl(${raw} / ${alpha})`;
}

export function getGraphThemeColors(): GraphThemeColors {
  const isDark =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return {
    canvas: cssHsl('--background', isDark ? 'hsl(0 0% 3.9%)' : 'hsl(0 0% 100%)'),
    nodeFill: cssHsl('--muted-foreground', isDark ? 'hsl(0 0% 63.9%)' : 'hsl(0 0% 45.1%)'),
    nodeFillHover: cssHsl('--foreground', isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 9%)'),
    nodeHoverFill: ACCENT,
    nodeStroke: 'none',
    labelFill: cssHsl('--foreground', isDark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 9%)'),
    labelFillMuted: cssHsl('--muted-foreground', isDark ? 'hsl(0 0% 63.9%)' : 'hsl(0 0% 45.1%)'),
    labelFillHover: ACCENT_SOFT,
    edgeDefault: cssHslAlpha('--foreground', isDark ? 0.14 : 0.12, isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'),
    edgeMuted: cssHslAlpha('--foreground', isDark ? 0.04 : 0.06, isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'),
    edgeHighlight: cssHslAlpha('--primary', 0.85, ACCENT),
    nodeOpacityDefault: 1,
    nodeOpacityMuted: isDark ? 0.07 : 0.12,
    labelFontSize: 10,
    labelOffsetX: 4,
    edgeWidthDefault: 0.75,
    edgeWidthHighlight: 1.1,
  };
}

/** 节点半径：连接数越多圆越大 */
export function obsidianNodeRadius(degree: number, hovered = false): number {
  const base = degree <= 0 ? 1.2 : 1.2 + Math.sqrt(degree) * 0.9;
  const r = Math.min(4, Math.max(1.2, base));
  return hovered ? r + 0.5 : r;
}

export function truncateGraphLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
