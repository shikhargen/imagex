import type { CustomFieldDefinition, ImageXNode, NodeType } from '../../../../shared/types.js';

export type BuiltInFieldDefinition = CustomFieldDefinition & {
  nodeTypes: NodeType[];
};

export const builtInFieldDefinitions: Record<NodeType, CustomFieldDefinition[]> = {
  text: [{ id: 'text', label: 'Text', kind: 'textarea', value: '' }],
  character: [
    { id: 'name', label: 'Name', kind: 'text', value: '' },
    { id: 'description', label: 'Description', kind: 'textarea', value: '', accepts: ['prompt', 'image'] },
    { id: 'traits', label: 'Traits', kind: 'text', value: '', accepts: ['prompt', 'image'] },
    { id: 'clothing', label: 'Clothing', kind: 'text', value: '', accepts: ['prompt', 'image'] },
    { id: 'mood', label: 'Mood', kind: 'text', value: '', accepts: ['prompt', 'image'] },
  ],
  style: [
    { id: 'name', label: 'Name', kind: 'text', value: '' },
    {
      id: 'medium',
      label: 'Medium',
      kind: 'select',
      value: 'digital illustration',
      options: ['digital illustration', 'photorealistic', '3D render', 'manga', 'pixel art', 'watercolor'],
    },
    { id: 'palette', label: 'Palette', kind: 'text', value: '', accepts: ['prompt', 'image'] },
    { id: 'description', label: 'Description', kind: 'textarea', value: '', accepts: ['prompt', 'image'] },
    { id: 'visualConstraints', label: 'Visual Constraints', kind: 'text', value: '', accepts: ['prompt', 'image'] },
  ],
  scene: [
    { id: 'environment', label: 'Environment', kind: 'textarea', value: '', accepts: ['prompt', 'image'] },
    { id: 'lighting', label: 'Lighting', kind: 'textarea', value: '', accepts: ['prompt', 'image'] },
    { id: 'camera', label: 'Camera', kind: 'text', value: '', accepts: ['prompt', 'image'] },
    { id: 'mood', label: 'Mood', kind: 'text', value: '', accepts: ['prompt', 'image'] },
    { id: 'weather', label: 'Weather', kind: 'text', value: '', accepts: ['prompt', 'image'] },
  ],
  imageInput: [
    { id: 'path', label: 'Path', kind: 'text', value: '' },
    {
      id: 'role',
      label: 'Role',
      kind: 'select',
      value: 'reference',
      options: ['reference', 'edit target', 'style reference', 'composition reference'],
    },
    { id: 'notes', label: 'Notes', kind: 'textarea', value: '', accepts: ['prompt', 'image'] },
  ],
  output: [
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
  frame: [],
  custom: [],
};

export function fieldDefinitionsFor(node: ImageXNode): CustomFieldDefinition[] {
  if (node.type === 'custom') return customFieldDefinitions(node);
  return builtInFieldDefinitions[node.type];
}

export function editableFieldDefinitionsFor(node: ImageXNode): CustomFieldDefinition[] {
  return fieldDefinitionsFor(node).filter((field) => field.kind !== 'outputSocket');
}

export function customFieldDefinitions(node: ImageXNode): CustomFieldDefinition[] {
  return Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
}

export function customFieldValue(node: ImageXNode, field: CustomFieldDefinition): unknown {
  if (node.type === 'custom') return field.value;
  return node.data[field.id];
}

export function labelForFieldId(field: string): string {
  return field.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}
