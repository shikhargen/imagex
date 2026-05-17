/**
 * GraphEngine — Manages node evaluation, image processing, and downstream propagation.
 *
 * - Tracks image dependencies and invalidates only affected downstream nodes
 * - Expensive image processing runs on demand for export/generation paths
 * - `ongoing` flag suppresses downstream during slider drags
 *
 * This class is imperative (not React) — React components subscribe to it
 * via hooks/selectors.
 */

import type { ImageXEdge, ImageXNode } from '../../shared/types.js';
import { processImageChain } from '../ui/flow/imaging/pipeline.js';
import { outputImageIndexFromHandle } from '../ui/flow/ports.js';

export type NodeOutput = {
  url: string; // blob: or data: URL of the processed result
  width: number;
  height: number;
};

type NodeOutputListener = (nodeId: string, output: NodeOutput | null) => void;

export class GraphEngine {
  private nodes = new Map<string, ImageXNode>();
  private edges: ImageXEdge[] = [];
  private incomingImageEdgeByTarget = new Map<string, ImageXEdge>();
  private outgoingEdgesBySource = new Map<string, ImageXEdge[]>();
  private outputs = new Map<string, NodeOutput>();
  private listeners = new Set<NodeOutputListener>();
  private perNodeListeners = new Map<
    string,
    Set<(output: NodeOutput | null) => void>
  >();
  private pendingEvals = new Map<string, number>(); // version counter for abort
  private imageSignatures = new Map<string, string>();

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Update the graph topology (call when nodes/edges change) */
  setGraph(nodes: ImageXNode[], edges: ImageXEdge[]): void {
    const prevNodes = this.nodes;
    const prevEdges = this.edges;
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
    this.edges = edges;
    this.rebuildEdgeIndexes(edges);

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

    const affectedNodeIds = new Set<string>();
    const nextSignatures = new Map<string, string>();
    for (const node of nodes) {
      const signature = this.imageSignature(node);
      nextSignatures.set(node.id, signature);
      if (signature !== (this.imageSignatures.get(node.id) ?? this.imageSignature(prevNodes.get(node.id)))) {
        affectedNodeIds.add(node.id);
      }
    }
    for (const prevId of prevNodes.keys()) {
      if (!this.nodes.has(prevId)) affectedNodeIds.add(prevId);
    }
    this.imageSignatures = nextSignatures;

    // Invalidate affected editing/download nodes. Processing itself is on demand;
    // this keeps drag/selection updates from recomputing every preview.
    for (const targetId of affectedTargets) {
      this.invalidateNodeAndDownstream(targetId, true);
    }
    for (const nodeId of affectedNodeIds) {
      this.invalidateNodeAndDownstream(nodeId, true);
    }
  }

  /** Update a single node's data and invalidate affected previews/exports */
  updateNode(node: ImageXNode, ongoing = false): void {
    this.nodes.set(node.id, node);
    this.imageSignatures.set(node.id, this.imageSignature(node));
    this.invalidateNodeAndDownstream(node.id, !ongoing);
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

  private invalidateNodeAndDownstream(nodeId: string, includeDownstream: boolean): void {
    const queue = [nodeId];
    const visited = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (node && (this.isEditingType(node.type) || node.type === 'download')) {
        const prev = this.outputs.get(currentId);
        if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
        this.outputs.delete(currentId);
        this.pendingEvals.set(currentId, (this.pendingEvals.get(currentId) || 0) + 1);

        const nodeListeners = this.perNodeListeners.get(currentId);
        if (nodeListeners) {
          for (const fn of nodeListeners) fn(null);
        }
        for (const fn of this.listeners) fn(currentId, null);
      }

      if (!includeDownstream) continue;
      for (const edge of this.outgoingEdgesBySource.get(currentId) ?? []) {
        if (edge.source === currentId) queue.push(edge.target);
      }
    }
  }

  private isEditingType(type: string): boolean {
    return type === 'rotate-flip' || type === 'color-balance' || type === 'crop' || type === 'blur';
  }

  private imageSignature(node: ImageXNode | undefined): string {
    if (!node) return '';
    if (node.type === 'image') {
      return JSON.stringify({
        type: node.type,
        assetUrl: node.data.assetUrl,
        assetId: node.data.assetId,
        image: node.data.image,
      });
    }
    if (node.type === 'codex-output') {
      return JSON.stringify({
        type: node.type,
        previewUrl: node.data.previewUrl,
        previewUrls: node.data.previewUrls,
      });
    }
    if (this.isEditingType(node.type) || node.type === 'download') {
      const { title: _title, frameId: _frameId, width: _width, height: _height, ...data } = node.data;
      return JSON.stringify({ type: node.type, data });
    }
    return JSON.stringify({ type: node.type });
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

    const walk = (id: string, sourceHandle?: string | null) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) return;

      // Find upstream edge (image-in or field:image)
      const upstreamEdge = this.incomingImageEdgeByTarget.get(id);
      if (upstreamEdge) {
        walk(upstreamEdge.source, upstreamEdge.sourceHandle);
      }

      // After walking upstream, collect this node's contribution
      if (node.type === 'image') {
        sourceUrl = (node.data.assetUrl as string) || undefined;
      } else if (node.type === 'codex-output') {
        sourceUrl = outputPreviewUrlForHandle(node, sourceHandle);
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
    this.incomingImageEdgeByTarget.clear();
    this.outgoingEdgesBySource.clear();
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

  private rebuildEdgeIndexes(edges: ImageXEdge[]): void {
    const incomingImageEdgeByTarget = new Map<string, ImageXEdge>();
    const outgoingEdgesBySource = new Map<string, ImageXEdge[]>();
    for (const edge of edges) {
      if (edge.targetHandle === 'image-in' || edge.targetHandle === 'field:image') {
        incomingImageEdgeByTarget.set(edge.target, edge);
      }
      const outgoing = outgoingEdgesBySource.get(edge.source);
      if (outgoing) outgoing.push(edge);
      else outgoingEdgesBySource.set(edge.source, [edge]);
    }
    this.incomingImageEdgeByTarget = incomingImageEdgeByTarget;
    this.outgoingEdgesBySource = outgoingEdgesBySource;
  }
}

/** Singleton engine instance */
export const graphEngine = new GraphEngine();

function outputPreviewUrlForHandle(node: ImageXNode, sourceHandle: string | null | undefined): string | undefined {
  const index = outputImageIndexFromHandle(sourceHandle);
  const previewUrls = Array.isArray(node.data.previewUrls) ? node.data.previewUrls : [];
  const indexedUrl = previewUrls[index];
  if (typeof indexedUrl === 'string' && indexedUrl) return indexedUrl;
  return (node.data.previewUrl as string) || undefined;
}
