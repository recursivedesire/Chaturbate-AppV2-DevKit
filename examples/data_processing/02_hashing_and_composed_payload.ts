import {Base64, djb2Hash} from '@lib/data_processing';

import {publishExample} from '../command_system/publish_example';

const payload = {
  version: 1,
  flags: ['reminders', 'goals'],
};

const canonical = JSON.stringify(payload);
const digest = djb2Hash(canonical);
const token = Base64.encode(`${canonical}|${digest}`);

publishExample('__EXAMPLE_DATA_PROCESSING_02__', {
  digest,
  tokenPrefix: token.slice(0, 16),
  tokenLength: token.length,
});
