import {buildCli, command, group} from '@lib/command_system';
import {InputRewriter} from '@lib/input_rewriter';

import {publishExample} from './publish_example';

const cli = buildCli(
  group('lc').commands(
    command('start').run(() => 'start ok'),
    command('status').run(() => 'status ok'),
  ),
  {
    syntax: {
      prefixes: ['/', '!'],
      pathSeparators: [' ', '.', '/'],
    },
    inputRewriter: new InputRewriter()
      .exact('/go', '/lc start'),
  },
);

publishExample('__EXAMPLE_COMMAND_SYSTEM_08__', {
  slashPrefix: cli.run('/lc status').result?.message,
  bangPrefix: cli.run('!lc status').result?.message,
  dotPath: cli.run('/lc.start').result?.message,
  slashPath: cli.run('/lc/start').result?.message,
  rewriteShortcut: cli.run('/go').result?.message,
});
