import {relativeValue} from './modules/use_relative';
import {aliasValue} from '@lib/use_alias';

(globalThis as any).__DOTTED_RELATIVE__ = relativeValue();
(globalThis as any).__DOTTED_ALIAS__ = aliasValue();
