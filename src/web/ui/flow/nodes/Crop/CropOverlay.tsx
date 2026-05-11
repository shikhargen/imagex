type Props = {
  x: number;
  y: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
};

export function CropOverlay({ x, y, width, height, containerWidth, containerHeight }: Props) {
  if (width <= 0 || height <= 0) return null;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox={`0 0 ${containerWidth} ${containerHeight}`}
    >
      {/* Dark mask outside crop */}
      <defs>
        <mask id="crop-mask">
          <rect width={containerWidth} height={containerHeight} fill="white" />
          <rect x={x} y={y} width={width} height={height} fill="black" />
        </mask>
      </defs>
      <rect width={containerWidth} height={containerHeight} fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />

      {/* Crop border */}
      <rect x={x} y={y} width={width} height={height} fill="none" stroke="#facc15" strokeWidth="1.5" />

      {/* Rule of thirds grid */}
      <line x1={x + width / 3} y1={y} x2={x + width / 3} y2={y + height} stroke="#facc15" strokeWidth="0.5" opacity="0.4" strokeDasharray="4 4" />
      <line x1={x + 2 * width / 3} y1={y} x2={x + 2 * width / 3} y2={y + height} stroke="#facc15" strokeWidth="0.5" opacity="0.4" strokeDasharray="4 4" />
      <line x1={x} y1={y + height / 3} x2={x + width} y2={y + height / 3} stroke="#facc15" strokeWidth="0.5" opacity="0.4" strokeDasharray="4 4" />
      <line x1={x} y1={y + 2 * height / 3} x2={x + width} y2={y + 2 * height / 3} stroke="#facc15" strokeWidth="0.5" opacity="0.4" strokeDasharray="4 4" />

      {/* Corner brackets */}
      {([
        [x, y], [x + width, y], [x, y + height], [x + width, y + height]
      ] as [number, number][]).map(([cx, cy], i) => {
        const size = 8;
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={cx + size * dx} y2={cy} stroke="#facc15" strokeWidth="2" />
            <line x1={cx} y1={cy} x2={cx} y2={cy + size * dy} stroke="#facc15" strokeWidth="2" />
          </g>
        );
      })}
    </svg>
  );
}
