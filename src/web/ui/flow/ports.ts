import type { CustomFieldDefinition, ImageXNode, NodeType } from '../../../shared/types.js';
import { builtInFieldDefinitions } from './fields/definitions.js';

export type PortKind = 'text' | 'image' | 'result';

export type NodePort = {
  id: string;
  label: string;
  kind: PortKind;
  accepts?: PortKind[];
  field?: string;
};

export function fieldHandleId(field: string): string {
  return `field:${field}`;
}

export const inputPorts: Record<NodeType, NodePort[]> = {
  prompt: [],
  image: [],
  color: [],
  file: [],
  'codex-output': [
    { id: 'input-in', label: 'Input', kind: 'text', accepts: ['text', 'image', 'result'] },
  ],
  'color-balance': [
    { id: 'image-in', label: 'Image', kind: 'image', accepts: ['image', 'result'] },
  ],
  'rotate-flip': [
    { id: 'image-in', label: 'Image', kind: 'image', accepts: ['image', 'result'] },
  ],
  crop: [
    { id: 'image-in', label: 'Image', kind: 'image', accepts: ['image', 'result'] },
  ],
  blur: [
    { id: 'image-in', label: 'Image', kind: 'image', accepts: ['image', 'result'] },
  ],
  download: [
    { id: 'image-in', label: 'Image', kind: 'image', accepts: ['image', 'result'] },
  ],
  frame: [],
};

export const outputPorts: Record<NodeType, NodePort[]> = {
  prompt: [{ id: 'text-out', label: 'Text', kind: 'text' }],
  image: [{ id: 'image-out', label: 'Image', kind: 'image' }],
  color: [{ id: 'text-out', label: 'Color', kind: 'text' }],
  file: [{ id: 'text-out', label: 'Text', kind: 'text' }],
  'codex-output': [{ id: 'result-out', label: 'Image', kind: 'result' }],
  'color-balance': [{ id: 'image-out', label: 'Image', kind: 'image' }],
  'rotate-flip': [{ id: 'image-out', label: 'Image', kind: 'image' }],
  crop: [{ id: 'image-out', label: 'Image', kind: 'image' }],
  blur: [{ id: 'image-out', label: 'Image', kind: 'image' }],
  download: [],
  frame: [],
};

export function inputPortsFor(node: ImageXNode): NodePort[] {
  const staticPorts = inputPorts[node.type];
  
  // For primitive nodes, generate input ports from text/textarea/image fields
  const primitiveTypes: NodeType[] = ['prompt', 'image', 'color', 'file'];
  if (!primitiveTypes.includes(node.type)) return staticPorts;

  const builtIn = builtInFieldDefinitions[node.type] || [];
  const dynamic = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  const allFields = [...builtIn, ...dynamic];

  const fieldPorts: NodePort[] = allFields
    .filter((f) => f.kind === 'text' || f.kind === 'textarea' || f.kind === 'image')
    .map((f) => ({
      id: fieldHandleId(f.id),
      label: f.label,
      kind: (f.kind === 'image' ? 'image' : 'text') as PortKind,
      accepts: (f.kind === 'image' ? ['image', 'result'] : ['text']) as PortKind[],
      field: f.id,
    }));

  return [...staticPorts, ...fieldPorts];
}

export function outputPortsFor(node: ImageXNode): NodePort[] {
  if (node.type === 'codex-output') {
    const urls = Array.isArray(node.data.previewUrls) ? node.data.previewUrls : [];
    const imageCount = urls.filter((url) => typeof url === 'string' && url.length > 0).length;
    if (imageCount > 1) {
      return Array.from({ length: imageCount }, (_, index) => ({
        id: outputImageHandleId(index),
        label: `Image ${index + 1}`,
        kind: 'result' as const,
      }));
    }
  }
  return outputPorts[node.type];
}

export function outputImageHandleId(index: number): string {
  return index <= 0 ? 'result-out' : `result-out:${index}`;
}

export function outputImageIndexFromHandle(handleId: string | null | undefined): number {
  if (!handleId || handleId === 'result-out') return 0;
  const match = handleId.match(/^result-out:(\d+)$/);
  if (!match) return 0;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

type MinimalConnection = {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function isCompatibleConnection(connection: MinimalConnection, nodes: ImageXNode[], edges?: { source: string; target: string }[]): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;

  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (!source || !target) return false;

  const sourcePort = outputPortsFor(source).find((port) => port.id === connection.sourceHandle);
  const targetPort = inputPortsFor(target).find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return false;

  if (!(targetPort.accepts || [targetPort.kind]).includes(sourcePort.kind)) return false;

  // Cycle detection: would adding source→target create a cycle?
  if (edges) {
    if (wouldCreateCycle(connection.source, connection.target, edges)) return false;
  }

  return true;
}

export function edgeReferencesExistingPorts(edge: MinimalConnection, nodes: ImageXNode[]): boolean {
  if (!edge.source || !edge.target || !edge.sourceHandle || !edge.targetHandle) return false;

  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return false;

  return (
    outputPortsFor(source).some((port) => port.id === edge.sourceHandle) &&
    inputPortsFor(target).some((port) => port.id === edge.targetHandle)
  );
}

/** Check if adding an edge from source→target would create a cycle */
function wouldCreateCycle(source: string, target: string, edges: { source: string; target: string }[]): boolean {
  // DFS from target following existing edges - if we can reach source, it's a cycle
  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges) {
      if (edge.source === current) {
        stack.push(edge.target);
      }
    }
  }
  return false;
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
