export const PAGE_DEPTH_FEET = 20;
export const PAGE_HEIGHT = 1120;
export const PAGE_WIDTH = 860;
export const TOP_MARGIN = 56;
export const LEFT_MARGIN = 36;
export const DEPTH_COLUMN_WIDTH = 92;
export const BLOW_COLUMN_WIDTH = 170;
export const SOIL_COLUMN_WIDTH = 500;
export const COLUMN_GAP = 12;
export const PAGE_INNER_HEIGHT = 980;

export const DEPTH_SCALE = PAGE_INNER_HEIGHT / PAGE_DEPTH_FEET;

export function clampDepth(depth: number) {
  return Math.min(PAGE_DEPTH_FEET, Math.max(0, depth));
}

export function depthToY(depth: number) {
  return TOP_MARGIN + clampDepth(depth) * DEPTH_SCALE;
}

export function yToDepth(y: number) {
  return clampDepth((y - TOP_MARGIN) / DEPTH_SCALE);
}

export function roundDepth(depth: number, precision = 0.1) {
  return Math.round(depth / precision) * precision;
}

export function formatDepth(depth: number) {
  return `${depth.toFixed(1)} ft`;
}