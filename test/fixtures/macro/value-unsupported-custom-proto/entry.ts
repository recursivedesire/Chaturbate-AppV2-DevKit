import { VALUE } from '@lib/macro';

const proto = {kind: 'proto'};
const output = VALUE(() => {
  const value = Object.create(proto) as Record<string, unknown>;
  value.name = 'custom';
  return value;
});

(globalThis as any).__VALUE_UNSUPPORTED_CUSTOM_PROTO__ = output;
