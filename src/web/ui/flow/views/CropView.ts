import { graphEngine } from '../../../state/graphEngine.js';
import type { ImageXNode } from '../../../../shared/types.js';

export class CropView {
  constructor(
    private nodeId: string,
    private onChange: (key: string, value: unknown) => void,
    private getNode: () => ImageXNode
  ) {}

  getCrop() {
    const data = this.getNode().data;
    return {
      x: Number(data.x) || 0,
      y: Number(data.y) || 0,
      width: Number(data.cropWidth) || 0,
      height: Number(data.cropHeight) || 0,
    };
  }

  updateCrop(x: number, y: number, w: number, h: number, ongoing: boolean) {
    this.onChange('x', Math.round(x));
    this.onChange('y', Math.round(y));
    this.onChange('cropWidth', Math.round(w));
    this.onChange('cropHeight', Math.round(h));
    if (!ongoing) {
      graphEngine.updateNode(this.getNode(), false);
    }
  }

  reset(imageWidth: number, imageHeight: number) {
    this.updateCrop(0, 0, imageWidth, imageHeight, false);
  }
}
