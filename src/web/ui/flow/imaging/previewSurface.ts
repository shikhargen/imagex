type PreviewSurfaceRefreshListener = () => void;

const previewSurfaceListeners = new Set<PreviewSurfaceRefreshListener>();

export function onPreviewSurfaceRefresh(listener: PreviewSurfaceRefreshListener): () => void {
  previewSurfaceListeners.add(listener);
  return () => previewSurfaceListeners.delete(listener);
}

export function refreshPreviewSurfaces(): void {
  performance.mark('imagex.preview-surface-refresh');
  window.dispatchEvent(new CustomEvent('imagex:preview-surface-refresh'));
  for (const listener of previewSurfaceListeners) listener();
}
