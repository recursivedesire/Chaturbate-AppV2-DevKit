import type {
  AnyBuiltCommand,
  AnyBuiltGroup,
  AnyBuiltNode,
  BuiltOption,
  Diagnostic,
  ParseResult,
  ResolverOptions,
} from '../types';

import {
  appendRawOption,
  chainToPath,
  deepFreeze,
  isBooleanLiteral,
} from './raw-options';

import {resolveNodeToken, tokenize} from './resolve';

function findOptionByLongName(command: AnyBuiltCommand, name: string): BuiltOption | undefined {
  for (var i = 0; i < command.options.length; i += 1) {
    if (command.options[i].name === name) {
      return command.options[i];
    }
  }
  return undefined;
}

function findOptionByShortName(command: AnyBuiltCommand, shortName: string): BuiltOption | undefined {
  for (var i = 0; i < command.options.length; i += 1) {
    if (command.options[i].spec.shortName === shortName) {
      return command.options[i];
    }
  }
  return undefined;
}

export function parseCommandTokens(input: string, root: AnyBuiltGroup, resolver?: ResolverOptions): ParseResult<AnyBuiltCommand> {
  var tokenized = tokenize(input);
  if (tokenized.ok === false) {
    return {ok: false, input, diagnostics: tokenized.diagnostics};
  }

  var tokens = tokenized.tokens;
  if (!tokens.length) {
    return {ok: false, input, diagnostics: [{stage: 'parse', code: 'INVALID_PREFIX', message: 'Input is empty.'}]};
  }

  var rootMatch = resolveNodeToken(tokens[0], [root], resolver);
  if ('diagnostics' in rootMatch) {
    return {ok: false, input, diagnostics: rootMatch.diagnostics};
  }

  var chain: AnyBuiltNode[] = [root];
  var currentGroup: AnyBuiltGroup = root;
  var cursor = 1;
  var target: AnyBuiltCommand | undefined;
  var unresolvedDiagnostics: Diagnostic[] | undefined;

  while (cursor < tokens.length) {
    var resolved = resolveNodeToken(tokens[cursor], currentGroup.children, resolver);
    if ('diagnostics' in resolved) {
      unresolvedDiagnostics = resolved.diagnostics;
      break;
    }

    chain.push(resolved.node);
    cursor += 1;

    if (resolved.node.type === 'command') {
      target = resolved.node;
      break;
    }

    currentGroup = resolved.node;
  }

  if (!target) {
    return {
      ok: false,
      input,
      diagnostics: unresolvedDiagnostics || [{
        stage: 'parse',
        code: 'UNKNOWN_COMMAND',
        message: 'No executable command was found in input.',
        path: tokens.slice(0, cursor),
      }],
    };
  }

  var rawArgs: string[] = [];
  var rawOptions: Record<string, string | boolean | readonly string[]> = {};
  var optionTerminatorUsed = false;
  var remaining = tokens.slice(cursor);

  for (var i = 0; i < remaining.length; i += 1) {
    var token = remaining[i];

    if (!optionTerminatorUsed && token === '--') {
      optionTerminatorUsed = true;
      continue;
    }

    if (!optionTerminatorUsed && token.indexOf('--') === 0 && token.length > 2) {
      var longBody = token.slice(2);
      var eqIndex = longBody.indexOf('=');
      var longName = eqIndex >= 0 ? longBody.slice(0, eqIndex) : longBody;
      var inlineLongValue = eqIndex >= 0 ? longBody.slice(eqIndex + 1) : undefined;
      var longOption = findOptionByLongName(target, longName);

      if (!longOption) {
        return {ok: false, input, diagnostics: [{stage: 'parse', code: 'UNKNOWN_OPTION', message: 'Unknown option "--' + longName + '".', token, path: chainToPath(chain)}]};
      }

      var longValue: string | boolean;
      if (typeof inlineLongValue !== 'undefined') {
        longValue = inlineLongValue;
      } else if (longOption.spec.kind === 'boolean') {
        var nextLong = remaining[i + 1];
        if (typeof nextLong !== 'undefined' && isBooleanLiteral(nextLong)) {
          longValue = nextLong;
          i += 1;
        } else {
          longValue = true;
        }
      } else {
        if (typeof remaining[i + 1] === 'undefined') {
          return {ok: false, input, diagnostics: [{stage: 'parse', code: 'MISSING_OPTION_VALUE', message: 'Option "--' + longName + '" expects a value.', token, path: chainToPath(chain)}]};
        }
        longValue = remaining[i + 1];
        i += 1;
      }

      if (longOption.spec.kind === 'array' || longOption.spec.repeatable) {
        appendRawOption(rawOptions, longOption.name, longValue);
      } else {
        rawOptions[longOption.name] = longValue;
      }
      continue;
    }

    if (!optionTerminatorUsed && token.charAt(0) === '-' && token.length > 1) {
      var shortBody = token.slice(1);
      var shortEqIndex = shortBody.indexOf('=');
      var shortName = shortEqIndex >= 0 ? shortBody.slice(0, shortEqIndex) : shortBody;

      if (shortName.length !== 1) {
        return {ok: false, input, diagnostics: [{stage: 'parse', code: 'UNKNOWN_OPTION', message: 'Unknown short option token "' + token + '".', token, path: chainToPath(chain)}]};
      }

      var inlineShortValue = shortEqIndex >= 0 ? shortBody.slice(shortEqIndex + 1) : undefined;
      var shortOption = findOptionByShortName(target, shortName);
      if (!shortOption) {
        return {ok: false, input, diagnostics: [{stage: 'parse', code: 'UNKNOWN_OPTION', message: 'Unknown option "-' + shortName + '".', token, path: chainToPath(chain)}]};
      }

      var shortValue: string | boolean;
      if (typeof inlineShortValue !== 'undefined') {
        shortValue = inlineShortValue;
      } else if (shortOption.spec.kind === 'boolean') {
        var nextShort = remaining[i + 1];
        if (typeof nextShort !== 'undefined' && isBooleanLiteral(nextShort)) {
          shortValue = nextShort;
          i += 1;
        } else {
          shortValue = true;
        }
      } else {
        if (typeof remaining[i + 1] === 'undefined') {
          return {ok: false, input, diagnostics: [{stage: 'parse', code: 'MISSING_OPTION_VALUE', message: 'Option "-' + shortName + '" expects a value.', token, path: chainToPath(chain)}]};
        }
        shortValue = remaining[i + 1];
        i += 1;
      }

      if (shortOption.spec.kind === 'array' || shortOption.spec.repeatable) {
        appendRawOption(rawOptions, shortOption.name, shortValue);
      } else {
        rawOptions[shortOption.name] = shortValue;
      }
      continue;
    }

    rawArgs.push(token);
  }

  return {
    ok: true,
    input,
    path: chainToPath(chain),
    target,
    chain: chain.slice(),
    tokens: tokens.slice(),
    rawArgs,
    rawOptions: deepFreeze(rawOptions),
    optionTerminatorUsed,
  };
}

export function resolvePath(root: AnyBuiltGroup, parts: readonly string[], resolver?: ResolverOptions): {chain: AnyBuiltNode[]; node: AnyBuiltNode} | undefined {
  if (!parts.length) {
    return {chain: [root], node: root};
  }

  var first = resolveNodeToken(parts[0], [root], resolver);
  if ('diagnostics' in first) {
    return undefined;
  }

  var chain: AnyBuiltNode[] = [root];
  var current: AnyBuiltNode = root;

  for (var i = 1; i < parts.length; i += 1) {
    if (current.type !== 'group') {
      return undefined;
    }

    var next = resolveNodeToken(parts[i], current.children, resolver);
    if ('diagnostics' in next) {
      return undefined;
    }

    current = next.node;
    chain.push(current);
  }

  return {chain, node: current};
}
