import {
  arrayArg,
  arrayOption,
  buildCli,
  command,
  group,
  stringArg,
} from '@lib/command_system';
import {$limitcam} from '@api/$limitcam';
import {$room} from '@api/$room';

import {publishExample} from './publish_example';

const usernameSpec = stringArg().regex(/^[a-z0-9_]{3,20}$/i);

const cli = buildCli(
  group('/lc').commands(
    command('start')
      .arg('message', stringArg())
      .option('user', arrayOption(usernameSpec).repeatable().short('u'))
      .run(({args, options}) => {
        const users = Array.isArray(options.user) ? options.user : [];
        $limitcam.start(args.message, users as string[]);
        $room.sendNotice(`Limitcam started: ${args.message}`);

        return {
          success: true,
          data: {
            active: $limitcam.active,
            users: $limitcam.users.slice().sort(),
          },
        };
      }),
    command('add')
      .arg('users', arrayArg(usernameSpec).variadic())
      .run(({args}) => {
        $limitcam.add(args.users as string[]);
        return {
          success: true,
          data: $limitcam.users.slice().sort(),
        };
      }),
    command('remove')
      .option('user', arrayOption(usernameSpec).repeatable().required().short('u'))
      .run(({options}) => {
        const users = Array.isArray(options.user) ? options.user : [];
        $limitcam.remove(users as string[]);
        return {
          success: true,
          data: $limitcam.users.slice().sort(),
        };
      }),
    command('stop').run(() => {
      $limitcam.stop();
      return {
        success: true,
        data: {
          active: $limitcam.active,
          users: $limitcam.users.slice().sort(),
        },
      };
    }),
  ),
);

const start = cli.run('/lc start "Limitcam active" --user=alice -u bob');
const add = cli.run('/lc add charlie');
const remove = cli.run('/lc remove --user bob');
const stop = cli.run('/lc stop');
const startData = start.result?.data as {active?: boolean; users?: readonly string[]} | undefined;
const stopData = stop.result?.data as {active?: boolean} | undefined;

publishExample('__EXAMPLE_COMMAND_SYSTEM_02__', {
  startedActive: startData?.active,
  startedUsers: startData?.users,
  afterAdd: add.result?.data,
  afterRemove: remove.result?.data,
  stoppedActive: stopData?.active,
});
