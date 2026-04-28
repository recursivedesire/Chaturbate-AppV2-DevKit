import { VALUE } from '@lib/macro';

const output = VALUE();
(globalThis as any).__VALUE_MISSING_THUNK__ = output;
