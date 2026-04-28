import { VALUE } from '@lib/macro';

const value = VALUE(() => 1 + 2);
(globalThis as any).__VALUE_LITERAL__ = value;
