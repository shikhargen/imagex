/**
 * useCanvasRenderer — Direct canvas rendering hook for image editing nodes.
 *
 * Optimizations:
 * - Batches renders to requestAnimationFrame (natural 60fps throttling)
 * - Skips re-processing if sourceUrl and chain haven't changed
 * - Uses WASM (photon-rs) for native-speed pixel operations
 * - Falls back to Canvas 2D if WASM unavailable
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { graphEngine } from '../../../state/graphEngine.js';
import { flowStore } from '../../../state/flowStore.js';
import { loadImage, renderToCanvas } from './pipeline.js';
import { initWasm, isWasmReady, processWithWasm, onResolutionChange, invalidateProcessingCache } from './wasmEngine.js';

// Kick off WASM initialization eagerly (non-blocking)
initWasm();

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>
): { hasImage: boolean } {
  const [hasImage, setHasImage] = useState(false);
  const lastSourceRef = useRef<string | undefined>(undefined);
  const lastChainKeyRef = useRef<string>('');
  const rafRef = useRef<number>(0);
  const pendingRef = useRef(false);

  // Subscribe to graph topology changes (edges), output changes, node data changes, AND resolution changes
  const [graphVersion, setGraphVersion] = useState(0);
  useEffect(() => {
    const unsub1 = graphEngine.subscribe(() => setGraphVersion((v) => v + 1));
    const unsub2 = flowStore.subscribeEdges(() => setGraphVersion((v) => v + 1));
    const unsub3 = flowStore.subscribeNodes(() => setGraphVersion((v) => v + 1));
    const unsub4 = onResolutionChange(() => {
      lastSourceRef.current = undefined;
      lastChainKeyRef.current = '';
      setGraphVersion((v) => v + 1);
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { sourceUrl, chain } = graphEngine.traceUpstream(nodeId);
    if (!sourceUrl) {
      if (hasImage) setHasImage(false);
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.aspectRatio = '';
      lastSourceRef.current = undefined;
      lastChainKeyRef.current = '';
      return;
    }

    // Build the full chain
    const editingTypes = new Set(['rotate-flip', 'color-balance', 'crop', 'blur']);
    const fullChain = editingTypes.has(nodeType)
      ? [...chain, { type: nodeType, params: { ...nodeData } }]
      : chain;

    // Skip if nothing changed
    const chainKey = JSON.stringify(fullChain);
    if (sourceUrl === lastSourceRef.current && chainKey === lastChainKeyRef.current && hasImage) {
      return;
    }

    // If source URL changed, invalidate WASM caches (old pixel data is stale)
    if (sourceUrl !== lastSourceRef.current) {
      invalidateProcessingCache();
    }

    lastSourceRef.current = sourceUrl;
    lastChainKeyRef.current = chainKey;

    // Load (instant from cache) and process
    loadImage(sourceUrl).then((img) => {
      if (!canvasRef.current) return;
      try {
        if (isWasmReady()) {
          processWithWasm(canvasRef.current, img, fullChain);
        } else {
          renderToCanvas(canvasRef.current, img, fullChain);
        }
        // Explicitly set CSS aspect-ratio so the container always matches
        // the canvas intrinsic dimensions, even after rotation swaps w/h.
        const c = canvasRef.current;
        if (c.width > 0 && c.height > 0) {
          c.style.aspectRatio = `${c.width} / ${c.height}`;
        }
        setHasImage(true);
      } catch (e) {
        console.error('Canvas render error:', e);
        setHasImage(false);
      }
    }).catch(() => {
      setHasImage(false);
    });
  }, [canvasRef, nodeId, nodeType, nodeData, hasImage]);

  // Schedule render on next animation frame (batched, max 60fps)
  useEffect(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      pendingRef.current = false;
      render();
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pendingRef.current = false;
    };
  }, [render, graphVersion]);

  return { hasImage };
}
