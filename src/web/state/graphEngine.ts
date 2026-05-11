/**
 * GraphEngine — Manages node evaluation, image processing, and downstream propagation.
 *
 * - Each node processes ONLY its own step
 * - Results are cached per-node as blob URLs
 * - Changes propagate downstream via edge traversal
 * - `ongoing` flag suppresses downstream during slider drags
 *
 * This class is imperative (not React) — React components subscribe to it
 * via hooks/selectors.
 */

import type { ImageXEdge, ImageXNode } from '../../shared/types.js';
import { processImageChain } from '../ui/flow/imaging/pipeline.js';

export type NodeOutput = {
  url: string; // blob: or data: URL of the processed result
  width: number;
  height: number;
};

type NodeOutputListener = (nodeId: string, output: NodeOutput | null) => void;

export class GraphEngine {
  private nodes = new Map<string, ImageXNode>();
  private edges: ImageXEdge[] = [];
  private outputs = new Map<string, NodeOutput>();
  private listeners = new Set<NodeOutputListener>();
  private perNodeListeners = new Map<
    string,
    Set<(output: NodeOutput | null) => void>
  >();
  private pendingEvals = new Map<string, number>(); // version counter for abort

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Update the graph topology (call when nodes/edges change) */
  setGraph(nodes: ImageXNode[], edges: ImageXEdge[]): void {
    const prevEdges = this.edges;
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.edges = edges;

    // Detect nodes whose incoming connectivity changed and re-evaluate them
    const editingTypes = new Set([
      'rotate-flip',
      'color-balance',
      'crop',
      'blur',
      'download',
    ]);

    // Build sets of "target:targetHandle<-source:sourceHandle" for fast comparison
    const edgeKey = (e: ImageXEdge) =>
      `${e.target}:${e.targetHandle || ''}<-${e.source}:${
        e.sourceHandle || ''
      }`;
    const prevSet = new Set(prevEdges.map(edgeKey));
    const nextSet = new Set(edges.map(edgeKey));

    // Find targets whose incoming edges changed (added or removed)
    const affectedTargets = new Set<string>();
    for (const e of edges) {
      if (!prevSet.has(edgeKey(e))) affectedTargets.add(e.target);
    }
    for (const e of prevEdges) {
      if (!nextSet.has(edgeKey(e))) affectedTargets.add(e.target);
    }

    // Re-evaluate affected editing/download nodes
    for (const targetId of affectedTargets) {
      const node = this.nodes.get(targetId);
      if (node && editingTypes.has(node.type)) {
        void this.evaluateNode(targetId, false);
      }
    }
  }

  /** Update a single node's data and re-evaluate it */
  updateNode(node: ImageXNode, ongoing = false): void {
    this.nodes.set(node.id, node);
    void this.evaluateNode(node.id, ongoing);
  }

  /** Get the cached output for a node */
  getOutput(nodeId: string): NodeOutput | null {
    return this.outputs.get(nodeId) || null;
  }

  /** Subscribe to ALL output changes */
  subscribe(listener: NodeOutputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Subscribe to a SPECIFIC node's output changes */
  subscribeNode(
    nodeId: string,
    listener: (output: NodeOutput | null) => void
  ): () => void {
    let set = this.perNodeListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.perNodeListeners.set(nodeId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.perNodeListeners.delete(nodeId);
    };
  }

  // ─── Evaluation ────────────────────────────────────────────────────────────

  /** Evaluate a node: process its input through its own step, cache result */
  private async evaluateNode(nodeId: string, ongoing: boolean): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const editingTypes = new Set([
      'rotate-flip',
      'color-balance',
      'crop',
      'blur',
    ]);
    if (!editingTypes.has(node.type) && node.type !== 'download') return;

    // Increment version to abort stale evaluations
    const version = (this.pendingEvals.get(nodeId) || 0) + 1;
    this.pendingEvals.set(nodeId, version);

    // Find source URL and build chain by tracing upstream
    const { sourceUrl, chain } = this.traceUpstream(nodeId);
    if (!sourceUrl) {
      this.setOutput(nodeId, null);
      return;
    }

    // Add this node's own operation to the chain (except download)
    const fullChain =
      node.type === 'download'
        ? chain
        : [...chain, { type: node.type, params: { ...node.data } }];

    try {
      const bitmap = await processImageChain(sourceUrl, fullChain);

      // Check if evaluation is still current
      if (this.pendingEvals.get(nodeId) !== version) {
        bitmap.close();
        return;
      }

      // Convert to blob URL
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();

      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (this.pendingEvals.get(nodeId) !== version) return;

      // Revoke old URL
      const prev = this.outputs.get(nodeId);
      if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);

      const url = URL.createObjectURL(blob);
      this.setOutput(nodeId, { url, width, height });
    } catch {
      if (this.pendingEvals.get(nodeId) === version) {
        this.setOutput(nodeId, null);
      }
    }

    // Propagate downstream (unless ongoing)
    if (!ongoing) {
      this.propagateDownstream(nodeId);
    }
  }

  /** Propagate: find downstream nodes and re-evaluate them */
  private propagateDownstream(nodeId: string): void {
    const downstream = this.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target);

    for (const targetId of downstream) {
      void this.evaluateNode(targetId, false);
    }
  }

  /** Set output and notify listeners */
  private setOutput(nodeId: string, output: NodeOutput | null): void {
    if (output) {
      this.outputs.set(nodeId, output);
    } else {
      this.outputs.delete(nodeId);
    }
    // Notify per-node listeners
    const nodeListeners = this.perNodeListeners.get(nodeId);
    if (nodeListeners) {
      for (const fn of nodeListeners) fn(output);
    }
    // Notify global listeners
    for (const fn of this.listeners) fn(nodeId, output);
  }

  /** Trace upstream from a node to find source URL and intermediate processing chain */
  traceUpstream(nodeId: string): {
    sourceUrl: string | undefined;
    chain: Array<{ type: string; params: Record<string, unknown> }>;
  } {
    const editingTypes = new Set([
      'rotate-flip',
      'color-balance',
      'crop',
      'blur',
    ]);
    const visited = new Set<string>();
    const chain: Array<{ type: string; params: Record<string, unknown> }> = [];
    let sourceUrl: string | undefined;

    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) return;

      // Find upstream edge (image-in or field:image)
      const upstreamEdge = this.edges.find(
        (e) =>
          e.target === id &&
          (e.targetHandle === 'image-in' || e.targetHandle === 'field:image')
      );
      if (upstreamEdge) {
        walk(upstreamEdge.source);
      }

      // After walking upstream, collect this node's contribution
      if (node.type === 'image') {
        sourceUrl = (node.data.assetUrl as string) || undefined;
      } else if (node.type === 'codex-output') {
        sourceUrl = (node.data.previewUrl as string) || undefined;
      } else if (editingTypes.has(node.type) && id !== nodeId) {
        // Intermediate editing node — add to chain
        chain.push({ type: node.type, params: { ...node.data } });
      }
    };

    walk(nodeId);
    return { sourceUrl, chain };
  }

  /** Clean up all resources */
  dispose(): void {
    for (const [, output] of this.outputs) {
      if (output.url.startsWith('blob:')) URL.revokeObjectURL(output.url);
    }
    this.outputs.clear();
    this.listeners.clear();
    this.perNodeListeners.clear();
    this.pendingEvals.clear();
  }

  // ─── Generation Export ─────────────────────────────────────────────────────

  /**
   * Get the final image data URL for a node (for sending to the generation API).
   * For image nodes: returns raw asset URL
   * For editing nodes: returns the processed result
   * For codex-output nodes connected downstream: returns their generated preview
   *
   * This is called during prompt compilation to resolve image references.
   */
  async getImageDataUrlForNode(nodeId: string): Promise<string | null> {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    // Raw image node — return asset URL directly
    if (node.type === 'image') {
      return (node.data.assetUrl as string) || null;
    }

    // Codex-output node — return its preview (generated image)
    if (node.type === 'codex-output') {
      return (node.data.previewUrl as string) || null;
    }

    // Editing node — export the processed canvas as data URL
    const output = this.outputs.get(nodeId);
    if (output?.url) {
      // Convert blob URL to data URL
      if (output.url.startsWith('blob:')) {
        try {
          const response = await fetch(output.url);
          const blob = await response.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }
      return output.url;
    }

    // No cached output — process on demand
    const { sourceUrl, chain } = this.traceUpstream(nodeId);
    if (!sourceUrl) return null;

    const editingTypes = new Set([
      'rotate-flip',
      'color-balance',
      'crop',
      'blur',
    ]);
    const fullChain = editingTypes.has(node.type)
      ? [...chain, { type: node.type, params: { ...node.data } }]
      : chain;

    try {
      const bitmap = await processImageChain(sourceUrl, fullChain);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve the final image URL for any node that produces an image output.
   * Used by the compiler to get the actual image data to send to the API.
   * Returns the URL (asset URL, blob URL, or data URL).
   */
  getResolvedImageUrl(nodeId: string): string | null {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    if (node.type === 'image') {
      return (node.data.assetUrl as string) || null;
    }
    if (node.type === 'codex-output') {
      return (node.data.previewUrl as string) || null;
    }

    // Editing nodes — return cached processed output
    const output = this.outputs.get(nodeId);
    return output?.url || null;
  }
}

/** Singleton engine instance */
export const graphEngine = new GraphEngine();
