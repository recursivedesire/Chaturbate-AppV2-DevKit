import {buildCli, command, group} from '@lib/command_system';
import {$limitcam} from '@api/$limitcam';

import {publishExample} from './publish_example';

const cli = buildCli(
  group('/lc').command(
    command('status').run(() => ({
      success: true,
      data: {
        active: $limitcam.active,
        users: $limitcam.users.slice().sort(),
      },
    })),
  ),
);

const run = cli.run('/lc status');
publishExample('__EXAMPLE_COMMAND_SYSTEM_01__', run.result?.data);
