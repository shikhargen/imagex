import type { CustomFieldDefinition, ImageGenerationOptions, ImageXNode, ImageXWorkflow } from '../shared/types.js';

type CompiledWorkflow = {
  prompt: string;
  options: ImageGenerationOptions;
};

export function compileWorkflow(workflow: ImageXWorkflow): CompiledWorkflow {
  const output = workflow.nodes.find((node) => node.type === 'output');
  const prompt = buildPrompt(workflow);

  return {
    prompt,
    options: {
      prompt,
      model: stringField(output, 'model', 'gpt-image-2'),
      size: enumField(
        output,
        'size',
        ['auto', '1024x1024', '1536x1024', '1024x1536', '2048x2048', '2048x1152', '3840x2160', '2160x3840'],
        '1024x1024'
      ),
      outputFormat: enumField(output, 'format', ['png', 'jpeg', 'webp'], 'png'),
      background: enumField(output, 'background', ['transparent', 'opaque', 'auto'], 'auto'),
      quality: enumField(output, 'quality', ['low', 'medium', 'high', 'auto'], 'auto'),
      count: numberField(output, 'count', 1, 1, 4),
      workflowName: workflow.name,
    },
  };
}

function buildPrompt(workflow: ImageXWorkflow): string {
  const context = graphContext(workflow);
  const outputs = workflow.nodes.filter((node) => node.type === 'output');
  const compiledOutputs = outputs.map((output) => compileOutputNode(output, context, new Set())).filter(isMeaningfulObject);
  const fallback = outputs.length === 0 ? fallbackInputs(workflow, context) : null;

  return JSON.stringify(
    {
      useCase: workflow.settings.useCase || 'stylized-concept',
      assetType: 'imagex generated workflow output',
      instruction:
        'Generate one image from this structured workflow. Treat node fields as reusable creative components. Preserve explicit user values and do not invent unrelated logos, watermarks, or extra text.',
      outputs: compiledOutputs,
      ...(fallback
        ? {
            primaryRequest: fallback.primaryRequest,
            characters: fallback.characters,
            styles: fallback.styles,
            scenes: fallback.scenes,
            imageInputs: fallback.imageInputs,
          }
        : {}),
    },
    null,
    2
  );
}

type GraphContext = {
  nodesById: Map<string, ImageXNode>;
  incomingByTargetHandle: Map<string, ImageXNode[]>;
};

type PromptSections = {
  primaryRequest: unknown[];
  characters: unknown[];
  styles: unknown[];
  scenes: unknown[];
  imageInputs: unknown[];
};

function graphContext(workflow: ImageXWorkflow): GraphContext {
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incomingByTargetHandle = new Map<string, ImageXNode[]>();
  for (const edge of workflow.edges) {
    if (!edge.targetHandle) continue;
    const source = nodesById.get(edge.source);
    if (!source) continue;
    const key = `${edge.target}:${edge.targetHandle}`;
    const existing = incomingByTargetHandle.get(key) || [];
    existing.push(source);
    incomingByTargetHandle.set(key, existing);
  }
  return { nodesById, incomingByTargetHandle };
}

function compileOutputNode(output: ImageXNode, context: GraphContext, seen: Set<string>): Record<string, unknown> | string {
  if (seen.has(output.id)) return '[circular reference]';
  const nextSeen = new Set(seen);
  nextSeen.add(output.id);

  return {
    request: compileOutputInputs(output, context, nextSeen),
    settings: compileNodeFields(output, ['size', 'quality', 'format', 'background', 'count'], context, nextSeen),
  };
}

function compileOutputInputs(output: ImageXNode, context: GraphContext, seen: Set<string>): PromptSections {
  return {
    primaryRequest: compileHandleInputs(output.id, 'prompt-in', context, seen),
    characters: compileHandleInputs(output.id, 'character-in', context, seen),
    styles: compileHandleInputs(output.id, 'style-in', context, seen),
    scenes: compileHandleInputs(output.id, 'scene-in', context, seen),
    imageInputs: compileHandleInputs(output.id, 'image-in', context, seen),
  };
}

function compileHandleInputs(targetId: string, targetHandle: string, context: GraphContext, seen: Set<string>): unknown[] {
  return (context.incomingByTargetHandle.get(`${targetId}:${targetHandle}`) || [])
    .map((node) => compileConnectedNode(node, context, seen))
    .filter(isMeaningfulObject);
}

function fallbackInputs(workflow: ImageXWorkflow, context: GraphContext): PromptSections {
  return {
    primaryRequest: compileNodesByType(workflow.nodes, 'text', context),
    characters: compileNodesByType(workflow.nodes, 'character', context),
    styles: compileNodesByType(workflow.nodes, 'style', context),
    scenes: compileNodesByType(workflow.nodes, 'scene', context),
    imageInputs: compileNodesByType(workflow.nodes, 'imageInput', context),
  };
}

function compileNodesByType(nodes: ImageXNode[], type: ImageXNode['type'], context: GraphContext): unknown[] {
  return nodes
    .filter((node) => node.type === type)
    .map((node) => compileConnectedNode(node, context, new Set()))
    .filter(isMeaningfulObject);
}

function compileNodeFields(node: ImageXNode, keys: string[], context: GraphContext, seen = new Set<string>()): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    const connected = context.incomingByTargetHandle.get(`${node.id}:field:${key}`) || [];
    if (connected.length === 1) {
      fields[key] = compileConnectedNode(connected[0]!, context, seen);
      continue;
    }
    if (connected.length > 1) {
      fields[key] = connected.map((connectedNode) => compileConnectedNode(connectedNode, context, seen));
      continue;
    }

    const value = node.data[key];
    if (value === undefined || value === null || value === '') continue;
    fields[key] = value;
  }
  return fields;
}

function compileConnectedNode(node: ImageXNode, context: GraphContext, seen: Set<string>): unknown {
  if (seen.has(node.id)) return '[circular reference]';
  const nextSeen = new Set(seen);
  nextSeen.add(node.id);

  switch (node.type) {
    case 'text':
      return compileNodeFields(node, ['text'], context, nextSeen);
    case 'character':
      return compileNodeFields(node, ['name', 'description', 'traits', 'clothing', 'mood', 'notes'], context, nextSeen);
    case 'style':
      return compileNodeFields(node, ['name', 'medium', 'palette', 'description', 'visualConstraints', 'strength'], context, nextSeen);
    case 'scene':
      return compileNodeFields(node, ['name', 'environment', 'mood', 'lighting', 'camera', 'weather', 'props', 'constraints'], context, nextSeen);
    case 'imageInput':
      return compileNodeFields(node, ['path', 'role', 'notes'], context, nextSeen);
    case 'output':
      return compileOutputNode(node, context, seen);
    case 'frame':
      return compileNodeFields(node, ['title', 'notes'], context, nextSeen);
    case 'custom':
      return compileCustomNode(node, context, nextSeen);
  }
}

function compileCustomNode(node: ImageXNode, context: GraphContext, seen: Set<string>): Record<string, unknown> {
  const fields = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  const compiled: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === 'outputSocket') continue;
    const connected = context.incomingByTargetHandle.get(`${node.id}:field:${field.id}`) || [];
    if (connected.length === 1) {
      compiled[field.label] = compileConnectedNode(connected[0]!, context, seen);
      continue;
    }
    if (connected.length > 1) {
      compiled[field.label] = connected.map((connectedNode) => compileConnectedNode(connectedNode, context, seen));
      continue;
    }
    if (field.kind === 'inputSocket') continue;
    if (field.value === undefined || field.value === null || field.value === '') continue;
    compiled[field.label] = field.value;
  }
  return compiled;
}

function isMeaningfulObject(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'object') return true;
  return Object.keys(value).length > 0;
}

function stringField(node: ImageXNode | undefined, key: string, fallback = ''): string {
  const value = node?.data[key];
  return typeof value === 'string' ? value.trim() : fallback;
}

function numberField(node: ImageXNode | undefined, key: string, fallback: number, min: number, max: number): number {
  const raw = node?.data[key];
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function enumField<const T extends readonly string[]>(
  node: ImageXNode | undefined,
  key: string,
  allowed: T,
  fallback: T[number]
): T[number] {
  const value = node?.data[key];
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
