export function VALUE<T>(thunk: () => T): T {
  if (typeof thunk !== 'function') {
    throw new Error('DevKit macro VALUE requires a zero-argument function thunk.');
  }

  throw new Error('DevKit macro VALUE requires macro-plugin transform at build time.');
}

export function EMIT(thunk: () => string | string[]): void {
  if (typeof thunk !== 'function') {
    throw new Error('DevKit macro EMIT requires a zero-argument function thunk.');
  }

  throw new Error('DevKit macro EMIT requires macro-plugin transform at build time.');
}
