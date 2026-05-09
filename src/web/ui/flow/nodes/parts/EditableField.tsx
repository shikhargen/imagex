import { FieldControl } from '../../fields/FieldControl.js';
import { labelForFieldId } from '../../fields/definitions.js';
import type { UpdateNodeData } from '../../types.js';

export function EditableField({
  nodeId,
  field,
  value,
  onChange,
  compact,
}: {
  nodeId: string;
  field: string;
  value: unknown;
  onChange: UpdateNodeData;
  compact?: boolean;
}) {
  return (
    <FieldControl
      field={{ id: field, label: labelForFieldId(field), kind: field === 'text' || field === 'description' ? 'textarea' : 'text' }}
      value={value}
      onChange={(nextValue) => onChange(nodeId, field, nextValue)}
      {...(compact === undefined ? {} : { compact })}
    />
  );
}
