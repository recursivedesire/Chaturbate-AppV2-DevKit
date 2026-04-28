import {TemplateEngine} from '@lib/template_engine';
import {$limitcam} from '@api/$limitcam';

function renderLimitcamNotice(username: string): string {
  const state = $limitcam.hasAccess(username) ? 'ACCESS' : 'LOCKED';
  return TemplateEngine.render('{name}: {state}', {name: username, state});
}

export {renderLimitcamNotice};
