import type {
  AnyBuiltNode,
  AuthContext,
  AuthorizationInput,
  BuiltValueSpec,
  CommandResult,
  Many,
} from '../types';

export function isReadonlyArray<T>(value: unknown): value is readonly T[] {
  return Array.isArray(value);
}

export function normalizeMany<T>(first: Many<T> | undefined, rest: readonly T[]): T[] {
  if (typeof first === 'undefined') {
    return [];
  }
  if (isReadonlyArray<T>(first)) {
    return first.slice();
  }
  var values = [first];
  for (var i = 0; i < rest.length; i += 1) {
    values.push(rest[i]);
  }
  return values;
}

export function uniqueStrings(values: readonly string[]): string[] {
  var out: string[] = [];
  for (var i = 0; i < values.length; i += 1) {
    if (out.indexOf(values[i]) === -1) {
      out.push(values[i]);
    }
  }
  return out;
}

export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function deepFreeze<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i += 1) {
      deepFreeze(value[i]);
    }
    return Object.freeze(value) as T;
  }
  var keys = Object.keys(value);
  for (var k = 0; k < keys.length; k += 1) {
    deepFreeze((value as Record<string, unknown>)[keys[k]]);
  }
  return Object.freeze(value) as T;
}

export function regexTest(regex: RegExp, value: string): boolean {
  var flags = '';
  for (var i = 0; i < regex.flags.length; i += 1) {
    var flag = regex.flags.charAt(i);
    if (flag !== 'g' && flag !== 'y' && flags.indexOf(flag) === -1) {
      flags += flag;
    }
  }
  return new RegExp(regex.source, flags).test(value);
}

export function toCommandResult(result: CommandResult | string | void): CommandResult {
  if (typeof result === 'string') {
    return {success: true, message: result};
  }
  if (typeof result === 'undefined') {
    return {success: true};
  }
  return result;
}

export function copyLabels(labels?: readonly string[]): readonly string[] {
  return labels ? labels.slice() : [];
}

export function buildAuthorizationInput(auth?: AuthContext): AuthorizationInput {
  var runtimeUser = (globalThis as {$user?: {username?: string; colorGroup?: string}}).$user;
  return {
    username: runtimeUser && typeof runtimeUser.username === 'string' ? runtimeUser.username : undefined,
    colorGroup: runtimeUser && typeof runtimeUser.colorGroup === 'string' ? runtimeUser.colorGroup : undefined,
    labels: copyLabels(auth && auth.labels),
  };
}

export function matchesPermissions(permissions: readonly string[], authorization: AuthorizationInput): boolean {
  if (!permissions.length) {
    return true;
  }
  var labels = authorization.labels || [];
  for (var i = 0; i < permissions.length; i += 1) {
    var permission = permissions[i];
    if (permission === authorization.username || permission === authorization.colorGroup) {
      return true;
    }
    for (var j = 0; j < labels.length; j += 1) {
      if (labels[j] === permission) {
        return true;
      }
    }
  }
  return false;
}

export function resolveEffectivePermissions(chain: readonly AnyBuiltNode[]): string[] {
  var current: string[] = [];
  for (var i = 0; i < chain.length; i += 1) {
    var node = chain[i];
    if (node.permissionMode === 'inherit') {
      continue;
    }
    if (node.permissionMode === 'replace') {
      current = node.permissions.slice();
      continue;
    }
    current = uniqueStrings(current.concat(node.permissions as string[]));
  }
  return current;
}

export function chainToPath(chain: readonly AnyBuiltNode[]): string[] {
  var path: string[] = [];
  for (var i = 0; i < chain.length; i += 1) {
    path.push(chain[i].name);
  }
  return path;
}

export function isBooleanLiteral(value: string): boolean {
  return value === 'true' || value === 'false' || value === '1' || value === '0';
}

export function isBuiltValueSpec(value: unknown): value is BuiltValueSpec<unknown> {
  return isObject(value) && hasOwn(value, 'kind') && hasOwn(value, 'parser');
}

export function isBuiltNode(value: unknown): value is AnyBuiltNode {
  return isObject(value) && ((value as {type?: unknown}).type === 'command' || (value as {type?: unknown}).type === 'group');
}
