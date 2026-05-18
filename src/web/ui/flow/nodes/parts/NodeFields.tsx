import { Handle, Position } from '@xyflow/react';
import { Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { CustomFieldDefinition, ImageXNode } from '../../../../../shared/types.js';
import { FieldControl } from '../../fields/FieldControl.js';
import { customFieldValue, fieldDefinitionsFor } from '../../fields/definitions.js';

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
  /** Whether labels/removal are editable for this field list */
  editableFieldStructure?: boolean | undefined;
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
  editableFieldStructure,
}: NodeFieldsProps) {
  const allFields = fieldDefinitionsFor(node);

  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);

  const removeField = (fieldId: string) => {
    const field = allFields.find((candidate) => candidate.id === fieldId);
    if (!field || !isTextLikeField(field) || !canRemoveField(node, allFields, field)) return;
    const updated = allFields.filter((f) => f.id !== fieldId);
    onFieldsChange(node.id, updated);
    if (renamingFieldId === fieldId) setRenamingFieldId(null);
  };

  return (
    <>
      <div className="ix-node-fields">
        {allFields.map((field) => {
          const hasSocket = field.kind === 'text' || field.kind === 'textarea' || field.kind === 'image';
          const handleId = `field:${field.id}`;
          const isConnected = connectedHandles.includes(handleId);
          const isRenaming = renamingFieldId === field.id;
          const canEditStructure = Boolean(editableFieldStructure) && isTextLikeField(field);
          const canRemove = canEditStructure && canRemoveField(node, allFields, field);

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

              {/* Hover actions for editable fields */}
              {canEditStructure && !isRenaming && !isConnected && (
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
                    disabled={!canRemove}
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
                    if (onDynamicFieldChange) onDynamicFieldChange(node.id, field.id, value);
                    else onFieldChange(node.id, field.id, value);
                  }}
                  onCommit={onFieldCommit ? (value) => onFieldCommit(node.id, field.id, value) : undefined}
                  labelEditing={isRenaming}
                  onLabelCommit={(newLabel) => {
                    const updated = allFields.map((f) =>
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

function canRemoveField(node: ImageXNode, fields: CustomFieldDefinition[], field: CustomFieldDefinition): boolean {
  if (node.type !== 'prompt' || !isTextLikeField(field)) return true;
  const promptTextFields = fields.filter(isTextLikeField);
  return promptTextFields.length > 1;
}

function isTextLikeField(field: CustomFieldDefinition): boolean {
  return field.kind === 'text' || field.kind === 'textarea';
}
