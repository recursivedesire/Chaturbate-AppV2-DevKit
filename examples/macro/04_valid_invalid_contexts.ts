import {EMIT, VALUE} from '@lib/macro';

import {publishExample} from './publish_example';

const presetSeconds = VALUE(() => ({quick: 30, standard: 60}).standard);

EMIT(() => [
  'const subject = "Limitcam manager active";',
  '$room.setSubject(subject);',
  'globalThis.__EXAMPLE_MACRO_04__ = { subject };',
]);

publishExample('__EXAMPLE_MACRO_04_VALUE__', presetSeconds);

/*
Invalid wrapper contexts (documented only):

const bad = EMIT(() => 'const x = 1;'); // EMIT cannot be used as an expression value
function badReturn() {
  return EMIT(() => 'const y = 2;');
}
const alsoBad = VALUE(123); // VALUE requires a zero-arg thunk
*/
