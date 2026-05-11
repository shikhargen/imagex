import { graphEngine } from '../../../state/graphEngine.js';
import type { ImageXNode } from '../../../../shared/types.js';

export class BlurView {
  constructor(private nodeId: string, private onChange: (key: string, value: unknown) => void) {}

  setRadius(node: ImageXNode, value: number, ongoing: boolean) {
    this.onChange('radius', value);
    graphEngine.updateNode({ ...node, data: { ...node.data, radius: value } }, ongoing);
  }
}
