import { MarkerType, type Edge } from '@xyflow/react';
import type { ImageXEdge, ImageXNode, ImageXWorkflow, NodeType } from '../../../shared/types.js';
import { nodeMeta } from './meta.js';
import { inputPortsFor, outputPortsFor, portLabel } from './ports.js';
import type { OpenNodeMenu, UiEdge, UiNode, UiNodeData, UpdateNodeData } from './types.js';

export function workflowToFlow(
  workflow: ImageXWorkflow,
  onChange: UpdateNodeData,
  onMenu: OpenNodeMenu,
  onShowPrompt?: () => void,
  onAddCustomField?: UiNodeData['onAddCustomField'],
  onUpdateCustomField?: UiNodeData['onUpdateCustomField'],
  onActivateCustomField?: UiNodeData['onActivateCustomField'],
  onOpenAssetPicker?: UiNodeData['onOpenAssetPicker']
): { nodes: UiNode[]; edges: UiEdge[] } {
  const workflowNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const workflowEdges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const normalizedEdges = workflowEdges.map((edge) => withInferredHandles(edge, workflowNodes));
  return {
    nodes: workflowNodes.map((node) => {
      const connectedTargetHandles = normalizedEdges
        .filter((edge) => edge.target === node.id && edge.targetHandle)
        .map((edge) => edge.targetHandle!);
      const data: UiNodeData = {
        workflowNode: node,
        onChange,
        onMenu,
        connectedTargetHandles,
      };
      if (onShowPrompt) data.onShowPrompt = onShowPrompt;
      if (onAddCustomField) data.onAddCustomField = onAddCustomField;
      if (onUpdateCustomField) data.onUpdateCustomField = onUpdateCustomField;
      if (onActivateCustomField) data.onActivateCustomField = onActivateCustomField;
      if (onOpenAssetPicker) data.onOpenAssetPicker = onOpenAssetPicker;
      const frameWidth = Number(node.data.width) || 520;
      const frameHeight = Number(node.data.height) || 360;
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data,
        ...(node.type === 'frame'
          ? {
              zIndex: -1,
              selectable: true,
              width: frameWidth,
              height: frameHeight,
              initialWidth: frameWidth,
              initialHeight: frameHeight,
              style: { width: frameWidth, height: frameHeight },
            }
          : { zIndex: 10 }),
      };
    }),
    edges: normalizedEdges.map((edge) => toFlowEdge(edge, workflowNodes)),
  };
}

export function syncFlowToWorkflow(workflow: ImageXWorkflow, nodes: UiNode[], edges: UiEdge[]): ImageXWorkflow {
  const workflowNodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  return {
    ...workflow,
    nodes: workflowNodes.map((workflowNode) => {
      const flowNode = nodes.find((node) => node.id === workflowNode.id);
      const data = flowNode ? { ...flowNode.data.workflowNode.data } : workflowNode.data;
      if (flowNode?.type === 'frame') {
        const style = flowNode.style as { width?: number | string; height?: number | string } | undefined;
        data.width = numericDimension(flowNode.width) ?? numericDimension(style?.width) ?? numericDimension(data.width) ?? 520;
        data.height = numericDimension(flowNode.height) ?? numericDimension(style?.height) ?? numericDimension(data.height) ?? 360;
      }
      return flowNode
        ? {
            ...workflowNode,
            position: flowNode.position,
            data,
          }
        : workflowNode;
    }),
    edges: edges.map((edge) => {
      const workflowEdge: ImageXEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
      };
      if (edge.sourceHandle) workflowEdge.sourceHandle = edge.sourceHandle;
      if (edge.targetHandle) workflowEdge.targetHandle = edge.targetHandle;
      return workflowEdge;
    }),
  };
}

function numericDimension(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

export function toFlowEdge(edge: ImageXEdge, nodes: ImageXNode[]): Edge {
  const source = nodes.find((node) => node.id === edge.source);
  const accent = source ? nodeMeta[source.type].accent : '#8b5cf6';
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: 'default',
    animated: false,
    reconnectable: true,
    label: edgeLabel(edge, nodes),
    labelShowBg: true,
    labelBgBorderRadius: 4,
    labelBgPadding: [4, 2],
    labelStyle: {
      fill: '#aab1bd',
      fontSize: 14,
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: '#202124',
      stroke: '#3a3a3a',
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: accent,
    },
    style: {
      stroke: accent,
      strokeWidth: 2.5,
    },
  };
}

function withInferredHandles(edge: ImageXEdge, nodes: ImageXNode[]): ImageXEdge {
  if (edge.sourceHandle && edge.targetHandle) return edge;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return edge;
  const sourceHandle = edge.sourceHandle || outputPortsFor(source)[0]?.id;
  const sourceKind = outputPortsFor(source).find((port) => port.id === sourceHandle)?.kind;
  const targetHandle =
    edge.targetHandle ||
    inputPortsFor(target).find((port) => sourceKind && (port.accepts || [port.kind]).includes(sourceKind))?.id ||
    inputPortsFor(target)[0]?.id;
  const inferred: ImageXEdge = {
    ...edge,
  };
  if (sourceHandle) inferred.sourceHandle = sourceHandle;
  if (targetHandle) inferred.targetHandle = targetHandle;
  return inferred;
}

function edgeLabel(edge: ImageXEdge, nodes: ImageXNode[]): string {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const sourceLabel = portLabel(source, edge.sourceHandle);
  const targetLabel = portLabel(target, edge.targetHandle);
  if (sourceLabel && sourceLabel === targetLabel) return sourceLabel;
  return targetLabel || sourceLabel || '';
}

export function createUiWorkflowNode(type: NodeType, position: { x: number; y: number }): ImageXNode {
  return {
    id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    position,
    data: defaultDataFor(type),
  };
}

function defaultDataFor(type: NodeType): Record<string, unknown> {
  switch (type) {
    case 'text':
      return { text: 'Describe the image goal here.' };
    case 'character':
      return {
        name: 'New Character',
        description: 'Identity, silhouette, clothing, and recurring traits.',
        mood: 'focused',
      };
    case 'style':
      return {
        name: 'New Style',
        medium: 'digital illustration',
        palette: 'balanced contrast',
        description: 'Rendering style and visual constraints.',
      };
    case 'scene':
      return {
        environment: 'Describe the setting.',
        lighting: 'natural cinematic lighting',
        camera: 'medium shot',
      };
    case 'imageInput':
      return {
        path: '',
        role: 'reference',
        notes: 'How this image should influence generation.',
      };
    case 'output':
      return {
        size: '1024x1024',
        quality: 'auto',
        format: 'png',
        background: 'auto',
        count: 1,
      };
    case 'frame':
      return {
        title: 'Frame',
        notes: '',
        width: 520,
        height: 360,
      };
    case 'custom':
      return {
        title: 'Custom Node',
        fields: [],
      };
  }
}
