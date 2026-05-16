#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

const root = process.cwd();
const htmlPath = join(root, 'src', 'web', 'webgl-pipeline-verify.generated.html');
const host = '127.0.0.1';

class CdpClient {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const client = new CdpClient(socket);
      socket.addEventListener('open', () => resolve(client), { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

const port = await getFreePort();
const debugPort = await getFreePort();
const url = `http://${host}:${port}/webgl-pipeline-verify.generated.html`;

const chromeBin = process.env.CHROME_BIN || 'google-chrome';

await writeFile(htmlPath, verifierHtml(), 'utf8');

const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--host', host, '--port', String(port), '--strictPort', '--clearScreen', 'false'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);

let viteOutput = '';
vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString(); });
vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString(); });

try {
  await waitForServer(`http://${host}:${port}`, 20_000);

  const chrome = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      `--remote-debugging-port=${debugPort}`,
      url,
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let chromeOutput = '';
  chrome.stdout.on('data', (chunk) => { chromeOutput += chunk.toString(); });
  chrome.stderr.on('data', (chunk) => { chromeOutput += chunk.toString(); });

  try {
    const wsUrl = await waitForPageWebSocket(debugPort, url, 20_000);
    const cdp = await CdpClient.connect(wsUrl);
    try {
      await cdp.call('Runtime.enable');
      const verifyResult = await waitForVerifierResult(cdp, 30_000);
      if (!verifyResult.ok) {
        throw new Error(`WebGL verifier failed.\n${verifyResult.error || ''}\n${chromeOutput}`);
      }
      console.log(`WEBGL_VERIFY_PASS ${JSON.stringify({ checks: verifyResult.checks, averageMs: verifyResult.averageMs })}`);
    } finally {
      cdp.close();
    }
  } finally {
    chrome.kill('SIGTERM');
  }
} finally {
  vite.kill('SIGTERM');
  await rm(htmlPath, { force: true });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, host, () => {
      const address = server.address();
      const selected = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(selected));
    });
    server.on('error', reject);
  });
}

async function waitForPageWebSocket(debugPort, targetUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://${host}:${debugPort}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page' && target.url === targetUrl)
          || targets.find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Chrome DevTools.');
}

async function waitForVerifierResult(cdp, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await cdp.call('Runtime.evaluate', {
      expression: 'window.__imagexWebglVerifyResult ?? null',
      returnByValue: true,
    });
    const value = response.result?.value;
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for WebGL verifier result.');
}

async function waitForServer(target, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(target);
      if (response.ok || response.status === 404) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for Vite.\n${viteOutput}`);
}

function verifierHtml() {
  return String.raw`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>ImageX WebGL verifier</title>
  </head>
  <body>
    <pre id="result">WEBGL_VERIFY_RUNNING</pre>
    <script type="module">
      import {
        initWebgl,
        isWebglReady,
        loadImage,
        processImageChain,
        renderToCanvas,
      } from '/ui/flow/imaging/index.ts';
      import { GraphEngine } from '/state/graphEngine.ts';

      window.__imagexWebglVerifyResult = null;
      const result = document.getElementById('result');
      const checks = [];

      function assert(condition, message) {
        if (!condition) throw new Error(message);
        checks.push(message);
      }

      function near(actual, expected, tolerance = 8) {
        return Math.abs(actual - expected) <= tolerance;
      }

      function assertPixel(pixel, expected, label) {
        assert(
          near(pixel[0], expected[0]) &&
            near(pixel[1], expected[1]) &&
            near(pixel[2], expected[2]) &&
            near(pixel[3], expected[3], 4),
          label + ' expected ' + expected.join(',') + ' got ' + Array.from(pixel).join(','),
        );
      }

      function sourceDataUrl() {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 3;
        const ctx = canvas.getContext('2d');
        const rows = [
          [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]],
          [[0, 255, 255, 255], [100, 100, 100, 255], [255, 255, 0, 255], [255, 0, 255, 255]],
          [[0, 0, 0, 255], [128, 0, 0, 255], [0, 128, 0, 255], [0, 0, 128, 255]],
        ];
        const imageData = ctx.createImageData(4, 3);
        let offset = 0;
        for (const row of rows) {
          for (const pixel of row) {
            imageData.data.set(pixel, offset);
            offset += 4;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
      }

      function benchmarkSourceDataUrl(size = 256) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const offset = (y * size + x) * 4;
            imageData.data[offset] = (x * 255) / size;
            imageData.data[offset + 1] = (y * 255) / size;
            imageData.data[offset + 2] = ((x + y) * 255) / (size * 2);
            imageData.data[offset + 3] = 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
      }

      async function readPixel(canvas, x, y) {
        const image = new Image();
        image.src = canvas.toDataURL('image/png');
        await image.decode();
        const copy = document.createElement('canvas');
        copy.width = image.naturalWidth;
        copy.height = image.naturalHeight;
        const ctx = copy.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(x, y, 1, 1).data;
      }

      function render(img, chain) {
        const canvas = document.createElement('canvas');
        renderToCanvas(canvas, img, chain);
        return canvas;
      }

      try {
        await initWebgl();
        assert(isWebglReady(), 'webgl initializes');

        const img = await loadImage(sourceDataUrl());

        const source = render(img, []);
        assert(source.width === 4 && source.height === 3, 'source dimensions preserved');
        assertPixel(await readPixel(source, 0, 0), [255, 0, 0, 255], 'source top-left orientation');

        const cropped = render(img, [{ type: 'crop', params: { x: 1, y: 1, cropWidth: 2, cropHeight: 1 } }]);
        assert(cropped.width === 2 && cropped.height === 1, 'crop dimensions');
        assertPixel(await readPixel(cropped, 0, 0), [100, 100, 100, 255], 'crop first pixel');
        assertPixel(await readPixel(cropped, 1, 0), [255, 255, 0, 255], 'crop second pixel');

        const invalidCrop = render(img, [{ type: 'crop', params: { x: 99, y: 99, cropWidth: 2, cropHeight: 2 } }]);
        assert(invalidCrop.width === 4 && invalidCrop.height === 3, 'invalid crop leaves source dimensions');

        const flipped = render(img, [{ type: 'rotate-flip', params: { rotate: 0, flipH: true, flipV: false } }]);
        assert(flipped.width === 4 && flipped.height === 3, 'flip dimensions');
        assertPixel(await readPixel(flipped, 0, 0), [255, 255, 255, 255], 'flip horizontal top-left');

        const rotated = render(img, [{ type: 'rotate-flip', params: { rotate: 90, flipH: false, flipV: false } }]);
        assert(rotated.width === 3 && rotated.height === 4, 'rotate 90 dimensions');

        const balanced = render(img, [
          { type: 'crop', params: { x: 1, y: 1, cropWidth: 1, cropHeight: 1 } },
          { type: 'color-balance', params: { red: 100, green: 0, blue: 0 } },
        ]);
        assertPixel(await readPixel(balanced, 0, 0), [255, 100, 100, 255], 'color balance red channel');

        const blurred = render(img, [{ type: 'blur', params: { radius: 2 } }]);
        assert(blurred.width === 4 && blurred.height === 3, 'blur dimensions');
        const blurredPixel = await readPixel(blurred, 1, 1);
        assert(!near(blurredPixel[0], 100, 2) || !near(blurredPixel[1], 100, 2) || !near(blurredPixel[2], 100, 2), 'blur changes center pixel');

        const bitmap = await processImageChain(img.src, [{ type: 'crop', params: { x: 1, y: 1, cropWidth: 2, cropHeight: 1 } }]);
        assert(bitmap.width === 2 && bitmap.height === 1, 'processImageChain crop dimensions');
        bitmap.close();

        const benchmarkImg = await loadImage(benchmarkSourceDataUrl());
        const benchmarkChain = [
          { type: 'rotate-flip', params: { rotate: 0, flipH: false, flipV: false } },
          { type: 'crop', params: { x: 16, y: 12, cropWidth: 224, cropHeight: 220 } },
          { type: 'color-balance', params: { red: 12, green: -8, blue: 6 } },
          { type: 'blur', params: { radius: 4 } },
        ];
        for (let i = 0; i < 5; i++) render(benchmarkImg, benchmarkChain);
        const start = performance.now();
        for (let i = 0; i < 40; i++) render(benchmarkImg, benchmarkChain);
        const averageMs = (performance.now() - start) / 40;
        const repeated = render(benchmarkImg, benchmarkChain);
        assert(repeated.width === 224 && repeated.height === 220, 'repeated cached WebGL preview renders complete');
        assert(averageMs < 25, '40 cached WebGL preview renders average under 25ms');

        const engine = new GraphEngine();
        const graphNodes = Array.from({ length: 60 }, (_, index) => {
          const imageId = 'image-' + index;
          const editId = 'blur-' + index;
          return [
            { id: imageId, type: 'image', position: { x: index * 24, y: 0 }, data: { assetUrl: 'asset-' + index } },
            { id: editId, type: 'blur', position: { x: index * 24, y: 220 }, data: { radius: 2 } },
          ];
        }).flat();
        const graphEdges = Array.from({ length: 60 }, (_, index) => ({
          id: 'edge-' + index,
          source: 'image-' + index,
          target: 'blur-' + index,
          sourceHandle: 'image-out',
          targetHandle: 'image-in',
        }));
        engine.setGraph(graphNodes, graphEdges);
        let changedBranchNotifications = 0;
        let untouchedBranchNotifications = 0;
        engine.subscribeNode('blur-0', () => { changedBranchNotifications += 1; });
        engine.subscribeNode('blur-1', () => { untouchedBranchNotifications += 1; });
        engine.setGraph(
          graphNodes.map((node) => node.id === 'image-0' ? { ...node, position: { x: 999, y: 999 } } : node),
          graphEdges,
        );
        assert(changedBranchNotifications === 0 && untouchedBranchNotifications === 0, 'position-only graph changes do not invalidate previews');
        engine.setGraph(
          graphNodes.map((node) => node.id === 'image-0' ? { ...node, data: { ...node.data, assetUrl: 'asset-0-updated' } } : node),
          graphEdges,
        );
        assert(changedBranchNotifications > 0, 'source image changes invalidate dependent branch');
        assert(untouchedBranchNotifications === 0, 'source image changes do not invalidate unrelated branches');
        engine.dispose();

        window.__imagexWebglVerifyResult = { ok: true, checks: checks.length, averageMs: Number(averageMs.toFixed(2)) };
        result.textContent = 'WEBGL_VERIFY_PASS ' + JSON.stringify(window.__imagexWebglVerifyResult);
      } catch (error) {
        console.error(error);
        window.__imagexWebglVerifyResult = { ok: false, error: error && error.stack ? error.stack : String(error) };
        result.textContent = 'WEBGL_VERIFY_FAIL ' + (error && error.stack ? error.stack : String(error));
      }
    </script>
  </body>
</html>`;
}
