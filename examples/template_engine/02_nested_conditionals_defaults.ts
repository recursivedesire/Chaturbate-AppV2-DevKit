import {TemplateEngine} from '@lib/template_engine';
import {$limitcam} from '@api/$limitcam';
import {$user} from '@api/$user';

import {publishExample} from '../command_system/publish_example';

const params = {
  user: {
    name: $user.username,
    language: $user.language,
  },
  limitcam: {
    active: $limitcam.active,
  },
};

const status = TemplateEngine.render('Limitcam: {limitcam.active?ON:OFF}', params);
const localized = TemplateEngine.render('{line}', {
  line: params.user.language === 'en' ? 'Reminder' : 'Aviso',
});
const fallback = TemplateEngine.render('Alias: {user.alias?:guest}', params);
const missing = TemplateEngine.render('Unknown: {user.unknown}', params);

publishExample('__EXAMPLE_TEMPLATE_ENGINE_02__', {
  status,
  localized,
  fallback,
  missing,
});
