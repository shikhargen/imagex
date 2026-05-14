import { useEffect, useState } from 'react';

const DEFAULT_MAX_PREVIEW_EDGE = 2048;

export function PreviewImage({
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
  return <img src={previewSrc || src} alt={alt} className={className} loading="lazy" decoding="async" />;
}

function useBoundedPreviewSrc(src: string, maxEdge: number): string | null {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewSrc(null);

    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;

      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const longEdge = Math.max(width, height);
      if (!width || !height || longEdge <= maxEdge) {
        setPreviewSrc(src);
        return;
      }

      const scale = maxEdge / longEdge;
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) {
        setPreviewSrc(src);
        return;
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob((blob) => {
        if (cancelled) return;
        if (!blob) {
          setPreviewSrc(src);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
      }, 'image/png');
    };
    image.onerror = () => {
      if (!cancelled) setPreviewSrc(src);
    };
    image.src = src;

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, maxEdge]);

  return previewSrc;
}
