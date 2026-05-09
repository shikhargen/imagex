import type { UiNode } from '../flow/types.js';

export type Rect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function nodeRect(node: UiNode): Rect {
  const { width, height } = nodeDimensions(node);
  const left = node.position.x;
  const top = node.position.y;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function nodeDimensions(node: UiNode): { width: number; height: number } {
  if (node.type === 'frame') {
    return {
      width: dimensionValue(node.data.workflowNode.data.width, node.width, node.measured?.width, 520),
      height: dimensionValue(node.data.workflowNode.data.height, node.height, node.measured?.height, 360),
    };
  }
  return {
    width: dimensionValue(node.measured?.width, node.width, node.data.workflowNode.data.width, 300),
    height: dimensionValue(node.measured?.height, node.height, node.data.workflowNode.data.height, 160),
  };
}

function dimensionValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 1;
}

export function rectsIntersect(left: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>, right: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function containsRect(outer: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>, inner: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>): boolean {
  return outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
}

export function containsPoint(rect: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>, point: { x: number; y: number }): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

export function intersectionArea(left: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>, right: Pick<Rect, 'left' | 'top' | 'right' | 'bottom'>): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}
