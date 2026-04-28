import {buildCli, command, group} from '@lib/command_system';

import {publishExample} from './publish_example';

const cli = buildCli(
  group('/lc')
    .permissions('o')
    .commands(
      command('status').permissions('f').run(() => ({success: true, message: 'status-visible'})),
      command('audit').run(() => ({success: true, message: 'owner-only'})),
    ),
);

const parsed = cli.parse('/lc audit');
const validated = cli.validate(parsed);

const viewerAllowed = validated.ok ? cli.authorize(validated).ok : false;
const ownerAllowed = validated.ok ? cli.authorize(validated, {labels: ['o']}).ok : false;

const helpDefault = cli.help('/lc');
const helpAll = cli.help('/lc', {includeUnauthorized: true});
const listDefault = cli.list('/lc');

publishExample('__EXAMPLE_COMMAND_SYSTEM_03__', {
  viewerAllowed,
  ownerAllowed,
  hiddenByDefault: !helpDefault.includes('audit'),
  shownWhenRequested: helpAll.includes('audit'),
  listDefault,
});
