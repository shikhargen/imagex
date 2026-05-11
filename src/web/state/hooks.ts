/**
 * React hooks for subscribing to the GraphEngine.
 * Uses useSyncExternalStore for granular per-node subscriptions.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { graphEngine, type NodeOutput } from './graphEngine.js';

/**
 * Subscribe to a specific node's processed output.
 * Only re-renders when THIS node's output changes.
 */
export function useNodeOutput(nodeId: string): NodeOutput | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => graphEngine.subscribeNode(nodeId, onStoreChange),
    [nodeId]
  );
  const getSnapshot = useCallback(
    () => graphEngine.getOutput(nodeId),
    [nodeId]
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Get the output URL for a node (convenience wrapper).
 */
export function useNodeOutputUrl(nodeId: string): string | undefined {
  return useNodeOutput(nodeId)?.url;
}
