# ImageX

A node-based visual editor for AI image generation workflows. Connect nodes, edit images in real-time with WASM processing, and generate images through OpenAI Codex — all in a dark, keyboard-first interface.

## Features

- **Visual Node Editor** — Build image generation pipelines by connecting nodes with React Flow
- **Real-time Image Processing** — Crop, rotate, flip, blur, and color-balance with instant WASM previews (photon-rs)
- **AI Image Generation** — Generate images via OpenAI Codex with streaming output
- **Dark UI** — Consistent dark theme with amber accent, built with Tailwind CSS v4 and shadcn/ui
- **Local-first** — All projects and workflows stored locally on your machine
- **Keyboard Shortcuts** — Full keyboard navigation and shortcuts support

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Flow, react-colorful
- **Image Processing**: photon-rs (WASM) + photon-node (server-side)
- **Backend**: Express.js, Node.js
- **AI Provider**: OpenAI Codex (via OAuth)

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

### Run in Development Mode

The dev script starts both the backend daemon and the Vite dev server:

```bash
npm run dev
```

This runs two processes:

- **Daemon** — Express API server (default: `http://127.0.0.1:3847`)
- **Web UI** — Vite dev server (default: `http://127.0.0.1:5173`)

Then open your browser to `http://127.0.0.1:5173`.

### Authentication

ImageX uses OpenAI Codex for image generation. Authenticate via OAuth:

```bash
npx tsx src/cli/index.ts auth
```

Or after building:

```bash
npm run build
node dist/cli/index.js auth
```

Check your auth status:

```bash
node dist/cli/index.js doctor
```

### Production Build

```bash
npm run build
```

This compiles TypeScript and bundles the web UI to `dist/`.

Run the production build:

```bash
node dist/cli/index.js ui
```

### Available Scripts

| Script               | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start daemon + web UI in development |
| `npm run dev:web`    | Start only the Vite dev server       |
| `npm run dev:daemon` | Start only the backend daemon        |
| `npm run build`      | Build for production                 |
| `npm run check`      | Type-check with TypeScript (no emit) |
| `npm start`          | Run production build                 |

## Project Structure

```
src/
  cli/            # CLI commands (auth, ui, doctor)
  daemon/         # Express server and API routes
  web/            # React frontend
    ui/           # Components, editors, panels
    state/        # Flow store, graph engine
    logo/         # Logo assets
  workflows/      # Workflow compiler and defaults
  providers/      # AI provider integrations
  auth/           # OAuth authentication
  config/         # Path configuration
```

## License

MIT
