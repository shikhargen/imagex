# imagex Seed

This document is the build seed for imagex. It captures the initial product vision, architecture, and implementation plan.

## Product Vision

imagex is a local-first visual workflow app for AI image generation.

Users install a CLI, authenticate locally, launch a localhost web UI, and compose reusable image-generation workflows using semantic creative nodes such as Character, Style, Scene, Image Input, Text, and Output.

The goal is not to copy ComfyUI. ComfyUI exposes low-level diffusion machinery. imagex should expose reusable creative intent.

One-line pitch:

> imagex is a local-first node UI for programmable AI image generation, where characters, styles, scenes, references, and output formats become reusable workflow components.

## Product Principles

- Local-first: no hosted backend is required for the MVP.
- API-native first: use provider APIs before supporting local diffusion pipelines.
- Semantic nodes: users compose creative concepts, not samplers, VAEs, latents, and loaders.
- Reusable components: characters, styles, scenes, templates, and outputs should be reusable across workflows.
- CLI install and launch: the app should feel like a developer tool that starts a polished local UI.
- Browser tokens stay private: provider tokens must live in the local daemon, not in the browser UI.
- Start with a small vertical slice, then expand.

## MVP Shape

The first useful version should support:

- `imagex auth`
- `imagex whoami`
- `imagex ui`
- A local daemon with a localhost HTTP API
- A minimal web UI
- A basic node workflow
- Workflow save/load from disk
- One working image generation path through Codex/ChatGPT OAuth
- Local output storage

Optional soon after:

- `imagex run <workflow>`
- `imagex logout`
- `imagex doctor`
- Templates: Character Sheet, Manga Panel, Product Ad

## Target Architecture

```text
CLI
  - imagex auth
  - imagex whoami
  - imagex ui
  - imagex run <workflow>
  - imagex logout
  - imagex doctor

Local daemon
  - localhost HTTP API
  - secure auth/token store
  - workflow compiler
  - provider adapters
  - local workflow storage
  - local asset storage
  - progress/status events

Web UI
  - left sidebar
  - top toolbar
  - central node canvas
  - right inspector panel
  - bottom output/status panel
  - templates browser
  - gallery

Providers
  - Codex/ChatGPT OAuth provider for MVP
  - OpenAI API key provider later
  - ComfyUI provider later
  - Replicate/fal/custom providers later
```

The browser UI should call only the local daemon. The daemon owns provider credentials and provider requests.

```text
Browser UI -> localhost API -> imagex daemon -> image provider
```

## CLI Contract

### `imagex auth`

Starts local OAuth login.

Expected behavior:

- Open browser or print login URL/instructions.
- Store credentials locally.
- Handle login failure and expired sessions.
- Prefer Codex/ChatGPT OAuth for the initial provider.

### `imagex whoami`

Shows current provider and authentication state.

Example:

```text
Provider: OpenAI Codex / ChatGPT
Status: authenticated
```

### `imagex ui`

Starts the local daemon and serves the web UI.

Options:

```bash
imagex ui --port 3847
imagex ui --host 127.0.0.1
imagex ui --no-open
```

Expected behavior:

- Start local server.
- Print the local URL.
- Open browser unless `--no-open` is passed.
- Fail clearly if the port is unavailable.

### `imagex run <workflow>`

Runs a saved workflow from the terminal. This can be post-MVP, but it is useful for developer credibility.

### `imagex logout`

Clears stored auth credentials.

### `imagex doctor`

Checks:

- Auth state
- Output directory writability
- Port availability
- Provider reachability
- Token store availability

## Local Storage

Prefer app-owned local storage, not repo-relative storage, for normal user data.

Suggested paths:

```text
~/.imagex/auth.json
~/.imagex/config.json
~/.imagex/workflows/<workflow-id>.imagex.json
~/Pictures/imagex/<workflow-name>/
```

During development, a repo-local `.imagex/` directory is acceptable for quick iteration, but final CLI behavior should use user-level storage.

## Workflow Model

Initial workflow type:

```ts
type ImageXWorkflow = {
  id: string;
  version: '0.1';
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: ImageXNode[];
  edges: ImageXEdge[];
  settings: WorkflowSettings;
};

type ImageXNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

type ImageXEdge = {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
};

type NodeType =
  | 'text'
  | 'imageInput'
  | 'character'
  | 'style'
  | 'scene'
  | 'output';
```

The compiler should turn semantic nodes into one image generation request.

For the first version, keep compilation simple:

- Text nodes contribute direct prompt text.
- Character nodes contribute identity, traits, description, and reference notes.
- Style nodes contribute medium, palette, visual language, and strength.
- Scene nodes contribute environment, mood, lighting, and camera/framing.
- Image Input nodes contribute local image references.
- Output nodes contribute size, quality, format, aspect ratio, and save path.

## MVP Nodes

### Text

Freeform prompt fragment.

Fields:

- text
- weight/priority, optional

### Image Input

Local image reference.

Fields:

- path or asset id
- role: reference, edit target, style reference, composition reference
- notes

### Character

Reusable character definition.

Fields:

- name
- description
- traits
- clothing/accessories
- reference images
- consistency strength
- notes

### Style

Reusable visual style.

Fields:

- name
- medium
- description
- palette
- visual constraints
- reference images
- strength

### Scene

Reusable setting and shot direction.

Fields:

- name
- environment
- mood
- lighting
- camera/framing
- props
- constraints

### Output

Generation target.

Fields:

- aspect ratio
- size
- quality
- format
- background mode
- save path
- metadata toggle

## Web UI Shape

Use a practical app layout, not a marketing page.

The first screen should be the workflow editor:

- Left sidebar: Projects, Workflows, Templates, Assets, Nodes, Settings
- Top toolbar: workflow name, save state, command/search, Run, auth/account
- Center: node canvas
- Right: selected-node inspector
- Bottom: queue, status, recent outputs, errors

React Flow / xyflow is a good fit for the node canvas.

Keep the first UI dense, useful, and app-like. Avoid landing-page hero sections for the actual product shell.

## Codex OAuth Auth Path

The project should use `@earendil-works/pi-ai` for OAuth login and token refresh.

Relevant package entry point:

```ts
import {
  loginOpenAICodex,
  getOAuthApiKey,
  type OAuthCredentials,
  type OAuthProviderId,
} from '@earendil-works/pi-ai/oauth';
```

Important behavior:

- OAuth login is Node-side only.
- Credential storage is the caller's responsibility.
- Store credentials locally.
- Use `getOAuthApiKey('openai-codex', auth)` to get a usable bearer token.
- Save refreshed credentials after `getOAuthApiKey` returns `newCredentials`.
- Do not expose credentials or bearer tokens to the browser.

Auth store shape can start as:

```ts
type AuthStore = Record<OAuthProviderId, OAuthCredentials>;
```

Development sample from brainstorm used:

```ts
const result = await getOAuthApiKey(providerId, auth);
auth[providerId] = result.newCredentials;
return result.apiKey;
```

For imagex, specialize this initially to `openai-codex`.

## Codex Image Generation Path

The MVP image provider should use the Codex Responses backend with the OAuth bearer token.

Endpoint:

```text
https://chatgpt.com/backend-api/codex/responses
```

Request shape:

```ts
await fetch('https://chatgpt.com/backend-api/codex/responses', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-5.5',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    ],
    instructions: 'You are an image generation assistant.',
    tools: [
      {
        type: 'image_generation',
        model: imageModel,
        size,
        quality,
        output_format: outputFormat,
        background,
      },
    ],
    tool_choice: { type: 'image_generation' },
    stream: true,
    store: false,
  }),
});
```

Expected response:

- Server-sent event stream.
- Parse `data: ...` JSON lines.
- Watch for failures:
  - `response.failed`
  - `error`
- Extract generated base64 from either:
  - `response.output_item.done` where `item.type === 'image_generation_call'`
  - `response.completed.response.output[]` image generation items
- Decode base64 and write the image locally.

Initial supported generation options:

```ts
type ImageGenerationOptions = {
  prompt: string;
  model: 'gpt-image-2' | 'gpt-image-1.5' | string;
  size:
    | 'auto'
    | '1024x1024'
    | '1536x1024'
    | '1024x1536'
    | '2048x2048'
    | '2048x1152'
    | '3840x2160'
    | '2160x3840';
  outputFormat: 'png' | 'jpeg' | 'webp';
  background?: 'transparent' | 'opaque' | 'auto';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  count: number;
};
```

Recommended defaults:

```ts
{
  model: 'gpt-image-2',
  size: '1024x1024',
  outputFormat: 'png',
  quality: 'auto',
  background: 'auto',
  count: 1,
}
```

## Image Generation Prompting

Use structured prompts compiled from workflow nodes.

Prompt scaffold:

```text
Use case: <taxonomy slug>
Asset type: <where the asset will be used>
Primary request: <main prompt>
Input images: <Image 1: role; Image 2: role>
Scene/backdrop: <environment>
Subject: <main subject>
Style/medium: <photo/illustration/3D/etc>
Composition/framing: <wide/close/top-down; placement>
Lighting/mood: <lighting + mood>
Color palette: <palette notes>
Materials/textures: <surface details>
Text (verbatim): "<exact text>"
Constraints: <must keep/must avoid>
Avoid: <negative constraints>
```

Rules:

- Preserve user specificity.
- Add helpful detail only when the user input is generic.
- Do not invent extra characters, brands, slogans, or story beats.
- For edits, repeat invariants: change only X; keep Y unchanged.
- Label input images by role.
- Use higher quality for dense text, diagrams, identity-sensitive work, and final assets.

Useful use-case taxonomy:

- photorealistic-natural
- product-mockup
- ui-mockup
- infographic-diagram
- scientific-educational
- ads-marketing
- productivity-visual
- logo-brand
- illustration-story
- stylized-concept
- historical-scene
- text-localization
- identity-preserve
- precise-object-edit
- lighting-weather
- background-extraction
- style-transfer
- compositing
- sketch-to-render

## Transparent Background Handling

Important model constraint:

- `gpt-image-2` does not support native `background=transparent`.
- `gpt-image-1.5` can be used for true transparent output, but it should be treated as a fallback.

For the app, there are two possible paths:

1. Default path: generate on a flat chroma-key background and remove the background locally.
2. True transparency fallback: use `gpt-image-1.5` with `background=transparent` and `png` or `webp`.

The UI should make this explicit. Do not silently downgrade from `gpt-image-2` to `gpt-image-1.5`.

Good chroma-key prompt constraints:

```text
Create the requested subject on a perfectly flat solid #00ff00 chroma-key background for background removal.
The background must be one uniform color with no shadows, gradients, texture, reflections, floor plane, or lighting variation.
Keep the subject fully separated from the background with crisp edges and generous padding.
Do not use #00ff00 anywhere in the subject.
No cast shadow, no contact shadow, no reflection, no watermark, and no text unless explicitly requested.
```

The existing Codex skill includes a local helper:

```bash
python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
  --input <source> \
  --out <final.png> \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

imagex can later vendor or reimplement equivalent local background removal if transparent cutouts become core.

## First Vertical Slice

Build this first:

1. CLI entrypoint named `imagex`.
2. `imagex auth` logs into `openai-codex` and stores credentials locally.
3. `imagex whoami` reports whether credentials exist and can resolve a token.
4. `imagex ui --no-open` starts a localhost server.
5. Server exposes:
   - `GET /api/health`
   - `GET /api/auth/status`
   - `POST /api/generate`
   - `GET /api/workflows`
   - `POST /api/workflows`
6. Web UI shows:
   - app shell
   - simple workflow canvas or structured editor
   - prompt/node inspector
   - Run button
   - latest output preview
7. Generation flow:
   - UI sends a workflow to daemon.
   - Daemon compiles it into a prompt.
   - Daemon resolves Codex OAuth bearer token.
   - Daemon calls Codex image generation.
   - Daemon writes image to local output directory.
   - UI shows saved image.

Keep the first implementation boring and reliable. Fancy node editing can come after the full auth-to-image loop works.

## Suggested Initial Tech Stack

Use the existing package direction unless a stronger reason appears:

- TypeScript
- Node.js
- `@earendil-works/pi-ai` for OAuth
- React for UI
- Vite for frontend/dev server
- Express/Fastify/Hono for local daemon HTTP API
- React Flow / xyflow for the node canvas

Implementation can be monorepo-style inside this package:

```text
src/
  cli/
  daemon/
  auth/
  providers/
  workflows/
  web/
```

Do not overbuild package boundaries before the vertical slice exists.

## Current Repo Notes

Existing files:

- `brainstorm/PRD.md`: original product vision and UX/architecture ideas.
- `brainstorm/pi-ai-auth-docs.md`: local copy of pi-ai docs, including OAuth flow.
- `brainstorm/auth.ts`: small auth-store sample.
- `brainstorm/image-gen.ts`: important Codex OAuth image generation sample.
- `brainstorm/models.ts`: provider/model helper sample.
- `brainstorm/main.ts`: rough Copilot auth/model sample, not directly imagex architecture.

Treat brainstorm files as reference material, not final code.

## Open Questions

- Should imagex store auth in plain JSON for MVP or use OS keychain immediately?
- Should the first UI use a real node canvas immediately, or a simpler structured workflow editor first?
- Should generated assets default to `~/Pictures/imagex` or app data under `~/.imagex/outputs`?
- Should image input/editing be included in the first vertical slice or come after text-to-image works?
- How much of the Codex skill's prompt taxonomy should become visible UI versus internal compiler logic?

## Near-Term Build Order

1. Normalize package scripts and TypeScript layout.
2. Add CLI entrypoint.
3. Implement local auth store and `openai-codex` login.
4. Implement Codex image provider from the brainstorm sample.
5. Implement workflow schema and compiler.
6. Implement daemon API.
7. Implement minimal web UI.
8. Wire one end-to-end generation flow.
9. Add local workflow persistence.
10. Add first templates.
