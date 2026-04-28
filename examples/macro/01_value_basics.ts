import {VALUE} from '@lib/macro';

import {publishExample} from './publish_example';

const threshold = VALUE(() => ({quick: 50, focus: 120, vip: 300}).focus);
const label = VALUE(() => `limitcam-${'ready'}`);

publishExample('__EXAMPLE_MACRO_01__', {threshold, label});
