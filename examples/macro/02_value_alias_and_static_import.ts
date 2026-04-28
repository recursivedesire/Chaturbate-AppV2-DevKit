import {VALUE as V} from '@lib/macro';

import {publishExample} from './publish_example';
import {formatSessionLabel, presetUsers} from './02_source';

const compiled = V(() => formatSessionLabel(presetUsers.length));

publishExample('__EXAMPLE_MACRO_02__', compiled);
