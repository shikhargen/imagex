import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawn } from 'node:child_process';
import { loginOpenAICodex } from '@earendil-works/pi-ai/oauth';
import { saveCodexCredentials } from './store.js';

export async function loginToCodex(): Promise<void> {
  const credentials = await loginOpenAICodex({
    originator: 'imagex',
    onAuth: ({ url, instructions }) => {
      console.log(instructions || 'Open this URL to authenticate:');
      console.log(url);
      openBrowser(url);
    },
    onPrompt: async (prompt) => {
      const rl = createInterface({ input, output });
      try {
        return await rl.question(`${prompt.message} `);
      } finally {
        rl.close();
      }
    },
    onProgress: (message) => console.log(message),
  });

  await saveCodexCredentials(credentials);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args =
    platform === 'win32' ? ['/c', 'start', '', url] : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    // The printed URL is the fallback.
  });
  child.unref();
}
