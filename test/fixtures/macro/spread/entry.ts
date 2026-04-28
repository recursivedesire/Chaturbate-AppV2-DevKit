import { VALUE } from '@lib/macro';

const first = 'x';
const rest = ['y', 'z'];
const output = VALUE(() => [first, ...rest].join('-'));
(globalThis as any).__VALUE_SPREAD__ = output;
