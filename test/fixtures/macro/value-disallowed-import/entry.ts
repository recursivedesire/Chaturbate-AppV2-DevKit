import { VALUE } from '@lib/macro';
import { readPkgLength } from './helpers/disallowed';

const output = VALUE(() => readPkgLength());
(globalThis as any).__VALUE_DISALLOWED_IMPORT__ = output;
