import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

function log(scope: string, message: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const extraStr = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${ts}] [${scope}] ${message}${extraStr}`);
}

function logRequest(req: Request, res: Response, start: number): void {
  const duration = Date.now() - start;
  log('http', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
}
import { imagexPaths } from '../config/paths.js';
import { getCodexAuthStatus, resolveCodexBearerToken } from '../auth/store.js';
import { generateCodexImages } from '../providers/codexImage.js';
import type { GenerateWorkflowRequest, GeneratedImage, ImageXEdge, ImageXNode, ImageXWorkflow, OutputNodeResult } from '../shared/types.js';
import { compileOutputNodeWorkflow, compileWorkflow } from '../workflows/compiler.js';
import { listWorkflows, saveWorkflow } from '../workflows/store.js';
import {
  createProject,
  createProjectNodeAsset,
  createProjectWorkflow,
  deleteProjectWorkflow,
  deleteProject,
  deleteProjectAsset,
  getProject,
  importProjectAsset,
  loadProjectWorkflow,
  listProjectAssets,
  listProjectNodeAssets,
  listProjects,
  listTemplates,
  projectAssetDir,
  projectAssetPath,
  projectOutputDir,
  renameProjectAsset,
  renameProject,
  saveProjectWorkflow,
  type CreateProjectInput,
} from '../projects/store.js';

export type StartServerOptions = {
  host: string;
  port: number;
};

export async function startServer(options: StartServerOptions): Promise<Server> {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => logRequest(req, res, start));
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'imagex' });
  });

  app.get('/api/auth/status', async (_req, res, next) => {
    try {
      res.json(await getCodexAuthStatus());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/workflows', async (_req, res, next) => {
    try {
      res.json({ workflows: await listWorkflows() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects', async (_req, res, next) => {
    try {
      res.json({ projects: await listProjects() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  app.get('/api/projects/:projectId', async (req, res, next) => {
    try {
      res.json({ project: await getProject(req.params.projectId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects', async (req: Request<unknown, unknown, CreateProjectInput>, res, next) => {
    try {
      res.json({ project: await createProject(req.body) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/projects/:projectId', async (req: Request<{ projectId: string }, unknown, { title: string }>, res, next) => {
    try {
      res.json({ project: await renameProject(req.params.projectId, req.body.title || '') });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/projects/:projectId', async (req, res, next) => {
    try {
      await deleteProject(req.params.projectId || '');
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:projectId/workflow', async (req: Request<{ projectId: string }, unknown, GenerateWorkflowRequest | unknown>, res, next) => {
    try {
      res.json({ project: await saveProjectWorkflow(req.params.projectId, workflowFromBody(req.body)) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:projectId/workflows/:workflowId', async (req, res, next) => {
    try {
      res.json({ project: await loadProjectWorkflow(req.params.projectId || '', req.params.workflowId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:projectId/workflows', async (req: Request<{ projectId: string }, unknown, { title?: string }>, res, next) => {
    try {
      res.json({ project: await createProjectWorkflow(req.params.projectId, req.body.title || 'Untitled Workflow') });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/projects/:projectId/workflows/:workflowId', async (req, res, next) => {
    try {
      res.json({ project: await deleteProjectWorkflow(req.params.projectId || '', req.params.workflowId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:projectId/assets', async (req, res, next) => {
    try {
      res.json({ assets: await listProjectAssets(req.params.projectId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:projectId/node-assets', async (req, res, next) => {
    try {
      res.json({ assets: await listProjectNodeAssets(req.params.projectId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/projects/:projectId/node-assets',
    async (req: Request<{ projectId: string }, unknown, { name: string; rootNodeId: string; nodes: ImageXNode[]; edges: ImageXEdge[] }>, res, next) => {
      try {
        res.json({ assets: await createProjectNodeAsset(req.params.projectId, req.body) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    '/api/projects/:projectId/assets',
    async (req: Request<{ projectId: string }, unknown, { name: string; mimeType: string; dataBase64: string }>, res, next) => {
      try {
        res.json({ assets: await importProjectAsset(req.params.projectId, req.body) });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch('/api/projects/:projectId/assets/:assetId', async (req: Request<{ projectId: string; assetId: string }, unknown, { name: string }>, res, next) => {
    try {
      res.json({ assets: await renameProjectAsset(req.params.projectId, req.params.assetId, req.body.name || '') });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/projects/:projectId/assets/:assetId', async (req, res, next) => {
    try {
      res.json({ assets: await deleteProjectAsset(req.params.projectId || '', req.params.assetId || '') });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:projectId/asset-files/:assetId', async (req, res, next) => {
    try {
      const projectId = req.params.projectId || '';
      const target = resolve(await projectAssetPath(projectId, req.params.assetId || ''));
      const assetsRoot = resolve(projectAssetDir(projectId));
      if (relative(assetsRoot, target).startsWith('..')) {
        res.status(403).end();
        return;
      }
      const file = await readFile(target);
      res.type(extname(target) || 'application/octet-stream').send(file);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:projectId/generate', async (req: Request<{ projectId: string }, unknown, GenerateWorkflowRequest>, res, next) => {
    try {
      const projectId = req.params.projectId;
      const outputNodes = req.body.workflow.nodes.filter((n) => n.type === 'codex-output');
      log('generate', 'starting workflow generation', { projectId, outputNodes: outputNodes.length });
      const bearerToken = await resolveCodexBearerToken();
      const results = await executeWorkflowOutputNodes(
        req.body.workflow,
        bearerToken,
        projectId
      );
      log('generate', 'workflow generation complete', { projectId, results: results.length });
      await saveProjectWorkflow(projectId, req.body.workflow);
      res.json({ results });
    } catch (error) {
      log('generate', 'workflow generation failed', { projectId: req.params.projectId, error: String(error) });
      next(error);
    }
  });

  async function resolveImageReferences(
    projectId: string,
    references?: Array<{ name: string; role: string; notes: string; position: string }>,
    generatedResults?: Map<string, GeneratedImage[]>
  ): Promise<Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }>> {
    if (!references || references.length === 0) return [];

    const assets = await listProjectAssets(projectId);
    const resolved: Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }> = [];

    for (const ref of references) {
      // Handle output node references (__output:nodeId)
      if (ref.name.startsWith('__output:') && generatedResults) {
        const outputNodeId = ref.name.slice('__output:'.length);
        const images = generatedResults.get(outputNodeId) || [];
        if (images.length > 0) {
          const img = images[0]!;
          const file = await readFile(img.path);
          const ext = extname(img.path).slice(1) || 'png';
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          resolved.push({
            name: ref.name,
            role: ref.role,
            notes: ref.notes,
            position: ref.position,
            dataUrl: `data:${mimeType};base64,${file.toString('base64')}`,
          });
        }
        continue;
      }

      // Handle asset URL references (path starts with /api/)
      if (ref.name.startsWith('/api/')) {
        // Extract asset ID from URL like /api/projects/xxx/asset-files/asset-id
        const parts = ref.name.split('/');
        const assetId = parts[parts.length - 1] || '';
        const assetPath = await projectAssetPath(projectId, assetId);
        try {
          const file = await readFile(assetPath);
          const ext = extname(assetPath).slice(1) || 'png';
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          resolved.push({
            name: ref.name,
            role: ref.role,
            notes: ref.notes,
            position: ref.position,
            dataUrl: `data:${mimeType};base64,${file.toString('base64')}`,
          });
        } catch {
          log('resolver', 'failed to read asset file', { assetId, path: assetPath });
        }
        continue;
      }

      // Handle asset name references
      const asset = assets.find((a) => a.name === ref.name || a.file === ref.name);
      if (!asset) continue;

      const assetPath = await projectAssetPath(projectId, asset.id);
      const file = await readFile(assetPath);
      const ext = extname(assetPath).slice(1) || 'png';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const base64 = file.toString('base64');
      resolved.push({
        name: ref.name,
        role: ref.role,
        notes: ref.notes,
        position: ref.position,
        dataUrl: `data:${mimeType};base64,${base64}`,
      });
    }

    return resolved;
  }

  /**
   * Apply image editing transforms (rotate, flip, color balance) to resolved references.
   * Traces the workflow graph to find editing nodes between image sources and the output node.
   */
  async function applyImageEdits(
    references: Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }>,
    workflow: ImageXWorkflow,
    outputNodeId: string
  ): Promise<Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }>> {
    // Build a map of which editing nodes affect which image paths
    const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));

    // For each reference, trace backwards from outputNode to find editing nodes in its path
    const result: Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }> = [];

    for (const ref of references) {
      // Find the source node for this reference (by matching its path/name)
      const editingNodes = findEditingNodesForRef(ref.name, workflow, outputNodeId, nodesById);

      if (editingNodes.length === 0) {
        result.push(ref);
        continue;
      }

      // Apply transforms in order (from source towards output)
      let imageBuffer = Buffer.from(ref.dataUrl.split(',')[1] || '', 'base64');
      let pipeline = sharp(imageBuffer);

      for (const editNode of editingNodes) {
        if (editNode.type === 'rotate-flip') {
          const rotate = ((Number(editNode.data.rotate) || 0) % 360 + 360) % 360;
          const flipH = Boolean(editNode.data.flipH);
          const flipV = Boolean(editNode.data.flipV);
          if (rotate !== 0) pipeline = pipeline.rotate(rotate);
          if (flipH) pipeline = pipeline.flop();
          if (flipV) pipeline = pipeline.flip();
        } else if (editNode.type === 'color-balance') {
          const red = Number(editNode.data.red) || 0;
          const green = Number(editNode.data.green) || 0;
          const blue = Number(editNode.data.blue) || 0;
          if (red !== 0 || green !== 0 || blue !== 0) {
            // Apply color shift using linear transform
            pipeline = pipeline.linear(
              [1 + red / 100, 1 + green / 100, 1 + blue / 100],
              [0, 0, 0]
            );
          }
        }
      }

      const outputBuffer = await pipeline.png().toBuffer();
      const dataUrl = `data:image/png;base64,${outputBuffer.toString('base64')}`;
      result.push({ ...ref, dataUrl });
    }

    return result;
  }

  /**
   * Find editing nodes (rotate-flip, color-balance) in the path between an image source and the output node.
   */
  function findEditingNodesForRef(
    refName: string,
    workflow: ImageXWorkflow,
    outputNodeId: string,
    nodesById: Map<string, ImageXNode>
  ): ImageXNode[] {
    // Trace from outputNode backwards to find the path that includes this reference
    // Collect editing nodes along the way
    const editingNodes: ImageXNode[] = [];

    function traceBack(nodeId: string, visited: Set<string>): boolean {
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);

      const node = nodesById.get(nodeId);
      if (!node) return false;

      // Check if this node is the image source matching our reference
      if (node.type === 'image') {
        const assetUrl = typeof node.data.assetUrl === 'string' ? node.data.assetUrl : '';
        const assetName = typeof node.data.assetName === 'string' ? node.data.assetName : '';
        if (refName === assetUrl || refName === assetName || refName === node.id) {
          return true;
        }
      }

      // Trace upstream
      for (const edge of workflow.edges) {
        if (edge.target !== nodeId) continue;
        const found = traceBack(edge.source, visited);
        if (found) {
          // This node is on the path - if it's an editing node, collect it
          if (node.type === 'rotate-flip' || node.type === 'color-balance') {
            editingNodes.unshift(node); // unshift to maintain source-to-output order
          }
          return true;
        }
      }

      return false;
    }

    traceBack(outputNodeId, new Set());
    return editingNodes;
  }

  app.post('/api/projects/:projectId/compile', async (req: Request<{ projectId: string }, unknown, GenerateWorkflowRequest & { outputNodeId?: string }>, res, next) => {
    try {
      await getProject(req.params.projectId);
      const { workflow, outputNodeId } = req.body;
      const compiled = outputNodeId
        ? compileOutputNodeWorkflow(workflow, outputNodeId)
        : compileWorkflow(workflow);
      if (!compiled) {
        res.status(400).json({ error: 'Output node not found or invalid' });
        return;
      }
      res.json({ prompt: compiled.prompt, options: compiled.options });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/workflows', async (req, res, next) => {
    try {
      res.json({ workflow: await saveWorkflow(req.body) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/generate', async (req: Request<unknown, unknown, GenerateWorkflowRequest>, res, next) => {
    try {
      log('generate', 'starting non-project workflow generation');
      const bearerToken = await resolveCodexBearerToken();
      const results = await executeWorkflowOutputNodes(req.body.workflow, bearerToken);
      log('generate', 'non-project workflow generation complete', { results: results.length });
      await saveWorkflow(req.body.workflow);
      res.json({ results });
    } catch (error) {
      log('generate', 'non-project workflow generation failed', { error: String(error) });
      next(error);
    }
  });

  app.post('/api/compile', async (req: Request<unknown, unknown, GenerateWorkflowRequest & { outputNodeId?: string }>, res, next) => {
    try {
      const { workflow, outputNodeId } = req.body;
      const compiled = outputNodeId
        ? compileOutputNodeWorkflow(workflow, outputNodeId)
        : compileWorkflow(workflow);
      if (!compiled) {
        res.status(400).json({ error: 'Output node not found or invalid' });
        return;
      }
      res.json({ prompt: compiled.prompt, options: compiled.options });
    } catch (error) {
      next(error);
    }
  });

  app.get('/outputs/:workflow/:file', async (req, res, next) => {
    try {
      const workflow = decodeURIComponent(req.params.workflow || '');
      const file = decodeURIComponent(req.params.file || '');
      const outputsRoot = resolve(imagexPaths().outputsDir);
      const target = resolve(outputsRoot, workflow, file);
      if (relative(outputsRoot, target).startsWith('..')) {
        res.status(403).end();
        return;
      }
      await access(target);
      res.sendFile(target);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:projectId/outputs/:file', async (req, res, next) => {
    try {
      const projectId = decodeURIComponent(req.params.projectId || '');
      const file = decodeURIComponent(req.params.file || '');
      const outputsRoot = resolve(projectOutputDir(projectId));
      const target = resolve(outputsRoot, file);
      log('outputs', 'serving file', { projectId, file, target, outputsRoot });
      if (relative(outputsRoot, target).startsWith('..')) {
        res.status(403).end();
        return;
      }
      const buffer = await readFile(target);
      const ext = extname(target).slice(1) || 'png';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      res.type(mimeType).send(buffer);
    } catch (error) {
      log('outputs', 'failed to serve file', { projectId: req.params.projectId, file: req.params.file, error: String(error) });
      next(error);
    }
  });

  app.get('/api/projects/:projectId/assets/:file', async (req, res, next) => {
    try {
      const projectId = decodeURIComponent(req.params.projectId || '');
      const file = decodeURIComponent(req.params.file || '');
      const assetsRoot = resolve(projectAssetDir(projectId));
      const target = resolve(assetsRoot, file);
      if (relative(assetsRoot, target).startsWith('..') || file === 'assets.json') {
        res.status(403).end();
        return;
      }
      const buffer = await readFile(target);
      const ext = extname(target).slice(1) || 'png';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      res.type(mimeType).send(buffer);
    } catch (error) {
      next(error);
    }
  });

  serveWebApp(app);
  app.use(errorHandler);

  async function executeWorkflowOutputNodes(
    workflow: ImageXWorkflow,
    bearerToken: string,
    projectId?: string
  ): Promise<OutputNodeResult[]> {
    const outputNodes = workflow.nodes.filter((n) => n.type === 'codex-output');
    if (outputNodes.length === 0) {
      log('executor', 'no output nodes found');
      return [];
    }

    log('executor', 'discovered output nodes', { count: outputNodes.length, ids: outputNodes.map((n) => n.id) });

    // Build dependency graph: targetOutputId -> Set of source output node ids
    // Trace through intermediate nodes (an output node may connect through image nodes)
    const dependencies = new Map<string, Set<string>>();
    const outputNodeIds = new Set(outputNodes.map((n) => n.id));

    function findUpstreamOutputNodes(nodeId: string, visited: Set<string>): string[] {
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);
      const found: string[] = [];
      for (const edge of workflow.edges) {
        if (edge.target !== nodeId) continue;
        const sourceId = edge.source;
        if (outputNodeIds.has(sourceId)) {
          found.push(sourceId);
        } else {
          // Trace through intermediate nodes
          found.push(...findUpstreamOutputNodes(sourceId, visited));
        }
      }
      return found;
    }

    for (const outputNode of outputNodes) {
      const upstreamOutputs = findUpstreamOutputNodes(outputNode.id, new Set([outputNode.id]));
      if (upstreamOutputs.length > 0) {
        dependencies.set(outputNode.id, new Set(upstreamOutputs));
      }
    }

    // Kahn's algorithm for topological sort
    const inDegree = new Map<string, number>();
    for (const node of outputNodes) {
      inDegree.set(node.id, dependencies.get(node.id)?.size || 0);
    }

    const queue = outputNodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
    const order: string[] = [];

    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);

      for (const [targetId, deps] of dependencies) {
        if (deps.has(id)) {
          const newDegree = (inDegree.get(targetId) || 0) - 1;
          inDegree.set(targetId, newDegree);
          if (newDegree === 0) queue.push(targetId);
        }
      }
    }

    if (order.length !== outputNodes.length) {
      throw new Error('Circular dependency detected between output nodes');
    }

    log('executor', 'execution order', { order });

    const results = new Map<string, GeneratedImage[]>();
    const outputResults: OutputNodeResult[] = [];

    for (const outputNodeId of order) {
      log('executor', 'compiling output node', { outputNodeId });
      const compiled = compileOutputNodeWorkflow(workflow, outputNodeId);
      if (!compiled) {
        log('executor', 'compilation returned null, skipping', { outputNodeId });
        continue;
      }

      const { prompt, options } = compiled;
      log('executor', 'compiled output node', { outputNodeId, refs: options.references?.length || 0 });

      // Resolve static image references (assets) and output node references
      const upstreamIds = dependencies.get(outputNodeId) || new Set();
      if (projectId) {
        const resolved = await resolveImageReferences(projectId, options.references, results);
        // Apply image editing transforms (rotate/flip/color-balance) to resolved references
        const transformed = await applyImageEdits(resolved, workflow, outputNodeId);
        options.references = transformed;
        log('executor', 'resolved image references', { outputNodeId, resolved: resolved.length });
      }

      // Gather upstream generated images from dependent output nodes as extra images
      const extraImages: Array<{ dataUrl: string }> = [];
      for (const upstreamId of upstreamIds) {
        const upstreamImages = results.get(upstreamId) || [];
        log('executor', 'attaching upstream images', { outputNodeId, upstreamId, count: upstreamImages.length });
        for (const img of upstreamImages) {
          log('executor', 'reading upstream image', { outputNodeId, upstreamId, path: img.path });
          const file = await readFile(img.path);
          const ext = extname(img.path).slice(1) || 'png';
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          extraImages.push({
            dataUrl: `data:${mimeType};base64,${file.toString('base64')}`,
          });
        }
      }

      log('executor', 'generating images', { outputNodeId, count: options.count, extraImages: extraImages.length });
      const images = await generateCodexImages(
        options,
        bearerToken,
        projectId
          ? {
              outputDir: projectOutputDir(projectId),
              urlBase: `/api/projects/${encodeURIComponent(projectId)}/outputs`,
            }
          : undefined,
        extraImages
      );
      log('executor', 'images generated', { outputNodeId, count: images.length, urls: images.map((i) => i.url) });

      results.set(outputNodeId, images);
      outputResults.push({ outputNodeId, prompt, images });
    }

    return outputResults;
  }

  const server = createServer(app);
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  return server;
}

function serveWebApp(app: express.Express): void {
  const webRoot = findBuiltWebRoot();
  if (!webRoot) {
    app.get('/', (_req, res) => {
      res.status(503).send('imagex web UI is not built yet. Run `npm run build`, then start `imagex ui` again.');
    });
    return;
  }

  app.use(express.static(webRoot));
  app.get('*splat', (_req, res) => {
    res.sendFile(join(webRoot, 'index.html'));
  });
}

function findBuiltWebRoot(): string | null {
  const currentFile = fileURLToPath(import.meta.url);
  const candidates = [
    join(dirname(currentFile), '..', 'web'),
    join(process.cwd(), 'dist', 'web'),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) || null;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
}

function workflowFromBody(body: unknown): GenerateWorkflowRequest['workflow'] {
  if (body && typeof body === 'object' && 'workflow' in body) {
    return (body as GenerateWorkflowRequest).workflow;
  }
  return body as GenerateWorkflowRequest['workflow'];
}
