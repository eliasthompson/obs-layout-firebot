// Finding, closing, and starting desktop apps by process name: tasklist and taskkill on Windows, pgrep and pkill on
// macOS and Linux. Nothing here forces a process to exit: an app that will not close, or that this tool is not allowed
// to close, is handed to the user, and an app the user had to close is left for the user to start again.
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

/** Ask every process of this name to close, the way closing its window would. False when the request was refused. */
const requestClose = (name: string) => {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/IM', name], { stdio: 'ignore' });
    else execFileSync('pkill', ['-TERM', '-x', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** Wait for every process of this name to be gone, up to the timeout. */
export const waitUntilClosed = async (name: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (isRunning(name) && Date.now() < deadline) await sleep(500);
  return !isRunning(name);
};

export type CloseResult = 'closed' | 'denied' | 'timeout';

/**
 * Close an app and wait for it to exit. `denied` means the request was refused while the app runs, which is what
 * happens when the app runs as administrator and this tool does not; `timeout` means the app is still up after the
 * wait, usually because it is asking the user whether to close.
 */
export const closeApp = async (name: string, timeoutMs: number): Promise<CloseResult> => {
  if (!requestClose(name) && isRunning(name)) return 'denied';
  return (await waitUntilClosed(name, timeoutMs)) ? 'closed' : 'timeout';
};

/** Wait for the user to close the app, with a reminder every half minute. */
export const waitForManualClose = async (name: string, label: string) => {
  let reminded = Date.now();
  while (isRunning(name)) {
    await sleep(1000);
    if (Date.now() - reminded >= 30_000) {
      console.log(`still waiting for ${label} to close`);
      reminded = Date.now();
    }
  }
};

export interface Launcher {
  command: string;
  args: string[];
  /** Working directory, for programs that look for their files next to themselves. */
  cwd?: string;
}

/** Start a program detached from this process, so it keeps running after the tool exits. */
export const startDetached = ({ command, args, cwd }: Launcher) => {
  spawn(command, args, { cwd, detached: true, stdio: 'ignore' }).unref();
};

export interface App {
  label: string;
  processName: string;
  /** How to start the app. Resolved before anything is closed, so a missing install fails early. */
  launcher: () => Launcher;
  closeTimeoutMs: number;
}

export type RestartOutcome = 'manual' | 'restarted' | 'started';

/** What `restartApp` would do, for a dry run: reports the close and the start without doing either. */
export const describeRestart = (app: App) => {
  const launcher = app.launcher();
  const command = [launcher.command, ...launcher.args].join(' ');
  console.log(
    isRunning(app.processName)
      ? `dry run: ${app.label} would be closed, never forcibly, and started again (${command})`
      : `dry run: ${app.label} is not running and would be started (${command})`,
  );
};

/**
 * Restart an app around a step that needs it closed, such as editing a file it reads at startup. The app is closed
 * the way its window would be and never forced. When it cannot be closed from here, the user is asked to close it and
 * the step waits; the app is then also left for the user to start, because starting it from here could run it without
 * the rights it had. An app that was not running is started afterwards.
 */
export const restartApp = async (app: App, between: () => Promise<void> | void): Promise<RestartOutcome> => {
  const launcher = app.launcher();

  if (!isRunning(app.processName)) {
    console.log(`${app.label} is not running`);
    await between();
    startDetached(launcher);
    console.log(`started ${app.label}`);
    return 'started';
  }

  const result = await closeApp(app.processName, app.closeTimeoutMs);
  if (result === 'closed') {
    console.log(`${app.label} closed`);
    await between();
    startDetached(launcher);
    console.log(`started ${app.label} (${[launcher.command, ...launcher.args].join(' ')})`);
    return 'restarted';
  }

  console.log(
    result === 'denied'
      ? `${app.label} could not be closed from here; it is probably running as administrator. Close it yourself, waiting...`
      : `${app.label} has not closed; it may be asking you whether to. Close it yourself, waiting...`,
  );
  await waitForManualClose(app.processName, app.label);
  console.log(`${app.label} closed`);
  await between();
  console.log(`start ${app.label} again yourself: started from here, it could run without the rights it had`);
  return 'manual';
};
