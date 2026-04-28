import { VALUE } from '@lib/macro';

const output = VALUE(123 as any);
(globalThis as any).__VALUE_INVALID_THUNK__ = output;
