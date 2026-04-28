function publishExample(key: string, value: unknown): void {
  (globalThis as Record<string, unknown>)[key] = value;
}

function readExample<T>(key: string, fallback: T): T {
  const current = (globalThis as Record<string, unknown>)[key];
  if (typeof current === 'undefined') {
    return fallback;
  }
  return current as T;
}

export {publishExample, readExample};
