export type NodeType =
  | 'text'
  | 'imageInput'
  | 'character'
  | 'style'
  | 'scene'
  | 'output'
  | 'frame'
  | 'custom';

export type CustomFieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'slider'
  | 'number'
  | 'toggle'
  | 'inputSocket'
  | 'outputSocket';

export type CustomFieldDefinition = {
  id: string;
  label: string;
  kind: CustomFieldKind;
  value?: string | number | boolean;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  accepts?: string[];
};

export type ImageXWorkflow = {
  id: string;
  version: '0.1';
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: ImageXNode[];
  edges: ImageXEdge[];
  settings: WorkflowSettings;
};

export type ImageXProjectMetadata = {
  app: 'imagex';
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  workflowFile: string;
  workflows?: Array<{ id: string; title: string; file: string }>;
  assetsDir: string;
  outputsDir: string;
};

export type ImageXProjectSummary = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  path: string;
};

export type ImageXTemplateSummary = {
  id: string;
  title: string;
  description: string;
};

export type ImageXProject = {
  metadata: ImageXProjectMetadata;
  workflow: ImageXWorkflow;
};

export type ImageXAsset = {
  id: string;
  name: string;
  type: 'image';
  file: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export type ImageXNodeAsset = {
  id: string;
  name: string;
  type: 'node';
  nodeType: NodeType;
  rootNodeId: string;
  nodes: ImageXNode[];
  edges: ImageXEdge[];
  createdAt: string;
  updatedAt: string;
};

export type ImageXNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type ImageXEdge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
};

export type WorkflowSettings = {
  provider: 'openai-codex';
  useCase?: string;
};

export type ImageReference = {
  name: string;
  role: string;
  notes: string;
  position: string;
};

export type ImageGenerationOptions = {
  prompt: string;
  model: string;
  size:
    | 'auto'
    | '1024x1024'
    | '1536x1024'
    | '1024x1536'
    | '2048x2048'
    | '2048x1152'
    | '3840x2160'
    | '2160x3840';
  outputFormat: 'png' | 'jpeg' | 'webp';
  background?: 'transparent' | 'opaque' | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  count: number;
  workflowName?: string;
  references?: ImageReference[];
};

export type GeneratedImage = {
  id: string;
  path: string;
  url: string;
  revisedPrompt?: string;
};

export type GenerateWorkflowRequest = {
  workflow: ImageXWorkflow;
};

export type GenerateWorkflowResponse = {
  prompt: string;
  images: GeneratedImage[];
};
