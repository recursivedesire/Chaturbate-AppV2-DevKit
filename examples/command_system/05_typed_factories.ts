import {
  arrayOption,
  booleanOption,
  buildCli,
  command,
  group,
  numberArg,
  selectArg,
  stringArg,
  stringOption,
} from '@lib/command_system';

import {publishExample} from './publish_example';

const usernameSpec = stringArg().regex(/^[a-z0-9_]{3,20}$/i);

const cli = buildCli(
  group('/lc').command(
    command('configure')
      .arg('username', usernameSpec)
      .arg('preset', selectArg(['quick', 'focus', 'vip']))
      .arg('duration', numberArg().validate((value) => (value >= 1 && value <= 180) || 'duration must be between 1 and 180'))
      .option('tag', stringOption().required().short('t').parse((raw) => raw.trim().toLowerCase()))
      .option('notify', booleanOption().default(true))
      .option('allow', arrayOption(usernameSpec).repeatable().short('u'))
      .run(({args, options}) => ({
        success: true,
        data: {
          args,
          options,
        },
      })),
  ),
);

const bad = cli.run('/lc configure bad! quick 30 -t prep');
const good = cli.run('/lc configure alice vip 45 -t " Night " -u bob --allow charlie --notify=false');
const goodData = good.result?.data as {
  args?: {preset?: string; duration?: number};
  options?: {tag?: string; allow?: readonly string[]; notify?: boolean};
} | undefined;

publishExample('__EXAMPLE_COMMAND_SYSTEM_05__', {
  badOk: bad.ok,
  goodPreset: goodData?.args?.preset,
  goodDuration: goodData?.args?.duration,
  normalizedTag: goodData?.options?.tag,
  allowUsers: goodData?.options?.allow,
  notify: goodData?.options?.notify,
});
