import type { CustomFieldDefinition, ImageXNode, NodeType } from '../../../shared/types.js';
import { builtInFieldDefinitions, editableFieldDefinitionsFor, fieldDefinitionsFor, labelForFieldId } from './fields/definitions.js';

export type PortKind = 'prompt' | 'character' | 'style' | 'scene' | 'image' | 'result';

export type NodePort = {
  id: string;
  label: string;
  kind: PortKind;
  accepts?: PortKind[];
  field?: string;
};

export const editableFields: Record<NodeType, string[]> = {
  text: ['text'],
  character: ['name', 'description', 'traits', 'clothing', 'mood'],
  style: ['name', 'medium', 'palette', 'description', 'visualConstraints'],
  scene: ['environment', 'lighting', 'camera', 'mood', 'weather'],
  imageInput: ['path', 'role', 'notes'],
  output: ['size', 'quality', 'format', 'background', 'count'],
  frame: [],
  custom: [],
};

export function fieldHandleId(field: string): string {
  return `field:${field}`;
}

function fieldPorts(type: NodeType): NodePort[] {
  return builtInFieldDefinitions[type]
    .filter((field) => editableFields[type].includes(field.id))
    .map((field) => ({
      id: fieldHandleId(field.id),
      label: field.label,
      kind: 'prompt',
      ...(field.accepts ? { accepts: field.accepts as PortKind[] } : {}),
      field: field.id,
    }));
}

export const inputPorts: Record<NodeType, NodePort[]> = {
  text: fieldPorts('text'),
  character: fieldPorts('character'),
  style: fieldPorts('style'),
  scene: fieldPorts('scene'),
  imageInput: fieldPorts('imageInput'),
  output: [
    { id: 'prompt-in', label: 'Prompt', kind: 'prompt', accepts: ['prompt'] },
    { id: 'character-in', label: 'Character', kind: 'character', accepts: ['character'] },
    { id: 'style-in', label: 'Style', kind: 'style', accepts: ['style'] },
    { id: 'scene-in', label: 'Scene', kind: 'scene', accepts: ['scene'] },
    { id: 'image-in', label: 'Reference', kind: 'image', accepts: ['image', 'result'] },
    ...fieldPorts('output'),
  ],
  frame: [],
  custom: [],
};

export const outputPorts: Record<NodeType, NodePort[]> = {
  text: [{ id: 'prompt-out', label: 'Prompt', kind: 'prompt' }],
  character: [{ id: 'character-out', label: 'Character', kind: 'character' }],
  style: [{ id: 'style-out', label: 'Style', kind: 'style' }],
  scene: [{ id: 'scene-out', label: 'Scene', kind: 'scene' }],
  imageInput: [{ id: 'image-out', label: 'Image', kind: 'image' }],
  output: [{ id: 'result-out', label: 'Result', kind: 'result' }],
  frame: [],
  custom: [{ id: 'custom-out', label: 'Custom', kind: 'prompt' }],
};

export function editableFieldIdsFor(node: ImageXNode): string[] {
  if (node.type !== 'custom') return editableFields[node.type];
  return editableFieldDefinitionsFor(node)
    .filter((field) => field.kind !== 'inputSocket')
    .map((field) => field.id);
}

export function inputPortsFor(node: ImageXNode): NodePort[] {
  if (node.type !== 'custom') return inputPorts[node.type];
  return fieldDefinitionsFor(node)
    .filter((field) => field.kind !== 'outputSocket')
    .map((field) => fieldToInputPort(field));
}

export function outputPortsFor(node: ImageXNode): NodePort[] {
  if (node.type !== 'custom') return outputPorts[node.type];
  const customOutputs = fieldDefinitionsFor(node)
    .filter((field) => field.kind === 'outputSocket')
    .map((field) => ({
      id: `output:${field.id}`,
      label: field.label,
      kind: 'prompt' as const,
    }));
  return customOutputs.length ? customOutputs : outputPorts.custom;
}

function fieldToInputPort(field: CustomFieldDefinition): NodePort {
  return {
    id: fieldHandleId(field.id),
    label: field.label,
    kind: 'prompt',
    ...(field.accepts ? { accepts: field.accepts as PortKind[] } : {}),
    field: field.id,
  };
}

type MinimalConnection = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function isCompatibleConnection(connection: MinimalConnection, nodes: ImageXNode[]): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) return false;

  const sourcePort = outputPortsFor(source).find((port) => port.id === connection.sourceHandle);
  const targetPort = inputPortsFor(target).find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return false;

  return (targetPort.accepts || [targetPort.kind]).includes(sourcePort.kind);
}

export function portLabel(node: ImageXNode | undefined, handleId: string | null | undefined): string {
  if (!node || !handleId) return '';
  const port = [...inputPortsFor(node), ...outputPortsFor(node)].find((candidate) => candidate.id === handleId);
  return port?.label || '';
}

export function firstCompatibleInputHandle(source: ImageXNode, target: ImageXNode): string | null {
  const sourcePort = outputPortsFor(source)[0];
  if (!sourcePort) return null;
  return (
    inputPortsFor(target).find((port) => (port.accepts || [port.kind]).includes(sourcePort.kind))?.id || null
  );
}

export function firstCompatibleOutputHandle(source: ImageXNode, target: ImageXNode, targetHandle: string | null | undefined): string | null {
  const targetPort = inputPortsFor(target).find((port) => port.id === targetHandle) || inputPortsFor(target)[0];
  if (!targetPort) return null;
  return outputPortsFor(source).find((port) => (targetPort.accepts || [targetPort.kind]).includes(port.kind))?.id || null;
}
