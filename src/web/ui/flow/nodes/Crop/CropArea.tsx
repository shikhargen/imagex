import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CropOverlay } from './CropOverlay.js';

type Props = {
  x: number;
  y: number;
  cropWidth: number;
  cropHeight: number;
  imageWidth: number;
  imageHeight: number;
  /** If set (e.g. "16:9"), edges/corners only scale uniformly, preserving ratio */
  aspectRatio?: string;
  onCropChange: (x: number, y: number, w: number, h: number, ongoing: boolean) => void;
};

export function CropArea({ x, y, cropWidth, cropHeight, imageWidth, imageHeight, aspectRatio, onCropChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const scale = imageWidth > 0 && containerSize.w > 0 ? containerSize.w / imageWidth : 1;

  // Use getBoundingClientRect for SCREEN-space scale (accounts for ReactFlow zoom)
  const getScreenScale = () => {
    const el = containerRef.current;
    if (!el || imageWidth === 0) return 1;
    return el.getBoundingClientRect().width / imageWidth;
  };
  const screenScaleRef = useRef(getScreenScale());

  // Update on every render
  screenScaleRef.current = getScreenScale();

  // Keep current crop values in refs so drag handlers always have latest
  const cropRef = useRef({ x, y, w: cropWidth, h: cropHeight });
  cropRef.current = { x, y, w: cropWidth, h: cropHeight };

  // Parse locked aspect ratio (null if custom/free)
  const lockedRatio = useMemo(() => {
    if (!aspectRatio || aspectRatio === 'custom') return null;
    const [rw, rh] = aspectRatio.split(':').map(Number);
    return rw && rh ? rw / rh : null;
  }, [aspectRatio]);

  const startDrag = useCallback((e: React.MouseEvent, mode: string) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    // Capture crop at drag start
    const orig = { ...cropRef.current };

    // Set cursor on body to prevent flicker when pointer moves off handles
    const cursor = mode === 'box' ? 'move'
      : (mode === 'n' || mode === 's') ? 'ns-resize'
      : (mode === 'e' || mode === 'w') ? 'ew-resize'
      : (mode === 'nw' || mode === 'se') ? 'nwse-resize'
      : 'nesw-resize';
    // Lock cursor globally via a style element (prevents flicker from child element cursors)
    const styleEl = document.createElement('style');
    styleEl.textContent = `* { cursor: ${cursor} !important; }`;
    document.head.appendChild(styleEl);

    const calc = (me: MouseEvent) => {
      const s = screenScaleRef.current;
      const dx = (me.clientX - startX) / s;
      const dy = (me.clientY - startY) / s;
      let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;

      if (mode === 'box') {
        nx = Math.max(0, Math.min(imageWidth - nw, orig.x + dx));
        ny = Math.max(0, Math.min(imageHeight - nh, orig.y + dy));
      } else if (lockedRatio) {
        // Aspect ratio locked: resize maintaining ratio
        // Use the appropriate delta based on which handle is dragged
        if (mode === 'se') {
          nw = Math.max(10, orig.w + dx);
          nh = nw / lockedRatio;
        } else if (mode === 'sw') {
          nw = Math.max(10, orig.w - dx);
          nh = nw / lockedRatio;
          nx = orig.x + orig.w - nw;
        } else if (mode === 'ne') {
          nw = Math.max(10, orig.w + dx);
          nh = nw / lockedRatio;
          ny = orig.y + orig.h - nh;
        } else if (mode === 'nw') {
          nw = Math.max(10, orig.w - dx);
          nh = nw / lockedRatio;
          nx = orig.x + orig.w - nw;
          ny = orig.y + orig.h - nh;
        } else if (mode === 'e') {
          nw = Math.max(10, orig.w + dx);
          nh = nw / lockedRatio;
          ny = orig.y + (orig.h - nh) / 2; // center vertically
        } else if (mode === 'w') {
          nw = Math.max(10, orig.w - dx);
          nh = nw / lockedRatio;
          nx = orig.x + orig.w - nw;
          ny = orig.y + (orig.h - nh) / 2;
        } else if (mode === 's') {
          nh = Math.max(10, orig.h + dy);
          nw = nh * lockedRatio;
          nx = orig.x + (orig.w - nw) / 2; // center horizontally
        } else if (mode === 'n') {
          nh = Math.max(10, orig.h - dy);
          nw = nh * lockedRatio;
          nx = orig.x + (orig.w - nw) / 2;
          ny = orig.y + orig.h - nh;
        }
        // Clamp to image bounds
        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        if (nx + nw > imageWidth) { nw = imageWidth - nx; nh = nw / lockedRatio; }
        if (ny + nh > imageHeight) { nh = imageHeight - ny; nw = nh * lockedRatio; }
        nw = Math.max(10, nw);
        nh = Math.max(10, nh);
      } else if (mode === 'n') {
        ny = Math.max(0, Math.min(orig.y + orig.h - 10, orig.y + dy));
        nh = orig.h - (ny - orig.y);
      } else if (mode === 's') {
        nh = Math.max(10, Math.min(imageHeight - orig.y, orig.h + dy));
      } else if (mode === 'w') {
        nx = Math.max(0, Math.min(orig.x + orig.w - 10, orig.x + dx));
        nw = orig.w - (nx - orig.x);
      } else if (mode === 'e') {
        nw = Math.max(10, Math.min(imageWidth - orig.x, orig.w + dx));
      } else if (mode === 'nw') {
        nx = Math.max(0, Math.min(orig.x + orig.w - 10, orig.x + dx));
        ny = Math.max(0, Math.min(orig.y + orig.h - 10, orig.y + dy));
        nw = orig.w - (nx - orig.x);
        nh = orig.h - (ny - orig.y);
      } else if (mode === 'ne') {
        ny = Math.max(0, Math.min(orig.y + orig.h - 10, orig.y + dy));
        nw = Math.max(10, Math.min(imageWidth - orig.x, orig.w + dx));
        nh = orig.h - (ny - orig.y);
      } else if (mode === 'sw') {
        nx = Math.max(0, Math.min(orig.x + orig.w - 10, orig.x + dx));
        nw = orig.w - (nx - orig.x);
        nh = Math.max(10, Math.min(imageHeight - orig.y, orig.h + dy));
      } else if (mode === 'se') {
        nw = Math.max(10, Math.min(imageWidth - orig.x, orig.w + dx));
        nh = Math.max(10, Math.min(imageHeight - orig.y, orig.h + dy));
      }

      return { nx, ny, nw, nh };
    };

    const handleMove = (me: MouseEvent) => {
      const { nx, ny, nw, nh } = calc(me);
      onCropChange(Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh), true);
    };

    const handleUp = (me: MouseEvent) => {
      const { nx, ny, nw, nh } = calc(me);
      onCropChange(Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh), false);
      document.head.removeChild(styleEl);
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [imageWidth, imageHeight, onCropChange]);

  // Render
  const sx = x * scale;
  const sy = y * scale;
  const sw = cropWidth * scale;
  const sh = cropHeight * scale;
  const HANDLE = 8;

  return (
    <div ref={containerRef} className="ix-crop-area nodrag" style={{ position: 'absolute', inset: 0 }}>
      <CropOverlay x={sx} y={sy} width={sw} height={sh} containerWidth={containerSize.w} containerHeight={containerSize.h} />

      {/* Box drag region (inside crop) */}
      <div
        style={{ position: 'absolute', left: sx, top: sy, width: sw, height: sh, cursor: 'move', zIndex: 5 }}
        onMouseDown={(e) => startDrag(e, 'box')}
      />

      {/* Edge handles */}
      <div style={{ position: 'absolute', left: sx + HANDLE, top: sy - HANDLE/2, width: sw - HANDLE*2, height: HANDLE, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(e) => startDrag(e, 'n')} />
      <div style={{ position: 'absolute', left: sx + HANDLE, top: sy + sh - HANDLE/2, width: sw - HANDLE*2, height: HANDLE, cursor: 'ns-resize', zIndex: 10 }} onMouseDown={(e) => startDrag(e, 's')} />
      <div style={{ position: 'absolute', left: sx - HANDLE/2, top: sy + HANDLE, width: HANDLE, height: sh - HANDLE*2, cursor: 'ew-resize', zIndex: 10 }} onMouseDown={(e) => startDrag(e, 'w')} />
      <div style={{ position: 'absolute', left: sx + sw - HANDLE/2, top: sy + HANDLE, width: HANDLE, height: sh - HANDLE*2, cursor: 'ew-resize', zIndex: 10 }} onMouseDown={(e) => startDrag(e, 'e')} />

      {/* Corner handles */}
      <div style={{ position: 'absolute', left: sx - HANDLE/2, top: sy - HANDLE/2, width: HANDLE, height: HANDLE, cursor: 'nwse-resize', zIndex: 15 }} onMouseDown={(e) => startDrag(e, 'nw')} />
      <div style={{ position: 'absolute', left: sx + sw - HANDLE/2, top: sy - HANDLE/2, width: HANDLE, height: HANDLE, cursor: 'nesw-resize', zIndex: 15 }} onMouseDown={(e) => startDrag(e, 'ne')} />
      <div style={{ position: 'absolute', left: sx - HANDLE/2, top: sy + sh - HANDLE/2, width: HANDLE, height: HANDLE, cursor: 'nesw-resize', zIndex: 15 }} onMouseDown={(e) => startDrag(e, 'sw')} />
      <div style={{ position: 'absolute', left: sx + sw - HANDLE/2, top: sy + sh - HANDLE/2, width: HANDLE, height: HANDLE, cursor: 'nwse-resize', zIndex: 15 }} onMouseDown={(e) => startDrag(e, 'se')} />
    </div>
  );
}
