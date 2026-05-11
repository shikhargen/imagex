/**
 * NodeContent — Shared body content for each node type.
 *
 * This is the single source of truth for what a node renders (preview, controls, overlays).
 * Used by both the node component (inside BaseNode) and the InspectorPanel.
 * No ReactFlow-specific dependencies — operates purely on ImageXNode + callbacks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import type { ImageXNode } from '../../../../shared/types.js';
import { FieldControl } from '../fields/FieldControl.js';
import { customFieldValue, editableFieldDefinitionsFor } from '../fields/definitions.js';
import { useCanvasRenderer } from '../imaging/useCanvasRenderer.js';
import { graphEngine } from '../../../state/graphEngine.js';
import { loadImage, renderToCanvas } from '../imaging/pipeline.js';
import { isWasmReady, applyWasmStep } from '../imaging/wasmEngine.js';
import { nodeMeta } from '../meta.js';
import { RotateFlipView } from '../views/RotateFlipView.js';
import { NodeFields } from './parts/NodeFields.js';
import { CropArea } from './Crop/CropArea.js';

export type NodeContentProps = {
  node: ImageXNode;
  onChange: (nodeId: string, key: string, value: unknown) => void;
  onShowPrompt?: ((nodeId: string) => void) | undefined;
  connectedHandles?: string[] | undefined;
};

/**
 * Renders the appropriate body content for a given node type.
 * Contains all the preview canvases, controls, crop overlays, etc.
 */
export function NodeContent({ node, onChange, onShowPrompt, connectedHandles = [] }: NodeContentProps) {
  switch (node.type) {
    case 'codex-output':
      return <OutputContent node={node} onChange={onChange} onShowPrompt={onShowPrompt} connectedHandles={connectedHandles} />;
    case 'rotate-flip':
      return <RotateFlipContent node={node} onChange={onChange} />;
    case 'crop':
      return <CropContent node={node} onChange={onChange} />;
    case 'color-balance':
    case 'blur':
      return <EditingContent node={node} onChange={onChange} connectedHandles={connectedHandles} />;
    case 'download':
      return <DownloadContent node={node} onChange={onChange} connectedHandles={connectedHandles} />;
    default:
      return null;
  }
}

/* ─── Output Node Content ─────────────────────────────────────────────────── */

function OutputContent({ node, onChange, onShowPrompt }: NodeContentProps) {
  const fields = editableFieldDefinitionsFor(node);
  const previewUrl = typeof node.data.previewUrl === 'string' ? node.data.previewUrl : undefined;

  return (
    <>
      <div className="ix-output-preview">
        {previewUrl ? <img src={previewUrl} alt="Output preview" /> : <div className="empty-preview">Preview</div>}
        {onShowPrompt && (
          <button
            className="preview-prompt-button nodrag nopan nowheel"
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onShowPrompt(node.id);
            }}
            onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}
          >
            <Eye size={14} />
            Prompt
          </button>
        )}
      </div>
      <div className="ix-node-fields">
        {fields.map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            value={customFieldValue(node, field)}
            onChange={(value) => onChange(node.id, field.id, value)}
          />
        ))}
      </div>
    </>
  );
}

/* ─── Rotate & Flip Content ───────────────────────────────────────────────── */

function RotateFlipContent({ node, onChange }: { node: ImageXNode; onChange: (nodeId: string, key: string, value: unknown) => void }) {
  const flipH = Boolean(node.data.flipH);
  const flipV = Boolean(node.data.flipV);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, node.type, node.data as Record<string, unknown>);

  const view = useMemo(
    () => new RotateFlipView(node.id, (key, value) => onChange(node.id, key, value)),
    [node.id, onChange],
  );

  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  return (
    <>
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
      <div className="ix-edit-preview">
        <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
        {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
      </div>
    </>
  );
}

/* ─── Crop Content ────────────────────────────────────────────────────────── */

function CropContent({ node, onChange }: { node: ImageXNode; onChange: (nodeId: string, key: string, value: unknown) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, '__source_only', node.data as Record<string, unknown>);

  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const { sourceUrl } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) return;
    loadImage(sourceUrl).then((img) => setImgDims({ w: img.naturalWidth, h: img.naturalHeight }));
  }, [node.id]);

  const [graphVer, setGraphVer] = useState(0);
  useEffect(() => {
    return graphEngine.subscribe(() => setGraphVer((v) => v + 1));
  }, []);
  useEffect(() => {
    const { sourceUrl } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) { setImgDims({ w: 0, h: 0 }); return; }
    loadImage(sourceUrl).then((img) => setImgDims({ w: img.naturalWidth, h: img.naturalHeight }));
  }, [graphVer, node.id]);

  const hasCrop = Number(node.data.cropWidth) > 0 && Number(node.data.cropHeight) > 0;
  const cropW = hasCrop ? Number(node.data.cropWidth) : Math.round(imgDims.w * 0.8);
  const cropH = hasCrop ? Number(node.data.cropHeight) : Math.round(imgDims.h * 0.8);
  const cropX = hasCrop ? (Number(node.data.x) || 0) : Math.round(imgDims.w * 0.1);
  const cropY = hasCrop ? (Number(node.data.y) || 0) : Math.round(imgDims.h * 0.1);

  useEffect(() => {
    if (!hasCrop && imgDims.w > 0 && imgDims.h > 0) {
      onChange(node.id, 'x', Math.round(imgDims.w * 0.1));
      onChange(node.id, 'y', Math.round(imgDims.h * 0.1));
      onChange(node.id, 'cropWidth', Math.round(imgDims.w * 0.8));
      onChange(node.id, 'cropHeight', Math.round(imgDims.h * 0.8));
    }
  }, [hasCrop, imgDims.w, imgDims.h]);

  const handleCropChange = useCallback((nx: number, ny: number, nw: number, nh: number, ongoing: boolean) => {
    onChange(node.id, 'x', Math.round(nx));
    onChange(node.id, 'y', Math.round(ny));
    onChange(node.id, 'cropWidth', Math.round(nw));
    onChange(node.id, 'cropHeight', Math.round(nh));
    if (!ongoing) {
      graphEngine.updateNode(
        { ...node, data: { ...node.data, x: Math.round(nx), y: Math.round(ny), cropWidth: Math.round(nw), cropHeight: Math.round(nh) } },
        false,
      );
    }
  }, [node, onChange]);

  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  return (
    <>
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
      {hasImage && (
        <div className="ix-node-fields">
          <div className="ix-primitive-field">
            <Field className="ix-field">
              <span className="ix-control-shell">
                <FieldLabel className="ix-control-label ix-control-label--inline">Aspect Ratio</FieldLabel>
                <Select
                  value={(node.data.aspectRatio as string) || 'custom'}
                  onValueChange={(ratio) => {
                    onChange(node.id, 'aspectRatio', ratio);
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
                  <SelectTrigger className="nodrag ix-select-trigger" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="nodrag" position="popper" sideOffset={4}>
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
              </span>
            </Field>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Generic Editing Content (color-balance, blur) ───────────────────────── */

function EditingContent({ node, onChange, connectedHandles = [] }: { node: ImageXNode; onChange: (nodeId: string, key: string, value: unknown) => void; connectedHandles?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, node.type, node.data as Record<string, unknown>);

  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  const handleFieldChange = useCallback((nodeId: string, fieldId: string, value: unknown) => {
    onChange(nodeId, fieldId, value);
    graphEngine.updateNode(
      { ...node, data: { ...node.data, [fieldId]: value } },
      true,
    );
  }, [node, onChange]);

  const handleFieldCommit = useCallback((nodeId: string, fieldId: string, value: unknown) => {
    onChange(nodeId, fieldId, value);
    graphEngine.updateNode(
      { ...node, data: { ...node.data, [fieldId]: value } },
      false,
    );
  }, [node, onChange]);

  return (
    <>
      <div className="ix-edit-preview">
        <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
        {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
      </div>
      <NodeFields
        node={node}
        connectedHandles={connectedHandles}
        addableFields={[]}
        onFieldChange={handleFieldChange}
        onFieldCommit={handleFieldCommit}
        onFieldsChange={(nodeId, fields) => onChange(nodeId, 'fields', fields)}
      />
    </>
  );
}

/* ─── Download Content ────────────────────────────────────────────────────── */

function DownloadContent({ node, onChange, connectedHandles = [] }: { node: ImageXNode; onChange: (nodeId: string, key: string, value: unknown) => void; connectedHandles?: string[] }) {
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const hasInput = connectedHandles.includes('image-in');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hasImage } = useCanvasRenderer(canvasRef, node.id, 'download', node.data as Record<string, unknown>);

  useEffect(() => {
    graphEngine.updateNode(node, false);
  }, [node.data]);

  const handleDownload = async () => {
    const { sourceUrl, chain } = graphEngine.traceUpstream(node.id);
    if (!sourceUrl) return;
    try {
      const img = await loadImage(sourceUrl);
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = img.naturalWidth;
      exportCanvas.height = img.naturalHeight;
      const ctx = exportCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
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
    <>
      {hasInput && (
        <div className="ix-edit-preview">
          <canvas ref={canvasRef} className="ix-canvas-preview" style={{ display: hasImage ? undefined : 'none' }} />
          {!hasImage && <div className="ix-edit-preview-empty">No image connected</div>}
        </div>
      )}
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
    </>
  );
}
