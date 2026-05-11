import { graphEngine } from '../../../state/graphEngine.js';
import type { ImageXNode } from '../../../../shared/types.js';

export class RotateFlipView {
  constructor(private nodeId: string, private onChange: (key: string, value: unknown) => void) {}

  getRotation(data: Record<string, unknown>): number {
    return Number(data.rotate) || 0;
  }

  getFlipH(data: Record<string, unknown>): boolean {
    return Boolean(data.flipH);
  }

  getFlipV(data: Record<string, unknown>): boolean {
    return Boolean(data.flipV);
  }

  rotateLeft(node: ImageXNode) {
    const deg = this.getRotation(node.data) - 90;
    this.onChange('rotate', String(deg));
    graphEngine.updateNode({ ...node, data: { ...node.data, rotate: String(deg) } }, false);
  }

  rotateRight(node: ImageXNode) {
    const deg = this.getRotation(node.data) + 90;
    this.onChange('rotate', String(deg));
    graphEngine.updateNode({ ...node, data: { ...node.data, rotate: String(deg) } }, false);
  }

  toggleFlipH(node: ImageXNode) {
    const next = !this.getFlipH(node.data);
    this.onChange('flipH', next);
    graphEngine.updateNode({ ...node, data: { ...node.data, flipH: next } }, false);
  }

  toggleFlipV(node: ImageXNode) {
    const next = !this.getFlipV(node.data);
    this.onChange('flipV', next);
    graphEngine.updateNode({ ...node, data: { ...node.data, flipV: next } }, false);
  }

  reset(node: ImageXNode) {
    this.onChange('rotate', '0');
    this.onChange('flipH', false);
    this.onChange('flipV', false);
    graphEngine.updateNode({ ...node, data: { ...node.data, rotate: '0', flipH: false, flipV: false } }, false);
  }
}
