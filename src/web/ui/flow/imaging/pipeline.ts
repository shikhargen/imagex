/**
 * ImagePipeline - Browser-side canvas-based image processing.
 *
 * Each editing node in the graph has a processor function that takes an input
 * ImageBitmap and returns a processed one. The pipeline manages:
 * - Loading source images from URLs
 * - Applying chains of processors
 * - Caching intermediate results
 * - Notifying downstream nodes when results change
 *
 * Architecture:
 * - Source nodes (image) load an ImageBitmap from their asset URL
 * - Editing nodes register a processor: (input: ImageBitmap, params: T) => ImageBitmap
 * - The pipeline evaluates lazily: only when a node requests its output
 * - Results are cached and invalidated when upstream changes
 */

export type ProcessorFn = (
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  input: ImageBitmap,
  params: Record<string, unknown>
) => void;

export type ImageResult = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

// Registry of processor functions by node type
const processors = new Map<string, ProcessorFn>();

export function registerProcessor(nodeType: string, fn: ProcessorFn): void {
  processors.set(nodeType, fn);
}

// ─── Built-in processors ─────────────────────────────────────────────────────

registerProcessor('rotate-flip', (canvas, ctx, input, params) => {
  const rotate = ((Number(params.rotate) || 0) % 360 + 360) % 360;
  const flipH = Boolean(params.flipH);
  const flipV = Boolean(params.flipV);

  const isRotated = rotate === 90 || rotate === 270;
  const w = isRotated ? input.height : input.width;
  const h = isRotated ? input.width : input.height;

  canvas.width = w;
  canvas.height = h;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);
  ctx.drawImage(input, -input.width / 2, -input.height / 2);
  ctx.restore();
});

registerProcessor('color-balance', (canvas, ctx, input, params) => {
  const red = Number(params.red) || 0;
  const green = Number(params.green) || 0;
  const blue = Number(params.blue) || 0;

  canvas.width = input.width;
  canvas.height = input.height;
  ctx.drawImage(input, 0, 0);

  if (red === 0 && green === 0 && blue === 0) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i]! + red * 2.55));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + green * 2.55));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + blue * 2.55));
  }
  ctx.putImageData(imageData, 0, 0);
});

registerProcessor('crop', (canvas, ctx, input, params) => {
  const x = Number(params.x) || 0;
  const y = Number(params.y) || 0;
  const w = Number(params.cropWidth) || input.width;
  const h = Number(params.cropHeight) || input.height;

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(input, x, y, w, h, 0, 0, w, h);
});

registerProcessor('blur', (canvas, ctx, input, params) => {
  const radius = Number(params.radius) || 0;
  canvas.width = input.width;
  canvas.height = input.height;
  ctx.filter = radius > 0 ? `blur(${radius}px)` : 'none';
  ctx.drawImage(input, 0, 0);
  ctx.filter = 'none';
});

// ─── Image cache ─────────────────────────────────────────────────────────────

const bitmapCache = new Map<string, ImageBitmap>();

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const cached = bitmapCache.get(url);
  if (cached) return cached;
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  bitmapCache.set(url, bitmap);
  return bitmap;
}

// ─── HTMLImageElement cache (for direct canvas rendering) ────────────────────

const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

/**
 * Load an image as HTMLImageElement with caching and promise deduplication.
 * Once loaded, the element is reused forever (no re-fetch).
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = loadingPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      loadingPromises.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      loadingPromises.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
  loadingPromises.set(url, promise);
  return promise;
}

// ─── Direct canvas rendering (synchronous after image is loaded) ─────────────

type CanvasProcessorFn = (
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  input: HTMLCanvasElement | HTMLImageElement,
  params: Record<string, unknown>
) => void;

const canvasProcessors = new Map<string, CanvasProcessorFn>();

canvasProcessors.set('rotate-flip', (canvas, ctx, input, params) => {
  const rotate = ((Number(params.rotate) || 0) % 360 + 360) % 360;
  const flipH = Boolean(params.flipH);
  const flipV = Boolean(params.flipV);

  const isRotated = rotate === 90 || rotate === 270;
  const w = isRotated ? input.height : input.width;
  const h = isRotated ? input.width : input.height;

  canvas.width = w;
  canvas.height = h;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  if (flipH) ctx.scale(-1, 1);
  if (flipV) ctx.scale(1, -1);
  ctx.drawImage(input, -input.width / 2, -input.height / 2);
  ctx.restore();
});

canvasProcessors.set('color-balance', (canvas, ctx, input, params) => {
  const red = Number(params.red) || 0;
  const green = Number(params.green) || 0;
  const blue = Number(params.blue) || 0;

  canvas.width = input.width;
  canvas.height = input.height;
  ctx.drawImage(input, 0, 0);

  if (red === 0 && green === 0 && blue === 0) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i]! + red * 2.55));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + green * 2.55));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + blue * 2.55));
  }
  ctx.putImageData(imageData, 0, 0);
});

canvasProcessors.set('crop', (canvas, ctx, input, params) => {
  const x = Number(params.x) || 0;
  const y = Number(params.y) || 0;
  const w = Number(params.cropWidth) || input.width;
  const h = Number(params.cropHeight) || input.height;

  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(input, x, y, w, h, 0, 0, w, h);
});

canvasProcessors.set('blur', (canvas, ctx, input, params) => {
  const radius = Number(params.radius) || 0;
  canvas.width = input.width;
  canvas.height = input.height;
  ctx.filter = radius > 0 ? `blur(${radius}px)` : 'none';
  ctx.drawImage(input, 0, 0);
  ctx.filter = 'none';
});

/**
 * Render a processing chain directly to a visible canvas element.
 * This is SYNCHRONOUS once the source image is loaded.
 * Uses a scratch canvas for intermediate steps, draws final result to the target.
 */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  chain: Array<{ type: string; params: Record<string, unknown> }>
): void {
  if (chain.length === 0) {
    // No processing — just draw the source directly
    canvas.width = sourceImg.naturalWidth;
    canvas.height = sourceImg.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceImg, 0, 0);
    return;
  }

  // For multi-step chains, use a scratch canvas for intermediates
  let current: HTMLCanvasElement | HTMLImageElement = sourceImg;

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i]!;
    const proc = canvasProcessors.get(step.type);
    if (!proc) continue;

    const isLast = i === chain.length - 1;
    // For the last step, draw directly to the target canvas
    const target = isLast ? canvas : document.createElement('canvas');
    const ctx = target.getContext('2d');
    if (!ctx) continue;

    proc(target, ctx, current, step.params);
    current = target;
  }
}

// ─── Pipeline execution ──────────────────────────────────────────────────────

/**
 * Process an image through a chain of editing nodes.
 * Returns the final processed ImageBitmap.
 */
export async function processImageChain(
  sourceUrl: string,
  chain: Array<{ type: string; params: Record<string, unknown> }>
): Promise<ImageBitmap> {
  // Load source image (cached)
  const source = await loadBitmap(sourceUrl);

  if (chain.length === 0) return source;

  // Apply each processor in order
  let bitmap = await createImageBitmap(source); // Clone so we don't mutate cache
  for (const step of chain) {
    const processor = processors.get(step.type);
    if (!processor) continue;

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    processor(canvas, ctx, bitmap, step.params);
    bitmap.close();
    bitmap = await createImageBitmap(canvas);
  }

  return bitmap;
}

/**
 * Process and get a data URL (for preview or download).
 */
export async function processImageToDataUrl(
  sourceUrl: string,
  chain: Array<{ type: string; params: Record<string, unknown> }>,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92
): Promise<string> {
  const bitmap = await processImageChain(sourceUrl, chain);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: format, quality });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Process and download as a file.
 */
export async function processAndDownload(
  sourceUrl: string,
  chain: Array<{ type: string; params: Record<string, unknown> }>,
  filename = 'image.png'
): Promise<void> {
  const bitmap = await processImageChain(sourceUrl, chain);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
