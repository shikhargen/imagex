import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  ConnectionLineType,
  type EdgeChange,
  MarkerType,
  type NodeChange,
  SelectionMode,
  type ReactFlowInstance,
} from '@xyflow/react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { NodeType } from '../../../shared/types.js';
import { nodeMeta } from '../flow/meta.js';
import { isCompatibleConnection, portLabel } from '../flow/ports.js';
import type { UiEdge, UiNode } from '../flow/types.js';
import {
  CharacterNode,
  CustomNode,
  FrameNode,
  ImageInputNode,
  OutputNode,
  SceneNode,
  StyleNode,
  TextNode,
} from '../flow/nodes/ImageXNode.js';

const nodeTypes = {
  text: TextNode,
  character: CharacterNode,
  style: StyleNode,
  scene: SceneNode,
  imageInput: ImageInputNode,
  output: OutputNode,
  frame: FrameNode,
  custom: CustomNode,
};

export function FlowEditor({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onSelectNode,
  onNodeMenu,
  onBeforeChange,
  onPaneMenu,
  onSelectionMenu,
  onSelectionChangeIds,
  onFrameDrag,
  onNodeDragHoverFrame,
  onNodeDragStopCheckFrames,
  onPaneClickClear,
  onCommitFlow,
  onFlowReady,
  placingNodeId,
  onPlacingMove,
  onPlacingDrop,
}: {
  nodes: UiNode[];
  edges: UiEdge[];
  onNodesChange: (nodes: UiNode[]) => void;
  onEdgesChange: (edges: UiEdge[]) => void;
  onSelectNode: (nodeId: string | null) => void;
  onNodeMenu: (nodeId: string, position: { x: number; y: number }) => void;
  onBeforeChange: () => void;
  onPaneMenu: (position: { x: number; y: number }, flowPosition: { x: number; y: number }) => void;
  onSelectionMenu: (position: { x: number; y: number }) => void;
  onSelectionChangeIds: (nodeIds: string[], edgeIds: string[]) => void;
  onFrameDrag: (frameId: string, delta: { x: number; y: number }) => void;
  onNodeDragHoverFrame: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeDragStopCheckFrames: (nodeId: string) => void;
  onPaneClickClear: () => void;
  onCommitFlow: () => void;
  onFlowReady?: (api: { screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } }) => void;
  placingNodeId?: string | null;
  onPlacingMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onPlacingDrop?: () => void;
}) {
  const edgeReconnectSuccessful = useRef(true);
  const frameDragRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<UiNode, UiEdge> | null>(null);
  const handleNodesChange = useCallback(
    (changes: NodeChange<UiNode>[]) => onNodesChange(applyNodeChanges(changes, nodes)),
    [nodes, onNodesChange]
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<UiEdge>[]) => onEdgesChange(applyEdgeChanges(changes, edges)),
    [edges, onEdgesChange]
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!isCompatibleConnection(connection, nodes.map((node) => node.data.workflowNode))) return;
      onBeforeChange();
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      onEdgesChange(addEdge(styleConnection(connection, source, target), edges));
    },
    [edges, nodes, onBeforeChange, onEdgesChange]
  );

  const handleReconnect = useCallback(
    (oldEdge: UiEdge, newConnection: Connection) => {
      if (!newConnection.target || !newConnection.targetHandle) return;
      if (!isCompatibleConnection(newConnection, nodes.map((node) => node.data.workflowNode))) return;
      onBeforeChange();
      edgeReconnectSuccessful.current = true;
      const source = nodes.find((node) => node.id === newConnection.source);
      const target = nodes.find((node) => node.id === newConnection.target);
      onEdgesChange(
        edges.map((edge) =>
          edge.id === oldEdge.id ? { ...styleConnection(newConnection, source, target), id: oldEdge.id } : edge
        )
      );
    },
    [edges, nodes, onBeforeChange, onEdgesChange]
  );
  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);
  const handleReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: UiEdge) => {
      if (!edgeReconnectSuccessful.current) {
        onBeforeChange();
        onEdgesChange(edges.filter((candidate) => candidate.id !== edge.id));
      }
      edgeReconnectSuccessful.current = true;
    },
    [edges, onBeforeChange, onEdgesChange]
  );

  const memoizedEdgeOptions = useMemo(
    () => ({ type: 'default' as const, reconnectable: true as const, zIndex: 5 }),
    []
  );
  const memoizedFitViewOptions = useMemo(() => ({ padding: 0.2 }), []);
  const memoizedPanOnDrag = useMemo(() => [1, 2] as [number, number], []);

  useEffect(() => {
    const canvas = document.querySelector('.react-flow__pane') as HTMLElement | null;
    if (!canvas) return;
    if (placingNodeId) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
  }, [placingNodeId]);

  useEffect(() => {
    if (!placingNodeId || !reactFlowRef.current || !onPlacingMove) return;
    const handleMouseMove = (event: MouseEvent) => {
      const position = reactFlowRef.current!.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      onPlacingMove(placingNodeId, position);
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [placingNodeId, onPlacingMove]);

  return (
    <section className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onInit={(instance) => {
          reactFlowRef.current = instance;
          onFlowReady?.({ screenToFlowPosition: instance.screenToFlowPosition.bind(instance) });
        }}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        onReconnectStart={handleReconnectStart}
        onReconnectEnd={handleReconnectEnd}
        onNodeDragStart={(_, node) => {
          if (placingNodeId) return;
          onBeforeChange();
          if (node.type === 'frame') frameDragRef.current = { id: node.id, position: node.position };
        }}
        onNodeDrag={(_, node) => {
          const active = frameDragRef.current;
          if (node.type !== 'frame') {
            onNodeDragHoverFrame(node.id, node.position);
            return;
          }
          if (!active || node.id !== active.id) return;
          const delta = { x: node.position.x - active.position.x, y: node.position.y - active.position.y };
          if (delta.x || delta.y) onFrameDrag(node.id, delta);
          frameDragRef.current = { id: node.id, position: node.position };
        }}
        onNodeDragStop={(_, node) => {
          frameDragRef.current = null;
          if (node.type !== 'frame') {
            onNodeDragStopCheckFrames(node.id);
            return;
          }
          onCommitFlow();
        }}
        edgesReconnectable
        reconnectRadius={16}
        isValidConnection={(connection) => isCompatibleConnection(connection, nodes.map((node) => node.data.workflowNode))}
        onNodeClick={(_, node) => {
          if (placingNodeId) {
            onPlacingDrop?.();
            return;
          }
          onSelectNode(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onNodeMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        onSelectionContextMenu={(event) => {
          event.preventDefault();
          onSelectionMenu({ x: event.clientX, y: event.clientY });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          if (placingNodeId) {
            onPlacingDrop?.();
            return;
          }
          onPaneMenu(
            { x: event.clientX, y: event.clientY },
            reactFlowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) || { x: 0, y: 0 }
          );
        }}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) =>
          onSelectionChangeIds(
            selectedNodes.map((node) => node.id),
            selectedEdges.map((edge) => edge.id)
          )
        }
        onEdgeDoubleClick={(_, edge) => {
          onBeforeChange();
          onEdgesChange(edges.filter((candidate) => candidate.id !== edge.id));
        }}
        onPaneClick={() => {
          if (placingNodeId) {
            onPlacingDrop?.();
            return;
          }
          onPaneClickClear();
        }}
        fitView
        fitViewOptions={memoizedFitViewOptions}
        minZoom={0.25}
        maxZoom={1.6}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        panOnDrag={memoizedPanOnDrag}
        connectionLineType={ConnectionLineType.Bezier}
        defaultEdgeOptions={memoizedEdgeOptions}
        elevateNodesOnSelect={false}
      >
        <Background variant={BackgroundVariant.Dots} color="#5b6472" gap={24} size={1.35} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => nodeMeta[node.type as NodeType].accent}
          maskColor="rgba(2, 6, 23, 0.72)"
        />
        <Controls position="top-left" />
      </ReactFlow>
    </section>
  );
}

function styleConnection(connection: Connection, source: UiNode | undefined, target: UiNode | undefined): UiEdge {
  const accent = source ? nodeMeta[source.type as NodeType].accent : '#7a7a7a';
  const sourceLabel = portLabel(source?.data.workflowNode, connection.sourceHandle);
  const targetLabel = portLabel(target?.data.workflowNode, connection.targetHandle);
  return {
    id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
    source: connection.source || '',
    target: connection.target || '',
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    type: 'default',
    reconnectable: true,
    label: sourceLabel && sourceLabel === targetLabel ? sourceLabel : targetLabel || sourceLabel || '',
    labelShowBg: true,
    labelBgBorderRadius: 4,
    labelBgPadding: [4, 2],
    labelStyle: { fill: '#aab1bd', fontSize: 14, fontWeight: 700 },
    labelBgStyle: { fill: '#202124', stroke: '#3a3a3a' },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: accent,
    },
    style: {
      stroke: accent,
      strokeWidth: 2,
    },
  };
}
