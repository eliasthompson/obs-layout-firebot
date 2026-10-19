#!/usr/bin/env node
// The obs-layout-firebot command: the tools that set up OBS, deploy a config to Firebot, and install the script. Each
// command lives in tools/commands and gets the arguments after its name.
import { apply } from './commands/apply';
import { capture } from './commands/capture';
import { deploy } from './commands/deploy';
import { fades } from './commands/fades';
import { init } from './commands/init';
import { installScript } from './commands/installScript';
import { restartFirebotCommand } from './commands/restartFirebot';
import { setup } from './commands/setup';

const COMMANDS: Record<string, { run: (args: string[]) => Promise<void> | void; summary: string }> = {
  init: { run: init, summary: 'start config/scenes.ts from the example' },
  setup: { run: setup, summary: 'create the filters in OBS for every bound item (safe to rerun)' },
  'install-script': { run: installScript, summary: "copy the script into the Firebot profile's scripts folder" },
  deploy: { run: deploy, summary: 'check the config against OBS, store it in Firebot, and sync the presets' },
  'restart-firebot': {
    run: restartFirebotCommand,
    summary: 'install the presets into the profile and restart Firebot',
  },
  apply: { run: apply, summary: 'apply a scene key from this machine and verify the result' },
  capture: { run: capture, summary: 'sample screenshots during a transition' },
  fades: { run: fades, summary: "set the scene items' show/hide transitions (OBS must be closed)" },
};

const usage = () =>
  [
    'usage: obs-layout-firebot <command> [options]',
    '',
    ...Object.entries(COMMANDS).map(([name, { summary }]) => `  ${name.padEnd(16)} ${summary}`),
    '',
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
