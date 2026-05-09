import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Eye, MoreHorizontal, Plus } from 'lucide-react';
import type { CSSProperties, MouseEvent } from 'react';
import type { CustomFieldDefinition, NodeType } from '../../../../shared/types.js';
import { FieldControl } from '../fields/FieldControl.js';
import { customFieldValue, editableFieldDefinitionsFor } from '../fields/definitions.js';
import { nodeMeta } from '../meta.js';
import { fieldHandleId, inputPortsFor, outputPortsFor } from '../ports.js';
import type { UiNode } from '../types.js';

type Props = NodeProps<UiNode>;

export function TextNode(props: Props) {
  return <BaseNode {...props} />;
}

export function CharacterNode(props: Props) {
  return <BaseNode {...props} />;
}

export function StyleNode(props: Props) {
  return <BaseNode {...props} />;
}

export function SceneNode(props: Props) {
  return <BaseNode {...props} />;
}

export function ImageInputNode(props: Props) {
  return <BaseNode {...props} />;
}

export function OutputNode(props: Props) {
  return <BaseNode {...props} preview />;
}

export function CustomNode(props: Props) {
  return <BaseNode {...props} />;
}

export function FrameNode(props: Props) {
  return <BaseNode {...props} frame />;
}

function BaseNode({ data, selected, preview, frame }: Props & { preview?: boolean; frame?: boolean }) {
  const node = data.workflowNode;
  const meta = nodeMeta[node.type];
  const Icon = meta.icon;
  const fields = editableFieldDefinitionsFor(node);
  const inputs = inputPortsFor(node).filter((port) => !port.field);
  const fieldInputs = inputPortsFor(node).filter((port) => port.field);
  const outputs = outputPortsFor(node);
  const connectedInputHandles = data.connectedTargetHandles;
  const longestLabel = Math.max(0, ...fields.map((field) => field.label.length));
  const fieldLabelWidth = Math.min(Math.max(7.5, longestLabel * 0.72 + 2.75), 16);
  const controlWidth = 13.5;
  const previewUrl = typeof node.data.previewUrl === 'string' ? node.data.previewUrl : undefined;
  const onMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    data.onMenu(node.id, { x: event.clientX, y: event.clientY });
  };

  return (
    <article
      className={`ix-node ix-node-${node.type} ${selected ? 'selected' : ''} ${frame && data.isDropTargetFrame ? 'drop-target' : ''}`}
      style={
        {
          '--node-accent': meta.accent,
          '--field-label-width': `${fieldLabelWidth}rem`,
          '--field-control-width': `${controlWidth}rem`,
          ...(frame ? { width: '100%', height: '100%' } : {}),
        } as CSSProperties
      }
      onContextMenu={onMenu}
    >
      <header className="ix-node-header">
        <span className="ix-node-icon">
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <span>
          <strong>{meta.label}</strong>
          <small>{meta.description}</small>
        </span>
        <button className="icon-button nodrag" type="button" aria-label="Node actions" onClick={onMenu}>
          <MoreHorizontal size={16} />
        </button>
      </header>

      {!frame && (inputs.length > 0 || outputs.length > 0) && (
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
      )}

      {!frame && preview && (
        <div className="ix-output-preview">
          {previewUrl ? <img src={previewUrl} alt="Output preview" /> : <div className="empty-preview">Preview</div>}
          <button
            className="preview-prompt-button nodrag"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data.onShowPrompt?.();
            }}
          >
            <Eye size={14} />
            Prompt
          </button>
        </div>
      )}

      {!frame && <div className="ix-node-fields">
        {fields.map((field) => {
          const handleId = fieldHandleId(field.id);
          const connected = connectedInputHandles.includes(handleId);
          const port = fieldInputs.find((candidate) => candidate.id === handleId);
          return (
            <div
              key={field.id}
              className={`ix-field-socket-row ${connected ? 'connected' : ''}`}
              data-custom-field-id={node.type === 'custom' ? field.id : undefined}
              data-custom-node-id={node.type === 'custom' ? node.id : undefined}
              onMouseEnter={() => {
                if (node.type === 'custom') data.onActivateCustomField?.(node.id, field.id);
              }}
              onPointerDown={() => {
                if (node.type === 'custom') data.onActivateCustomField?.(node.id, field.id);
              }}
              onFocusCapture={() => {
                if (node.type === 'custom') data.onActivateCustomField?.(node.id, field.id);
              }}
            >
              {port && (
                <Handle
                  id={port.id}
                  className={`ix-handle ix-handle-in ix-port-${port.kind}`}
                  type="target"
                  position={Position.Left}
                  isConnectableStart={false}
                />
              )}
              {connected || field.kind === 'inputSocket' ? (
                <div className="ix-field-connected-label">{port?.label || field.label}</div>
              ) : (
                <FieldControl
                  field={field}
                  value={customFieldValue(node, field)}
                  onChange={(value) => {
                    if (node.type === 'custom') data.onUpdateCustomField?.(node.id, field.id, value);
                    else data.onChange(node.id, field.id, value);
                  }}
                  assetPreviewUrl={
                    node.type === 'imageInput' && field.id === 'path' && typeof node.data.assetUrl === 'string'
                      ? node.data.assetUrl
                      : undefined
                  }
                  onOpenAssets={
                    node.type === 'imageInput' && field.id === 'path'
                      ? () => data.onOpenAssetPicker?.(node.id, field.id)
                      : undefined
                  }
                  compact={node.type !== 'text'}
                />
              )}
            </div>
          );
        })}
        {node.type === 'custom' && (
          <CustomFieldAdder nodeId={node.id} {...(data.onAddCustomField ? { onAdd: data.onAddCustomField } : {})} />
        )}
      </div>}
    </article>
  );
}

function CustomFieldAdder({
  nodeId,
  onAdd,
}: {
  nodeId: string;
  onAdd?: (nodeId: string, preset: string) => void;
}) {
  const presets: Array<{ kind: CustomFieldDefinition['kind']; label: string }> = [
    { kind: 'text', label: 'Text' },
    { kind: 'textarea', label: 'Text Area' },
    { kind: 'select', label: 'Selector' },
    { kind: 'slider', label: 'Slider' },
    { kind: 'number', label: 'Number' },
    { kind: 'toggle', label: 'Toggle' },
    { kind: 'inputSocket', label: 'Input Socket' },
    { kind: 'outputSocket', label: 'Output Socket' },
  ];
  return (
    <details className="custom-field-adder nodrag">
      <summary>
        <Plus size={14} />
        Add field
      </summary>
      <div>
        {presets.map((preset) => (
          <button key={preset.kind} type="button" onClick={() => onAdd?.(nodeId, preset.kind)}>
            {preset.label}
          </button>
        ))}
      </div>
    </details>
  );
}
