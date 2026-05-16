/**
 * webglEngine - GPU-backed browser image processing for editor previews and exports.
 *
 * The daemon can keep its own server-side parity implementation, but the
 * realtime editor path runs through raw WebGL shaders.
 */

export type ImageStep = {
  type: string;
  params: Record<string, unknown>;
};

export type ImageResult = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
};

type TextureFrame = {
  texture: WebGLTexture;
  width: number;
  height: number;
  owned: boolean;
};

type RenderTarget =
  | { kind: 'texture'; frame: TextureFrame }
  | { kind: 'canvas'; width: number; height: number };

const MAX_SHADER_BLUR_RADIUS = 64;
const SOURCE_CACHE_MAX = 32;
const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();
const bitmapCache = new Map<string, ImageBitmap>();
const resolutionListeners = new Set<() => void>();

let sharedRenderer: WebglRenderer | null = null;
let webglReady: boolean | null = null;
let previewMaxLongEdge = Number(localStorage.getItem('imagex.previewResolution')) || 1024;

export function initWebgl(): Promise<boolean> {
  if (webglReady !== null) return Promise.resolve(webglReady);
  webglReady = Boolean(getSharedRenderer());
  return Promise.resolve(webglReady);
}

export function isWebglReady(): boolean {
  if (webglReady !== null) return webglReady;
  webglReady = Boolean(getSharedRenderer());
  return webglReady;
}

export function setPreviewResolution(value: number): void {
  previewMaxLongEdge = Math.max(64, Math.round(value));
  localStorage.setItem('imagex.previewResolution', String(previewMaxLongEdge));
  invalidateProcessingCache();
  for (const fn of resolutionListeners) fn();
}

export function getPreviewResolution(): number {
  return previewMaxLongEdge;
}

export function onResolutionChange(listener: () => void): () => void {
  resolutionListeners.add(listener);
  return () => resolutionListeners.delete(listener);
}

export function invalidateProcessingCache(): void {
  for (const bitmap of bitmapCache.values()) bitmap.close();
  bitmapCache.clear();
  sharedRenderer?.clearSourceTextureCache();
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return Promise.resolve(cached);

  const existing = loadingPromises.get(url);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(url, img);
      loadingPromises.delete(url);
      resolve(img);
    };
    img.onerror = () => {
      loadingPromises.delete(url);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
  loadingPromises.set(url, promise);
  return promise;
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  chain: ImageStep[],
  maxLongEdge = previewMaxLongEdge,
): void {
  const renderer = getSharedRenderer();
  if (!renderer) throw new Error('WebGL is not available for image rendering.');
  renderer.renderToCanvas(canvas, sourceImg, chain, maxLongEdge > 0 ? maxLongEdge : undefined);
}

export async function processImageChain(sourceUrl: string, chain: ImageStep[]): Promise<ImageBitmap> {
  const cacheKey = `${sourceUrl}|${stableChainKey(chain)}`;
  const cached = bitmapCache.get(cacheKey);
  if (cached) return createImageBitmap(cached);

  const sourceImg = await loadImage(sourceUrl);
  const renderer = getSharedRenderer();
  if (!renderer) throw new Error('WebGL is not available for image processing.');
  const bitmap = await renderer.renderToBitmap(sourceImg, chain);

  if (bitmapCache.size >= SOURCE_CACHE_MAX) {
    const firstKey = bitmapCache.keys().next().value;
    if (firstKey !== undefined) {
      bitmapCache.get(firstKey)?.close();
      bitmapCache.delete(firstKey);
    }
  }
  bitmapCache.set(cacheKey, bitmap);
  return createImageBitmap(bitmap);
}

export async function processImageToBlob(
  sourceUrl: string,
  chain: ImageStep[],
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): Promise<Blob> {
  const bitmap = await processImageChain(sourceUrl, chain);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('2D canvas export context is not available.');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: format, quality });
}

export async function processImageToDataUrl(
  sourceUrl: string,
  chain: ImageStep[],
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): Promise<string> {
  const blob = await processImageToBlob(sourceUrl, chain, format, quality);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function processAndDownload(
  sourceUrl: string,
  chain: ImageStep[],
  filename = 'image.png',
): Promise<void> {
  const blob = await processImageToBlob(sourceUrl, chain, 'image/png');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getSharedRenderer(): WebglRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.left = '-10000px';
  canvas.style.top = '0';
  canvas.style.width = '1px';
  canvas.style.height = '1px';
  canvas.style.visibility = 'hidden';
  (document.body || document.documentElement).appendChild(canvas);
  sharedRenderer = WebglRenderer.create(canvas);
  return sharedRenderer;
}

function stableChainKey(chain: ImageStep[]): string {
  return JSON.stringify(chain.map((step) => ({ type: step.type, params: step.params })));
}

function scaledDimensions(width: number, height: number, maxLongEdge?: number): { width: number; height: number; scale: number } {
  if (!maxLongEdge || maxLongEdge <= 0) return { width, height, scale: 1 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height, scale: 1 };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function scaledStep(step: ImageStep, scale: number): ImageStep {
  if (scale === 1) return step;
  if (step.type === 'crop') {
    return {
      type: step.type,
      params: {
        ...step.params,
        x: Math.round((Number(step.params.x) || 0) * scale),
        y: Math.round((Number(step.params.y) || 0) * scale),
        cropWidth: Math.round((Number(step.params.cropWidth) || 0) * scale),
        cropHeight: Math.round((Number(step.params.cropHeight) || 0) * scale),
      },
    };
  }
  if (step.type === 'blur') {
    return {
      type: step.type,
      params: {
        ...step.params,
        radius: Math.max(0, Math.round((Number(step.params.radius) || 0) * scale)),
      },
    };
  }
  return step;
}

class WebglRenderer {
  private readonly gl: WebGL2RenderingContext | WebGLRenderingContext;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly buffer: WebGLBuffer;
  private readonly copyProgram: WebGLProgram;
  private readonly colorProgram: WebGLProgram;
  private readonly cropProgram: WebGLProgram;
  private readonly rotateProgram: WebGLProgram;
  private readonly blurProgram: WebGLProgram;
  private readonly vertexLocations = new Map<WebGLProgram, { position: number; uv: number }>();
  private readonly sourceTextureCache = new Map<string, TextureFrame>();

  private constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      stencil: false,
    }) || canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      desynchronized: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      stencil: false,
    });

    if (!gl) throw new Error('WebGL context is not available.');
    this.gl = gl;

    const framebuffer = gl.createFramebuffer();
    const buffer = gl.createBuffer();
    if (!framebuffer || !buffer) throw new Error('Failed to allocate WebGL resources.');

    this.framebuffer = framebuffer;
    this.buffer = buffer;
    this.copyProgram = this.createProgram(FRAGMENT_COPY);
    this.colorProgram = this.createProgram(FRAGMENT_COLOR_BALANCE);
    this.cropProgram = this.createProgram(FRAGMENT_CROP);
    this.rotateProgram = this.createProgram(FRAGMENT_ROTATE_FLIP);
    this.blurProgram = this.createProgram(FRAGMENT_BLUR);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  }

  static create(canvas: HTMLCanvasElement): WebglRenderer | null {
    try {
      return new WebglRenderer(canvas);
    } catch (error) {
      console.warn('[webglEngine] Failed to initialize WebGL renderer:', error);
      return null;
    }
  }

  renderToCanvas(canvas: HTMLCanvasElement, sourceImg: HTMLImageElement, chain: ImageStep[], maxLongEdge?: number): void {
    const result = this.renderChain(sourceImg, chain, maxLongEdge);
    const glCanvas = this.gl.canvas as HTMLCanvasElement;
    glCanvas.width = result.width;
    glCanvas.height = result.height;
    this.renderPass(this.copyProgram, result, { kind: 'canvas', width: result.width, height: result.height });
    this.gl.finish();
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D canvas preview context is not available.');
    ctx.clearRect(0, 0, result.width, result.height);
    ctx.drawImage(glCanvas, 0, 0);
    this.deleteFrame(result);
  }

  async renderToBitmap(sourceImg: HTMLImageElement, chain: ImageStep[]): Promise<ImageBitmap> {
    const result = this.renderChain(sourceImg, chain);
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.width = result.width;
    canvas.height = result.height;
    this.renderPass(this.copyProgram, result, { kind: 'canvas', width: result.width, height: result.height });
    this.gl.finish();
    this.deleteFrame(result);
    return createImageBitmap(canvas);
  }

  private renderChain(sourceImg: HTMLImageElement, chain: ImageStep[], maxLongEdge?: number): TextureFrame {
    const sourceWidth = sourceImg.naturalWidth || sourceImg.width;
    const sourceHeight = sourceImg.naturalHeight || sourceImg.height;
    const scaled = scaledDimensions(sourceWidth, sourceHeight, maxLongEdge);
    let current = this.getSourceFrame(sourceImg, sourceWidth, sourceHeight);

    if (scaled.scale !== 1) {
      const downsampled = this.createEmptyFrame(scaled.width, scaled.height);
      this.renderPass(this.copyProgram, current, { kind: 'texture', frame: downsampled });
      this.deleteFrame(current);
      current = downsampled;
    }

    for (const rawStep of chain) {
      const step = scaledStep(rawStep, scaled.scale);
      const next = this.applyStep(current, step);
      if (next !== current) {
        this.deleteFrame(current);
        current = next;
      }
    }

    return current;
  }

  private applyStep(input: TextureFrame, step: ImageStep): TextureFrame {
    switch (step.type) {
      case 'rotate-flip':
        return this.applyRotateFlip(input, step.params);
      case 'crop':
        return this.applyCrop(input, step.params);
      case 'color-balance':
        return this.applyColorBalance(input, step.params);
      case 'blur':
        return this.applyBlur(input, step.params);
      default:
        return this.copyFrame(input, input.width, input.height);
    }
  }

  private applyRotateFlip(input: TextureFrame, params: Record<string, unknown>): TextureFrame {
    const rotate = ((Number(params.rotate) || 0) % 360 + 360) % 360;
    const flipH = Boolean(params.flipH);
    const flipV = Boolean(params.flipV);
    const rotated = rotate === 90 || rotate === 270;
    const width = rotated ? input.height : input.width;
    const height = rotated ? input.width : input.height;
    const output = this.createEmptyFrame(width, height);

    this.renderPass(this.rotateProgram, input, { kind: 'texture', frame: output }, (gl, program) => {
      this.uniform2f(program, 'u_sourceSize', input.width, input.height);
      this.uniform2f(program, 'u_targetSize', width, height);
      this.uniform1f(program, 'u_angle', rotate);
      this.uniform1f(program, 'u_flipH', flipH ? 1 : 0);
      this.uniform1f(program, 'u_flipV', flipV ? 1 : 0);
      gl;
    });

    return output;
  }

  private applyCrop(input: TextureFrame, params: Record<string, unknown>): TextureFrame {
    const x = Math.max(0, Math.round(Number(params.x) || 0));
    const y = Math.max(0, Math.round(Number(params.y) || 0));
    const requestedWidth = Math.round(Number(params.cropWidth) || input.width);
    const requestedHeight = Math.round(Number(params.cropHeight) || input.height);
    if (requestedWidth <= 0 || requestedHeight <= 0 || x >= input.width || y >= input.height) {
      return this.copyFrame(input, input.width, input.height);
    }
    const width = Math.max(1, Math.min(requestedWidth, input.width - x));
    const height = Math.max(1, Math.min(requestedHeight, input.height - y));

    if (x === 0 && y === 0 && width >= input.width && height >= input.height) {
      return this.copyFrame(input, input.width, input.height);
    }

    const output = this.createEmptyFrame(width, height);
    this.renderPass(this.cropProgram, input, { kind: 'texture', frame: output }, () => {
      this.uniform2f(this.cropProgram, 'u_sourceSize', input.width, input.height);
      this.uniform4f(this.cropProgram, 'u_cropRect', x, y, width, height);
    });
    return output;
  }

  private applyColorBalance(input: TextureFrame, params: Record<string, unknown>): TextureFrame {
    const red = Number(params.red) || 0;
    const green = Number(params.green) || 0;
    const blue = Number(params.blue) || 0;
    const output = this.createEmptyFrame(input.width, input.height);
    this.renderPass(this.colorProgram, input, { kind: 'texture', frame: output }, () => {
      this.uniform3f(this.colorProgram, 'u_delta', red / 100, green / 100, blue / 100);
    });
    return output;
  }

  private applyBlur(input: TextureFrame, params: Record<string, unknown>): TextureFrame {
    const radius = Math.min(MAX_SHADER_BLUR_RADIUS, Math.max(0, Math.round(Number(params.radius) || 0)));
    if (radius <= 0) return this.copyFrame(input, input.width, input.height);

    const temp = this.createEmptyFrame(input.width, input.height);
    const output = this.createEmptyFrame(input.width, input.height);
    this.renderPass(this.blurProgram, input, { kind: 'texture', frame: temp }, () => {
      this.uniform2f(this.blurProgram, 'u_textureSize', input.width, input.height);
      this.uniform2f(this.blurProgram, 'u_direction', 1, 0);
      this.uniform1f(this.blurProgram, 'u_radius', radius);
    });
    this.renderPass(this.blurProgram, temp, { kind: 'texture', frame: output }, () => {
      this.uniform2f(this.blurProgram, 'u_textureSize', input.width, input.height);
      this.uniform2f(this.blurProgram, 'u_direction', 0, 1);
      this.uniform1f(this.blurProgram, 'u_radius', radius);
    });
    this.deleteFrame(temp);
    return output;
  }

  private copyFrame(input: TextureFrame, width: number, height: number): TextureFrame {
    const output = this.createEmptyFrame(width, height);
    this.renderPass(this.copyProgram, input, { kind: 'texture', frame: output });
    return output;
  }

  private renderPass(
    program: WebGLProgram,
    input: TextureFrame,
    target: RenderTarget,
    uniforms?: (gl: WebGL2RenderingContext | WebGLRenderingContext, program: WebGLProgram) => void,
  ): void {
    const gl = this.gl;
    const targetWidth = target.kind === 'texture' ? target.frame.width : target.width;
    const targetHeight = target.kind === 'texture' ? target.frame.height : target.height;

    if (target.kind === 'texture') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.frame.texture, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, targetWidth, targetHeight);
    gl.useProgram(program);
    this.bindQuad(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.texture);
    this.uniform1i(program, 'u_image', 0);
    this.uniform2f(program, 'u_inputSize', input.width, input.height);
    uniforms?.(gl, program);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private createTextureFromImage(sourceImg: HTMLImageElement): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to allocate source texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImg);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return texture;
  }

  private getSourceFrame(sourceImg: HTMLImageElement, width: number, height: number): TextureFrame {
    const cacheKey = `${sourceImg.currentSrc || sourceImg.src}@${width}x${height}`;
    const cached = this.sourceTextureCache.get(cacheKey);
    if (cached) return cached;

    const frame: TextureFrame = {
      texture: this.createTextureFromImage(sourceImg),
      width,
      height,
      owned: false,
    };
    if (this.sourceTextureCache.size >= SOURCE_CACHE_MAX) {
      const firstKey = this.sourceTextureCache.keys().next().value;
      if (firstKey !== undefined) {
        const first = this.sourceTextureCache.get(firstKey);
        if (first) this.gl.deleteTexture(first.texture);
        this.sourceTextureCache.delete(firstKey);
      }
    }
    this.sourceTextureCache.set(cacheKey, frame);
    return frame;
  }

  clearSourceTextureCache(): void {
    for (const frame of this.sourceTextureCache.values()) {
      this.gl.deleteTexture(frame.texture);
    }
    this.sourceTextureCache.clear();
  }

  private createEmptyFrame(width: number, height: number): TextureFrame {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to allocate output texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return { texture, width, height, owned: true };
  }

  private deleteFrame(frame: TextureFrame): void {
    if (!frame.owned) return;
    this.gl.deleteTexture(frame.texture);
  }

  private bindQuad(program: WebGLProgram): void {
    const gl = this.gl;
    let locations = this.vertexLocations.get(program);
    if (!locations) {
      locations = {
        position: gl.getAttribLocation(program, 'a_position'),
        uv: gl.getAttribLocation(program, 'a_uv'),
      };
      this.vertexLocations.set(program, locations);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(locations.position);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(locations.uv);
    gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 16, 8);
  }

  private createProgram(fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to allocate WebGL program.');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program) || 'Unknown program link error.';
      gl.deleteProgram(program);
      throw new Error(error);
    }
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to allocate WebGL shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.';
      gl.deleteShader(shader);
      throw new Error(error);
    }
    return shader;
  }

  private uniform1i(program: WebGLProgram, name: string, value: number): void {
    const location = this.gl.getUniformLocation(program, name);
    if (location) this.gl.uniform1i(location, value);
  }

  private uniform1f(program: WebGLProgram, name: string, value: number): void {
    const location = this.gl.getUniformLocation(program, name);
    if (location) this.gl.uniform1f(location, value);
  }

  private uniform2f(program: WebGLProgram, name: string, x: number, y: number): void {
    const location = this.gl.getUniformLocation(program, name);
    if (location) this.gl.uniform2f(location, x, y);
  }

  private uniform3f(program: WebGLProgram, name: string, x: number, y: number, z: number): void {
    const location = this.gl.getUniformLocation(program, name);
    if (location) this.gl.uniform3f(location, x, y, z);
  }

  private uniform4f(program: WebGLProgram, name: string, x: number, y: number, z: number, w: number): void {
    const location = this.gl.getUniformLocation(program, name);
    if (location) this.gl.uniform4f(location, x, y, z, w);
  }
}

const QUAD_VERTICES = new Float32Array([
  -1, -1, 0, 0,
  1, -1, 1, 0,
  -1, 1, 0, 1,
  1, 1, 1, 1,
]);

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_HEADER = `
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_inputSize;
varying vec2 v_uv;
`;

const FRAGMENT_COPY = `
${FRAGMENT_HEADER}

void main() {
  gl_FragColor = texture2D(u_image, v_uv);
}
`;

const FRAGMENT_COLOR_BALANCE = `
${FRAGMENT_HEADER}
uniform vec3 u_delta;

void main() {
  vec4 color = texture2D(u_image, v_uv);
  gl_FragColor = vec4(clamp(color.rgb + u_delta, 0.0, 1.0), color.a);
}
`;

const FRAGMENT_CROP = `
${FRAGMENT_HEADER}
uniform vec2 u_sourceSize;
uniform vec4 u_cropRect;

void main() {
  vec2 topLeftUv = vec2(
    (u_cropRect.x + v_uv.x * u_cropRect.z) / u_sourceSize.x,
    (u_cropRect.y + (1.0 - v_uv.y) * u_cropRect.w) / u_sourceSize.y
  );
  gl_FragColor = texture2D(u_image, vec2(topLeftUv.x, 1.0 - topLeftUv.y));
}
`;

const FRAGMENT_ROTATE_FLIP = `
${FRAGMENT_HEADER}
uniform vec2 u_sourceSize;
uniform vec2 u_targetSize;
uniform float u_angle;
uniform float u_flipH;
uniform float u_flipV;

void main() {
  vec2 outputTopLeftPx = vec2(v_uv.x * u_targetSize.x, (1.0 - v_uv.y) * u_targetSize.y);
  vec2 centered = outputTopLeftPx - (u_targetSize * 0.5);
  float radians = -u_angle * 0.017453292519943295;
  float c = cos(radians);
  float s = sin(radians);
  vec2 rotated = vec2(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c
  );
  if (u_flipH > 0.5) rotated.x = -rotated.x;
  if (u_flipV > 0.5) rotated.y = -rotated.y;
  vec2 sourceTopLeftUv = (rotated + (u_sourceSize * 0.5)) / u_sourceSize;
  gl_FragColor = texture2D(u_image, vec2(sourceTopLeftUv.x, 1.0 - sourceTopLeftUv.y));
}
`;

const FRAGMENT_BLUR = `
${FRAGMENT_HEADER}
uniform vec2 u_textureSize;
uniform vec2 u_direction;
uniform float u_radius;

void main() {
  vec2 texel = u_direction / u_textureSize;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  float sigma = max(u_radius * 0.5, 0.5);

  for (int i = -${MAX_SHADER_BLUR_RADIUS}; i <= ${MAX_SHADER_BLUR_RADIUS}; i++) {
    float fi = float(i);
    if (abs(fi) <= u_radius) {
      float weight = exp(-(fi * fi) / (2.0 * sigma * sigma));
      sum += texture2D(u_image, v_uv + texel * fi) * weight;
      weightSum += weight;
    }
  }

  gl_FragColor = sum / weightSum;
}
`;
