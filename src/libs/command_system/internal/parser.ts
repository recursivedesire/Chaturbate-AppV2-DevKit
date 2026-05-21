import type {
  AnyBuiltCommand,
  AnyBuiltGroup,
  AnyBuiltNode,
  BuiltOption,
  Diagnostic,
  ParseResult,
  ResolverOptions,
  SyntaxConfig,
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

function splitBySeparators(value: string, separators: readonly string[]): string[] {
  var parts = [value];
  for (var s = 0; s < separators.length; s += 1) {
    var sep = separators[s];
    if (sep === ' ') {
      continue;
    }
    var newParts: string[] = [];
    for (var i = 0; i < parts.length; i += 1) {
      var split = parts[i].split(sep);
      for (var j = 0; j < split.length; j += 1) {
        if (split[j] !== '') {
          newParts.push(split[j]);
        }
      }
    }
    parts = newParts;
  }
  return parts;
}

export function parseCommandTokens(input: string, root: AnyBuiltGroup, resolver?: ResolverOptions, syntax?: SyntaxConfig, inputRewriter?: {rewrite(input: string): string}): ParseResult<AnyBuiltCommand> {
  if (inputRewriter) {
    input = inputRewriter.rewrite(input);
  }

  var tokenized = tokenize(input);
  if (tokenized.ok === false) {
    return {ok: false, input, diagnostics: tokenized.diagnostics};
  }

  var tokens = tokenized.tokens;
  if (!tokens.length) {
    return {ok: false, input, diagnostics: [{stage: 'parse', code: 'INVALID_PREFIX', message: 'Input is empty.'}]};
  }

  var firstToken = tokens[0];
  var prefixLen = 0;

  if (syntax && syntax.prefixes && syntax.prefixes.length > 0) {
    for (var p = 0; p < syntax.prefixes.length; p += 1) {
      if (firstToken.indexOf(syntax.prefixes[p]) === 0) {
        prefixLen = syntax.prefixes[p].length;
        break;
      }
    }
    if (!prefixLen) {
      return {ok: false, input, diagnostics: [{stage: 'parse', code: 'INVALID_PREFIX', message: 'Input does not start with a valid command prefix.'}]};
    }
  }

  var pathSeparators: string[] = [];
  if (syntax && syntax.pathSeparators && syntax.pathSeparators.length > 0) {
    for (var s = 0; s < syntax.pathSeparators.length; s += 1) {
      if (syntax.pathSeparators[s] !== ' ') {
        pathSeparators.push(syntax.pathSeparators[s]);
      }
    }
  }

  var expandedFirst: string[];
  var firstRemainder = firstToken.slice(prefixLen);

  if (pathSeparators.length > 0 && firstRemainder) {
    expandedFirst = splitBySeparators(firstRemainder, pathSeparators);
  } else if (firstRemainder) {
    expandedFirst = [firstRemainder];
  } else {
    expandedFirst = [];
  }

  if (!expandedFirst.length) {
    return {ok: false, input, diagnostics: [{stage: 'parse', code: 'INVALID_PREFIX', message: 'Command token is empty after stripping prefix.'}]};
  }

  var pathTokens = expandedFirst.concat(tokens.slice(1));
  var N = expandedFirst.length;

  var rootMatch = resolveNodeToken(pathTokens[0], [root], resolver);
  if ('diagnostics' in rootMatch) {
    return {ok: false, input, diagnostics: rootMatch.diagnostics};
  }

  var chain: AnyBuiltNode[] = [root];
  var currentGroup: AnyBuiltGroup = root;
  var cursor = 1;
  var target: AnyBuiltCommand | undefined;
  var unresolvedDiagnostics: Diagnostic[] | undefined;

  while (cursor < pathTokens.length) {
    var resolved = resolveNodeToken(pathTokens[cursor], currentGroup.children, resolver);
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
    var lastNode = chain[chain.length - 1];
    if (!unresolvedDiagnostics && cursor === pathTokens.length && lastNode.type === 'group' && lastNode.defaultCommand) {
      target = lastNode.defaultCommand;
      chain.push(target);
      return {
        ok: true,
        input,
        path: chainToPath(chain.slice(0, -1)),
        target,
        chain: chain.slice(),
        tokens: tokens.slice(),
        rawArgs: [],
        rawOptions: deepFreeze({}),
        optionTerminatorUsed: false,
      };
    }

    return {
      ok: false,
      input,
      diagnostics: unresolvedDiagnostics || [{
        stage: 'parse',
        code: 'UNKNOWN_COMMAND',
        message: 'No executable command was found in input.',
        path: pathTokens.slice(0, cursor),
      }],
    };
  }

  var cmdIdx = cursor - 1;
  var remainingStart = cmdIdx < N ? 1 : cmdIdx - N + 2;
  var remaining = tokens.slice(remainingStart);

  var rawArgs: string[] = [];
  var rawOptions: Record<string, string | boolean | readonly string[]> = {};
  var optionTerminatorUsed = false;

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
