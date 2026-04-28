function VALUE_echo(value: string) {
  return value;
}

function getRuntimeValue(value: string) {
  return value;
}

const output = VALUE_echo(getRuntimeValue('hello'));
(globalThis as any).__VALUE_DYNAMIC__ = output;
