import {TemplateEngine} from '@lib/template_engine';
import {$room} from '@api/$room';
import {$user} from '@api/$user';

import {publishExample} from '../command_system/publish_example';

const welcome = TemplateEngine.render('Welcome {0} to {1}', [$user.username, $room.owner]);
const tipMenu = TemplateEngine.render('Tip menu: {menu.label}', {menu: {label: 'Spin Wheel'}});

publishExample('__EXAMPLE_TEMPLATE_ENGINE_01__', {
  welcome,
  tipMenu,
});
