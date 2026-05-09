import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imagexPaths } from '../config/paths.js';
import type { ImageXWorkflow } from '../shared/types.js';
import { createDefaultWorkflow } from './defaults.js';

export async function listWorkflows(): Promise<ImageXWorkflow[]> {
  const dir = imagexPaths().workflowsDir;
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir);
  const workflows = await Promise.all(
    files
      .filter((file) => file.endsWith('.imagex.json'))
      .map(async (file) => JSON.parse(await readFile(join(dir, file), 'utf8')) as ImageXWorkflow)
  );

  if (workflows.length > 0) return workflows;

  const workflow = createDefaultWorkflow();
  await saveWorkflow(workflow);
  return [workflow];
}

export async function saveWorkflow(workflow: ImageXWorkflow): Promise<ImageXWorkflow> {
  const dir = imagexPaths().workflowsDir;
  await mkdir(dir, { recursive: true });
  const updated: ImageXWorkflow = {
    ...workflow,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(dir, `${updated.id}.imagex.json`), `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  return updated;
}
