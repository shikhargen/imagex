/**
 * useCanvasRenderer — Direct canvas rendering hook for image editing nodes.
 *
 * Optimizations:
 * - Batches renders to requestAnimationFrame (natural 60fps throttling)
 * - Skips re-processing if sourceUrl and chain haven't changed
 * - Uses raw WebGL shaders for realtime GPU-backed processing
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { graphEngine } from '../../../state/graphEngine.js';
import { loadImage, renderToCanvas } from './pipeline.js';
import { onPreviewSurfaceRefresh } from './previewSurface.js';
import { initWebgl, onResolutionChange } from './webglEngine.js';

// Kick off WebGL initialization eagerly (non-blocking).
void initWebgl();

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  nodeId: string,
  nodeType: string,
  nodeData: Record<string, unknown>
): { hasImage: boolean } {
  const [hasImage, setHasImage] = useState(false);
  const lastSourceRef = useRef<string | undefined>(undefined);
  const lastChainKeyRef = useRef<string>('');
  const hasImageRef = useRef(false);
  const rafRef = useRef<number>(0);
  const pendingRef = useRef(false);
  const renderSeqRef = useRef(0);

  // Subscribe only to this node's graph invalidations and preview-resolution changes.
  const [graphVersion, setGraphVersion] = useState(0);
  useEffect(() => {
    const unsub1 = graphEngine.subscribeNode(nodeId, () => setGraphVersion((v) => v + 1));
    const forceRender = () => {
      lastSourceRef.current = undefined;
      lastChainKeyRef.current = '';
      setGraphVersion((v) => v + 1);
    };
    const unsub2 = onResolutionChange(forceRender);
    const unsub3 = onPreviewSurfaceRefresh(forceRender);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [nodeId]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { sourceUrl, chain } = graphEngine.traceUpstream(nodeId);
    if (!sourceUrl) {
      hasImageRef.current = false;
      setHasImage(false);
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
    if (sourceUrl === lastSourceRef.current && chainKey === lastChainKeyRef.current && hasImageRef.current) {
      return;
    }

    lastSourceRef.current = sourceUrl;
    lastChainKeyRef.current = chainKey;
    const renderSeq = ++renderSeqRef.current;

    // Load (instant from cache) and process
    loadImage(sourceUrl).then((img) => {
      if (renderSeq !== renderSeqRef.current) return;
      if (!canvasRef.current) return;
      try {
        renderToCanvas(canvasRef.current, img, fullChain);
        // Explicitly set CSS aspect-ratio so the container always matches
        // the canvas intrinsic dimensions, even after rotation swaps w/h.
        const c = canvasRef.current;
        if (c.width > 0 && c.height > 0) {
          c.style.aspectRatio = `${c.width} / ${c.height}`;
        }
        hasImageRef.current = true;
        setHasImage(true);
      } catch (e) {
        console.error('Canvas render error:', e);
        hasImageRef.current = false;
        setHasImage(false);
      }
    }).catch(() => {
      hasImageRef.current = false;
      setHasImage(false);
    });
  }, [canvasRef, nodeId, nodeType, nodeData]);

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
