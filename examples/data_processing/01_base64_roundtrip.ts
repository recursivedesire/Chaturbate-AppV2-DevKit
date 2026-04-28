import {Base64} from '@lib/data_processing';

import {publishExample} from '../command_system/publish_example';

const source = 'Hello DevKit';
const encoded = Base64.encode(source);
const decoded = Base64.decode(encoded);

publishExample('__EXAMPLE_DATA_PROCESSING_01__', {
  encoded,
  decoded,
});
