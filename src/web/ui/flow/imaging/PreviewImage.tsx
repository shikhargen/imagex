import { memo, useEffect, useState } from 'react';
import { onPreviewSurfaceRefresh } from './previewSurface.js';

const DEFAULT_MAX_PREVIEW_EDGE = 2048;
const MAX_CACHED_PREVIEWS = 64;
const PREVIEW_CACHE_SWEEP_DELAY_MS = 30_000;

type PreviewCacheEntry = {
  promise: Promise<string>;
  objectUrl: string | null;
  refCount: number;
  lastUsed: number;
  settled: boolean;
};

const previewCache = new Map<string, PreviewCacheEntry>();

function PreviewImageImpl({
  src,
  alt,
  className,
  maxEdge = DEFAULT_MAX_PREVIEW_EDGE,
}: {
  src: string;
  alt: string;
  className?: string;
  maxEdge?: number;
}) {
  const previewSrc = useBoundedPreviewSrc(src, maxEdge);
  const surfaceEpoch = usePreviewSurfaceEpoch();
  return <img key={surfaceEpoch} src={previewSrc || src} alt={alt} className={className} loading="eager" decoding="async" />;
}

export const PreviewImage = memo(PreviewImageImpl);

function useBoundedPreviewSrc(src: string, maxEdge: number): string | null {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewSrc(null);

    const cacheKey = `${maxEdge}:${src}`;
    const entry = acquireBoundedPreview(cacheKey, src, maxEdge);
    entry.promise.then((nextSrc) => {
      if (!cancelled) setPreviewSrc(nextSrc);
    });

    return () => {
      cancelled = true;
      releaseBoundedPreview(cacheKey);
    };
  }, [src, maxEdge]);

  return previewSrc;
}

function usePreviewSurfaceEpoch(): number {
  const [epoch, setEpoch] = useState(0);

  useEffect(() => onPreviewSurfaceRefresh(() => setEpoch((value) => value + 1)), []);

  return epoch;
}

function acquireBoundedPreview(cacheKey: string, src: string, maxEdge: number): PreviewCacheEntry {
  const existing = previewCache.get(cacheKey);
  if (existing) {
    existing.refCount += 1;
    existing.lastUsed = Date.now();
    return existing;
  }

  const entry: PreviewCacheEntry = {
    promise: Promise.resolve(src),
    objectUrl: null,
    refCount: 1,
    lastUsed: Date.now(),
    settled: false,
  };

  entry.promise = createBoundedPreview(src, maxEdge).then(({ previewSrc, objectUrl }) => {
    entry.objectUrl = objectUrl;
    entry.settled = true;
    trimPreviewCache();
    return previewSrc;
  });

  previewCache.set(cacheKey, entry);
  trimPreviewCache();
  return entry;
}

function releaseBoundedPreview(cacheKey: string): void {
  const entry = previewCache.get(cacheKey);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  entry.lastUsed = Date.now();
  window.setTimeout(trimPreviewCache, PREVIEW_CACHE_SWEEP_DELAY_MS);
}

function trimPreviewCache(): void {
  if (previewCache.size <= MAX_CACHED_PREVIEWS) return;
  const evictable = [...previewCache.entries()]
    .filter(([, entry]) => entry.refCount === 0 && entry.settled)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);

  for (const [cacheKey, entry] of evictable) {
    if (previewCache.size <= MAX_CACHED_PREVIEWS) break;
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    previewCache.delete(cacheKey);
  }
}

async function createBoundedPreview(src: string, maxEdge: number): Promise<{ previewSrc: string; objectUrl: string | null }> {
  const image = await loadPreviewImage(src);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const longEdge = Math.max(width, height);
  if (!width || !height || longEdge <= maxEdge) {
    return { previewSrc: src, objectUrl: null };
  }

  const scale = maxEdge / longEdge;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    return { previewSrc: src, objectUrl: null };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    return { previewSrc: src, objectUrl: null };
  }
  const objectUrl = URL.createObjectURL(blob);
  await warmDecodedImage(objectUrl);
  return { previewSrc: objectUrl, objectUrl };
}

function loadPreviewImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Preview image failed to load'));
    image.src = src;
  })
    .then(async (image) => {
      await decodeImage(image);
      return image;
    })
    .catch<HTMLImageElement>(() => {
      const fallback = new Image();
      fallback.src = src;
      return fallback;
    });
}

async function warmDecodedImage(src: string): Promise<void> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  await decodeImage(image);
}

async function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode !== 'function') return;
  try {
    await image.decode();
  } catch {
    // The visible image element can still fall back to normal browser loading.
  }
}
