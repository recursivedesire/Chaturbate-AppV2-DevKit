import {
  buildCli,
  command,
  group,
  stringArg,
} from '@lib/command_system';
import {$limitcam} from '@api/$limitcam';

import {publishExample, readExample} from './publish_example';

import './side_effect_module';
import {renderLimitcamNotice} from './local_feature';

$limitcam.start('Limitcam active', ['alice']);

const cli = buildCli(
  group('/lc').command(
    command('notice')
      .arg('target', stringArg())
      .run(({args}) => ({
        success: true,
        message: renderLimitcamNotice(args.target),
      })),
  ),
);

const allowed = cli.run('/lc notice alice');
const blocked = cli.run('/lc notice bob');

publishExample('__EXAMPLE_COMMAND_SYSTEM_07__', {
  sideEffect: readExample('__EXAMPLE_COMMAND_SYSTEM_07_SIDE_EFFECT__', 0),
  allowed: allowed.result?.message,
  blocked: blocked.result?.message,
});

/*
Unsupported patterns in compat inlining (documented, intentionally not executed):

const dynamic = await import('./dynamic');
export * from './another-module';
*/
