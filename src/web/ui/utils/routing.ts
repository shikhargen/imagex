import type { ImageXProject } from '../../../shared/types.js';

export function pushProjectRoute(project: ImageXProject): void {
  const path = projectPath(project);
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
}

export function projectPath(project: ImageXProject): string {
  return `/projects/${slugify(project.metadata.title)}--${project.metadata.id}`;
}

export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
  if (!match) return null;
  const segment = decodeURIComponent(match[1] || '');
  return segment.includes('--') ? segment.slice(segment.lastIndexOf('--') + 2) : segment;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}
