import { VALUE } from '@lib/macro';

const base = 'alpha';
const output = VALUE(() => `<<${base}>>`);
(globalThis as any).__VALUE_CONST_IDENTIFIER__ = output;
