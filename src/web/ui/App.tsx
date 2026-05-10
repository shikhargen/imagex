import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { Box, Component, FileText, Frame, Image, Layers3, MapPin, Palette, UserRound } from 'lucide-react';
import type {
  CustomFieldDefinition,
  CustomFieldKind,
  GenerateWorkflowResponse,
  ImageXAsset,
  ImageXEdge,
  ImageXNode,
  ImageXNodeAsset,
  ImageXProject,
  ImageXProjectSummary,
  ImageXTemplateSummary,
  ImageXWorkflow,
  NodeType,
  OutputNodeResult,
} from '../../shared/types.js';
import { AssetsPanel } from './editor/AssetsPanel.js';
import { FlowEditor } from './editor/FlowEditor.js';
import { InspectorPanel, InspectorToggle } from './editor/InspectorPanel.js';
import { NodesPanel } from './editor/NodesPanel.js';
import { Sidebar } from './editor/Sidebar.js';
import { SidePanel } from './editor/SidePanel.js';
import { TopBar } from './editor/TopBar.js';
import { WorkflowsPanel } from './editor/WorkflowsPanel.js';
import { createUiWorkflowNode, syncFlowToWorkflow, workflowToFlow } from './flow/adapters.js';
import { nodeMeta } from './flow/meta.js';
import type { UiEdge, UiNode } from './flow/types.js';
import {
  attachNodeToFrameAtCenter,
  cloneWorkflow,
  cloneWorkflowNode,
  deleteNodes as deleteWorkflowNodes,
  detachNodesFromFrames,
  disconnectNodes,
  duplicateWorkflowNodes,
  expandSelectionWithFrameMembers,
  frameMembers,
  hoveredFrameForNodeCenter,
  moveFrameMembers,
  refreshConnectedTargetHandles,
  removeFrameOnly as removeFrameOnlyFromWorkflow,
  selectedEdgeIds as graphSelectedEdgeIds,
  selectedNodeIds as graphSelectedNodeIds,
  setHighlightedFrame,
  snapshotsEqual,
  updateNodeWorkflowData,
  wrapFramesAroundMembers,
} from './graph/operations.js';
import { editorShortcuts } from './shortcuts/registry.js';
import { useShortcuts } from './shortcuts/useShortcuts.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';

type AuthStatus = {
  authenticated: boolean;
  provider: 'openai-codex';
  accountId?: string;
};

type EditorSnapshot = {
  workflow: ImageXWorkflow;
  selectedId: string | null;
};

type FloatingMenu =
  | { type: 'node'; nodeId: string; x: number; y: number }
  | { type: 'selection'; x: number; y: number }
  | { type: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | { type: 'workflow'; workflowId: string; x: number; y: number }
  | { type: 'project'; projectId: string; x: number; y: number }
  | null;

type TextDialogState =
  | { type: 'rename-asset'; id: string; title: string; label: string; initialValue: string }
  | { type: 'rename-workflow'; id: string; title: string; label: string; initialValue: string }
  | { type: 'rename-project'; id: string; title: string; label: string; initialValue: string }
  | { type: 'create-node-asset'; id: string; title: string; label: string; initialValue: string }
  | null;

type ConfirmDialogState =
  | { type: 'delete-project'; id: string; title: string; message: string; confirmLabel: string }
  | null;

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [projects, setProjects] = useState<ImageXProjectSummary[]>([]);
  const [templates, setTemplates] = useState<ImageXTemplateSummary[]>([]);
  const [project, setProject] = useState<ImageXProject | null>(null);
  const [workflow, setWorkflow] = useState<ImageXWorkflow | null>(null);
  const [nodes, setNodes] = useState<UiNode[]>([]);
  const [edges, setEdges] = useState<UiEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading workspace...');
  const [outputResults, setOutputResults] = useState<Map<string, OutputNodeResult>>(new Map());
  const [menu, setMenu] = useState<FloatingMenu>(null);
  const [promptOverlay, setPromptOverlay] = useState<{ prompt: string } | null>(null);
  const [assets, setAssets] = useState<ImageXAsset[]>([]);
  const [nodeAssets, setNodeAssets] = useState<ImageXNodeAsset[]>([]);
  const [assetPicker, setAssetPicker] = useState<{ nodeId: string; fieldId: string } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [textDialog, setTextDialog] = useState<TextDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem('imagex.fontScale')) || 1);
  const [historyLimit, setHistoryLimit] = useState(() => clampHistoryLimit(Number(localStorage.getItem('imagex.historyLimit')) || 50));
  const [historyVersion, setHistoryVersion] = useState(0);
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('imagex.rightWidth')) || 340);
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem('imagex.rightOpen') !== 'false');
  const [activeSidePanel, setActiveSidePanel] = useState<string | null>(null);
  const [sidePanelWidth, setSidePanelWidth] = useState(() => Number(localStorage.getItem('imagex.sidePanelWidth')) || 260);
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState('');
  const [activeCustomField, setActiveCustomField] = useState<{ nodeId: string; fieldId: string } | null>(null);
  const activeCustomFieldRef = useRef<{ nodeId: string; fieldId: string } | null>(null);
  const notificationTimer = useRef<number | null>(null);
  const bootstrapped = useRef(false);
  const projectRef = useRef<ImageXProject | null>(null);
  const workflowRef = useRef<ImageXWorkflow | null>(null);
  const nodesRef = useRef<UiNode[]>([]);
  const edgesRef = useRef<UiEdge[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const historyLimitRef = useRef(historyLimit);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const isRestoringHistory = useRef(false);
  const activeEditHistoryKeyRef = useRef<string | null>(null);
  const activeEditHistoryTimerRef = useRef<number | null>(null);
  const frameWrapRafRef = useRef<number | null>(null);
  const [placingNodeId, setPlacingNodeId] = useState<string | null>(null);
  const placingNodeIdRef = useRef<string | null>(null);
  const placingNodeOffsetsRef = useRef<Array<{ id: string; dx: number; dy: number }>>([]);
  const flowApiRef = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
    localStorage.setItem('imagex.fontScale', String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem('imagex.rightOpen', String(rightOpen));
  }, [rightOpen]);

  useEffect(() => {
    localStorage.setItem('imagex.sidePanelWidth', String(sidePanelWidth));
  }, [sidePanelWidth]);

  useEffect(() => {
    localStorage.setItem('imagex.rightWidth', String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    placingNodeIdRef.current = placingNodeId;
  }, [placingNodeId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && placingNodeIdRef.current) {
        placingNodeOffsetsRef.current = [];
        setPlacingNodeId(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      lastMousePosRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const nextLimit = clampHistoryLimit(historyLimit);
    historyLimitRef.current = nextLimit;
    localStorage.setItem('imagex.historyLimit', String(nextLimit));
    if (undoStackRef.current.length > nextLimit) {
      undoStackRef.current = undoStackRef.current.slice(-nextLimit);
      setHistoryVersion((version) => version + 1);
    }
  }, [historyLimit]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname === '/settings') {
        setShowSettings(true);
        return;
      }
      setShowSettings(false);
      const projectId = projectIdFromPath(window.location.pathname);
      if (projectId) {
        void openProject(projectId, { navigate: false });
        return;
      }
      showDashboard({ navigate: false });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/settings') {
      setShowSettings(true);
    }
  }, []);

  useEffect(() => {
    if (!bootstrapped.current || !project || !workflow) return;
    const handle = window.setTimeout(() => {
      const wrapped = wrapFramesAroundMembers(nodes);
      const synced = syncFlowToWorkflow(workflow, wrapped.nodes, edges);
      if (wrapped.changed) {
        nodesRef.current = wrapped.nodes;
        setNodes(wrapped.nodes);
        workflowRef.current = synced;
        setWorkflow(synced);
      }
      setStatus('Autosaving...');
      void fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: synced }),
      })
        .then(() => setStatus('Autosaved'))
        .catch(() => setStatus('Autosave failed'));
    }, 700);
    return () => window.clearTimeout(handle);
  }, [project, workflow, nodes, edges]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedId)?.data.workflowNode || null,
    [nodes, selectedId]
  );

  useShortcuts(editorShortcuts, {
    'toggle-add-node': () => setActiveSidePanel((current) => (current === 'nodes' ? null : 'nodes')),
    'delete-selection': deleteSelection,
    'clear-selection': clearSelection,
    'detach-frame': detachSelectionFromFrames,
    'duplicate-field': duplicateActiveCustomField,
    undo: undo,
    redo: redo,
  });

  async function bootstrap() {
    const [authResponse, projectsResponse, templatesResponse] = await Promise.all([
      fetch('/api/auth/status'),
      fetch('/api/projects'),
      fetch('/api/templates'),
    ]);
    setAuth(await authResponse.json());
    const projectData = (await projectsResponse.json()) as { projects: ImageXProjectSummary[] };
    const templateData = (await templatesResponse.json()) as { templates: ImageXTemplateSummary[] };
    setProjects(projectData.projects);
    setTemplates(templateData.templates);
    bootstrapped.current = true;
    const projectId = projectIdFromPath(window.location.pathname);
    if (projectId) {
      await openProject(projectId, { navigate: false });
    } else {
      setStatus('Dashboard');
    }
  }

  async function refreshProjects() {
    const response = await fetch('/api/projects');
    const data = (await response.json()) as { projects: ImageXProjectSummary[] };
    setProjects(data.projects);
  }

  async function openProject(projectId: string, options: { navigate?: boolean } = {}) {
    setStatus('Opening project...');
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      showDashboard({ navigate: true, replace: true });
      showNotification(body.error || `Project not found: ${projectId}`);
      return;
    }
    const data = (await response.json()) as { project: ImageXProject };
    loadProject(data.project);
    if (options.navigate !== false) pushProjectRoute(data.project);
  }

  async function createProjectFromModal(input: { title: string; description: string; templateId: string }) {
    setStatus('Creating project...');
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      setStatus(body.error || 'Failed to create project');
      return;
    }
    const data = (await response.json()) as { project: ImageXProject };
    setShowNewProject(false);
    await refreshProjects();
    loadProject(data.project);
    pushProjectRoute(data.project);
  }

  async function selectWorkflow(workflowId: string) {
    if (!project || workflow?.id === workflowId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflows/${encodeURIComponent(workflowId)}`);
    if (!response.ok) {
      showNotification('Workflow not found.');
      return;
    }
    const data = (await response.json()) as { project: ImageXProject };
    loadProject(data.project);
  }

  async function createWorkflow() {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled Workflow' }),
    });
    if (!response.ok) {
      showNotification('Failed to create workflow.');
      return;
    }
    const data = (await response.json()) as { project: ImageXProject };
    loadProject(data.project);
  }

  async function deleteWorkflow(workflowId: string) {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflows/${encodeURIComponent(workflowId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Failed to delete workflow.' }));
      showNotification(body.error || 'Failed to delete workflow.');
      return;
    }
    const data = (await response.json()) as { project: ImageXProject };
    loadProject(data.project);
  }

  function loadProject(nextProject: ImageXProject) {
    clearHistory();
    projectRef.current = nextProject;
    setProject(nextProject);
    restoreWorkflowSnapshot(nextProject.workflow, nextProject.workflow.nodes[0]?.id ?? null);
    void refreshAssets(nextProject.metadata.id);
    void refreshNodeAssets(nextProject.metadata.id);
    setSelectedId(Array.isArray(nextProject.workflow.nodes) ? nextProject.workflow.nodes[0]?.id ?? null : null);
    setOutputResults(new Map());
    setStatus('Ready');
  }

  async function refreshAssets(projectId = project?.metadata.id) {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`);
    if (!response.ok) return;
    const data = (await response.json()) as { assets: ImageXAsset[] };
    setAssets(data.assets);
  }

  async function refreshNodeAssets(projectId = project?.metadata.id) {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/node-assets`);
    if (!response.ok) return;
    const data = (await response.json()) as { assets: ImageXNodeAsset[] };
    setNodeAssets(data.assets);
  }

  function closeProject() {
    showDashboard({ navigate: true });
    void refreshProjects();
  }

  function showDashboard(options: { navigate?: boolean; replace?: boolean } = {}) {
    clearHistory();
    setProject(null);
    setWorkflow(null);
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setOutputResults(new Map());
    setMenu(null);
    setPromptOverlay(null);
    setStatus('Dashboard');
    if (options.navigate !== false && window.location.pathname !== '/') {
      if (options.replace) window.history.replaceState({}, '', '/');
      else window.history.pushState({}, '', '/');
    }
  }

  function showNotification(message: string) {
    setNotification(message);
    if (notificationTimer.current) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotification(null), 3800);
  }

  function openSettingsRoute() {
    setShowSettings(true);
    if (window.location.pathname !== '/settings') window.history.pushState({}, '', '/settings');
  }

  function closeSettingsRoute() {
    setShowSettings(false);
    if (window.location.pathname === '/settings') {
      if (project) pushProjectRoute(project);
      else window.history.pushState({}, '', '/');
    }
  }

  function applyWorkflow(nextWorkflow: ImageXWorkflow) {
    restoreWorkflowSnapshot(nextWorkflow, selectedIdRef.current);
  }

  function restoreWorkflowSnapshot(nextWorkflow: ImageXWorkflow, nextSelectedId: string | null) {
    const flow = workflowToFlow(
      nextWorkflow,
      updateNodeData,
      openNodeMenu,
      showCompiledPrompt,
      addCustomField,
      updateCustomFieldValue,
      activateCustomField,
      openAssetPickerForField
    );
    const nextNodes = refreshConnectedTargetHandles(
      flow.nodes.map((node) => ({ ...node, selected: node.id === nextSelectedId })),
      flow.edges
    );
    workflowRef.current = nextWorkflow;
    nodesRef.current = nextNodes;
    edgesRef.current = flow.edges;
    selectedIdRef.current = nextSelectedId;
    setWorkflow(nextWorkflow);
    setNodes(nextNodes);
    setEdges(flow.edges);
    setSelectedId(nextSelectedId);
  }

  function syncLatestWorkflow(nextNodes = nodesRef.current, nextEdges = edgesRef.current) {
    const current = workflowRef.current;
    if (!current) return null;
    const wrapped = wrapFramesAroundMembers(nextNodes);
    if (wrapped.changed) {
      nodesRef.current = wrapped.nodes;
      setNodes(wrapped.nodes);
    }
    return syncFlowToWorkflow(current, wrapped.nodes, nextEdges);
  }

  function commitFlowToWorkflow(nextNodes = nodesRef.current, nextEdges = edgesRef.current) {
    const nextWorkflow = syncLatestWorkflow(nextNodes, nextEdges);
    if (!nextWorkflow) return null;
    workflowRef.current = nextWorkflow;
    setWorkflow(nextWorkflow);
    return nextWorkflow;
  }

  function currentSnapshot(): EditorSnapshot | null {
    const synced = syncLatestWorkflow();
    if (!synced) return null;
    return { workflow: cloneWorkflow(synced), selectedId: selectedIdRef.current };
  }

  function recordHistory() {
    if (isRestoringHistory.current) return;
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    const previous = undoStackRef.current.at(-1);
    if (previous && snapshotsEqual(previous, snapshot)) return;
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-historyLimitRef.current);
    redoStackRef.current = [];
    setHistoryVersion((version) => version + 1);
  }

  function recordEditHistory(key: string) {
    if (activeEditHistoryKeyRef.current !== key) {
      recordHistory();
      activeEditHistoryKeyRef.current = key;
    }
    if (activeEditHistoryTimerRef.current) window.clearTimeout(activeEditHistoryTimerRef.current);
    activeEditHistoryTimerRef.current = window.setTimeout(() => {
      activeEditHistoryKeyRef.current = null;
    }, 900);
  }

  function clearHistory() {
    activeEditHistoryKeyRef.current = null;
    if (activeEditHistoryTimerRef.current) window.clearTimeout(activeEditHistoryTimerRef.current);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setHistoryVersion((version) => version + 1);
  }

  function undo() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;
    const current = currentSnapshot();
    if (current) redoStackRef.current = [...redoStackRef.current, current].slice(-historyLimitRef.current);
    isRestoringHistory.current = true;
    restoreWorkflowSnapshot(cloneWorkflow(snapshot.workflow), snapshot.selectedId);
    isRestoringHistory.current = false;
    setStatus('Undo');
    setHistoryVersion((version) => version + 1);
  }

  function redo() {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return;
    const current = currentSnapshot();
    if (current) undoStackRef.current = [...undoStackRef.current, current].slice(-historyLimitRef.current);
    isRestoringHistory.current = true;
    restoreWorkflowSnapshot(cloneWorkflow(snapshot.workflow), snapshot.selectedId);
    isRestoringHistory.current = false;
    setStatus('Redo');
    setHistoryVersion((version) => version + 1);
  }

  function updateNodeData(nodeId: string, key: string, value: unknown) {
    recordEditHistory(`${nodeId}:${key}`);
    const { nodes: nextNodes } = updateNodeWorkflowData(nodesRef.current, nodeId, { [key]: value });
    const nextWorkflow = syncLatestWorkflow(nextNodes, edgesRef.current);
    nodesRef.current = nextNodes;
    if (nextWorkflow) workflowRef.current = nextWorkflow;
    setNodes(nextNodes);
    if (nextWorkflow) setWorkflow(nextWorkflow);
  }

  function openAssetPickerForField(nodeId: string, fieldId: string) {
    setAssetPicker({ nodeId, fieldId });
    void refreshAssets();
  }

  function openAssetLibrary() {
    setActiveSidePanel((current) => (current === 'assets' ? null : 'assets'));
    void refreshAssets();
    void refreshNodeAssets();
  }

  function selectAssetForField(asset: ImageXAsset) {
    if (!assetPicker) return;
    recordHistory();
    const { nodeId, fieldId } = assetPicker;
    const { nodes: nextNodes } = updateNodeWorkflowData(nodesRef.current, nodeId, {
      [fieldId]: asset.file,
      assetId: asset.id,
      assetUrl: asset.url,
      assetName: asset.name,
    });
    const nextWorkflow = syncLatestWorkflow(nextNodes, edgesRef.current);
    nodesRef.current = nextNodes;
    if (nextWorkflow) workflowRef.current = nextWorkflow;
    setNodes(nextNodes);
    if (nextWorkflow) setWorkflow(nextWorkflow);
    setAssetPicker(null);
  }

  async function importAssets(files: FileList | null) {
    if (!project || !files?.length) return;
    let nextAssets = assets;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataBase64 = await fileToBase64(file);
      const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type, dataBase64 }),
      });
      if (response.ok) {
        const data = (await response.json()) as { assets: ImageXAsset[] };
        nextAssets = data.assets;
      }
    }
    setAssets(nextAssets);
  }

  function renameAsset(assetId: string) {
    const asset = assets.find((candidate) => candidate.id === assetId);
    setTextDialog({
      type: 'rename-asset',
      id: assetId,
      title: 'Rename asset',
      label: 'Name',
      initialValue: asset?.name || 'Asset',
    });
  }

  async function submitRenameAsset(assetId: string, name: string) {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (response.ok) setAssets(((await response.json()) as { assets: ImageXAsset[] }).assets);
  }

  async function deleteAsset(assetId: string) {
    if (!project) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
    if (response.ok) setAssets(((await response.json()) as { assets: ImageXAsset[] }).assets);
  }

  function addCustomField(nodeId: string, preset: string) {
    const field = createCustomFieldDefinition(preset as CustomFieldKind);
    setActiveFieldRef({ nodeId, fieldId: field.id });
    updateCustomFields(nodeId, (fields) => [...fields, field]);
  }

  function updateCustomFieldValue(nodeId: string, fieldId: string, value: unknown) {
    updateCustomFields(nodeId, (fields) =>
      fields.map((field) => (field.id === fieldId ? { ...field, value: normalizeCustomFieldValue(value) } : field))
    );
  }

  function duplicateActiveCustomField() {
    if (selectedNodeIds().length > 0 || selectedIdRef.current) {
      duplicateSelection();
      return;
    }
    const active = activeCustomFieldRef.current || activeCustomField;
    if (!active) {
      duplicateSelection();
      return;
    }
    duplicateCustomField(active.nodeId, active.fieldId);
  }

  function clearSelection() {
    setMenu(null);
    setSelectedId(null);
    selectedIdRef.current = null;
    const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: false }));
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: false }));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    setNodes(nextNodes);
    setEdges(nextEdges);
  }

  function duplicateCustomField(nodeId: string, fieldId: string) {
    updateCustomFields(nodeId, (fields) => {
      const index = fields.findIndex((field) => field.id === fieldId);
      if (index === -1) return fields;
      const source = fields[index]!;
      const copy: CustomFieldDefinition = {
        ...source,
        id: `field-${crypto.randomUUID().slice(0, 8)}`,
        label: `${source.label} Copy`,
      };
      setActiveFieldRef({ nodeId, fieldId: copy.id });
      return [...fields.slice(0, index + 1), copy, ...fields.slice(index + 1)];
    });
  }

  function activateCustomField(nodeId: string, fieldId: string) {
    setActiveFieldRef({ nodeId, fieldId });
  }

  function setActiveFieldRef(active: { nodeId: string; fieldId: string }) {
    activeCustomFieldRef.current = active;
    setActiveCustomField(active);
  }

  function updateCustomFields(nodeId: string, updater: (fields: CustomFieldDefinition[]) => CustomFieldDefinition[]) {
    recordEditHistory(`custom-fields:${nodeId}`);
    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== nodeId) return node;
      const fields = Array.isArray(node.data.workflowNode.data.fields)
        ? (node.data.workflowNode.data.fields as CustomFieldDefinition[])
        : [];
      const workflowNode = {
        ...node.data.workflowNode,
        data: { ...node.data.workflowNode.data, fields: updater(fields) },
      };
      return { ...node, data: { ...node.data, workflowNode } };
    });
    const nextWorkflow = syncLatestWorkflow(nextNodes, edgesRef.current);
    const nextEdges = edgesRef.current;
    const nextConnectedNodes = refreshConnectedTargetHandles(nextNodes, nextEdges);
    nodesRef.current = nextConnectedNodes;
    if (nextWorkflow) workflowRef.current = nextWorkflow;
    setNodes(nextConnectedNodes);
    if (nextWorkflow) setWorkflow(nextWorkflow);
  }

  function updateFlowNodes(nextNodes: UiNode[]) {
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }

  function updateFlowEdges(nextEdges: UiEdge[]) {
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
    const nextNodes = refreshConnectedTargetHandles(nodesRef.current, nextEdges);
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    const nextWorkflow = syncLatestWorkflow(nextNodes, nextEdges);
    if (nextWorkflow) {
      workflowRef.current = nextWorkflow;
      setWorkflow(nextWorkflow);
    }
  }

  function openNodeMenu(nodeId: string, position: { x: number; y: number }) {
    selectedIdRef.current = nodeId;
    setSelectedId(nodeId);
    const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: node.id === nodeId }));
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    setMenu({ type: 'node', nodeId, x: position.x, y: position.y });
  }

  function handleSelectionChange(nodeIds: string[], edgeIds: string[]) {
    selectedIdRef.current = nodeIds.length === 1 ? nodeIds[0]! : null;
    setSelectedId(nodeIds.length === 1 ? nodeIds[0]! : null);
    const nodeSet = new Set(nodeIds);
    const edgeSet = new Set(edgeIds);
    const nextNodes = nodesRef.current.map((node) => ({ ...node, selected: nodeSet.has(node.id) }));
    const nextEdges = edgesRef.current.map((edge) => ({ ...edge, selected: edgeSet.has(edge.id) }));
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
  }

  function handleMenuAction(action: string, menuState: Exclude<FloatingMenu, null>) {
    setMenu(null);
    if (menuState.type === 'node') {
      if (action === 'duplicate') duplicateNode(menuState.nodeId);
      if (action === 'create-asset') openCreateNodeAssetDialog(menuState.nodeId);
      if (action === 'delete') deleteNode(menuState.nodeId);
      if (action === 'disconnect') disconnectNode(menuState.nodeId);
      if (action === 'remove-frame') removeFrameOnly(menuState.nodeId);
      if (action === 'detach-frame') detachNodeFromFrame(menuState.nodeId);
      return;
    }
    if (menuState.type === 'selection') {
      if (action === 'duplicate') duplicateSelection();
      if (action === 'delete') deleteSelection();
      if (action === 'disconnect') disconnectSelection();
      if (action === 'detach-frame') detachSelectionFromFrames();
      return;
    }
    if (menuState.type === 'pane') {
      if (action.startsWith('add:')) addNode(action.slice(4) as NodeType, { x: menuState.flowX, y: menuState.flowY });
      return;
    }
    if (menuState.type === 'workflow') {
      if (action === 'rename') renameWorkflowFromMenu(menuState.workflowId);
      if (action === 'delete') deleteWorkflow(menuState.workflowId);
      return;
    }
    if (menuState.type === 'project') {
      if (action === 'open') void openProject(menuState.projectId);
      if (action === 'rename') renameProjectFromMenu(menuState.projectId);
      if (action === 'delete') void deleteProjectFromMenu(menuState.projectId);
    }
  }

  function selectedNodeIds(): string[] {
    return graphSelectedNodeIds(nodesRef.current);
  }

  function selectedEdgeIds(): string[] {
    return graphSelectedEdgeIds(edgesRef.current);
  }

  function expandFrameSelection(selected: Set<string>): Set<string> {
    return expandSelectionWithFrameMembers(selected, nodesRef.current);
  }

  function renameWorkflowFromMenu(workflowId: string) {
    if (!project) return;
    const entry = project.metadata.workflows?.find((candidate) => candidate.id === workflowId);
    setTextDialog({
      type: 'rename-workflow',
      id: workflowId,
      title: 'Rename workflow',
      label: 'Name',
      initialValue: entry?.title || workflow?.name || 'Untitled Workflow',
    });
  }

  async function submitRenameWorkflow(workflowId: string, name: string) {
    if (!project) return;
    if (workflow?.id === workflowId) {
      renameWorkflow(name);
      return;
    }
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflows/${encodeURIComponent(workflowId)}`);
    if (!response.ok) return;
    const data = (await response.json()) as { project: ImageXProject };
    const renamed = { ...data.project.workflow, name };
    const saveResponse = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: renamed }),
    });
    if (saveResponse.ok) {
      const saved = (await saveResponse.json()) as { project: ImageXProject };
      setProject((current) => (current ? { ...current, metadata: saved.project.metadata } : current));
    }
  }

  function renameProjectFromMenu(projectId: string) {
    const item = projects.find((candidate) => candidate.id === projectId);
    setTextDialog({
      type: 'rename-project',
      id: projectId,
      title: 'Rename project',
      label: 'Name',
      initialValue: item?.title || 'Untitled Project',
    });
  }

  async function submitRenameProject(projectId: string, name: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name }),
    });
    if (response.ok) {
      const data = (await response.json()) as { project: ImageXProject };
      await refreshProjects();
      if (project?.metadata.id === projectId) {
        setProject(data.project);
      }
    }
  }

  function deleteProjectFromMenu(projectId: string) {
    const item = projects.find((candidate) => candidate.id === projectId);
    setConfirmDialog({
      type: 'delete-project',
      id: projectId,
      title: 'Delete project',
      message: `Delete "${item?.title || 'this project'}" and all of its files? This cannot be undone.`,
      confirmLabel: 'Delete Project',
    });
  }

  async function submitDeleteProject(projectId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    if (response.ok) {
      if (project?.metadata.id === projectId) showDashboard({ navigate: true });
      await refreshProjects();
    }
  }

  function openCreateNodeAssetDialog(nodeId: string) {
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId)?.data.workflowNode;
    if (!node || node.type === 'frame') return;
    const meta = nodeMeta[node.type];
    const defaultName =
      (typeof node.data.name === 'string' && node.data.name.trim()) ||
      (typeof node.data.title === 'string' && node.data.title.trim()) ||
      meta.label;
    setTextDialog({
      type: 'create-node-asset',
      id: nodeId,
      title: 'Create node asset',
      label: 'Name',
      initialValue: defaultName,
    });
  }

  async function createNodeAssetFromNode(nodeId: string, name: string) {
    if (!project) return;
    const payload = nodeAssetPayload(nodeId);
    if (!payload) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/node-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...payload }),
    });
    if (response.ok) {
      const data = (await response.json()) as { assets: ImageXNodeAsset[] };
      setNodeAssets(data.assets);
      setActiveSidePanel('assets');
    }
  }

  function nodeAssetPayload(rootNodeId: string): { rootNodeId: string; nodes: ImageXNode[]; edges: ImageXEdge[] } | null {
    const root = nodesRef.current.find((node) => node.id === rootNodeId);
    if (!root) return null;
    const included = new Set<string>([rootNodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edgesRef.current) {
        if (!edge.target || !edge.source) continue;
        if (included.has(edge.target) && !included.has(edge.source)) {
          included.add(edge.source);
          changed = true;
        }
      }
    }
    const nodes = nodesRef.current
      .filter((node) => included.has(node.id))
      .map((node) => cloneWorkflowNode(node.data.workflowNode));
    const edges = edgesRef.current
      .filter((edge) => included.has(edge.source) && included.has(edge.target))
      .map((edge) => {
        const nextEdge: ImageXEdge = { id: edge.id, source: edge.source, target: edge.target };
        if (edge.sourceHandle) nextEdge.sourceHandle = edge.sourceHandle;
        if (edge.targetHandle) nextEdge.targetHandle = edge.targetHandle;
        return nextEdge;
      });
    return { rootNodeId, nodes, edges };
  }

  function renameWorkflow(name: string) {
    if (!workflow) return;
    recordHistory();
    const nextWorkflow = { ...(syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current)), name };
    workflowRef.current = nextWorkflow;
    setWorkflow(nextWorkflow);
  }

  function addNode(type: Parameters<typeof createUiWorkflowNode>[0], position?: { x: number; y: number }) {
    if (!workflow) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current);
    const center = flowApiRef.current?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const nextNode = createUiWorkflowNode(
      type,
      position || center || {
        x: 160 + currentWithLayout.nodes.length * 28,
        y: 140 + currentWithLayout.nodes.length * 34,
      }
    );
    const nextWorkflow = {
      ...currentWithLayout,
      nodes: [...currentWithLayout.nodes, nextNode],
    };
    selectedIdRef.current = nextNode.id;
    placingNodeOffsetsRef.current = [{ id: nextNode.id, dx: 0, dy: 0 }];
    applyWorkflow(nextWorkflow);
    setSelectedId(nextNode.id);
    setPlacingNodeId(nextNode.id);
    setActiveSidePanel(null);
  }

  function addWorkflowNodesForPlacement(newNodes: ImageXNode[], newEdges: ImageXEdge[], rootNodeId: string) {
    if (!workflow || newNodes.length === 0) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current);
    const nextWorkflow = {
      ...currentWithLayout,
      nodes: [...currentWithLayout.nodes, ...newNodes],
      edges: [...currentWithLayout.edges, ...newEdges],
    };
    selectedIdRef.current = rootNodeId;
    const root = newNodes.find((node) => node.id === rootNodeId) || newNodes[0]!;
    placingNodeOffsetsRef.current = newNodes.map((node) => ({
      id: node.id,
      dx: node.position.x - root.position.x,
      dy: node.position.y - root.position.y,
    }));
    applyWorkflow(nextWorkflow);
    setSelectedId(rootNodeId);
    setPlacingNodeId(rootNodeId);
    setActiveSidePanel(null);
  }

  function addImageAssetNode(asset: ImageXAsset) {
    const position = flowApiRef.current?.screenToFlowPosition(lastMousePosRef.current) || { x: 160, y: 140 };
    const node = createUiWorkflowNode('imageInput', position);
    node.data = {
      ...node.data,
      path: asset.file,
      assetId: asset.id,
      assetUrl: asset.url,
      assetName: asset.name,
    };
    addWorkflowNodesForPlacement([node], [], node.id);
    setActiveSidePanel(null);
  }

  function addNodeAsset(asset: ImageXNodeAsset) {
    const root = asset.nodes.find((node) => node.id === asset.rootNodeId) || asset.nodes[0];
    if (!root) return;
    const idMap = new Map(asset.nodes.map((node) => [node.id, `${node.type}-${crypto.randomUUID().slice(0, 8)}`]));
    const rootNewId = idMap.get(root.id)!;
    const rootPosition = flowApiRef.current?.screenToFlowPosition(lastMousePosRef.current) || root.position;
    const offset = { x: rootPosition.x - root.position.x, y: rootPosition.y - root.position.y };
    const newNodes = asset.nodes.map((node) => {
      const copy = cloneWorkflowNode(node);
      copy.id = idMap.get(node.id)!;
      copy.position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
      if (typeof copy.data.frameId === 'string' && idMap.has(copy.data.frameId)) copy.data.frameId = idMap.get(copy.data.frameId);
      return copy;
    });
    const newEdges = asset.edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => {
        const nextEdge: ImageXEdge = {
          id: `${idMap.get(edge.source)}-${edge.sourceHandle || 'out'}-${idMap.get(edge.target)}-${edge.targetHandle || 'in'}`,
          source: idMap.get(edge.source)!,
          target: idMap.get(edge.target)!,
        };
        if (edge.sourceHandle) nextEdge.sourceHandle = edge.sourceHandle;
        if (edge.targetHandle) nextEdge.targetHandle = edge.targetHandle;
        return nextEdge;
      });
    addWorkflowNodesForPlacement(newNodes, newEdges, rootNewId);
    setActiveSidePanel(null);
  }

  function handlePlacingMove(nodeId: string, position: { x: number; y: number }) {
    const current = nodesRef.current;
    const offsets = placingNodeOffsetsRef.current.length
      ? placingNodeOffsetsRef.current
      : [{ id: nodeId, dx: 0, dy: 0 }];
    const positions = new Map(offsets.map((item) => [item.id, { x: position.x + item.dx, y: position.y + item.dy }]));
    const next = current.map((node) => {
      const nextPosition = positions.get(node.id);
      return nextPosition ? { ...node, position: nextPosition } : node;
    });
    nodesRef.current = next;
    setNodes(next);
  }

  function handlePlacingDrop() {
    const id = placingNodeIdRef.current;
    if (!id) return;
    placingNodeOffsetsRef.current = [];
    setPlacingNodeId(null);
    commitFlowToWorkflow();
  }

  function deleteNode(nodeId: string) {
    if (!workflow) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || workflow;
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
    const idsToDelete =
      node?.type === 'frame'
        ? new Set([nodeId, ...frameMembers(nodeId, nodesRef.current).map((inside) => inside.id)])
        : new Set([nodeId]);
    const nextWorkflow = deleteWorkflowNodes(currentWithLayout, idsToDelete);
    setMenu(null);
    setSelectedId(null);
    applyWorkflow(nextWorkflow);
  }

  function removeFrameOnly(nodeId: string) {
    if (!workflow) return;
    const node = nodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!node || node.type !== 'frame') return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || workflow;
    setMenu(null);
    setSelectedId(null);
    applyWorkflow(removeFrameOnlyFromWorkflow(currentWithLayout, nodeId));
  }

  function deleteSelection() {
    if (!workflow) return;
    const selectedNodes = expandFrameSelection(new Set(selectedNodeIds()));
    const selectedEdges = new Set(selectedEdgeIds());
    if (selectedNodes.size === 1 && selectedEdges.size === 0) {
      deleteNode([...selectedNodes][0]!);
      return;
    }
    if (selectedNodes.size === 0 && selectedEdges.size === 0) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current);
    applyWorkflow(deleteWorkflowNodes(currentWithLayout, selectedNodes, selectedEdges));
  }

  function disconnectSelection() {
    if (!workflow) return;
    const selectedNodes = expandFrameSelection(new Set(selectedNodeIds()));
    if (!selectedNodes.size) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current);
    applyWorkflow(disconnectNodes(currentWithLayout, selectedNodes));
  }

  function detachSelectionFromFrames() {
    const ids = new Set(selectedNodeIds());
    if (ids.size === 0 && selectedIdRef.current) ids.add(selectedIdRef.current);
    detachNodesFromFrameIds(ids);
  }

  function detachNodeFromFrame(nodeId: string) {
    detachNodesFromFrameIds(new Set([nodeId]));
  }

  function detachNodesFromFrameIds(nodeIds: Set<string>) {
    if (!workflow || nodeIds.size === 0) return;
    const result = detachNodesFromFrames(nodesRef.current, nodeIds);
    if (!result.changed) return;
    recordHistory();
    updateFlowNodesAndCommit(result.nodes, false);
  }

  function duplicateNode(nodeId: string) {
    if (!workflow) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || workflow;
    const node = currentWithLayout.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    if (node.type === 'frame') {
      const selected = new Set([nodeId, ...frameMembers(nodeId, nodesRef.current).map((inside) => inside.id)]);
      const duplicated = duplicateWorkflowNodes(currentWithLayout, selected, 48);
      applyWorkflow(duplicated.workflow);
      return;
    }
    const duplicated = duplicateWorkflowNodes(currentWithLayout, new Set([nodeId]), 36);
    const copyId = duplicated.copyIds[0] ?? null;
    const underCursor = flowApiRef.current?.screenToFlowPosition(lastMousePosRef.current);
    if (underCursor && copyId) {
      const copy = duplicated.workflow.nodes.find((n) => n.id === copyId);
      if (copy) copy.position = underCursor;
    }
    setMenu(null);
    selectedIdRef.current = copyId;
    setSelectedId(copyId);
    setPlacingNodeId(copyId);
    applyWorkflow(duplicated.workflow);
  }

  function duplicateSelection() {
    if (!workflow) return;
    const ids = [...expandFrameSelection(new Set(selectedNodeIds()))];
    if (ids.length === 0 && selectedIdRef.current) ids.push(selectedIdRef.current);
    if (ids.length === 0) return;
    if (ids.length === 1) {
      duplicateNode(ids[0]!);
      return;
    }
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || workflow;
    const duplicated = duplicateWorkflowNodes(currentWithLayout, new Set(ids), 44);
    applyWorkflow(duplicated.workflow);
    const copyIds = new Set(duplicated.copyIds);
    setNodes((current) => {
      const next = current.map((node) => ({ ...node, selected: copyIds.has(node.id) }));
      nodesRef.current = next;
      return next;
    });
  }

  function disconnectNode(nodeId: string) {
    if (!workflow) return;
    recordHistory();
    const currentWithLayout = syncLatestWorkflow() || syncFlowToWorkflow(workflow, nodesRef.current, edgesRef.current);
    setMenu(null);
    applyWorkflow(disconnectNodes(currentWithLayout, new Set([nodeId])));
  }

  function moveFrameContents(frameId: string, delta: { x: number; y: number }) {
    const moved = moveFrameMembers(nodesRef.current, frameId, delta);
    if (!moved.changed) return;
    updateFlowNodes(moved.nodes);
  }

  function expandFramesForNode(nodeId: string) {
    if (frameWrapRafRef.current) {
      window.cancelAnimationFrame(frameWrapRafRef.current);
      frameWrapRafRef.current = null;
    }
    const attached = attachNodeToFrameAtCenter(nodesRef.current, nodeId);
    const cleared = setHighlightedFrame(attached.nodes, null);
    const wrapped = wrapFramesAroundMembers(cleared);
    const nextNodes = wrapped.nodes;
    if (attached.changed || wrapped.changed) updateFlowNodesAndCommit(nextNodes, false);
    else {
      updateFlowNodes(cleared);
      commitFlowToWorkflow(cleared, edgesRef.current);
    }
  }

  function handleNodeDragFrameState(nodeId: string, position: { x: number; y: number }) {
    const current = nodesRef.current;
    const withPosition = current.map((node) => (node.id === nodeId ? { ...node, position } : node));
    const dragged = withPosition.find((node) => node.id === nodeId);
    const frameId = hoveredFrameForNodeCenter(withPosition, nodeId);
    const highlighted = setHighlightedFrame(withPosition, frameId);
    const memberFrameId = typeof dragged?.data.workflowNode.data.frameId === 'string' ? dragged.data.workflowNode.data.frameId : null;
    if (!memberFrameId) {
      if (highlighted !== current) updateFlowNodes(highlighted);
      return;
    }
    if (frameWrapRafRef.current) window.cancelAnimationFrame(frameWrapRafRef.current);
    frameWrapRafRef.current = window.requestAnimationFrame(() => {
      frameWrapRafRef.current = null;
      const wrapped = wrapFramesAroundMembers(highlighted, new Set([memberFrameId]));
      updateFlowNodes(wrapped.nodes);
    });
  }

  function updateFlowNodesAndCommit(nextNodes: UiNode[], shouldRecordHistory = true) {
    if (shouldRecordHistory) recordHistory();
    updateFlowNodes(nextNodes);
    commitFlowToWorkflow(nextNodes, edgesRef.current);
  }

  async function runWorkflow() {
    if (!workflow || !project) return;
    setStatus('Generating...');

    const nextWorkflow = syncFlowToWorkflow(workflow, nodes, edges);
    setWorkflow(nextWorkflow);

    const response = await fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: nextWorkflow }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: response.statusText }));
      setStatus(body.error || 'Generation failed');
      return;
    }

    const data = (await response.json()) as GenerateWorkflowResponse;
    const newResults = new Map<string, OutputNodeResult>();
    let totalImages = 0;
    for (const r of data.results) {
      newResults.set(r.outputNodeId, r);
      totalImages += r.images.length;
    }
    setOutputResults(newResults);
    setStatus(`Generated ${totalImages} image${totalImages === 1 ? '' : 's'}`);

    const withPreviews = {
      ...nextWorkflow,
      nodes: nextWorkflow.nodes.map((node) => {
        if (node.type !== 'output') return node;
        const result = newResults.get(node.id);
        const previewUrl = result?.images[0]?.url;
        return previewUrl ? { ...node, data: { ...node.data, previewUrl } } : node;
      }),
    };
    applyWorkflow(withPreviews);
    void fetch(`/api/projects/${encodeURIComponent(project.metadata.id)}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: withPreviews }),
    });
  }

  async function showCompiledPrompt(nodeId?: string) {
    const currentProject = projectRef.current;
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow || !currentProject) {
      setStatus('Open a project before compiling the prompt');
      return;
    }
    try {
      const nextWorkflow = syncFlowToWorkflow(currentWorkflow, nodesRef.current, edgesRef.current);
      const response = await fetch(`/api/projects/${encodeURIComponent(currentProject.metadata.id)}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: nextWorkflow, outputNodeId: nodeId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        setStatus(body.error || 'Failed to compile prompt');
        return;
      }
      const data = (await response.json()) as { prompt?: string };
      const prompt = data.prompt ?? '';
      setPromptOverlay({ prompt });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to compile prompt');
    }
  }

  async function submitTextDialog(value: string) {
    if (!textDialog) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const dialog = textDialog;
    setTextDialog(null);
    if (dialog.type === 'rename-asset') await submitRenameAsset(dialog.id, trimmed);
    if (dialog.type === 'rename-workflow') await submitRenameWorkflow(dialog.id, trimmed);
    if (dialog.type === 'rename-project') await submitRenameProject(dialog.id, trimmed);
    if (dialog.type === 'create-node-asset') await createNodeAssetFromNode(dialog.id, trimmed);
  }

  async function submitConfirmDialog() {
    if (!confirmDialog) return;
    const dialog = confirmDialog;
    setConfirmDialog(null);
    if (dialog.type === 'delete-project') await submitDeleteProject(dialog.id);
  }

  const appDialogs = (
    <>
      {textDialog && (
        <TextInputDialog
          title={textDialog.title}
          label={textDialog.label}
          initialValue={textDialog.initialValue}
          onCancel={() => setTextDialog(null)}
          onSubmit={(value) => {
            void submitTextDialog(value);
          }}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => {
            void submitConfirmDialog();
          }}
        />
      )}
    </>
  );

  if (!project || !workflow) {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-header">
          <div>
            <span className="brand dashboard-brand">
              <span className="brand-mark">X</span>
              imagex
            </span>
            <h1>Projects</h1>
            <p>Open a recent imagex project or create a new folder-backed project.</p>
          </div>
          <Button onClick={() => setShowNewProject(true)}>
            New Project
          </Button>
        </section>
        <section className="project-grid">
          {projects.map((item) => (
            <button
              key={item.id}
              className="project-card shadcn-card-button"
              onClick={() => openProject(item.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ type: 'project', projectId: item.id, x: event.clientX, y: event.clientY });
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.description || 'No description'}</span>
              <small>{item.path}</small>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="empty-dashboard">
              <strong>No projects yet</strong>
              <span>Create a project from scratch or start from a workflow template.</span>
            </div>
          )}
        </section>
        {showNewProject && (
          <NewProjectModal
            templates={templates}
            onCreate={createProjectFromModal}
            onClose={() => setShowNewProject(false)}
          />
        )}
        {appDialogs}
        {notification && <BottomNotification message={notification} onClose={() => setNotification(null)} />}
        {menu && <FloatingContextMenu menu={menu} isFrame={false} canDetach={false} onClose={() => setMenu(null)} onAction={handleMenuAction} />}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TopBar
        workflows={projectWorkflows(project)}
        activeWorkflowId={workflow.id}
        onSelectWorkflow={selectWorkflow}
        onCreateWorkflow={createWorkflow}
        onRun={runWorkflow}
        onCloseProject={closeProject}
        status={status}
        canRun={Boolean(workflow)}
      />
      <div
        className={`app-body ${activeSidePanel ? 'side-panel-open' : ''} ${rightOpen ? '' : 'right-collapsed'}`}
        style={
          {
            '--side-panel': `${activeSidePanel ? sidePanelWidth : 0}px`,
            '--right-panel': `${rightOpen ? rightWidth : 52}px`,
          } as CSSProperties
        }
      >
        <Sidebar
          activePanel={activeSidePanel}
          onOpenPanel={(id) => setActiveSidePanel((current) => (current === id ? null : id))}
          onOpenModal={(id) => {
            if (id === 'settings') openSettingsRoute();
            if (id === 'shortcuts') setShowShortcuts(true);
          }}
        />
        {activeSidePanel && (
          <>
            <SidePanel onClose={() => setActiveSidePanel(null)}>
              {activeSidePanel === 'workflows' && (
                <WorkflowsPanel
                  workflows={projectWorkflows(project)}
                  activeWorkflowId={workflow.id}
                  onSelect={selectWorkflow}
                  onCreate={createWorkflow}
                  onMenu={(workflowId, position) => setMenu({ type: 'workflow', workflowId, x: position.x, y: position.y })}
                  searchQuery={workflowSearchQuery}
                  onSearch={setWorkflowSearchQuery}
                />
              )}
              {activeSidePanel === 'nodes' && <NodesPanel onAdd={addNode} />}
              {activeSidePanel === 'assets' && workflow && (
                <AssetsPanel
                  assets={assets}
                  nodeAssets={nodeAssets}
                  onImport={importAssets}
                  onAddImageAsset={addImageAssetNode}
                  onAddNodeAsset={addNodeAsset}
                  onRename={renameAsset}
                  onDelete={deleteAsset}
                />
              )}
            </SidePanel>
            <ResizeHandle side="left" onResize={setSidePanelWidth} min={200} max={400} />
          </>
        )}
        <section className="workspace">
          <FlowEditor
            nodes={nodes}
            edges={edges}
            onNodesChange={updateFlowNodes}
            onEdgesChange={updateFlowEdges}
            onSelectNode={setSelectedId}
            onNodeMenu={openNodeMenu}
            onBeforeChange={recordHistory}
            onPaneMenu={(position, flowPosition) => setMenu({ type: 'pane', x: position.x, y: position.y, flowX: flowPosition.x, flowY: flowPosition.y })}
            onSelectionMenu={(position) => setMenu({ type: 'selection', x: position.x, y: position.y })}
            onSelectionChangeIds={handleSelectionChange}
            onFrameDrag={moveFrameContents}
            onNodeDragHoverFrame={handleNodeDragFrameState}
            onNodeDragStopCheckFrames={expandFramesForNode}
            onPaneClickClear={clearSelection}
            onCommitFlow={() => commitFlowToWorkflow()}
            onFlowReady={(api) => { flowApiRef.current = api; }}
            placingNodeId={placingNodeId}
            onPlacingMove={handlePlacingMove}
            onPlacingDrop={handlePlacingDrop}
          />
        </section>
        {rightOpen && <ResizeHandle side="right" onResize={setRightWidth} min={280} max={520} />}
        {rightOpen ? (
          <InspectorPanel node={selectedNode} onChange={updateNodeData} outputResults={outputResults} onClose={() => setRightOpen(false)} />
        ) : (
          <InspectorToggle onOpen={() => setRightOpen(true)} />
        )}
      </div>
      {menu && (
        <FloatingContextMenu
          menu={menu}
          isFrame={menu.type === 'node' && nodes.some((node) => node.id === menu.nodeId && node.type === 'frame')}
          canDetach={
            menu.type === 'selection'
              ? selectedNodeIds().some((id) => nodes.some((node) => node.id === id && typeof node.data.workflowNode.data.frameId === 'string'))
              : menu.type === 'node' &&
                nodes.some((node) => node.id === menu.nodeId && typeof node.data.workflowNode.data.frameId === 'string')
          }
          onClose={() => setMenu(null)}
          onAction={handleMenuAction}
        />
      )}
      {showSettings && (
        <SettingsModal
          auth={auth}
          fontScale={fontScale}
          onFontScale={setFontScale}
          historyLimit={historyLimit}
          onHistoryLimit={setHistoryLimit}
          undoCount={undoStackRef.current.length}
          redoCount={redoStackRef.current.length}
          onClose={() => closeSettingsRoute()}
        />
      )}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {assetPicker && (
        <AssetsModal
          assets={assets}
          onImport={importAssets}
          onSelect={selectAssetForField}
          onRename={renameAsset}
          onDelete={deleteAsset}
          onClose={() => setAssetPicker(null)}
        />
      )}

      {appDialogs}
      {promptOverlay && <PromptOverlay prompt={promptOverlay.prompt} onClose={() => setPromptOverlay(null)} />}
      {notification && <BottomNotification message={notification} onClose={() => setNotification(null)} />}
    </main>
  );
}

function normalizeCustomFieldValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return value === undefined || value === null ? '' : String(value);
}

function createCustomFieldDefinition(kind: CustomFieldKind): CustomFieldDefinition {
  const id = `field-${crypto.randomUUID().slice(0, 8)}`;
  switch (kind) {
    case 'textarea':
      return { id, label: 'Long Text', kind, value: '' };
    case 'select':
      return { id, label: 'Selector', kind, value: 'option 1', options: ['option 1', 'option 2'] };
    case 'slider':
      return { id, label: 'Slider', kind, value: 0.5, min: 0, max: 1, step: 0.05 };
    case 'number':
      return { id, label: 'Number', kind, value: 0 };
    case 'toggle':
      return { id, label: 'Toggle', kind, value: false };
    case 'inputSocket':
      return { id, label: 'Input', kind };
    case 'outputSocket':
      return { id, label: 'Output', kind };
    case 'text':
    default:
      return { id, label: 'Text', kind: 'text', value: '' };
  }
}

function ResizeHandle({
  side,
  onResize,
  min,
  max,
}: {
  side: 'left' | 'right';
  onResize: (width: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div
      className={`resize-handle ${side}`}
      onMouseDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const panel = side === 'left' ? event.currentTarget.previousElementSibling : event.currentTarget.nextElementSibling;
        const startWidth = panel?.getBoundingClientRect().width || min;
        const onMove = (moveEvent: MouseEvent) => {
          const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
          onResize(Math.max(min, Math.min(max, startWidth + delta)));
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    />
  );
}

function FloatingContextMenu({
  menu,
  isFrame,
  canDetach,
  onClose,
  onAction,
}: {
  menu: Exclude<FloatingMenu, null>;
  isFrame: boolean;
  canDetach: boolean;
  onClose: () => void;
  onAction: (action: string, menu: Exclude<FloatingMenu, null>) => void;
}) {
  const actions: Array<[string, string]> =
    menu.type === 'pane'
      ? [
          ['add:text', 'Add Text Node'],
          ['add:imageInput', 'Add Image Input'],
          ['add:character', 'Add Character'],
          ['add:style', 'Add Style'],
          ['add:scene', 'Add Scene'],
          ['add:output', 'Add Output'],
          ['add:frame', 'Add Frame'],
          ['add:custom', 'Add Custom Node'],
        ]
      : menu.type === 'workflow'
        ? [
            ['rename', 'Rename'],
            ['delete', 'Delete'],
          ]
        : menu.type === 'project'
          ? [
              ['open', 'Open'],
              ['rename', 'Rename'],
              ['delete', 'Delete'],
            ]
          : [
              ['duplicate', 'Duplicate'],
              ...(isFrame ? [] : ([['create-asset', 'Create asset']] as Array<[string, string]>)),
              ...(canDetach ? ([['detach-frame', 'Detach from frame']] as Array<[string, string]>) : []),
              ['disconnect', 'Disconnect all edges'],
              ...(isFrame ? ([['remove-frame', 'Remove frame only']] as Array<[string, string]>) : []),
              ['delete', 'Delete'],
            ];
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div
        className="menu-backdrop"
        role="button"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div className="node-menu" style={{ left: menu.x, top: menu.y }}>
        {actions.map(([action, label]) => (
          <Button
            key={action}
            variant="ghost"
            size="sm"
            className={action === 'delete' ? 'danger justify-start' : 'justify-start'}
            onClick={() => onAction(action, menu)}
          >
            {label}
          </Button>
        ))}
      </div>
    </>
  );
}

function useDismiss(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}

function NewProjectModal({
  templates,
  onCreate,
  onClose,
}: {
  templates: ImageXTemplateSummary[];
  onCreate: (input: { title: string; description: string; templateId: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id || 'scratch');
  const handleBackdrop = useDismiss(onClose);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="new-project-modal">
        <header>
          <h2>New Project</h2>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </header>
        <div className="new-project-form">
          <label>
            <span>Title</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          </label>
          <label>
            <span>Description</span>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <div className="template-picker">
            {templates.map((template) => (
              <Button
                key={template.id}
                variant={template.id === templateId ? 'secondary' : 'outline'}
                className={template.id === templateId ? 'selected template-choice' : 'template-choice'}
                type="button"
                onClick={() => setTemplateId(template.id)}
              >
                <strong>{template.title}</strong>
                <span>{template.description}</span>
              </Button>
            ))}
          </div>
          <Button
            onClick={() => onCreate({ title: title.trim() || 'Untitled Project', description, templateId })}
          >
            Create Project
          </Button>
        </div>
      </section>
    </div>
  );
}

function TextInputDialog({
  title,
  label,
  initialValue,
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  initialValue: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const canSubmit = value.trim().length > 0;
  const handleBackdrop = useDismiss(onCancel);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="dialog-modal">
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit(value);
          }}
        >
          <header>
            <h2>{title}</h2>
          </header>
          <label>
            <span>{label}</span>
            <Input value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
          </label>
          <div className="dialog-actions">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Save
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const handleBackdrop = useDismiss(onCancel);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="dialog-modal">
        <div className="dialog-form">
          <header>
            <h2>{title}</h2>
          </header>
          <p className="dialog-message">{message}</p>
          <div className="dialog-actions">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="danger" type="button" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BottomNotification({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="bottom-notification" role="status">
      <span>{message}</span>
      <Button variant="outline" size="sm" type="button" onClick={onClose} aria-label="Dismiss notification">
        Dismiss
      </Button>
    </div>
  );
}

const nodeChoices: Array<{ type: NodeType; label: string; description: string; icon: ComponentType<{ size?: number }> }> = [
  { type: 'text', label: 'Text', description: 'Prompt text fragment', icon: FileText },
  { type: 'character', label: 'Character', description: 'Identity, outfit, mood', icon: UserRound },
  { type: 'style', label: 'Style', description: 'Visual language', icon: Palette },
  { type: 'scene', label: 'Scene', description: 'Environment and shot', icon: MapPin },
  { type: 'imageInput', label: 'Image Input', description: 'Reference or edit target', icon: Image },
  { type: 'output', label: 'Output', description: 'Generation target', icon: Box },
  { type: 'frame', label: 'Frame', description: 'Group nodes visually', icon: Frame },
  { type: 'custom', label: 'Custom', description: 'Build your own node', icon: Component },
];

function AssetsModal({
  assets,
  onImport,
  onSelect,
  onRename,
  onDelete,
  onClose,
}: {
  assets: ImageXAsset[];
  onImport: (files: FileList | null) => void;
  onSelect: (asset: ImageXAsset) => void;
  onRename: (assetId: string) => void;
  onDelete: (assetId: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleBackdrop = useDismiss(onClose);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="assets-modal">
        <header>
          <div>
            <h2>Image Assets</h2>
            <p>Select an existing image or import more into this project.</p>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>Import Images</Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void onImport(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </header>
        <div className="assets-body">
          <aside>
            <Button variant="secondary" className="w-full justify-start">Images</Button>
            <Button variant="ghost" className="w-full justify-start" disabled>Other Assets</Button>
          </aside>
          <div className="asset-grid">
            {assets.map((asset) => (
              <article key={asset.id} className="asset-card">
                <button type="button" onClick={() => onSelect(asset)}>
                  <span className="asset-thumbnail">
                    <img src={asset.url} alt={asset.name} loading="lazy" />
                  </span>
                  <span>{asset.name}</span>
                </button>
                <div>
                  <Button variant="ghost" size="sm" onClick={() => onRename(asset.id)}>Rename</Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(asset.id)}>Delete</Button>
                </div>
              </article>
            ))}
            {assets.length === 0 && <p className="muted">No image assets in this project yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({
  auth,
  fontScale,
  onFontScale,
  historyLimit,
  onHistoryLimit,
  undoCount,
  redoCount,
  onClose,
}: {
  auth: AuthStatus | null;
  fontScale: number;
  onFontScale: (scale: number) => void;
  historyLimit: number;
  onHistoryLimit: (limit: number) => void;
  undoCount: number;
  redoCount: number;
  onClose: () => void;
}) {
  const handleBackdrop = useDismiss(onClose);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="settings-modal">
        <header>
          <h2>Settings</h2>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </header>
        <div className="settings-content">
          <section className="settings-status">
            <div>
              <span>Daemon</span>
              <strong>Connected</strong>
            </div>
            <div>
              <span>Authentication</span>
              <strong>{auth?.authenticated ? 'Authenticated' : 'Run imagex auth'}</strong>
            </div>
          </section>
          <label className="settings-row">
            <span>Font scale</span>
            <Slider min={0.5} max={3} step={0.1} value={[fontScale]} onValueChange={(value) => onFontScale(value[0] ?? fontScale)} />
            <strong>{fontScale.toFixed(2)}x</strong>
          </label>
          <label className="settings-row">
            <span>History size</span>
            <Slider min={10} max={200} step={5} value={[historyLimit]} onValueChange={(value) => onHistoryLimit(value[0] ?? historyLimit)} />
            <strong>{historyLimit}</strong>
          </label>
          <section className="settings-status">
            <div>
              <span>Undo entries</span>
              <strong>{undoCount}</strong>
            </div>
            <div>
              <span>Redo entries</span>
              <strong>{redoCount}</strong>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const handleBackdrop = useDismiss(onClose);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={handleBackdrop}>
      <section className="settings-modal shortcuts-modal">
        <header>
          <h2>Shortcuts</h2>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </header>
        <div className="shortcut-list">
          {editorShortcuts.map((shortcut) => (
            <div key={shortcut.id}>
              <kbd>{shortcut.label}</kbd>
              <span>{shortcut.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PromptOverlay({ prompt, onClose }: { prompt: string; onClose: () => void }) {
  const formatted = formatJsonPrompt(prompt);
  return (
    <div className="prompt-overlay-backdrop" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="prompt-overlay">
        <header>
          <h2>Compiled Prompt</h2>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </header>
        {formatted ? <JsonCodeBlock code={formatted} /> : <div className="empty-preview">No prompt generated</div>}
      </section>
    </div>
  );
}

function JsonCodeBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <div className="json-code" role="region" aria-label="Compiled prompt JSON">
      {lines.map((line, index) => (
        <div className="json-code-line" key={`${index}-${line}`}>
          <span className="json-line-number">{index + 1}</span>
          <code>{highlightJsonLine(line)}</code>
        </div>
      ))}
    </div>
  );
}

function formatJsonPrompt(prompt: string): string {
  try {
    return JSON.stringify(JSON.parse(prompt), null, 2);
  } catch {
    return prompt;
  }
}

function clampHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(10, Math.min(200, Math.round(value)));
}

function highlightJsonLine(line: string): ReactNode[] {
  const tokens = line.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],])/g);
  return tokens.filter(Boolean).map((token, index) => {
    let className = 'json-token';
    if (/^"(?:\\.|[^"\\])*"\s*:$/.test(token)) className += ' key';
    else if (/^"(?:\\.|[^"\\])*"$/.test(token)) className += ' string';
    else if (/^-?\d/.test(token)) className += ' number';
    else if (/^(true|false)$/.test(token)) className += ' boolean';
    else if (token === 'null') className += ' null';
    else if (/^[{}[\],]$/.test(token)) className += ' punctuation';
    return (
      <span className={className} key={`${index}-${token}`}>
        {token}
      </span>
    );
  });
}

function pushProjectRoute(project: ImageXProject) {
  const path = projectPath(project);
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
}

function projectPath(project: ImageXProject): string {
  return `/projects/${slugify(project.metadata.title)}--${project.metadata.id}`;
}

function projectWorkflows(project: ImageXProject): Array<{ id: string; title: string }> {
  const workflows = project.metadata.workflows?.length
    ? project.metadata.workflows
    : [{ id: project.workflow.id, title: project.workflow.name, file: project.metadata.workflowFile }];
  return workflows.map((workflow) => ({ id: workflow.id, title: workflow.title }));
}

function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) return null;
  const segment = decodeURIComponent(match[1] || '');
  return segment.includes('--') ? segment.slice(segment.lastIndexOf('--') + 2) : segment;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}
