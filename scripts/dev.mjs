import { spawn } from 'node:child_process';

const processes = [
  {
    name: 'daemon',
    command: 'npx',
    args: ['tsx', 'src/cli/index.ts', 'ui', '--no-open'],
  },
  {
    name: 'web',
    command: 'npx',
    args: ['vite', '--host', '127.0.0.1'],
  },
];

const children = processes.map((processInfo) => {
  const child = spawn(processInfo.command, processInfo.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => writePrefixed(processInfo.name, chunk));
  child.stderr.on('data', (chunk) => writePrefixed(processInfo.name, chunk));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren();
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[${processInfo.name}] exited with ${reason}`);
    process.exit(code ?? 1);
  });

  return child;
});

let shuttingDown = false;

process.on('SIGINT', () => {
  shuttingDown = true;
  stopChildren();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  stopChildren();
  process.exit(0);
});

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

function writePrefixed(name, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) console.log(`[${name}] ${line}`);
  }
}
