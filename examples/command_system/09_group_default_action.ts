import {buildCli, command, group} from '@lib/command_system';
import {$limitcam} from '@api/$limitcam';

import {publishExample} from './publish_example';

const cli = buildCli(
  group('/lc')
    .command(
      command('status').run(() => 'status ok'),
    )
    .command(
      command('start').run(() => 'start ok'),
    )
    .run(() => ({
      success: true as const,
      data: {
        active: $limitcam.active,
        users: $limitcam.users.slice().sort(),
      },
    })),
);

publishExample('__EXAMPLE_COMMAND_SYSTEM_09__', {
  defaultAction: cli.run('/lc').result?.data,
  childCommand: cli.run('/lc status').result?.message,
});
