/**
 * Compatibility surface for browser image processing.
 *
 * Realtime preview, graph exports, and downloads now share the raw WebGL
 * implementation in webglEngine.
 */

export type { ImageResult, ImageStep } from './webglEngine.js';
export {
  invalidateProcessingCache,
  loadImage,
  processAndDownload,
  processImageChain,
  processImageToBlob,
  processImageToDataUrl,
  renderToCanvas,
} from './webglEngine.js';
