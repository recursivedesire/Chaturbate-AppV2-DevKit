import { VALUE } from '@lib/macro';

function helper() {
  return 11;
}

const fn = VALUE(() => helper);
(globalThis as any).__VALUE_FN_BINDING__ = fn();
