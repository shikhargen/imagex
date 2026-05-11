import type { CustomFieldDefinition, ImageXNode, NodeType } from '../../../../shared/types.js';

export const builtInFieldDefinitions: Record<NodeType, CustomFieldDefinition[]> = {
  prompt: [{ id: 'text', label: 'Text', kind: 'textarea', value: '' }],
  image: [
    { id: 'image', label: 'Image', kind: 'image', value: '' },
    { id: 'description', label: 'Description', kind: 'textarea', value: '' },
  ],
  color: [{ id: 'color', label: 'Color', kind: 'color', value: '#ffffff' }],
  file: [{ id: 'filename', label: 'File', kind: 'text', value: '' }],
  'codex-output': [
    {
      id: 'size',
      label: 'Size',
      kind: 'select',
      value: '1024x1024',
      options: ['auto', '1024x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '3840x2160', '2160x3840'],
    },
    { id: 'quality', label: 'Quality', kind: 'select', value: 'auto', options: ['auto', 'low', 'medium', 'high'] },
    { id: 'format', label: 'Format', kind: 'select', value: 'png', options: ['png', 'jpeg', 'webp'] },
    { id: 'background', label: 'Background', kind: 'select', value: 'auto', options: ['auto', 'opaque', 'transparent'] },
    { id: 'count', label: 'Count', kind: 'slider', value: 1, min: 1, max: 4, step: 1 },
  ],
  'color-balance': [
    { id: 'red', label: 'Red', kind: 'slider', value: 0, min: -100, max: 100, step: 1 },
    { id: 'green', label: 'Green', kind: 'slider', value: 0, min: -100, max: 100, step: 1 },
    { id: 'blue', label: 'Blue', kind: 'slider', value: 0, min: -100, max: 100, step: 1 },
  ],
  'rotate-flip': [
    { id: 'rotate', label: 'Rotate', kind: 'select', value: '0', options: ['0', '90', '180', '270'] },
    { id: 'flipH', label: 'Flip Horizontal', kind: 'toggle', value: false },
    { id: 'flipV', label: 'Flip Vertical', kind: 'toggle', value: false },
  ],
  crop: [
    { id: 'x', label: 'X', kind: 'number', value: 0 },
    { id: 'y', label: 'Y', kind: 'number', value: 0 },
    { id: 'cropWidth', label: 'Width', kind: 'number', value: 0 },
    { id: 'cropHeight', label: 'Height', kind: 'number', value: 0 },
  ],
  blur: [
    { id: 'radius', label: 'Radius', kind: 'slider', value: 0, min: 0, max: 20, step: 1 },
  ],
  download: [],
  frame: [],
};

export function fieldDefinitionsFor(node: ImageXNode): CustomFieldDefinition[] {
  const builtIn = builtInFieldDefinitions[node.type];
  const dynamic = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  return [...builtIn, ...dynamic];
}

export function editableFieldDefinitionsFor(node: ImageXNode): CustomFieldDefinition[] {
  return fieldDefinitionsFor(node);
}

export function customFieldValue(node: ImageXNode, field: CustomFieldDefinition): unknown {
  // Dynamic fields store value in the field definition itself
  const dynamic = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  if (dynamic.some((f) => f.id === field.id)) return field.value;
  return node.data[field.id];
}

export function labelForFieldId(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}
