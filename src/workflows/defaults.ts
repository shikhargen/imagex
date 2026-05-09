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
        id: 'text-1',
        type: 'text',
        position: { x: 80, y: 120 },
        data: {
          text: 'A cinematic portrait of a neon explorer standing at the edge of a futuristic city.',
        },
      },
      {
        id: 'style-1',
        type: 'style',
        position: { x: 360, y: 80 },
        data: {
          name: 'High-detail concept art',
          medium: 'digital illustration',
          palette: 'electric cyan, deep black, warm amber highlights',
          description: 'Polished, dramatic, sharp silhouettes, readable details.',
        },
      },
      {
        id: 'scene-1',
        type: 'scene',
        position: { x: 360, y: 260 },
        data: {
          environment: 'rainy rooftop overlooking dense neon towers',
          lighting: 'rim lighting, wet reflections, volumetric haze',
          camera: 'medium-wide portrait framing',
        },
      },
      {
        id: 'output-1',
        type: 'output',
        position: { x: 700, y: 160 },
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
      { id: 'text-output', source: 'text-1', sourceHandle: 'prompt-out', target: 'output-1', targetHandle: 'prompt-in' },
      { id: 'style-output', source: 'style-1', sourceHandle: 'style-out', target: 'output-1', targetHandle: 'style-in' },
      { id: 'scene-output', source: 'scene-1', sourceHandle: 'scene-out', target: 'output-1', targetHandle: 'scene-in' },
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
