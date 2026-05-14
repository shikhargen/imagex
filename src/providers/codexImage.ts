import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { imagexPaths } from '../config/paths.js';
import type { GeneratedImage, ImageGenerationOptions } from '../shared/types.js';

type CodexImage = {
  b64: string;
  revisedPrompt?: string;
};

const codexResponsesUrl = process.env['CODEX_API_BASE'] || 'https://chatgpt.com/backend-api/codex/responses';
const codexResponsesModel = 'gpt-5.5';

export async function generateCodexImages(
  options: ImageGenerationOptions,
  bearerToken: string,
  storage?: { outputDir: string; urlBase: string },
  extraImages?: Array<{ dataUrl: string }>,
  onImage?: (image: GeneratedImage, index: number) => void | Promise<void>,
  signal?: AbortSignal
): Promise<GeneratedImage[]> {
  const workflowSlug = slugify(options.workflowName || 'untitled-workflow');
  const outputDir = storage?.outputDir || join(imagexPaths().outputsDir, workflowSlug);
  await mkdir(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const generated: GeneratedImage[] = [];
  let imageIndex = 0;

  // Fire all API calls in parallel, process each as it resolves
  const promises = Array.from({ length: options.count }, (_, i) =>
    requestCodexImages(options, bearerToken, extraImages, signal).then(async (images) => {
      for (const image of images) {
        if (signal?.aborted) throw new Error('Generation cancelled');
        const idx = imageIndex++;
        const id = randomUUID();
        const filename = `${timestamp}-${idx + 1}-${id.slice(0, 8)}.${options.outputFormat}`;
        const path = join(outputDir, filename);
        await writeFile(path, Buffer.from(image.b64, 'base64'));
        const generatedImage: GeneratedImage = {
          id,
          path,
          url: storage?.urlBase
            ? `${storage.urlBase}/${encodeURIComponent(filename)}`
            : `/outputs/${encodeURIComponent(workflowSlug)}/${encodeURIComponent(filename)}`,
        };
        if (image.revisedPrompt) generatedImage.revisedPrompt = image.revisedPrompt;
        generated.push(generatedImage);
        await onImage?.(generatedImage, idx);
      }
    })
  );
  await Promise.all(promises);

  if (generated.length === 0) {
    throw new Error('Codex returned no generated images.');
  }

  return generated;
}

async function requestCodexImages(
  options: ImageGenerationOptions,
  bearerToken: string,
  extraImages?: Array<{ dataUrl: string }>,
  signal?: AbortSignal
): Promise<CodexImage[]> {
  const content: Array<Record<string, unknown>> = [];

  for (const ref of options.references || []) {
    if ('dataUrl' in ref && typeof ref.dataUrl === 'string') {
      content.push({
        type: 'input_image',
        image_url: ref.dataUrl,
        detail: 'auto',
      });
    }
  }

  for (const img of extraImages || []) {
    content.push({
      type: 'input_image',
      image_url: img.dataUrl,
      detail: 'auto',
    });
  }

  content.push({
    type: 'input_text',
    text: options.prompt,
  });

  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: codexResponsesModel,
      input: [
        {
          role: 'user',
          content,
        },
      ],
      instructions: 'You are an image generation assistant.',
      tools: [
        {
          type: 'image_generation',
          model: options.model,
          size: options.size,
          quality: options.quality,
          output_format: options.outputFormat,
          background: options.background,
        },
      ],
      tool_choice: { type: 'image_generation' },
      stream: true,
      store: false,
    }),
  };
  if (signal) init.signal = signal;
  const response = await fetch(codexResponsesUrl, init);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Codex image generation failed (${response.status} ${response.statusText})${text ? `: ${text}` : ''}`
    );
  }

  return extractCodexImages(await response.text());
}

function extractCodexImages(sseBody: string): CodexImage[] {
  const events = parseSseJsonEvents(sseBody);
  const failure = events.find(
    (event) => event.type === 'response.failed' || event.type === 'error'
  );
  if (failure) {
    const message = failure.error?.message ?? failure.message ?? failure.error?.code;
    throw new Error(message ? `Codex image generation failed: ${message}` : 'Codex image generation failed.');
  }

  const outputItemImages = events
    .filter(
      (event) =>
        event.type === 'response.output_item.done' &&
        event.item?.type === 'image_generation_call' &&
        typeof event.item.result === 'string'
    )
    .map((event) => toCodexImage(event.item.result as string, event.item.revised_prompt as string | undefined));
  if (outputItemImages.length > 0) return outputItemImages;

  const completed = events.find((event) => event.type === 'response.completed');
  return (
    (completed?.response?.output ?? []) as Array<{
      type?: string;
      result?: string;
      revised_prompt?: string;
    }>
  )
    .filter((item) => item.type === 'image_generation_call' && typeof item.result === 'string')
    .map((item) => toCodexImage(item.result!, item.revised_prompt));
}

function toCodexImage(b64: string, revisedPrompt: string | undefined): CodexImage {
  const image: CodexImage = { b64 };
  if (revisedPrompt) image.revisedPrompt = revisedPrompt;
  return image;
}

function parseSseJsonEvents(body: string): any[] {
  const events: any[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      events.push(JSON.parse(data));
    } catch {
      // Ignore non-JSON SSE chunks.
    }
  }
  return events;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workflow';
}
