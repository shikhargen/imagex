import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Eye, MoreHorizontal, Plus, X } from 'lucide-react';
import { memo, useState, type CSSProperties, type MouseEvent } from 'react';
import type { CustomFieldDefinition } from '../../../../shared/types.js';
import { FieldControl } from '../fields/FieldControl.js';
import { customFieldValue, editableFieldDefinitionsFor, builtInFieldDefinitions } from '../fields/definitions.js';
import { nodeMeta } from '../meta.js';
import { inputPortsFor, outputPortsFor } from '../ports.js';
import type { UiNode } from '../types.js';
import { NodeFields } from './parts/NodeFields.js';

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
  return <ImageEditingNode {...props} />;
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
  const outputs = outputPortsFor(node);
  const connectedHandles = data.connectedTargetHandles;

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(title);

  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  const commitRename = () => {
    if (renameValue.trim() && renameValue !== title) {
      data.onChange(node.id, 'title', renameValue.trim());
    }
    setRenaming(false);
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
    <article
      className={`ix-node ix-node-${node.type} ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': meta.accent } as CSSProperties}
      onContextMenu={onMenu}
    >
      {/* Header */}
      <header className="ix-node-header">
        <div className="ix-node-header-main">
          <div className="ix-node-header-text">
            {renaming ? (
              <input
                className="ix-node-rename-input nodrag"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setRenameValue(title); setRenaming(false); }
                }}
                autoFocus
              />
            ) : (
              <strong onDoubleClick={() => { setRenameValue(title); setRenaming(true); }}>{title}</strong>
            )}
          </div>
        </div>
        <button className="ix-node-menu-btn nodrag" type="button" aria-label="Node actions" onClick={onMenu}>
          <MoreHorizontal size={14} />
        </button>
      </header>

      {/* Output handle */}
      {outputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className={`ix-handle ix-handle-out ix-port-${port.kind}`}
          type="source"
          position={Position.Right}
          isConnectableEnd={false}
          style={{ top: '50%' }}
        />
      ))}

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
    </article>
  );
}

/* ─── LLM Output Node ────────────────────────────────────────────────────── */

function LLMOutputNode({ data, selected }: Props) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const fields = editableFieldDefinitionsFor(node);
  const inputs = inputPortsFor(node);
  const outputs = outputPortsFor(node);
  const previewUrl = typeof node.data.previewUrl === 'string' ? node.data.previewUrl : undefined;

  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  return (
    <article
      className={`ix-node ix-node-${node.type} ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': meta.accent } as CSSProperties}
      onContextMenu={onMenu}
    >
      <header className="ix-node-header">
        <div className="ix-node-header-main">
          <span className="ix-node-icon">
            <meta.icon size={15} strokeWidth={2} />
          </span>
          <div className="ix-node-header-text">
            <strong>{title}</strong>
          </div>
        </div>
        <button className="ix-node-menu-btn nodrag" type="button" onClick={onMenu}>
          <MoreHorizontal size={14} />
        </button>
      </header>

      {/* Input ports */}
      <div className="ix-node-ports">
        <div className="ix-port-column">
          {inputs.map((port) => (
            <div key={port.id} className="ix-port-row input">
              <Handle
                id={port.id}
                className={`ix-handle ix-handle-in ix-port-${port.kind}`}
                type="target"
                position={Position.Left}
                isConnectableStart={false}
              />
              <span>{port.label}</span>
            </div>
          ))}
        </div>
        <div className="ix-port-column output">
          {outputs.map((port) => (
            <div key={port.id} className="ix-port-row output">
              <span>{port.label}</span>
              <Handle
                id={port.id}
                className={`ix-handle ix-handle-out ix-port-${port.kind}`}
                type="source"
                position={Position.Right}
                isConnectableEnd={false}
              />
            </div>
          ))}
        </div>
      </div>

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
    </article>
  );
}

/* ─── Image Editing Node ─────────────────────────────────────────────────── */

function ImageEditingNode({ data, selected }: Props) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const title = (node.data.title as string) || meta.label;
  const fields = editableFieldDefinitionsFor(node);
  const inputs = inputPortsFor(node);
  const outputs = outputPortsFor(node);

  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  return (
    <article
      className={`ix-node ix-node-${node.type} ${selected ? 'selected' : ''}`}
      style={{ '--node-accent': meta.accent } as CSSProperties}
      onContextMenu={onMenu}
    >
      <header className="ix-node-header">
        <div className="ix-node-header-main">
          <span className="ix-node-icon">
            <meta.icon size={15} strokeWidth={2} />
          </span>
          <div className="ix-node-header-text">
            <strong>{title}</strong>
          </div>
        </div>
        <button className="ix-node-menu-btn nodrag" type="button" onClick={onMenu}>
          <MoreHorizontal size={14} />
        </button>
      </header>

      {/* Input/output handles */}
      {inputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className={`ix-handle ix-handle-in ix-port-${port.kind}`}
          type="target"
          position={Position.Left}
          isConnectableStart={false}
          style={{ top: '50%' }}
        />
      ))}
      {outputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className={`ix-handle ix-handle-out ix-port-${port.kind}`}
          type="source"
          position={Position.Right}
          isConnectableEnd={false}
          style={{ top: '50%' }}
        />
      ))}

      {/* Preview area */}
      <div className="ix-output-preview">
        <div className="empty-preview">Preview</div>
      </div>

      {/* Controls */}
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
    </article>
  );
}
