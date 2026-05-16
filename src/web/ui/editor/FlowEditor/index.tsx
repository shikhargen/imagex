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
import './styles.css';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { NodeType } from '../../../../shared/types.js';
import { nodeMeta } from '../../flow/meta.js';
import { flowStore, useFlowNodes, useFlowEdges } from '../../../state/flowStore.js';
import { isCompatibleConnection } from '../../flow/ports.js';
import type { UiEdge, UiNode } from '../../flow/types.js';
import {
  BlurNode,
  CodexOutputNode,
  ColorBalanceNode,
  ColorNode,
  CropNode,
  DownloadNode,
  FileNode,
  FrameNode,
  ImageNode,
  PromptNode,
  RotateFlipNode,
} from '../../flow/nodes/ImageXNode.js';
import { graphEngine } from '../../../state/graphEngine.js';

const nodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  color: ColorNode,
  file: FileNode,
  'codex-output': CodexOutputNode,
  'color-balance': ColorBalanceNode,
  'rotate-flip': RotateFlipNode,
  crop: CropNode,
  blur: BlurNode,
  download: DownloadNode,
  frame: FrameNode,
};

export function FlowEditor({
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
  showMinimap,
}: {
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
  onFlowReady?: (api: {
    screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number };
    zoomIn: () => void;
    zoomOut: () => void;
    fitView: () => void;
  }) => void;
  placingNodeId?: string | null;
  onPlacingMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onPlacingDrop?: () => void;
  showMinimap?: boolean;
}) {
  // Read nodes/edges from FlowStore (not props) — avoids parent re-render cascades
  const nodes = useFlowNodes();
  const edges = useFlowEdges();
  const hasFrames = useMemo(() => nodes.some((node) => node.type === 'frame'), [nodes]);

  // Keep GraphEngine in sync with the current graph topology
  useEffect(() => {
    const workflowNodes = nodes.map((n) => n.data.workflowNode);
    const workflowEdges = edges.map((e) => {
      const edge: import('../../../../shared/types.js').ImageXEdge = {
        id: e.id,
        source: e.source,
        target: e.target,
      };
      if (e.sourceHandle != null) edge.sourceHandle = e.sourceHandle;
      if (e.targetHandle != null) edge.targetHandle = e.targetHandle;
      return edge;
    });
    graphEngine.setGraph(workflowNodes, workflowEdges);
  }, [nodes, edges]);

  const edgeReconnectSuccessful = useRef(true);
  const frameDragRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<UiNode, UiEdge> | null>(null);

  // Stable change handlers — write to flowStore only (App subscribes via flowStore)
  const handleNodesChange = useCallback(
    (changes: NodeChange<UiNode>[]) => {
      // Filter: skip position and dimension changes during drag (ReactFlow handles visually)
      // Only process selection and removal changes immediately
      const meaningful = changes.filter((c) => c.type === 'select' || c.type === 'remove');
      if (meaningful.length === 0) return;
      const current = flowStore.getNodes();
      const next = applyNodeChanges(meaningful, current);
      flowStore.setNodes(next);
    },
    []
  );
  const handleEdgesChange = useCallback(
    (changes: EdgeChange<UiEdge>[]) => {
      const current = flowStore.getEdges();
      const next = applyEdgeChanges(changes, current);
      flowStore.setEdges(next);
    },
    []
  );
  const handleConnect = useCallback(
    (connection: Connection) => {
      const currentNodes = flowStore.getNodes();
      const currentEdges = flowStore.getEdges();
      if (!isCompatibleConnection(connection, currentNodes.map((node) => node.data.workflowNode), currentEdges)) return;
      onBeforeChange();
      const source = currentNodes.find((node) => node.id === connection.source);
      const target = currentNodes.find((node) => node.id === connection.target);
      const nextNodes = resetOutputPreviewForTarget(currentNodes, target);
      if (nextNodes !== currentNodes) flowStore.setNodes(nextNodes);
      const nextEdges = addEdge(styleConnection(connection, source, target), currentEdges);
      flowStore.setEdges(nextEdges);
    },
    [onBeforeChange]
  );

  const handleReconnect = useCallback(
    (oldEdge: UiEdge, newConnection: Connection) => {
      if (!newConnection.target || !newConnection.targetHandle) return;
      const currentNodes = flowStore.getNodes();
      const currentEdges = flowStore.getEdges();
      if (!isCompatibleConnection(newConnection, currentNodes.map((node) => node.data.workflowNode), currentEdges)) return;
      onBeforeChange();
      edgeReconnectSuccessful.current = true;
      const source = currentNodes.find((node) => node.id === newConnection.source);
      const target = currentNodes.find((node) => node.id === newConnection.target);
      const nextNodes = resetOutputPreviewForTarget(currentNodes, target);
      if (nextNodes !== currentNodes) flowStore.setNodes(nextNodes);
      const nextEdges = currentEdges.map((edge) =>
        edge.id === oldEdge.id ? { ...styleConnection(newConnection, source, target), id: oldEdge.id } : edge
      );
      flowStore.setEdges(nextEdges);
    },
    [onBeforeChange]
  );
  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);
  const handleReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: UiEdge) => {
      if (!edgeReconnectSuccessful.current) {
        onBeforeChange();
        const nextEdges = flowStore.getEdges().filter((candidate) => candidate.id !== edge.id);
        flowStore.setEdges(nextEdges);
      }
      edgeReconnectSuccessful.current = true;
    },
    [onBeforeChange]
  );

  const memoizedEdgeOptions = useMemo(
    () => ({ type: 'default' as const, reconnectable: true as const, zIndex: 5 }),
    []
  );
  const memoizedFitViewOptions = useMemo(() => ({ padding: 0.2 }), []);
  const memoizedPanOnDrag = useMemo(() => [1, 2] as [number, number], []);
  const handleIsValidConnection = useCallback(
    (connection: Connection | UiEdge) => isCompatibleConnection(connection, flowStore.getNodes().map((node) => node.data.workflowNode), flowStore.getEdges()),
    [],
  );

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
          onFlowReady?.({
            screenToFlowPosition: instance.screenToFlowPosition.bind(instance),
            zoomIn: instance.zoomIn.bind(instance),
            zoomOut: instance.zoomOut.bind(instance),
            fitView: instance.fitView.bind(instance),
          });
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
            if (hasFrames) onNodeDragHoverFrame(node.id, node.position);
            return;
          }
          if (!active || node.id !== active.id) return;
          const delta = { x: node.position.x - active.position.x, y: node.position.y - active.position.y };
          if (delta.x || delta.y) onFrameDrag(node.id, delta);
          frameDragRef.current = { id: node.id, position: node.position };
        }}
        onNodeDragStop={(_, node, nodes) => {
          // Persist final positions to flowStore (we skipped position changes during drag)
          const currentNodes = flowStore.getNodes();
          const updatedNodes = currentNodes.map((n) => {
            const rfNode = nodes.find((rf) => rf.id === n.id);
            return rfNode ? { ...n, position: rfNode.position } : n;
          });
          flowStore.setNodes(updatedNodes);

          frameDragRef.current = null;
          if (node.type !== 'frame') {
            onNodeDragStopCheckFrames(node.id);
            return;
          }
          onCommitFlow();
        }}
        edgesReconnectable
        reconnectRadius={16}
        connectionRadius={40}
        isValidConnection={handleIsValidConnection}
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
          const nextEdges = flowStore.getEdges().filter((candidate) => candidate.id !== edge.id);
          flowStore.setEdges(nextEdges);
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
        maxZoom={2.5}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        panOnDrag={memoizedPanOnDrag}
        connectionLineType={ConnectionLineType.Bezier}
        defaultEdgeOptions={memoizedEdgeOptions}
        elevateNodesOnSelect={false}
        nodeDragThreshold={1}
        onlyRenderVisibleElements
      >
        <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.08)" gap={24} size={1} />
        {showMinimap !== false && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => nodeMeta[node.type as NodeType].accent}
            maskColor="rgba(2, 6, 23, 0.72)"
          />
        )}
        <Controls position="top-left" />
      </ReactFlow>
    </section>
  );
}

function resetOutputPreviewForTarget(nodes: UiNode[], target: UiNode | undefined): UiNode[] {
  if (!target || target.type !== 'codex-output') return nodes;
  const data = target.data.workflowNode.data;
  const hasGeneratedPreview =
    Boolean(data.previewUrl) ||
    (Array.isArray(data.previewUrls) && data.previewUrls.length > 0) ||
    Boolean(data.generation) ||
    Boolean(data.generating);
  if (!hasGeneratedPreview) return nodes;

  return nodes.map((node) => {
    if (node.id !== target.id) return node;
    const {
      previewUrl: _previewUrl,
      previewUrls: _previewUrls,
      previewIndex: _previewIndex,
      generation: _generation,
      generating: _generating,
      ...restData
    } = node.data.workflowNode.data;
    return {
      ...node,
      data: {
        ...node.data,
        workflowNode: {
          ...node.data.workflowNode,
          data: restData,
        },
      },
    };
  });
}

function styleConnection(connection: Connection, source: UiNode | undefined, target: UiNode | undefined): UiEdge {
  const accent = source ? nodeMeta[source.type as NodeType].accent : '#7a7a7a';
  return {
    id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
    source: connection.source || '',
    target: connection.target || '',
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    type: 'default',
    reconnectable: true,
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
