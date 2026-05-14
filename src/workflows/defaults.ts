import { randomUUID } from 'node:crypto';
import type { ImageXWorkflow } from '../shared/types.js';

export function createDefaultWorkflow(): ImageXWorkflow {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    version: '0.1',
    name: 'Untitled Workflow',
    createdAt: now,
    updatedAt: now,
    settings: {
      provider: 'openai-codex',
      useCase: 'stylized-concept',
    },
    nodes: [
      {
        id: 'prompt-1',
        type: 'prompt',
        position: { x: 80, y: 160 },
        data: {
          text: 'A cinematic portrait of a neon explorer standing at the edge of a futuristic city.',
        },
      },
      {
        id: 'output-1',
        type: 'codex-output',
        position: { x: 500, y: 160 },
        data: {
          size: '1024x1024',
          quality: 'auto',
          format: 'png',
          background: 'auto',
          count: 1,
        },
      },
    ],
    edges: [
      { id: 'prompt-to-output', source: 'prompt-1', sourceHandle: 'text-out', target: 'output-1', targetHandle: 'input-in' },
    ],
  };
}

export function createEmptyWorkflow(name = 'Untitled Workflow'): ImageXWorkflow {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    version: '0.1',
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      provider: 'openai-codex',
      useCase: 'stylized-concept',
    },
    nodes: [],
    edges: [],
  };
}
