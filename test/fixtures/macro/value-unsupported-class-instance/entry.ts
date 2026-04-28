import { VALUE } from '@lib/macro';

class ExampleBox {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

const output = VALUE(() => new ExampleBox(5));
(globalThis as any).__VALUE_UNSUPPORTED_CLASS_INSTANCE__ = output;
