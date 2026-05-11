import type { CustomFieldDefinition, ImageGenerationOptions, ImageReference, ImageXNode, ImageXWorkflow } from '../shared/types.js';

type CompiledWorkflow = {
  prompt: string;
  options: ImageGenerationOptions;
};

/** Map of nodeId → resolved image URL (from GraphEngine pre-processing) */
export type ResolvedImages = Map<string, string>;

export function compileWorkflow(workflow: ImageXWorkflow, resolvedImages?: ResolvedImages): CompiledWorkflow {
  const outputs = workflow.nodes.filter((node) => node.type === 'codex-output');
  const context = graphContext(workflow);

  const compiledOutputs = outputs.map((output) => compileCodexOutput(output, context, resolvedImages)).filter(isMeaningfulObject);

  const primaryOutput = outputs[0];
  const count = numberField(primaryOutput, 'count', 1, 1, 4);

  const rawPrompt = {
    useCase: workflow.settings.useCase || 'stylized-concept',
    instruction: imageCountInstruction(count),
    outputs: compiledOutputs,
  };

  const references: ImageReference[] = [];
  const nextIndex = { value: 1 };
  const promptJson = assignImagePositions(rawPrompt, nextIndex, references);
  const prompt = JSON.stringify(promptJson, null, 2);

  return {
    prompt,
    options: buildOptions(prompt, primaryOutput, workflow.name, references),
  };
}

export function compileOutputNodeWorkflow(workflow: ImageXWorkflow, nodeId: string, resolvedImages?: ResolvedImages): CompiledWorkflow | null {
  const context = graphContext(workflow);
  const output = context.nodesById.get(nodeId);
  if (!output || output.type !== 'codex-output') return null;

  const compiled = compileCodexOutput(output, context, resolvedImages);
  if (!isMeaningfulObject(compiled)) return null;

  const count = numberField(output, 'count', 1, 1, 4);

  const rawPrompt = {
    useCase: workflow.settings.useCase || 'stylized-concept',
    instruction: imageCountInstruction(count),
    outputs: [compiled],
  };

  const references: ImageReference[] = [];
  const nextIndex = { value: 1 };
  const promptJson = assignImagePositions(rawPrompt, nextIndex, references);
  const prompt = JSON.stringify(promptJson, null, 2);

  return {
    prompt,
    options: buildOptions(prompt, output, workflow.name, references),
  };
}

// ─── Graph Traversal ─────────────────────────────────────────────────────────

type GraphContext = {
  nodesById: Map<string, ImageXNode>;
  /** Maps "targetId:targetHandle" → list of source nodes connected to that input */
  incomingByTargetHandle: Map<string, ImageXNode[]>;
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

/** Get upstream nodes connected to a specific handle on a node */
function getUpstreamForHandle(nodeId: string, handleId: string, context: GraphContext): ImageXNode[] {
  return context.incomingByTargetHandle.get(`${nodeId}:${handleId}`) || [];
}

/** Get ALL upstream nodes connected to any handle on a node */
function getAllUpstream(nodeId: string, context: GraphContext): ImageXNode[] {
  const upstream: ImageXNode[] = [];
  for (const [key, sources] of context.incomingByTargetHandle.entries()) {
    if (!key.startsWith(`${nodeId}:`)) continue;
    upstream.push(...sources);
  }
  return upstream;
}

// ─── Node Compilation (DFS bottom-up) ───────────────────────────────────────

/**
 * Compiles a node into a JSON object representing its semantics.
 * 
 * Each node becomes an object of { label: value } pairs from its fields.
 * If a field has upstream connections (via its socket), the value becomes
 * the compiled object(s) of those upstream nodes instead of the field's text value.
 * 
 * For image fields: value is "__imagex_image_ref" marker that gets post-processed
 * into [image-N] position references.
 */
function compileNode(node: ImageXNode, context: GraphContext, seen: Set<string>, resolvedImages?: ResolvedImages): unknown {
  if (seen.has(node.id)) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(node.id);

  // If this node has a pre-processed image from GraphEngine, use it directly
  if (resolvedImages?.has(node.id)) {
    const resolvedUrl = resolvedImages.get(node.id)!;
    return { image: { __imagex_ref: true, path: resolvedUrl } };
  }

  switch (node.type) {
    case 'prompt':
    case 'file':
    case 'image':
      return compilePrimitiveNode(node, context, nextSeen, resolvedImages);
    case 'color':
      return compileColorNode(node);
    case 'color-balance':
    case 'rotate-flip':
    case 'crop':
    case 'blur':
      // Editing nodes: if resolvedImages didn't catch it above, pass through source
      return compilePassthroughEditNode(node, context, nextSeen, resolvedImages);
    case 'download':
      return null;
    case 'frame':
      return null;
    case 'codex-output':
      return { image: { __imagex_ref: true, path: `__output:${node.id}` } };
  }
}

function compilePrimitiveNode(node: ImageXNode, context: GraphContext, seen: Set<string>, resolvedImages?: ResolvedImages): unknown {
  const title = typeof node.data.title === 'string' && node.data.title !== nodeMeta(node.type)
    ? node.data.title
    : undefined;

  // Get all fields (built-in + dynamic)
  const builtInFields = getBuiltInFields(node);
  const dynamicFields = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  const allFields = [...builtInFields, ...dynamicFields];

  const result: Record<string, unknown> = {};
  if (title) result._name = title;

  for (const field of allFields) {
    const handleId = `field:${field.id}`;
    const upstream = getUpstreamForHandle(node.id, handleId, context);

    let fieldValue: unknown;
    if (upstream.length > 0) {
      // This field has connections flowing in - compile those nodes
      const compiled = upstream.map((up) => compileNode(up, context, new Set(seen), resolvedImages)).filter(Boolean);
      if (compiled.length === 1) {
        fieldValue = compiled[0];
      } else if (compiled.length > 1) {
        fieldValue = compiled;
      }
    } else if (field.kind === 'image') {
      // Image fields: produce an __imagex_ref marker if the node has an asset
      const assetUrl = typeof node.data.assetUrl === 'string' ? node.data.assetUrl : '';
      const assetName = typeof node.data.assetName === 'string' ? node.data.assetName : '';
      const path = assetUrl || assetName;
      if (path) {
        fieldValue = { __imagex_ref: true, path };
      }
    } else {
      // Use the field's own value
      fieldValue = getFieldValue(node, field);
    }

    if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;

    // Handle duplicate keys by converting to array
    if (result[field.label] !== undefined) {
      const existing = result[field.label];
      if (Array.isArray(existing)) {
        existing.push(fieldValue);
      } else {
        result[field.label] = [existing, fieldValue];
      }
    } else {
      result[field.label] = fieldValue;
    }
  }

  // Always return as object (consistent structure)
  return Object.keys(result).length > 0 ? result : null;
}

function compileColorNode(node: ImageXNode): unknown {
  const color = getFieldValue(node, { id: 'color', kind: 'color' }) || '#ffffff';
  return { color };
}

function compileRotateFlipNode(node: ImageXNode, context: GraphContext, seen: Set<string>, resolvedImages?: ResolvedImages): unknown {
  // Pass through the source image as-is (transforms applied during processing, not in prompt)
  const upstream = getAllUpstream(node.id, context);
  for (const up of upstream) {
    if (seen.has(up.id)) continue;
    const compiled = compileNode(up, context, new Set(seen), resolvedImages);
    if (compiled) return compiled;
  }
  return null;
}

function compilePassthroughEditNode(node: ImageXNode, context: GraphContext, seen: Set<string>, resolvedImages?: ResolvedImages): unknown {
  const upstream = getAllUpstream(node.id, context);
  for (const up of upstream) {
    if (seen.has(up.id)) continue;
    const compiled = compileNode(up, context, new Set(seen), resolvedImages);
    if (compiled) return compiled;
  }
  return null;
}

function compileColorBalanceNode(node: ImageXNode, context: GraphContext, seen: Set<string>, resolvedImages?: ResolvedImages): unknown {
  // Pass through the source image as-is (adjustments applied during processing, not in prompt)
  const upstream = getAllUpstream(node.id, context);
  for (const up of upstream) {
    if (seen.has(up.id)) continue;
    const compiled = compileNode(up, context, new Set(seen), resolvedImages);
    if (compiled) return compiled;
  }
  return null;
}

// ─── Codex Output Compilation ────────────────────────────────────────────────

function compileCodexOutput(output: ImageXNode, context: GraphContext, resolvedImages?: ResolvedImages): Record<string, unknown> {
  const baseSeen = new Set<string>([output.id]);
  const upstream = getAllUpstream(output.id, context);

  const inputs: unknown[] = [];
  for (const node of upstream) {
    const compiled = compileNode(node, context, new Set(baseSeen), resolvedImages);
    if (compiled) inputs.push(compiled);
  }

  return {
    request: inputs.length === 1 ? inputs[0] : inputs,
  };
}

// ─── Image Position Assignment ───────────────────────────────────────────────

function assignImagePositions(value: unknown, nextIndex: { value: number }, refs: ImageReference[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => assignImagePositions(item, nextIndex, refs));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('__imagex_ref' in record) {
      const path = String(record.path || '');
      const position = `[image-${nextIndex.value++}]`;
      refs.push({
        name: path,
        role: 'reference',
        notes: '',
        position,
      });
      return position;
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(record)) {
      result[key] = assignImagePositions(val, nextIndex, refs);
    }
    return result;
  }
  return value;
}

// ─── Options Builder ─────────────────────────────────────────────────────────

function buildOptions(prompt: string, output: ImageXNode | undefined, workflowName: string, references: ImageReference[]): ImageGenerationOptions {
  return {
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
    workflowName,
    references,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function imageCountInstruction(count: number): string {
  const n = count === 1 ? '1 image' : `${count} images`;
  return `Generate ${n} based on the following structured description. Preserve explicit user values and do not invent unrelated logos, watermarks, or extra text.`;
}

const defaultLabels: Record<string, string> = {
  prompt: 'Prompt',
  image: 'Image',
  color: 'Color',
  file: 'File',
};

function nodeMeta(type: string): string {
  return defaultLabels[type] || type;
}

function getBuiltInFields(node: ImageXNode): CustomFieldDefinition[] {
  // Import would be circular, so inline the lookup
  const defs: Record<string, CustomFieldDefinition[]> = {
    prompt: [{ id: 'text', label: 'Text', kind: 'textarea', value: '' }],
    image: [
      { id: 'image', label: 'Image', kind: 'image', value: '' },
      { id: 'description', label: 'Description', kind: 'textarea', value: '' },
    ],
    color: [{ id: 'color', label: 'Color', kind: 'color', value: '#ffffff' }],
    file: [{ id: 'filename', label: 'File', kind: 'text', value: '' }],
  };
  return defs[node.type] || [];
}

function getFieldValue(node: ImageXNode, field: { id: string; kind: string }): unknown {
  // Check node.data first
  const directValue = node.data[field.id];
  if (directValue !== undefined && directValue !== null && directValue !== '') return directValue;
  // Check dynamic fields
  const fields = Array.isArray(node.data.fields) ? (node.data.fields as CustomFieldDefinition[]) : [];
  const dynField = fields.find((f) => f.id === field.id);
  if (dynField && dynField.value !== undefined && dynField.value !== null && dynField.value !== '') return dynField.value;
  return undefined;
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

function isMeaningfulObject(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'object') return true;
  return Object.keys(value).length > 0;
}
