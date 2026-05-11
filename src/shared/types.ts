// ─── Node Categories ─────────────────────────────────────────────────────────
// Primitives: user-editable, can have fields added/removed, renamable
// LLM Output: hardcoded config, not user-editable fields, generates images
// Image Editing: takes image input, has fixed controls, shows preview

export type NodeCategory = 'primitive' | 'llm-output' | 'image-editing';

export type NodeType =
  // Primitives (addable fields, renamable)
  | 'prompt'        // text/prompt node - has text fields, chainable
  | 'image'         // image reference - description + image upload
  | 'color'         // color picker → outputs hex string
  | 'file'          // document attachment → converted to text
  // LLM Output (hardcoded config)
  | 'codex-output'  // OpenAI image generation with config sliders/dropdowns
  // Image Editing (fixed controls + preview)
  | 'color-balance' // RGB/HSL sliders on an image
  | 'rotate-flip'   // rotation + flip toggles
  | 'crop'          // crop with interactive handles
  | 'blur'          // gaussian blur
  // Utility
  | 'download'      // download processed image
  // Layout
  | 'frame';        // grouping container (no ports)

// ─── Socket/Port Types ───────────────────────────────────────────────────────
export type SocketType = 'text' | 'image' | 'color' | 'file' | 'any';

// ─── Field System ────────────────────────────────────────────────────────────
export type FieldKind =
  | 'text'       // single-line text input
  | 'textarea'   // multi-line text area
  | 'image'      // image upload/picker
  | 'color'      // color picker
  | 'file'       // file attachment
  | 'select'     // dropdown select
  | 'slider'     // numeric slider
  | 'number'     // numeric input
  | 'toggle';    // boolean switch

// Compat alias used internally
export type CustomFieldKind = FieldKind;

export type FieldDefinition = {
  id: string;
  label: string;
  kind: FieldKind;
  value?: string | number | boolean;
  options?: string[];          // for 'select'
  min?: number;                // for 'slider'/'number'
  max?: number;
  step?: number;
  placeholder?: string;
  removable?: boolean;         // can user remove this field?
  socketType?: SocketType;     // if this field can receive a connection
  accepts?: string[];          // port compatibility (legacy compat)
};

// Compat alias
export type CustomFieldDefinition = FieldDefinition;

// ─── Node Data ───────────────────────────────────────────────────────────────
export type ImageXNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  // Common data shape:
  // title?: string           -- user-defined name (renamable)
  // fields?: FieldDefinition[] -- dynamic fields for primitives
  // For codex-output: size, quality, format, background, count, model
  // For color-balance: image input, r/g/b offsets
  // For rotate-flip: image input, rotate degrees, flipH, flipV
};

export type ImageXEdge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
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

export type WorkflowSettings = {
  provider: 'openai-codex';
  useCase?: string;
};

// ─── Project & Assets ────────────────────────────────────────────────────────
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

// ─── Generation ──────────────────────────────────────────────────────────────
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

export type OutputNodeResult = {
  outputNodeId: string;
  prompt: string;
  images: GeneratedImage[];
};

export type GenerateWorkflowResponse = {
  results: OutputNodeResult[];
};
