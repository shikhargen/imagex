import { Handle, Position } from '@xyflow/react';
import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { CustomFieldDefinition, ImageXNode } from '../../../../../shared/types.js';
import { FieldControl } from '../../fields/FieldControl.js';
import { builtInFieldDefinitions, customFieldValue } from '../../fields/definitions.js';

export type NodeFieldsProps = {
  node: ImageXNode;
  connectedHandles: string[];
  addableFields: string[];
  hasAssetPicker?: boolean | undefined;
  /** Called when a built-in field value changes */
  onFieldChange: (nodeId: string, fieldId: string, value: unknown) => void;
  /** Called on slider release / commit for built-in fields (ongoing=false trigger) */
  onFieldCommit?: ((nodeId: string, fieldId: string, value: unknown) => void) | undefined;
  /** Called when a dynamic field value changes */
  onDynamicFieldChange?: ((nodeId: string, fieldId: string, value: unknown) => void) | undefined;
  /** Called to update the entire fields array (for rename/remove) */
  onFieldsChange: (nodeId: string, fields: CustomFieldDefinition[]) => void;
  /** Called to add a new dynamic field */
  onAddField?: ((nodeId: string, kind: string) => void) | undefined;
  /** Called to disconnect a handle */
  onDisconnect?: ((nodeId: string, handleId: string) => void) | undefined;
  /** Called to open asset picker */
  onOpenAssets?: ((nodeId: string, fieldId: string) => void) | undefined;
  /** Whether to render React Flow handles (only in node context) */
  renderHandles?: boolean | undefined;
};

/**
 * Shared field list component used by both PrimitiveNode and InspectorPanel.
 * Renders all fields with rename/delete hover actions, connected state, and add button.
 */
export function NodeFields({
  node,
  connectedHandles,
  addableFields,
  hasAssetPicker,
  onFieldChange,
  onFieldCommit,
  onDynamicFieldChange,
  onFieldsChange,
  onAddField,
  onDisconnect,
  onOpenAssets,
  renderHandles,
}: NodeFieldsProps) {
  const builtIn = builtInFieldDefinitions[node.type] || [];
  const dynamicFields = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  const allFields = [...builtIn, ...dynamicFields];

  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);

  const removeField = (fieldId: string) => {
    const updated = dynamicFields.filter((f) => f.id !== fieldId);
    onFieldsChange(node.id, updated);
    if (renamingFieldId === fieldId) setRenamingFieldId(null);
  };

  return (
    <>
      <div className="ix-node-fields">
        {allFields.map((field) => {
          const isDynamic = dynamicFields.some((f) => f.id === field.id);
          const hasSocket = field.kind === 'text' || field.kind === 'textarea' || field.kind === 'image';
          const handleId = `field:${field.id}`;
          const isConnected = connectedHandles.includes(handleId);
          const isRenaming = renamingFieldId === field.id;

          return (
            <div key={field.id} className="ix-primitive-field">
              {/* Input socket handle */}
              {renderHandles && hasSocket && (
                <Handle
                  id={handleId}
                  className="ix-handle ix-handle-in"
                  type="target"
                  position={Position.Left}
                />
              )}

              {/* Hover actions for dynamic fields */}
              {isDynamic && !isRenaming && !isConnected && (
                <div className="ix-field-actions nodrag">
                  <button
                    type="button"
                    title="Rename"
                    onClick={() => setRenamingFieldId(field.id)}
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    title="Remove"
                    onClick={() => removeField(field.id)}
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

              {/* Connected state: label + disconnect */}
              {isConnected ? (
                <div className="ix-field-connected-row">
                  {onDisconnect && (
                    <button
                      type="button"
                      className="ix-field-disconnect nodrag"
                      title="Disconnect"
                      onClick={() => onDisconnect(node.id, handleId)}
                    >
                      <X size={10} />
                    </button>
                  )}
                  <span className="ix-field-connected-label">{field.label}</span>
                </div>
              ) : (
                <FieldControl
                  field={field}
                  value={customFieldValue(node, field)}
                  onChange={(value) => {
                    if (isDynamic) {
                      onDynamicFieldChange?.(node.id, field.id, value);
                    } else {
                      onFieldChange(node.id, field.id, value);
                    }
                  }}
                  onCommit={!isDynamic && onFieldCommit ? (value) => onFieldCommit(node.id, field.id, value) : undefined}
                  labelEditing={isRenaming}
                  onLabelCommit={(newLabel) => {
                    const updated = dynamicFields.map((f) =>
                      f.id === field.id ? { ...f, label: newLabel } : f
                    );
                    onFieldsChange(node.id, updated);
                    setRenamingFieldId(null);
                  }}
                  onOpenAssets={
                    hasAssetPicker && (field.id === 'image' || field.kind === 'image')
                      ? () => onOpenAssets?.(node.id, field.id)
                      : undefined
                  }
                  assetPreviewUrl={
                    hasAssetPicker ? (node.data.assetUrl as string | undefined) : undefined
                  }
                  assetDisplayName={
                    hasAssetPicker ? (node.data.assetName as string | undefined) : undefined
                  }
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Add field button */}
      {addableFields.length > 0 && onAddField && (
        <div className="ix-add-field">
          <button
            type="button"
            className="ix-add-field-btn nodrag nopan"
            onMouseDown={() => onAddField(node.id, addableFields[0]!)}
          >
            <Plus size={12} />
            Add input
          </button>
        </div>
      )}
    </>
  );
}
