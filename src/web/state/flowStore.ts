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
import type { UiEdge, UiNode } from '../ui/flow/types.js';

type Listener = () => void;

export class FlowStore {
  private nodesMap = new Map<string, UiNode>();
  private edgesMap = new Map<string, UiEdge>();
  private cachedNodes: UiNode[] = [];
  private cachedEdges: UiEdge[] = [];
  private nodesListeners = new Set<Listener>();
  private edgesListeners = new Set<Listener>();
  private nodeListeners = new Map<string, Set<Listener>>();

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

  // ─── Writes ────────────────────────────────────────────────────────────────

  setNodes(nodes: UiNode[]): void {
    this.nodesMap = new Map(nodes.map((n) => [n.id, n]));
    this.cachedNodes = nodes;
    this.notifyNodesListeners();
  }

  setEdges(edges: UiEdge[]): void {
    this.edgesMap = new Map(edges.map((e) => [e.id, e]));
    this.cachedEdges = edges;
    this.notifyEdgesListeners();
  }

  updateNode(id: string, updater: (node: UiNode) => UiNode): void {
    const existing = this.nodesMap.get(id);
    if (!existing) return;
    const updated = updater(existing);
    this.nodesMap.set(id, updated);
    this.cachedNodes = [...this.nodesMap.values()];
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
    const listeners = this.nodeListeners.get(id);
    if (listeners) for (const fn of listeners) fn();
    this.notifyNodesListeners();
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  subscribeNodes(listener: Listener): () => void {
    this.nodesListeners.add(listener);
    return () => this.nodesListeners.delete(listener);
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

  // ─── Private ───────────────────────────────────────────────────────────────

  private notifyNodesListeners(): void {
    for (const fn of this.nodesListeners) fn();
  }

  private notifyEdgesListeners(): void {
    for (const fn of this.edgesListeners) fn();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const flowStore = new FlowStore();

// ─── React Hooks ─────────────────────────────────────────────────────────────

export function useFlowNodes(): UiNode[] {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeNodes(cb), []),
    () => flowStore.getNodes()
  );
}

export function useFlowEdges(): UiEdge[] {
  return useSyncExternalStore(
    useCallback((cb: Listener) => flowStore.subscribeEdges(cb), []),
    () => flowStore.getEdges()
  );
}
