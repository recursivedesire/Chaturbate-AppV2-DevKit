import type {
  AnyBuiltNode,
  Diagnostic,
  ResolverOptions,
} from '../types';

export type ResolveMatch = {node: AnyBuiltNode} | {diagnostics: Diagnostic[]};

export function resolveNodeToken(token: string, nodes: readonly AnyBuiltNode[], resolver?: ResolverOptions): ResolveMatch {
  var exact: AnyBuiltNode[] = [];
  for (var i = 0; i < nodes.length; i += 1) {
    if (nodes[i].name === token) {
      exact.push(nodes[i]);
      continue;
    }

    for (var j = 0; j < nodes[i].aliases.length; j += 1) {
      if (nodes[i].aliases[j] === token) {
        exact.push(nodes[i]);
        break;
      }
    }
  }

  if (exact.length === 1) {
    return {node: exact[0]};
  }

  if (exact.length > 1) {
    return {diagnostics: [{stage: 'parse', code: 'AMBIGUOUS_COMMAND', message: 'Ambiguous token "' + token + '".', token}]};
  }

  if (!resolver || !resolver.allowAbbreviations) {
    return {diagnostics: [{stage: 'parse', code: 'UNKNOWN_COMMAND', message: 'Unknown command or group "' + token + '".', token}]};
  }

  var abbreviated: AnyBuiltNode[] = [];
  for (var k = 0; k < nodes.length; k += 1) {
    if (nodes[k].name.indexOf(token) === 0) {
      abbreviated.push(nodes[k]);
      continue;
    }

    for (var m = 0; m < nodes[k].aliases.length; m += 1) {
      if (nodes[k].aliases[m].indexOf(token) === 0) {
        abbreviated.push(nodes[k]);
        break;
      }
    }
  }

  if (abbreviated.length === 1) {
    return {node: abbreviated[0]};
  }

  if (abbreviated.length > 1) {
    return {diagnostics: [{stage: 'parse', code: 'AMBIGUOUS_COMMAND', message: 'Ambiguous token "' + token + '".', token}]};
  }

  return {diagnostics: [{stage: 'parse', code: 'UNKNOWN_COMMAND', message: 'Unknown command or group "' + token + '".', token}]};
}

export function tokenize(input: string): {ok: true; tokens: string[]} | {ok: false; diagnostics: Diagnostic[]} {
  var tokens: string[] = [];
  var current = '';
  var inQuotes = false;
  var i = 0;

  while (i < input.length) {
    var ch = input.charAt(i);

    if (ch === '\\') {
      i += 1;
      if (i >= input.length) {
        current += '\\';
        break;
      }
      current += input.charAt(i);
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      i += 1;
      continue;
    }

    if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (inQuotes) {
    return {ok: false, diagnostics: [{stage: 'parse', code: 'UNEXPECTED_TOKEN', message: 'Unterminated quoted string.'}]};
  }

  if (current) {
    tokens.push(current);
  }

  return {ok: true, tokens};
}
