/**
 * FlowStore — Internal reactive store for flow nodes and edges.
 *
 * This is NOT React state. It's a plain class with per-key listeners.
 * React components subscribe via useSyncExternalStore.
 *
 * Key design:
 * - Nodes/edges live here, separate from any React state
 * - Per-node granular listeners (only affected components re-render)
 * - Cached arrays with stable references (useSyncExternalStore equality check)
 * - Mutations are imperative (no setState cascades)
 */

import { useSyncExternalStore, useCallback } from 'react';
import type { ImageXNode } from '../../shared/types.js';
import type { UiEdge, UiNode } from '../ui/flow/types.js';

type Listener = () => void;

export class FlowStore {
  private nodesMap = new Map<string, UiNode>();
  private edgesMap = new Map<string, UiEdge>();
  private cachedNodes: UiNode[] = [];
  private cachedEdges: UiEdge[] = [];
  private cachedWorkflowNodes: ImageXNode[] = [];
  private cachedHasFrames = false;
  private renderNodesListeners = new Set<Listener>();
  private nodesListeners = new Set<Listener>();
  private edgesListeners = new Set<Listener>();
  private nodeListeners = new Map<string, Set<Listener>>();
  private graphListeners = new Set<Listener>();
  private graphVersion = 0;

  // ─── Reads ─────────────────────────────────────────────────────────────────

  getNodes(): UiNode[] {
    return this.cachedNodes;
  }
  getEdges(): UiEdge[] {
    return this.cachedEdges;
  }
  getNode(id: string): UiNode | undefined {
    return this.nodesMap.get(id);
  }
  getWorkflowNodes(): ImageXNode[] {
    return this.cachedWorkflowNodes;
  }
  hasFrames(): boolean {
    return this.cachedHasFrames;
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  setNodes(nodes: UiNode[], options?: { transient?: boolean; graph?: boolean }): void {
    this.nodesMap = new Map(nodes.map((n) => [n.id, n]));
    this.cachedNodes = nodes;
    this.refreshNodeCaches(nodes);
    this.notifyRenderNodesListeners();
    if (!options?.transient) {
      this.notifyNodesListeners();
      if (options?.graph !== false) this.notifyGraphListeners();
    }
  }

  setEdges(edges: UiEdge[], options?: { graph?: boolean }): void {
    this.edgesMap = new Map(edges.map((e) => [e.id, e]));
    this.cachedEdges = edges;
    this.notifyEdgesListeners();
    if (options?.graph !== false) this.notifyGraphListeners();
  }

  updateNode(id: string, updater: (node: UiNode) => UiNode): void {
    const existing = this.nodesMap.get(id);
    if (!existing) return;
    const updated = updater(existing);
    this.nodesMap.set(id, updated);
    this.cachedNodes = [...this.nodesMap.values()];
    this.refreshNodeCaches(this.cachedNodes);
    // Notify per-node listeners only (avoids full re-render cascade)
    const listeners = this.nodeListeners.get(id);
    if (listeners) for (const fn of listeners) fn();
    // NOTE: deliberately NOT calling notifyNodesListeners() here.
    // Position changes during drag don't need to re-render the entire FlowEditor.
    // The cachedNodes array is updated for getNodes() calls but React won't see it
    // until a full setNodes() happens (e.g., on drag stop, add/remove, etc.)
  }

  /** Update a node AND notify global listeners (for changes that affect the full flow) */
  updateNodeAndNotify(id: string, updater: (node: UiNode) => UiNode): void {
    const existing = this.nodesMap.get(id);
    if (!existing) return;
    const updated = updater(existing);
    this.nodesMap.set(id, updated);
    this.cachedNodes = [...this.nodesMap.values()];
    this.refreshNodeCaches(this.cachedNodes);
    const listeners = this.nodeListeners.get(id);
    if (listeners) for (const fn of listeners) fn();
    this.notifyNodesListeners();
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  subscribeNodes(listener: Listener): () => void {
    this.nodesListeners.add(listener);
    return () => this.nodesListeners.delete(listener);
  }

  subscribeRenderNodes(listener: Listener): () => void {
    this.renderNodesListeners.add(listener);
    return () => this.renderNodesListeners.delete(listener);
  }

  subscribeEdges(listener: Listener): () => void {
    this.edgesListeners.add(listener);
    return () => this.edgesListeners.delete(listener);
  }

  subscribeNode(id: string, listener: Listener): () => void {
    let set = this.nodeListeners.get(id);
    if (!set) {
      set = new Set();
      this.nodeListeners.set(id, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.nodeListeners.delete(id);
    };
  }

  subscribeGraph(listener: Listener): () => void {
    this.graphListeners.add(listener);
    return () => this.graphListeners.delete(listener);
  }

  getGraphVersion(): number {
    return this.graphVersion;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private refreshNodeCaches(nodes: UiNode[]): void {
    this.cachedWorkflowNodes = nodes.map((node) => node.data.workflowNode);
    this.cachedHasFrames = nodes.some((node) => node.type === 'frame');
  }

  private notifyNodesListeners(): void {
    for (const fn of this.nodesListeners) fn();
  }

  private notifyRenderNodesListeners(): void {
    for (const fn of this.renderNodesListeners) fn();
  }

  private notifyEdgesListeners(): void {
    for (const fn of this.edgesListeners) fn();
  }

  private notifyGraphListeners(): void {
    this.graphVersion += 1;
    for (const fn of this.graphListeners) fn();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const flowStore = new FlowStore();

// ─── React Hooks ─────────────────────────────────────────────────────────────

export function useFlowNodes(): UiNode[] {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeRenderNodes(cb), []),
    () => flowStore.getNodes()
  );
}

export function useFlowEdges(): UiEdge[] {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeEdges(cb), []),
    () => flowStore.getEdges()
  );
}

export function useFlowGraphVersion(): number {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeGraph(cb), []),
    () => flowStore.getGraphVersion()
  );
}

export function useFlowHasFrames(): boolean {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeNodes(cb), []),
    () => flowStore.hasFrames()
  );
}
