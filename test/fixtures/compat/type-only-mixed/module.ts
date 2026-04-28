type Thing = { name: string };

function consume(input: Thing) {
  (globalThis as any).__TYPE_CONSUME__ = input.name;
}

function valueFactory() {
  (globalThis as any).__TYPE_FACTORY__ = true;
}

export { consume, valueFactory };
export type { Thing };
