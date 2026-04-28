import {TemplateEngine} from '@lib/template_engine';
import {$message} from '@api/$message';
import {$user} from '@api/$user';

import {publishExample} from '../command_system/publish_example';

const recursive = TemplateEngine.render('{outer}', {
  name: $user.username,
  inner: 'Hello {name}',
  outer: '[{inner}]',
});

const messageBody = TemplateEngine.render('Thanks for supporting, {name}!', {
  name: $user.username,
});

$message.setBody(messageBody);
$message.setColor('#00AA00');

publishExample('__EXAMPLE_TEMPLATE_ENGINE_03__', {
  recursive,
  messageBody: $message.body,
  messageColor: $message.color,
});
