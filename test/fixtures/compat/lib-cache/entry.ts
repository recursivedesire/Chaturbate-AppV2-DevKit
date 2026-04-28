import { Foo } from '@lib/Foo';

(globalThis as any).__LIB_CACHE_VALUE__ = Foo.value();
