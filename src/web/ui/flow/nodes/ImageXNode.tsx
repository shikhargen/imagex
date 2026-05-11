import { type NodeProps } from '@xyflow/react';
import { MoreHorizontal } from 'lucide-react';
import { memo, type CSSProperties, type MouseEvent } from 'react';
import { nodeMeta } from '../meta.js';
import type { UiNode } from '../types.js';
import { NodeFields } from './parts/NodeFields.js';
import { BaseNode } from './BaseNode.js';
import { NodeContent } from './NodeContent.js';

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
  return <EditNode {...props} />;
}
function ColorBalanceNodeImpl(props: Props) {
  return <EditNode {...props} />;
}
function RotateFlipNodeImpl(props: Props) {
  return <EditNode {...props} />;
}
function CropNodeImpl(props: Props) {
  return <EditNode {...props} />;
}
function BlurNodeImpl(props: Props) {
  return <EditNode {...props} />;
}
function DownloadNodeImpl(props: Props) {
  return <EditNode {...props} />;
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

/* ─── Edit Node (all non-primitive types) ─────────────────────────────────── */

function EditNode({ data, selected }: Props) {
  const node = data.workflowNode;
  return (
    <BaseNode data={data} selected={selected} showIcon centeredHandles>
      <NodeContent
        node={node}
        onChange={data.onChange}
        onShowPrompt={data.onShowPrompt}
        connectedHandles={data.connectedTargetHandles}
      />
    </BaseNode>
  );
}
