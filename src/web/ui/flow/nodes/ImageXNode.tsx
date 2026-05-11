import { type NodeProps } from '@xyflow/react';
import { Eye, FlipHorizontal, FlipVertical, MoreHorizontal, RotateCcw, RotateCw } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { FieldControl } from '../fields/FieldControl.js';
import { customFieldValue, editableFieldDefinitionsFor } from '../fields/definitions.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCanvasRenderer } from '../imaging/useCanvasRenderer.js';
import { graphEngine } from '../../../state/graphEngine.js';
import { loadImage, renderToCanvas } from '../imaging/pipeline.js';
import { isWasmReady, applyWasmStep } from '../imaging/wasmEngine.js';
import { nodeMeta } from '../meta.js';
import type { UiNode } from '../types.js';
import { NodeFields } from './parts/NodeFields.js';
import { BaseNode } from './BaseNode.js';
import { RotateFlipView } from '../views/RotateFlipView.js';
import { CropArea } from './Crop/CropArea.js';

type Props = NodeProps<UiNode>;

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  NODE TYPES                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function PromptNodeImpl(props: Props) {
  return <PrimitiveNode {...props} addableFields={['textarea', 'text']} />;
}
function ImageNodeImpl(props: Props) {
  return <PrimitiveNode {...props} addableFields={['textarea', 'image']} hasAssetPicker />;
}
function ColorNodeImpl(props: Props) {
  return <PrimitiveNode {...props} addableFields={[]} />;
}
function FileNodeImpl(props: Props) {
  return <PrimitiveNode {...props} addableFields={['text']} />;
}
function CodexOutputNodeImpl(props: Props) {
  return <LLMOutputNode {...props} />;
}
function ColorBalanceNodeImpl(props: Props) {
  return <ImageEditingNode {...props} />;
}
function RotateFlipNodeImpl(props: Props) {
  return <RotateFlipNodeInner {...props} />;
}
function CropNodeImpl(props: Props) {
  return <CropNodeInner {...props} />;
}
function BlurNodeImpl(props: Props) {
  return <ImageEditingNode {...props} />;
}
function DownloadNodeImpl(props: Props) {
  return <DownloadNodeInner {...props} />;
}
function FrameNodeImpl(props: Props) {
  return <PrimitiveNode {...props} addableFields={[]} frame />;
}

export const PromptNode = memo(PromptNodeImpl);
export const ImageNode = memo(ImageNodeImpl);
export const ColorNode = memo(ColorNodeImpl);
export const FileNode = memo(FileNodeImpl);
export const CodexOutputNode = memo(CodexOutputNodeImpl);
export const ColorBalanceNode = memo(ColorBalanceNodeImpl);
export const RotateFlipNode = memo(RotateFlipNodeImpl);
export const CropNode = memo(CropNodeImpl);
export const BlurNode = memo(BlurNodeImpl);
export const DownloadNode = memo(DownloadNodeImpl);
export const FrameNode = memo(FrameNodeImpl);

/* ─── Primitive Node ─────────────────────────────────────────────────────── */

function PrimitiveNode({
  data,
  selected,
  addableFields,
  frame,
  hasAssetPicker,
}: Props & { addableFields: string[]; frame?: boolean; hasAssetPicker?: boolean }) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const connectedHandles = data.connectedTargetHandles;

  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  if (frame) {
    return (
      <article
        className={`ix-node ix-node-frame ${selected ? 'selected' : ''} ${data.isDropTargetFrame ? 'drop-target' : ''}`}
        style={{ '--node-accent': meta.accent, width: '100%', height: '100%' } as CSSProperties}
        onContextMenu={onMenu}
      >
        <header className="ix-node-header">
          <div className="ix-node-header-main">
            <div className="ix-node-header-text">
              <strong>{title}</strong>
            </div>
          </div>
          <button className="ix-node-menu-btn nodrag" type="button" onClick={onMenu}>
            <MoreHorizontal size={14} />
          </button>
        </header>
      </article>
    );
  }

  return (
    <BaseNode data={data} selected={selected} renamable>
      {/* Shared fields component */}
      <NodeFields
        node={node}
        connectedHandles={connectedHandles}
        addableFields={addableFields}
        hasAssetPicker={hasAssetPicker}
        onFieldChange={(nodeId, fieldId, value) => data.onChange(nodeId, fieldId, value)}
        onDynamicFieldChange={(nodeId, fieldId, value) => data.onUpdateCustomField?.(nodeId, fieldId, value)}
        onFieldsChange={(nodeId, fields) => data.onChange(nodeId, 'fields', fields)}
        onAddField={(nodeId, kind) => data.onAddCustomField?.(nodeId, kind)}
        onOpenAssets={(nodeId, fieldId) => data.onOpenAssetPicker?.(nodeId, fieldId)}
        renderHandles
      />
    </BaseNode>
  );
}

/* ─── LLM Output Node ────────────────────────────────────────────────────── */

function LLMOutputNode({ data, selected }: Props) {
  const node = data.workflowNode;
  const fields = editableFieldDefinitionsFor(node);
  const previewUrl = typeof node.data.previewUrl === 'string' ? node.data.previewUrl : undefined;

  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      {/* Preview */}
      <div className="ix-output-preview">
        {previewUrl ? <img src={previewUrl} alt="Output preview" /> : <div className="empty-preview">Preview</div>}
        <button
          className="preview-prompt-button nodrag nopan nowheel"
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            data.onShowPrompt?.(node.id);
          }}
          onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}
        >
          <Eye size={14} />
          Prompt
        </button>
      </div>

      {/* Config fields */}
      <div className="ix-node-fields">
        {fields.map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            value={customFieldValue(node, field)}
            onChange={(value) => data.onChange(node.id, field.id, value)}
          />
        ))}
      </div>
    </BaseNode>
  );
}

/* ─── Rotate & Flip Node ─────────────────────────────────────────────────── */

function RotateFlipNodeInner({ data, selected }: Props) {
  const node = data.workflowNode;

  const rotate = Number(node.data.rotate) || 0;
  const flipH = Boolean(node.data.flipH);
  const flipV = Boolean(node.data.flipV);

  // Direct canvas rendering — no blob URLs, no GraphEngine for preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, node.type, node.data as Record<string, unknown>);

  // View controller
  const view = useMemo(
    () => new RotateFlipView(node.id, (key, value) => data.onChange(node.id, key, value)),
    [node.id, data.onChange],
  );

  // Still update GraphEngine so downstream nodes and generation path stay in sync
  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      {/* Controls row */}
      <div className="ix-edit-controls nodrag">
        <button type="button" title="Rotate left" onClick={() => view.rotateLeft(node)}>
          <RotateCcw size={16} />
        </button>
        <button type="button" title="Rotate right" onClick={() => view.rotateRight(node)}>
          <RotateCw size={16} />
        </button>
        <button type="button" title="Flip horizontal" className={flipH ? 'active' : ''} onClick={() => view.toggleFlipH(node)}>
          <FlipHorizontal size={16} />
        </button>
        <button type="button" title="Flip vertical" className={flipV ? 'active' : ''} onClick={() => view.toggleFlipV(node)}>
          <FlipVertical size={16} />
        </button>
        <span className="ix-edit-controls-spacer" />
        <button type="button" title="Reset" className="ix-edit-reset" onClick={() => view.reset(node)}>
          Reset
        </button>
      </div>

      {/* Preview — direct canvas rendering */}
      <div className="ix-edit-preview">
        <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
        {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
      </div>
    </BaseNode>
  );
}

/* ─── Crop Node ──────────────────────────────────────────────────────────── */

function CropNodeInner({ data, selected }: Props) {
  const node = data.workflowNode;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Show the FULL source image (upstream chain only, without applying this node's crop)
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, '__source_only', node.data as Record<string, unknown>);

  // Get source image dimensions for crop bounds
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const { sourceUrl } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) return;
    loadImage(sourceUrl).then((img) => setImgDims({ w: img.naturalWidth, h: img.naturalHeight }));
  }, [node.id]);

  // Re-check dimensions when graph changes
  const [graphVer, setGraphVer] = useState(0);
  useEffect(() => {
    return graphEngine.subscribe(() => setGraphVer((v) => v + 1));
  }, []);
  useEffect(() => {
    const { sourceUrl } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) { setImgDims({ w: 0, h: 0 }); return; }
    loadImage(sourceUrl).then((img) => setImgDims({ w: img.naturalWidth, h: img.naturalHeight }));
  }, [graphVer, node.id]);

  // Default to 80% of image centered if no crop set
  const hasCrop = Number(node.data.cropWidth) > 0 && Number(node.data.cropHeight) > 0;
  const cropW = hasCrop ? Number(node.data.cropWidth) : Math.round(imgDims.w * 0.8);
  const cropH = hasCrop ? Number(node.data.cropHeight) : Math.round(imgDims.h * 0.8);
  const cropX = hasCrop ? (Number(node.data.x) || 0) : Math.round(imgDims.w * 0.1);
  const cropY = hasCrop ? (Number(node.data.y) || 0) : Math.round(imgDims.h * 0.1);

  // Persist default crop values when image first connects
  useEffect(() => {
    if (!hasCrop && imgDims.w > 0 && imgDims.h > 0) {
      const dx = Math.round(imgDims.w * 0.1);
      const dy = Math.round(imgDims.h * 0.1);
      const dw = Math.round(imgDims.w * 0.8);
      const dh = Math.round(imgDims.h * 0.8);
      data.onChange(node.id, 'x', dx);
      data.onChange(node.id, 'y', dy);
      data.onChange(node.id, 'cropWidth', dw);
      data.onChange(node.id, 'cropHeight', dh);
    }
  }, [hasCrop, imgDims.w, imgDims.h]);

  const handleCropChange = useCallback((nx: number, ny: number, nw: number, nh: number, ongoing: boolean) => {
    data.onChange(node.id, 'x', Math.round(nx));
    data.onChange(node.id, 'y', Math.round(ny));
    data.onChange(node.id, 'cropWidth', Math.round(nw));
    data.onChange(node.id, 'cropHeight', Math.round(nh));
    if (!ongoing) {
      graphEngine.updateNode(
        { ...node, data: { ...node.data, x: Math.round(nx), y: Math.round(ny), cropWidth: Math.round(nw), cropHeight: Math.round(nh) } },
        false,
      );
    }
  }, [node, data.onChange]);

  // Keep GraphEngine in sync
  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      <div className="ix-crop-container">
        <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
        {hasImage && imgDims.w > 0 && (
          <CropArea
            x={cropX} y={cropY}
            cropWidth={cropW} cropHeight={cropH}
            imageWidth={imgDims.w} imageHeight={imgDims.h}
            aspectRatio={(node.data.aspectRatio as string) || 'custom'}
            onCropChange={handleCropChange}
          />
        )}
        {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
      </div>
      {/* Aspect ratio selector */}
      {hasImage && (
        <div className="ix-crop-controls nodrag">
          <Select
            value={(node.data.aspectRatio as string) || 'custom'}
            onValueChange={(ratio) => {
              data.onChange(node.id, 'aspectRatio', ratio);
              if (ratio !== 'custom' && imgDims.w > 0 && imgDims.h > 0) {
                const [rw, rh] = ratio.split(':').map(Number);
                if (rw && rh) {
                  const targetRatio = rw / rh;
                  const imgRatio = imgDims.w / imgDims.h;
                  let nw: number, nh: number;
                  if (targetRatio > imgRatio) {
                    nw = imgDims.w * 0.8;
                    nh = nw / targetRatio;
                  } else {
                    nh = imgDims.h * 0.8;
                    nw = nh * targetRatio;
                  }
                  const nx = (imgDims.w - nw) / 2;
                  const ny = (imgDims.h - nh) / 2;
                  handleCropChange(nx, ny, nw, nh, false);
                }
              }
            }}
          >
            <SelectTrigger className="ix-select-trigger" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4} className="nodrag">
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="3:4">3:4</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="9:16">9:16</SelectItem>
              <SelectItem value="3:2">3:2</SelectItem>
              <SelectItem value="2:3">2:3</SelectItem>
              <SelectItem value="21:9">21:9</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </BaseNode>
  );
}

/* ─── Generic Image Editing Node (fallback) ──────────────────────────────── */

function ImageEditingNode({ data, selected }: Props) {
  const node = data.workflowNode;
  const fields = editableFieldDefinitionsFor(node);

  // Direct canvas rendering — no blob URLs, no GraphEngine for preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, node.type, node.data as Record<string, unknown>);

  // Still update GraphEngine so downstream nodes and generation path stay in sync
  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      {/* Preview — direct canvas rendering */}
      <div className="ix-edit-preview">
        <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
        {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
      </div>

      {/* Controls */}
      <div className="ix-node-fields">
        {fields.map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            value={customFieldValue(node, field)}
            onChange={(value) => {
              data.onChange(node.id, field.id, value);
              // During drag (onChange), use ongoing=true to suppress downstream
              graphEngine.updateNode(
                { ...node, data: { ...node.data, [field.id]: value } },
                true,
              );
            }}
            onCommit={(value) => {
              data.onChange(node.id, field.id, value);
              // On release (commit), use ongoing=false to trigger full cascade
              graphEngine.updateNode(
                { ...node, data: { ...node.data, [field.id]: value } },
                false,
              );
            }}
          />
        ))}
      </div>
    </BaseNode>
  );
}

/* ─── Download Node ──────────────────────────────────────────────────────── */

function DownloadNodeInner({ data, selected }: Props) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const connectedHandles = data.connectedTargetHandles;
  const hasInput = connectedHandles.includes('image-in');

  // Direct canvas rendering — no blob URLs, no GraphEngine for preview
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, 'download', node.data as Record<string, unknown>);

  // Still update GraphEngine so generation path stays in sync
  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  const handleDownload = async () => {
    // Trace upstream to get source and chain, then process at full resolution via WASM
    const { sourceUrl, chain } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) return;
    try {
      const img = await loadImage(sourceUrl);
      // Use a temporary full-res canvas (no downscaling for export)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = img.naturalWidth;
      exportCanvas.height = img.naturalHeight;
      const ctx = exportCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      // Process with WASM if ready, otherwise fallback
      if (isWasmReady()) {
        const { open_image, putImageData } = await import('@silvia-odwyer/photon');
        let photonImg = open_image(exportCanvas, ctx);
        for (const step of chain) {
          photonImg = applyWasmStep(photonImg, step);
        }
        const w = photonImg.get_width();
        const h = photonImg.get_height();
        exportCanvas.width = w;
        exportCanvas.height = h;
        const exportCtx = exportCanvas.getContext('2d')!;
        putImageData(exportCanvas, exportCtx, photonImg);
      } else {
        renderToCanvas(exportCanvas, img, chain);
      }
      // Download
      exportCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title || 'image'}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      {/* Preview — direct canvas rendering */}
      {hasInput && (
        <div className="ix-edit-preview">
          <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
          {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
        </div>
      )}

      {/* Download button */}
      <div className="ix-download-action nodrag">
        <button
          type="button"
          className="ix-download-btn"
          disabled={!hasInput || !hasImage}
          onClick={handleDownload}
        >
          <meta.icon size={14} />
          Download
        </button>
      </div>
    </BaseNode>
  );
}
