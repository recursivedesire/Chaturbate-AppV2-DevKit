import {VALUE} from '@lib/macro';
import {command} from '@lib/command_system/builder';
import {buildCliRuntime} from '@lib/command_system/runtime';
import {$limitcam} from '@api/$limitcam';

import {publishExample} from './publish_example';

const runtimePolicy = VALUE(() => {
  const compileOnlyPolicyDraft = {
    root: '/lc',
    defaultMessage: 'Limitcam active',
    seedUsers: ['alice', 'bob'],
  };

  const startCommand = command('start').run(() => ({success: true})).build().name;
  const statusCommand = command('status').run(() => ({success: true})).build().name;

  return {
    root: compileOnlyPolicyDraft.root,
    defaultMessage: compileOnlyPolicyDraft.defaultMessage,
    seedUsers: compileOnlyPolicyDraft.seedUsers,
    startCommand,
    statusCommand,
  };
});

(() => {
  const runtimeSchema = {
    type: 'group' as const,
    name: runtimePolicy.root,
    aliases: [],
    description: 'Compile-time generated runtime schema',
    permissions: [],
    permissionMode: 'inherit' as const,
    children: [
      {
        type: 'command' as const,
        name: runtimePolicy.startCommand,
        aliases: [],
        description: 'Start limitcam from compile-time policy',
        args: [],
        options: [],
        permissions: [],
        permissionMode: 'inherit' as const,
        handler: () => {
          $limitcam.start(runtimePolicy.defaultMessage, runtimePolicy.seedUsers);
          return {
            success: true,
            message: `started:${$limitcam.users.length}`,
          };
        },
      },
      {
        type: 'command' as const,
        name: runtimePolicy.statusCommand,
        aliases: [],
        description: 'Read runtime limitcam status',
        args: [],
        options: [],
        permissions: [],
        permissionMode: 'inherit' as const,
        handler: () => ({
          success: true,
          message: `active=${$limitcam.active} users=${$limitcam.users.length}`,
        }),
      },
    ],
  };

  const cli = buildCliRuntime(runtimeSchema);
  const startRun = cli.run('/lc start');
  const statusRun = cli.run('/lc status');

  publishExample('__EXAMPLE_COMMAND_SYSTEM_06__', {
    format: 'runtime-only',
    startMessage: startRun.result?.message,
    statusMessage: statusRun.result?.message,
  });
})();
