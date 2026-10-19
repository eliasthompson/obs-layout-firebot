// Finding, closing, and starting desktop apps by process name: tasklist and taskkill on Windows, pgrep and pkill on
// macOS and Linux.
import { execFileSync, spawn } from 'node:child_process';

import { sleep } from './environment';

/** Whether a process runs under this name: the image name on Windows ("obs64.exe"), the exact process name elsewhere. */
export const isRunning = (name: string) => {
  try {
    if (process.platform === 'win32') {
      const tasks = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'], {
        encoding: 'utf8',
      });
      return tasks.toLowerCase().includes(`"${name.toLowerCase()}"`);
    }
    // pgrep exits with 1 when nothing matches
    execFileSync('pgrep', ['-x', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** Ask every process of this name to close, the way closing its window would; kill what is left after the timeout. */
export const closeGracefully = async (name: string, timeoutMs = 30_000) => {
  const signal = (force: boolean) => {
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill', [...(force ? ['/F', '/T'] : []), '/IM', name], { stdio: 'ignore' });
      } else {
        execFileSync('pkill', [force ? '-KILL' : '-TERM', '-x', name], { stdio: 'ignore' });
      }
    } catch {
      // Nothing left to signal
    }
  };

  signal(false);
  const deadline = Date.now() + timeoutMs;
  while (isRunning(name) && Date.now() < deadline) await sleep(500);
  if (!isRunning(name)) return 'closed';

  signal(true);
  await sleep(2000);
  return 'killed';
};

/** Start a program detached from this process, so it keeps running after the tool exits. */
export const startDetached = (command: string, args: string[] = []) => {
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
};
