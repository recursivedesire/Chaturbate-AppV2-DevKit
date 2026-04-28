import { VALUE } from '@lib/macro';

const fn = VALUE(() => function created() {
  return 13;
});

(globalThis as any).__VALUE_FN_INLINE__ = fn();
