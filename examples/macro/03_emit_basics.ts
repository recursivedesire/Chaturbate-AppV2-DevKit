import {EMIT} from '@lib/macro';

EMIT(() => [
  'const tokenGoal = 300;',
  'const current = 80;',
  'globalThis.__EXAMPLE_MACRO_03__ = { tokenGoal, remaining: tokenGoal - current };',
]);
