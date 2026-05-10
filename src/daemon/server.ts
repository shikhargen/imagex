import express, { type Request, type Response, type NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      const bearerToken = await resolveCodexBearerToken();
      const results = await executeWorkflowOutputNodes(
        req.body.workflow,
        bearerToken,
        req.params.projectId
      );
      await saveProjectWorkflow(req.params.projectId, req.body.workflow);
      res.json({ results });
    } catch (error) {
      next(error);
    }
  });

  async function resolveImageReferences(
    projectId: string,
    references?: Array<{ name: string; role: string; notes: string; position: string }>
  ): Promise<Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }>> {
    if (!references || references.length === 0) return [];

    const assets = await listProjectAssets(projectId);
    const resolved: Array<{ name: string; role: string; notes: string; position: string; dataUrl: string }> = [];

    for (const ref of references) {
      const asset = assets.find((a) => a.name === ref.name);
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
      const bearerToken = await resolveCodexBearerToken();
      const results = await executeWorkflowOutputNodes(req.body.workflow, bearerToken);
      await saveWorkflow(req.body.workflow);
      res.json({ results });
    } catch (error) {
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
      await access(target);
      res.sendFile(target);
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
    const outputNodes = workflow.nodes.filter((n) => n.type === 'output');
    if (outputNodes.length === 0) return [];

    // Build dependency graph: targetId -> Set of source output node ids
    const dependencies = new Map<string, Set<string>>();
    for (const edge of workflow.edges) {
      const source = workflow.nodes.find((n) => n.id === edge.source);
      const target = workflow.nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;
      if (source.type !== 'output' || target.type !== 'output') continue;
      if (edge.sourceHandle === 'result-out' && edge.targetHandle === 'image-in') {
        if (!dependencies.has(target.id)) dependencies.set(target.id, new Set());
        dependencies.get(target.id)!.add(source.id);
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

    const results = new Map<string, GeneratedImage[]>();
    const outputResults: OutputNodeResult[] = [];

    for (const outputNodeId of order) {
      const compiled = compileOutputNodeWorkflow(workflow, outputNodeId);
      if (!compiled) continue;

      const { prompt, options } = compiled;

      // Resolve static image references
      if (projectId) {
        const resolved = await resolveImageReferences(projectId, options.references);
        options.references = resolved;
      }

      // Gather upstream generated images from dependent output nodes
      const upstreamIds = dependencies.get(outputNodeId) || new Set();
      const extraImages: Array<{ dataUrl: string }> = [];
      for (const upstreamId of upstreamIds) {
        const upstreamImages = results.get(upstreamId) || [];
        for (const img of upstreamImages) {
          const file = await readFile(img.path);
          const ext = extname(img.path).slice(1) || 'png';
          const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          extraImages.push({
            dataUrl: `data:${mimeType};base64,${file.toString('base64')}`,
          });
        }
      }

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
