#!/usr/bin/env node
// The obs-layout-firebot command: the tools that set OBS up and deploy a config to Firebot. Each command lives in
// tools/commands and gets the arguments after its name. Commands are grouped by the program they act on: `obs:`
// commands talk to OBS, `firebot:` commands to Firebot.
import { firebotDeploy } from './commands/firebotDeploy';
import { firebotRestart } from './commands/firebotRestart';
import { obsCapture } from './commands/obsCapture';
import { obsDeploy } from './commands/obsDeploy';
import { obsRestart } from './commands/obsRestart';
import { obsVerify } from './commands/obsVerify';

interface Command {
  run: (args: string[]) => Promise<void> | void;
  summary: string;
}

const COMMANDS: Record<string, Command> = {
  'obs:deploy': {
    run: obsDeploy,
    summary: 'set OBS up for the config, then restart it if the item transitions need setting (asks first)',
  },
  'obs:restart': { run: obsRestart, summary: 'restart OBS, never forcibly' },
  'obs:verify': { run: obsVerify, summary: 'apply a scene key from this machine and compare the result with the plan' },
  'obs:capture': { run: obsCapture, summary: 'sample screenshots during a transition' },
  'firebot:deploy': {
    run: firebotDeploy,
    summary:
      'check the config against OBS, store it in Firebot, sync the presets and the script (asks before a restart)',
  },
  'firebot:restart': { run: firebotRestart, summary: 'install the presets into the profile and restart Firebot' },
};

const usage = () =>
  [
    'usage: obs-layout-firebot <command> [options]',
    '',
    ...Object.entries(COMMANDS).map(([name, { summary }]) => `  ${name.padEnd(18)} ${summary}`),
    '',
    'Every command that changes something takes --dry-run where it applies, and --yes to skip its questions.',
    "See the README for each command's options.",
  ].join('\n');

const [name = '', ...args] = process.argv.slice(2);
const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;

if (!command) {
  console.log(usage());
  if (!['', '--help', '-h', 'help'].includes(name)) {
    console.error(`\nunknown command "${name}"`);
    process.exitCode = 1;
  }
} else {
  try {
    await command.run(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
