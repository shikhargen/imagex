/**
 * Editor Store — Central state management for the workflow editor.
 * 
 * Replaces the 33+ useState/15+ useRef pattern in App.tsx with a single
 * Zustand store that provides:
 * - Stable references (no stale closure issues)
 * - Granular subscriptions via selectors
 * - No re-render cascades from unrelated state changes
 * - Clean imperative API for mutations
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  ImageXAsset,
  ImageXNodeAsset,
  ImageXProject,
  ImageXProjectSummary,
  ImageXTemplateSummary,
  ImageXWorkflow,
  OutputNodeResult,
} from '../../shared/types.js';
import type { UiEdge, UiNode } from '../ui/flow/types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuthStatus = {
  authenticated: boolean;
  provider: 'openai-codex';
  accountId?: string;
};

export type FloatingMenu =
  | { type: 'node'; nodeId: string; x: number; y: number }
  | { type: 'selection'; x: number; y: number }
  | { type: 'pane'; x: number; y: number; flowX: number; flowY: number }
  | { type: 'workflow'; workflowId: string; x: number; y: number }
  | { type: 'project'; projectId: string; x: number; y: number }
  | { type: 'asset'; assetId: string; x: number; y: number }
  | null;

export type TextDialogState =
  | { type: 'rename-asset'; id: string; title: string; label: string; initialValue: string }
  | { type: 'rename-workflow'; id: string; title: string; label: string; initialValue: string }
  | { type: 'rename-project'; id: string; title: string; label: string; initialValue: string }
  | { type: 'create-node-asset'; id: string; title: string; label: string; initialValue: string }
  | null;

export type ConfirmDialogState =
  | { type: 'delete-project'; id: string; title: string; message: string; confirmLabel: string }
  | null;

type EditorSnapshot = {
  workflow: ImageXWorkflow;
  selectedId: string | null;
};

// ─── Store Shape ─────────────────────────────────────────────────────────────

interface EditorState {
  // Auth & projects
  auth: AuthStatus | null;
  projects: ImageXProjectSummary[];
  templates: ImageXTemplateSummary[];
  project: ImageXProject | null;

  // Workflow
  workflow: ImageXWorkflow | null;
  nodes: UiNode[];
  edges: UiEdge[];
  selectedId: string | null;
  status: string;
  outputResults: Map<string, OutputNodeResult>;

  // UI
  menu: FloatingMenu;
  promptOverlay: { prompt: string } | null;
  notification: string | null;
  showNewProject: boolean;
  showSettings: boolean;
  showShortcuts: boolean;
  showMinimap: boolean;
  rightOpen: boolean;
  rightWidth: number;
  activeSidePanel: string | null;
  sidePanelWidth: number;
  fontScale: number;
  placingNodeId: string | null;
  workflowSearchQuery: string;
  historyLimit: number;
  historyVersion: number;

  // Assets
  assets: ImageXAsset[];
  nodeAssets: ImageXNodeAsset[];
  assetPicker: { nodeId: string; fieldId: string } | null;

  // Dialogs
  textDialog: TextDialogState;
  confirmDialog: ConfirmDialogState;

  // History
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];

  // Active field (for custom field editing)
  activeCustomField: { nodeId: string; fieldId: string } | null;
}

interface EditorActions {
  // Auth & projects
  setAuth: (auth: AuthStatus | null) => void;
  setProjects: (projects: ImageXProjectSummary[]) => void;
  setTemplates: (templates: ImageXTemplateSummary[]) => void;
  setProject: (project: ImageXProject | null) => void;

  // Workflow
  setWorkflow: (workflow: ImageXWorkflow | null) => void;
  setNodes: (nodes: UiNode[]) => void;
  setEdges: (edges: UiEdge[]) => void;
  setSelectedId: (id: string | null) => void;
  setStatus: (status: string) => void;
  setOutputResults: (results: Map<string, OutputNodeResult>) => void;

  // UI
  setMenu: (menu: FloatingMenu) => void;
  setPromptOverlay: (overlay: { prompt: string } | null) => void;
  notify: (message: string) => void;
  clearNotification: () => void;
  setShowNewProject: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowShortcuts: (show: boolean) => void;
  setShowMinimap: (show: boolean) => void;
  toggleMinimap: () => void;
  setRightOpen: (open: boolean) => void;
  setRightWidth: (width: number) => void;
  setActiveSidePanel: (panel: string | null) => void;
  setSidePanelWidth: (width: number) => void;
  setFontScale: (scale: number) => void;
  setPlacingNodeId: (id: string | null) => void;
  setWorkflowSearchQuery: (query: string) => void;
  setHistoryLimit: (limit: number) => void;
  bumpHistoryVersion: () => void;

  // Assets
  setAssets: (assets: ImageXAsset[]) => void;
  setNodeAssets: (assets: ImageXNodeAsset[]) => void;
  setAssetPicker: (picker: { nodeId: string; fieldId: string } | null) => void;

  // Dialogs
  setTextDialog: (dialog: TextDialogState) => void;
  setConfirmDialog: (dialog: ConfirmDialogState) => void;

  // History
  pushUndo: (snapshot: EditorSnapshot) => void;
  popUndo: () => EditorSnapshot | undefined;
  pushRedo: (snapshot: EditorSnapshot) => void;
  popRedo: () => EditorSnapshot | undefined;
  clearHistory: () => void;

  // Active field
  setActiveCustomField: (field: { nodeId: string; fieldId: string } | null) => void;
}

// ─── Store Creation ──────────────────────────────────────────────────────────

function clampHistoryLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(10, Math.min(200, Math.round(value)));
}

export const useEditorStore = create<EditorState & EditorActions>()(
  devtools(
    (set, get) => ({
      // Initial state
      auth: null,
      projects: [],
      templates: [],
      project: null,
      workflow: null,
      nodes: [],
      edges: [],
      selectedId: null,
      status: 'Loading workspace...',
      outputResults: new Map(),
      menu: null,
      promptOverlay: null,
      notification: null,
      showNewProject: false,
      showSettings: false,
      showShortcuts: false,
      showMinimap: localStorage.getItem('imagex.minimap') !== 'false',
      rightOpen: localStorage.getItem('imagex.rightOpen') !== 'false',
      rightWidth: Number(localStorage.getItem('imagex.rightWidth')) || 340,
      activeSidePanel: null,
      sidePanelWidth: Number(localStorage.getItem('imagex.sidePanelWidth')) || 260,
      fontScale: Number(localStorage.getItem('imagex.fontScale')) || 1,
      placingNodeId: null,
      workflowSearchQuery: '',
      historyLimit: clampHistoryLimit(Number(localStorage.getItem('imagex.historyLimit')) || 50),
      historyVersion: 0,
      assets: [],
      nodeAssets: [],
      assetPicker: null,
      textDialog: null,
      confirmDialog: null,
      undoStack: [],
      redoStack: [],
      activeCustomField: null,

      // Actions
      setAuth: (auth) => set({ auth }),
      setProjects: (projects) => set({ projects }),
      setTemplates: (templates) => set({ templates }),
      setProject: (project) => set({ project }),
      setWorkflow: (workflow) => set({ workflow }),
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      setSelectedId: (selectedId) => set({ selectedId }),
      setStatus: (status) => set({ status }),
      setOutputResults: (outputResults) => set({ outputResults }),
      setMenu: (menu) => set({ menu }),
      setPromptOverlay: (promptOverlay) => set({ promptOverlay }),
      notify: (message) => set({ notification: message }),
      clearNotification: () => set({ notification: null }),
      setShowNewProject: (showNewProject) => set({ showNewProject }),
      setShowSettings: (showSettings) => set({ showSettings }),
      setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
      setShowMinimap: (showMinimap) => {
        localStorage.setItem('imagex.minimap', String(showMinimap));
        set({ showMinimap });
      },
      toggleMinimap: () => {
        const next = !get().showMinimap;
        localStorage.setItem('imagex.minimap', String(next));
        set({ showMinimap: next });
      },
      setRightOpen: (rightOpen) => {
        localStorage.setItem('imagex.rightOpen', String(rightOpen));
        set({ rightOpen });
      },
      setRightWidth: (rightWidth) => {
        localStorage.setItem('imagex.rightWidth', String(rightWidth));
        set({ rightWidth });
      },
      setActiveSidePanel: (activeSidePanel) => set({ activeSidePanel }),
      setSidePanelWidth: (sidePanelWidth) => {
        localStorage.setItem('imagex.sidePanelWidth', String(sidePanelWidth));
        set({ sidePanelWidth });
      },
      setFontScale: (fontScale) => {
        localStorage.setItem('imagex.fontScale', String(fontScale));
        document.documentElement.style.setProperty('--font-scale', String(fontScale));
        set({ fontScale });
      },
      setPlacingNodeId: (placingNodeId) => set({ placingNodeId }),
      setWorkflowSearchQuery: (workflowSearchQuery) => set({ workflowSearchQuery }),
      setHistoryLimit: (historyLimit) => {
        const clamped = clampHistoryLimit(historyLimit);
        localStorage.setItem('imagex.historyLimit', String(clamped));
        const { undoStack } = get();
        if (undoStack.length > clamped) {
          set({ historyLimit: clamped, undoStack: undoStack.slice(-clamped), historyVersion: get().historyVersion + 1 });
        } else {
          set({ historyLimit: clamped });
        }
      },
      bumpHistoryVersion: () => set({ historyVersion: get().historyVersion + 1 }),
      setAssets: (assets) => set({ assets }),
      setNodeAssets: (nodeAssets) => set({ nodeAssets }),
      setAssetPicker: (assetPicker) => set({ assetPicker }),
      setTextDialog: (textDialog) => set({ textDialog }),
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
      pushUndo: (snapshot) => {
        const { undoStack, historyLimit, historyVersion } = get();
        set({ undoStack: [...undoStack, snapshot].slice(-historyLimit), redoStack: [], historyVersion: historyVersion + 1 });
      },
      popUndo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return undefined;
        const snapshot = undoStack[undoStack.length - 1]!;
        set({ undoStack: undoStack.slice(0, -1) });
        return snapshot;
      },
      pushRedo: (snapshot) => set((state) => ({ redoStack: [...state.redoStack, snapshot] })),
      popRedo: () => {
        const { redoStack } = get();
        if (redoStack.length === 0) return undefined;
        const snapshot = redoStack[redoStack.length - 1]!;
        set({ redoStack: redoStack.slice(0, -1) });
        return snapshot;
      },
      clearHistory: () => set({ undoStack: [], redoStack: [] }),
      setActiveCustomField: (activeCustomField) => set({ activeCustomField }),
    }),
    { name: 'imagex-editor' }
  )
);

// ─── Selectors (for granular subscriptions) ──────────────────────────────────

export const selectWorkflow = (state: EditorState) => state.workflow;
export const selectNodes = (state: EditorState) => state.nodes;
export const selectEdges = (state: EditorState) => state.edges;
export const selectSelectedId = (state: EditorState) => state.selectedId;
export const selectProject = (state: EditorState) => state.project;
export const selectStatus = (state: EditorState) => state.status;
export const selectMenu = (state: EditorState) => state.menu;
export const selectAssets = (state: EditorState) => state.assets;
export const selectNotification = (state: EditorState) => state.notification;
export const selectRightOpen = (state: EditorState) => state.rightOpen;
export const selectActiveSidePanel = (state: EditorState) => state.activeSidePanel;
export const selectShowMinimap = (state: EditorState) => state.showMinimap;
export const selectPlacingNodeId = (state: EditorState) => state.placingNodeId;
