import {chainToPath, deepFreeze, isBooleanLiteral} from './shared';

export {chainToPath, deepFreeze, isBooleanLiteral};

export function appendRawOption(rawOptions: Record<string, string | boolean | readonly string[]>, name: string, value: string | boolean): void {
  var existing = rawOptions[name];
  if (typeof existing === 'undefined') {
    rawOptions[name] = value;
    return;
  }

  if (Array.isArray(existing)) {
    rawOptions[name] = (existing as readonly string[]).concat(String(value));
    return;
  }

  rawOptions[name] = [String(existing), String(value)];
}
