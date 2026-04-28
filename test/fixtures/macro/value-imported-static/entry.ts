import { VALUE } from '@lib/macro';
import { label, nums } from './values';

const output = VALUE(() => `${label}:${nums.join('-')}`);
(globalThis as any).__VALUE_IMPORTED_STATIC__ = output;
