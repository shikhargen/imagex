# ImageX

ImageX is a local-first, node-based editor for AI image generation workflows. Build a DAG of prompts, image references, colors, local assets, image-edit steps, and output nodes; preview image transforms locally; then run selected output generations through the local daemon.

The app is currently a Vite/React web UI plus a local Express daemon. It is not an Electron app.

## Features

- **Visual workflow editor**: compose generation graphs with React Flow nodes, edges, dynamic handles, frames, and keyboard shortcuts.
- **Floating editor shell**: full-screen canvas with floating workflow tabs, logo/menu, sidebar, run controls, side panels, and inspector.
- **Structured prompt compilation**: prompts compile into deterministic JSON with image references instead of ad hoc prose concatenation.
- **Local image previews**: crop, rotate/flip, blur, and color-balance render through the frontend WebGL pipeline.
- **Output-node generation**: each output node is a generation target. Run selected outputs, force upstream dependencies, or run all outputs in dependency order.
- **Durable generation jobs**: daemon-managed runs survive refreshes and recover partial output state after daemon restart.
- **Local-first storage**: projects, workflows, assets, auth, run metadata, and generated files live under `IMAGEX_HOME` or `~/.imagex`.
- **Codex image provider**: generation uses the OpenAI Codex Responses image tool transport, with `CODEX_API_BASE` override support for local mock testing.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Flow, Zustand, lucide-react, react-colorful.
- **Image pipeline**: raw WebGL for frontend previews/export/download paths, plus `photon-node` for daemon-side transform parity before generation.
- **Backend**: Node.js 20+, Express, ESM TypeScript.
- **Provider/auth**: OpenAI Codex OAuth and Responses image tool transport.

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
git clone https://github.com/shikhargen/imagex.git
cd imagex
npm install
```

### Run The App

```bash
npm run dev
```

This starts:

- Daemon API: `http://127.0.0.1:3847`
- Web UI: `http://127.0.0.1:5173`

Open `http://127.0.0.1:5173`.

### Authentication

Authenticate with Codex:

```bash
npx tsx src/cli/index.ts auth
```

Check status:

```bash
npx tsx src/cli/index.ts whoami
npx tsx src/cli/index.ts doctor
```

Log out:

```bash
npx tsx src/cli/index.ts logout
```

### Local Mock Provider

For local generation testing without real image calls, run a compatible mock service separately and start ImageX with:

```bash
CODEX_API_BASE=http://127.0.0.1:8787/backend-api/codex/responses npm run dev
```

## Scripts

| Script               | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `npm run dev`        | Start daemon and Vite dev server                        |
| `npm run dev:web`    | Start only the Vite dev server                          |
| `npm run dev:daemon` | Start only the local daemon                             |
| `npm run check`      | Type-check with TypeScript                              |
| `npm run test:webgl` | Run the browser WebGL image-pipeline verifier           |
| `npm test`           | Run typecheck and WebGL verifier                        |
| `npm run build`      | Build TypeScript and the web UI                         |
| `npm start`          | Run the built daemon/UI without opening a browser       |

## Storage

By default ImageX stores local data in `~/.imagex`. Set `IMAGEX_HOME` to use a different root.

Generation run files are stored per project under:

```text
outputs/runs/index.json
outputs/runs/<job-id>/job.json
outputs/runs/<job-id>/<output-node-id>/
```

`outputs/runs/index.json` keeps the newest run records in chronological order.

## Project Structure

```text
src/
  auth/           # Codex OAuth storage and auth helpers
  cli/            # CLI commands
  config/         # Local path configuration
  daemon/         # Express API, generation jobs, file serving
  projects/       # Project persistence
  providers/      # Provider transports
  shared/         # Shared persisted types
  web/            # React frontend
    state/        # Flow store and graph engine
    ui/           # Editor shell, panels, nodes, components
  workflows/      # Compiler and workflow persistence
```

## Verification

Use the focused command for the area you changed:

```bash
npm run check
npm run test:webgl
npm run build
```

For UI behavior, run `npm run dev` and inspect the editor in the browser.

## License

MIT
