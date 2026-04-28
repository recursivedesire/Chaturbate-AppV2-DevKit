import {
  booleanOption,
  buildCli,
  command,
  group,
  numberArg,
} from '@lib/command_system';
import {$callback} from '@api/$callback';

import {publishExample} from './publish_example';

const cli = buildCli(
  group('/lc').command(
    command('remind')
      .arg('seconds', numberArg().validate((value) => value >= 5 || 'seconds must be >= 5'))
      .option('repeat', booleanOption().short('r').default(false))
      .run(({args, options}) => {
        $callback.create('limitcam:reminder', args.seconds, options.repeat);
        return {
          success: true,
          data: {
            seconds: args.seconds,
            repeat: options.repeat,
          },
        };
      }),
  ),
);

const analysis = cli.analyze('/lc remind 30 -r');
const execution = cli.executeAnalysis(analysis);
const scheduled = ($callback as {__scheduled?: unknown[]}).__scheduled || [];

publishExample('__EXAMPLE_COMMAND_SYSTEM_04__', {
  parseOk: analysis.parseOk,
  validateOk: analysis.validateOk,
  executable: analysis.executable,
  scheduled: execution.result?.data,
  callbackCount: scheduled.length,
  callbackLabel: (scheduled[0] as {label?: string} | undefined)?.label,
});
