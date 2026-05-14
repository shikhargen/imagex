# AGENTS.md

This file is the onboarding note for AI coding agents working in ImageX. Keep it current, concise, and open-ended: update it when architecture, commands, storage, or product direction changes.

## Project Purpose

ImageX is a local-first, node-based image generation workflow editor. Users compose prompts, image references, colors, files, image-processing steps, and AI output nodes into a DAG; the app previews image edits locally and compiles the graph into structured JSON prompts plus image references for generation.

The current checkout is a Vite/React web app plus a local Express daemon. Do not assume an Electron wrapper exists unless the codebase gains one.

## Current Shape

- Package manager: `npm` with `package-lock.json`; do not switch package managers casually.
- Runtime: Node.js 20+, ESM TypeScript, React 19, Vite, Tailwind CSS v4, shadcn/ui, React Flow, Zustand, photon-rs WASM, Express.
- Main commands:
  - Install: `npm install`
  - Dev app: `npm run dev` starts daemon on `127.0.0.1:3847` and Vite on `127.0.0.1:5173`
  - Web only: `npm run dev:web`
  - Daemon only: `npm run dev:daemon`
  - Type check: `npm run check`
  - Production build: `npm run build`
  - Start built daemon/UI: `npm start`
- CLI commands:
  - Auth: `npx tsx src/cli/index.ts auth`
  - Status: `npx tsx src/cli/index.ts whoami` or `npx tsx src/cli/index.ts doctor`
  - Logout: `npx tsx src/cli/index.ts logout`

## Read These First

- `README.md` for the human-facing overview and quickstart.
- `package.json`, `vite.config.ts`, `tsconfig.json`, and `components.json` for tooling.
- `src/shared/types.ts` for persisted workflow, project, node, asset, and generation schemas.
- `src/web/ui/flow/meta.ts`, `src/web/ui/flow/ports.ts`, and `src/web/ui/flow/fields/definitions.ts` for node catalog, port compatibility, and field definitions.
- `src/workflows/compiler.ts` for graph-to-prompt compilation.
- `src/daemon/server.ts` for API routes, project generation, output-node ordering, image-reference resolution, and server-side image transforms.
- `src/projects/store.ts` and `src/workflows/store.ts` for local persistence.
- `src/web/state/flowStore.ts`, `src/web/state/graphEngine.ts`, and `src/web/ui/flow/imaging/` for the performance-sensitive editor and preview pipeline.
- `src/web/ui/editor/useEditorActions.ts` and `src/web/ui/editor/useProjectActions.ts` for workflow, project, generation, asset, undo/redo, and autosave behavior.

Gitignored local notes may exist. Treat them as private context only; do not quote unpublished details into tracked files.

## Architecture Invariants

- Persisted workflow data uses `ImageXWorkflow`, `ImageXNode`, and `ImageXEdge` from `src/shared/types.ts`. React Flow nodes are adapters around these workflow nodes, not a separate source of truth.
- `FlowStore` owns React Flow nodes and edges. `FlowEditor` reads via `useFlowNodes()` and `useFlowEdges()` instead of receiving node arrays through parent props.
- Preserve the drag performance model: `handleNodesChange` filters position/dimension changes during drag, and final positions are synced on drag stop.
- `App.tsx` currently orchestrates top-level UI state with `useEditorActions` and `useProjectActions`. `src/web/state/editorStore.ts` exists, but verify active usage before moving logic into it.
- `GraphEngine` evaluates image-producing nodes, caches outputs per node, and propagates downstream changes through edges. Use the `ongoing` flag for live slider/drag updates so expensive downstream propagation waits until commit.
- Image previews use `useCanvasRenderer`, `processWithWasm`, and `PREVIEW_MAX_WIDTH` downscaling. Full-resolution download/server paths must not accidentally reuse preview-scale coordinates.
- Photon `putImageData` consumes its `PhotonImage`. Do not call `.free()` on an image after passing it to `putImageData`.
- Prompt compilation is structured data, not prose concatenation. Nodes compile into nested JSON objects; duplicate field labels become arrays; image placeholders start as `__imagex_ref` markers and are post-processed into `[image-N]` references.
- Image-editing nodes generally pass image references through the compiler; actual transforms are applied by the frontend preview path and mirrored on the daemon before generation.
- Generation with multiple output nodes must keep topological ordering and detect circular output dependencies.

## Product And UX Direction

- Keep the app as a dense, dark, keyboard-first workflow editor, not a marketing page.
- Use existing design tokens in `src/web/styles.css` and component styling in the nearby CSS module for the feature being changed.
- Current visual language: near-black surfaces, warm amber primary action, per-node accent colors, Geist sans, JetBrains Mono for code/data, lucide icons.
- Use shadcn components already present under `src/web/components/ui` before inventing custom primitives. Use the shadcn `Select`, not native `<select>`, for app UI.
- Use icons for tool actions where a familiar icon exists. Avoid emoji unless explicitly requested.
- Keep node dimensions stable. If adding fields, controls, labels, previews, or loading states, check that they do not resize nodes unpredictably or make text overflow.

## Feature Entry Points

When adding a new node type, usually update:

- `src/shared/types.ts`
- `src/web/ui/flow/meta.ts`
- `src/web/ui/flow/ports.ts`
- `src/web/ui/flow/fields/definitions.ts`
- `src/web/ui/flow/adapters.ts`
- `src/web/ui/flow/nodes/ImageXNode.tsx` and possibly `NodeContent.tsx`
- `src/workflows/compiler.ts`
- `src/web/state/graphEngine.ts` and `src/web/ui/flow/imaging/` if the node produces or transforms images
- `src/daemon/server.ts` if generation needs server-side parity

When changing image operations, keep frontend preview, full-resolution download, prompt compilation behavior, and daemon-side generation transforms aligned.

When changing providers or auth, keep all provider-specific code isolated under `src/providers/` and `src/auth/`, then thread only typed options through the daemon/UI. Do not mix API-key and OAuth flows without an explicit product decision.

When changing persistence, include schema compatibility for existing files under `IMAGEX_HOME` or `~/.imagex`.

## Data, Auth, And Security

- Local data root is `process.env.IMAGEX_HOME || ~/.imagex`.
- Auth is stored in `auth.json` with restrictive permissions. Never commit credentials, generated project data, `.env`, or outputs.
- Project assets and outputs are served through daemon routes that guard against path traversal. Preserve those checks when touching file-serving code.
- Avoid adding telemetry or external network calls outside explicit auth/generation flows.

## Code Quality Choices

- TypeScript is strict. Prefer shared types and narrow boundary validation over `any`.
- Keep imports compatible with the current ESM setup. Local TS imports generally use `.js` specifiers.
- Keep graph/compiler/persistence transforms deterministic and easy to test with plain data.
- Prefer small, local abstractions over broad rewrites. The editor has performance-sensitive state boundaries; measure or reason carefully before changing them.
- Do not copy names, comments, file names, or branding from private/reference code into tracked files.
- If changing UI, verify with the running app when practical, especially React Flow dragging, connection validation, node sizing, image previews, and modals.

## Verification

- Docs-only changes: no build is required, but check Markdown manually.
- TypeScript/source changes: run `npm run check`.
- Changes touching build config, daemon, provider, or packaging: run `npm run build`.
- UI behavior changes: run `npm run dev` and inspect `http://127.0.0.1:5173`.
- Generation changes: if auth is unavailable, still verify compile endpoints and UI state; do not claim live image generation worked.

## Installed Skills

Skills live under `.agents/skills/` and are tracked by `skills-lock.json`.

- `frontend-design`: use for substantial UI creation or visual redesign while preserving ImageX's workflow-editor product shape.
- `shadcn`: use when adding, updating, debugging, or composing shadcn/ui components. Run `npx shadcn@latest docs <component>` before relying on component APIs.
- `tailwind-design-system`: use for Tailwind v4 tokens, theming, and reusable design-system work.
- `vercel-react-best-practices`: use for React performance, data fetching, bundle, rendering, or rerender-sensitive changes.
- `vercel-composition-patterns`: use for component API refactors, compound components, and avoiding boolean-prop sprawl.
- `web-design-guidelines`: use for UI, accessibility, and UX review passes.

## External References

- React Flow LLM index: https://reactflow.dev/llms.txt
- React Flow docs to consider for this app: custom nodes, handles, validation, prevent cycles, performance, computing flows, grouping/subflows, undo/redo, and testing.
- OpenAI image generation and Responses image tool docs: https://platform.openai.com/docs/guides/images/image-generation and https://platform.openai.com/docs/guides/tools-image-generation
- shadcn project config: `components.json`; use the local `shadcn` skill and CLI for current component docs.
- Tailwind CSS v4 docs: https://tailwindcss.com/docs

## Maintenance Notes

- Keep this file pointer-heavy. Prefer stable concepts and file entry points over long directory dumps.
- If a rule becomes task-specific, move it to a narrower doc or skill and link to it here.
- If architecture changes, update this file in the same PR as the code.
