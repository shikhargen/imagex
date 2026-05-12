/**
 * wasmEngine — photon-rs WASM-backed image processing engine.
 *
 * Flow: image → scratch canvas → WASM memory (PhotonImage) → process → target canvas
 *
 * Optimization:
 * - Caches the downscaled source pixel data per URL (avoids re-rasterizing every frame)
 */

import initPhoton, {
  open_image,
  putImageData,
  gaussian_blur,
  rotate,
  fliph,
  flipv,
  crop,
  alter_channels,
  type PhotonImage,
} from '@silvia-odwyer/photon';

// ─── WASM Initialization ─────────────────────────────────────────────────────

let wasmReady = false;
let wasmInitPromise: Promise<boolean> | null = null;

/**
 * Initialize the photon WASM module. Safe to call multiple times;
 * subsequent calls return the cached result.
 */
export function initWasm(): Promise<boolean> {
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = initPhoton()
    .then(() => {
      wasmReady = true;
      return true;
    })
    .catch((err) => {
      console.warn('[wasmEngine] Failed to initialize photon WASM:', err);
      wasmReady = false;
      return false;
    });

  return wasmInitPromise;
}

/** Returns whether the WASM engine is ready for use. */
export function isWasmReady(): boolean {
  return wasmReady;
}

// ─── Scratch canvas ──────────────────────────────────────────────────────────

let scratchCanvas: HTMLCanvasElement | null = null;

function getScratchCanvas(): HTMLCanvasElement {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
  }
  return scratchCanvas;
}

/** Max width for preview rendering — configurable via settings */
let PREVIEW_MAX_WIDTH = Number(localStorage.getItem('imagex.previewResolution')) || 1024;

const resolutionListeners = new Set<() => void>();

export function setPreviewResolution(value: number): void {
  PREVIEW_MAX_WIDTH = value;
  localStorage.setItem('imagex.previewResolution', String(value));
  sourceCache.clear();
  for (const fn of resolutionListeners) fn();
}

export function onResolutionChange(listener: () => void): () => void {
  resolutionListeners.add(listener);
  return () => resolutionListeners.delete(listener);
}

/** Invalidate all cached processing data (call when source images change) */
export function invalidateProcessingCache(): void {
  sourceCache.clear();
}

// ─── Source image cache ──────────────────────────────────────────────────────

type CachedSource = {
  width: number;
  height: number;
  scaleFactor: number;
  pixels: Uint8Array;
};

const sourceCache = new Map<string, CachedSource>();
const SOURCE_CACHE_MAX = 4;

function getOrCreateSource(sourceImg: HTMLImageElement): CachedSource {
  const cacheKey = `${sourceImg.src}@${PREVIEW_MAX_WIDTH}`;
  const cached = sourceCache.get(cacheKey);
  if (cached) return cached;

  // Downscale and rasterize
  const scratch = getScratchCanvas();
  const naturalW = sourceImg.naturalWidth;
  const naturalH = sourceImg.naturalHeight;
  let drawW = naturalW;
  let drawH = naturalH;
  let scaleFactor = 1;
  if (drawW > PREVIEW_MAX_WIDTH) {
    scaleFactor = PREVIEW_MAX_WIDTH / drawW;
    drawW = PREVIEW_MAX_WIDTH;
    drawH = Math.round(naturalH * scaleFactor);
  }
  scratch.width = drawW;
  scratch.height = drawH;
  const scratchCtx = scratch.getContext('2d')!;
  scratchCtx.drawImage(sourceImg, 0, 0, drawW, drawH);

  // Extract pixels
  const imageData = scratchCtx.getImageData(0, 0, drawW, drawH);
  const pixels = new Uint8Array(imageData.data.buffer.slice(0));

  const entry: CachedSource = { width: drawW, height: drawH, scaleFactor, pixels };

  // Evict oldest if at capacity
  if (sourceCache.size >= SOURCE_CACHE_MAX) {
    const firstKey = sourceCache.keys().next().value;
    if (firstKey !== undefined) sourceCache.delete(firstKey);
  }
  sourceCache.set(cacheKey, entry);
  return entry;
}

/** Create a fresh PhotonImage from cached pixel data */
function photonFromSource(source: CachedSource): PhotonImage {
  const scratch = getScratchCanvas();
  scratch.width = source.width;
  scratch.height = source.height;
  const ctx = scratch.getContext('2d')!;
  const imageData = new ImageData(new Uint8ClampedArray(source.pixels), source.width, source.height);
  ctx.putImageData(imageData, 0, 0);
  return open_image(scratch, ctx);
}

// ─── Main processing function ────────────────────────────────────────────────

/**
 * Process an image through a chain of operations using photon WASM.
 * Renders the result directly to the target canvas.
 */
export function processWithWasm(
  targetCanvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  chain: Array<{ type: string; params: Record<string, unknown> }>
): void {
  if (!wasmReady) {
    throw new Error('[wasmEngine] WASM not initialized. Call initWasm() first.');
  }

  // Get or create cached source (avoids re-rasterizing every frame)
  const source = getOrCreateSource(sourceImg);
  let img = photonFromSource(source);

  // Apply each operation
  for (const step of chain) {
    img = applyWasmStep(img, step, source.scaleFactor);
  }

  // Write result to target canvas
  const width = img.get_width();
  const height = img.get_height();
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetCtx = targetCanvas.getContext('2d')!;
  putImageData(targetCanvas, targetCtx, img);
  // img is now consumed by putImageData — do NOT call img.free()
}

// ─── Step dispatcher ─────────────────────────────────────────────────────────

export function applyWasmStep(
  img: PhotonImage,
  step: { type: string; params: Record<string, unknown> },
  scaleFactor = 1
): PhotonImage {
  switch (step.type) {
    case 'rotate-flip': {
      const angle = ((Number(step.params.rotate) || 0) % 360 + 360) % 360;
      const doFlipH = Boolean(step.params.flipH);
      const doFlipV = Boolean(step.params.flipV);

      if (angle !== 0) {
        const rotated = rotate(img, angle);
        img.free();
        img = rotated;
      }
      if (doFlipH) fliph(img);
      if (doFlipV) flipv(img);
      return img;
    }

    case 'blur': {
      const radius = Number(step.params.radius) || 0;
      // Scale blur radius proportionally to the downscaled image
      const scaledRadius = Math.max(0, Math.round(radius * scaleFactor));
      if (scaledRadius > 0) gaussian_blur(img, scaledRadius);
      return img;
    }

    case 'color-balance': {
      const r = Number(step.params.red) || 0;
      const g = Number(step.params.green) || 0;
      const b = Number(step.params.blue) || 0;
      if (r !== 0 || g !== 0 || b !== 0) {
        alter_channels(img, r, g, b);
      }
      return img;
    }

    case 'crop': {
      // Scale crop coordinates proportionally to the downscaled image
      const x = Math.round((Number(step.params.x) || 0) * scaleFactor);
      const y = Math.round((Number(step.params.y) || 0) * scaleFactor);
      const w = Math.round((Number(step.params.cropWidth) || 0) * scaleFactor);
      const h = Math.round((Number(step.params.cropHeight) || 0) * scaleFactor);
      
      // Skip if no valid crop region
      if (w <= 0 || h <= 0) return img;
      
      const imgW = img.get_width();
      const imgH = img.get_height();
      
      // Skip if crop covers the full image
      if (x === 0 && y === 0 && w >= imgW && h >= imgH) return img;
      
      // Clamp to image bounds
      const x2 = Math.min(x + w, imgW);
      const y2 = Math.min(y + h, imgH);
      if (x2 <= x || y2 <= y) return img;
      
      const cropped = crop(img, Math.max(0, x), Math.max(0, y), x2, y2);
      img.free();
      return cropped;
    }

    default:
      return img;
  }
}
