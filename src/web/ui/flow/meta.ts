import {
  FileText,
  Image,
  SlidersHorizontal,
  Frame,
  Pipette,
  File,
  RotateCw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { NodeType, NodeCategory } from '../../../shared/types.js';

export type NodeMeta = {
  label: string;
  accent: string;
  icon: LucideIcon;
  description: string;
  category: NodeCategory;
};

export const nodeMeta: Record<NodeType, NodeMeta> = {
  // ─── New Primitives ──────────────────────────────────────────────────────────
  prompt: {
    label: 'Prompt',
    accent: '#6ee7b7',
    icon: FileText,
    description: 'Text prompt with addable variables',
    category: 'primitive',
  },
  image: {
    label: 'Image',
    accent: '#60a5fa',
    icon: Image,
    description: 'Image reference with description',
    category: 'primitive',
  },
  color: {
    label: 'Color',
    accent: '#f472b6',
    icon: Pipette,
    description: 'Color picker (outputs hex)',
    category: 'primitive',
  },
  file: {
    label: 'File',
    accent: '#f59e0b',
    icon: File,
    description: 'Document attachment (converted to text)',
    category: 'primitive',
  },
  // ─── LLM Output ─────────────────────────────────────────────────────────────
  'codex-output': {
    label: 'Output',
    accent: '#22d3ee',
    icon: Sparkles,
    description: 'Generate image with AI',
    category: 'llm-output',
  },
  // ─── Image Editing ───────────────────────────────────────────────────────────
  'color-balance': {
    label: 'Color Balance',
    accent: '#a78bfa',
    icon: SlidersHorizontal,
    description: 'Adjust RGB color balance',
    category: 'image-editing',
  },
  'rotate-flip': {
    label: 'Rotate & Flip',
    accent: '#fb923c',
    icon: RotateCw,
    description: 'Rotate and flip image',
    category: 'image-editing',
  },
  // ─── Layout ──────────────────────────────────────────────────────────────────
  frame: {
    label: 'Frame',
    accent: '#6b7280',
    icon: Frame,
    description: 'Group nodes together',
    category: 'primitive',
  },
};
