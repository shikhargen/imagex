import { useCallback, useRef } from 'react';

export type DragEvent = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  ongoing: boolean;
};

export function useDrag(onDrag: (event: DragEvent) => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    startRef.current = start;

    const handleMove = (me: MouseEvent) => {
      if (!startRef.current) return;
      onDrag({
        startX: startRef.current.x,
        startY: startRef.current.y,
        currentX: me.clientX,
        currentY: me.clientY,
        deltaX: me.clientX - startRef.current.x,
        deltaY: me.clientY - startRef.current.y,
        ongoing: true,
      });
    };

    const handleUp = (me: MouseEvent) => {
      if (!startRef.current) return;
      onDrag({
        startX: startRef.current.x,
        startY: startRef.current.y,
        currentX: me.clientX,
        currentY: me.clientY,
        deltaX: me.clientX - startRef.current.x,
        deltaY: me.clientY - startRef.current.y,
        ongoing: false,
      });
      startRef.current = null;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [onDrag]);

  return { handleMouseDown };
}
