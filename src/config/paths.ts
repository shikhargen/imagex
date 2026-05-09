import { homedir } from 'node:os';
import { join } from 'node:path';

export type ImageXPaths = {
  root: string;
  authFile: string;
  configFile: string;
  workflowsDir: string;
  projectsDir: string;
  outputsDir: string;
};

export function imagexPaths(): ImageXPaths {
  const root = process.env.IMAGEX_HOME || join(homedir(), '.imagex');
  return {
    root,
    authFile: join(root, 'auth.json'),
    configFile: join(root, 'config.json'),
    workflowsDir: join(root, 'workflows'),
    projectsDir: join(root, 'projects'),
    outputsDir: join(root, 'outputs'),
  };
}
