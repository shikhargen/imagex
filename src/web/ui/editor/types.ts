import type { ImageXWorkflow } from '../../../shared/types.js';

export type AuthStatus = {
  authenticated: boolean;
  provider: 'openai-codex';
  accountId?: string;
};

export type EditorSnapshot = {
  workflow: ImageXWorkflow;
  selectedId: string | null;
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
