import {
  Box,
  Component,
  FileText,
  Image,
  MapPin,
  Palette,
  SlidersHorizontal,
  UserRound,
  Frame,
  type LucideIcon,
} from 'lucide-react';
import type { NodeType } from '../../../shared/types.js';

export type NodeMeta = {
  label: string;
  accent: string;
  icon: LucideIcon;
  description: string;
};

export const nodeMeta: Record<NodeType, NodeMeta> = {
  text: {
    label: 'Text',
    accent: '#6ee7b7',
    icon: FileText,
    description: 'Prompt fragment',
  },
  imageInput: {
    label: 'Image Input',
    accent: '#60a5fa',
    icon: Image,
    description: 'Reference or edit target',
  },
  character: {
    label: 'Character',
    accent: '#a78bfa',
    icon: UserRound,
    description: 'Identity and traits',
  },
  style: {
    label: 'Style',
    accent: '#f472b6',
    icon: Palette,
    description: 'Visual language',
  },
  scene: {
    label: 'Scene',
    accent: '#f59e0b',
    icon: MapPin,
    description: 'Environment and shot',
  },
  output: {
    label: 'Output',
    accent: '#22d3ee',
    icon: Box,
    description: 'Generation target',
  },
  frame: {
    label: 'Frame',
    accent: '#6b7280',
    icon: Frame,
    description: 'Grouped layout area',
  },
  custom: {
    label: 'Custom',
    accent: '#a3a3a3',
    icon: Component,
    description: 'User-defined node',
  },
};

export const utilityMeta = {
  controls: {
    label: 'Controls',
    accent: '#94a3b8',
    icon: SlidersHorizontal,
  },
};
