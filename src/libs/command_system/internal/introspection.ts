import type {
  AnalysisResult,
  AnyBuiltCommand,
  AnyBuiltGroup,
  AnyBuiltNode,
  AuthContext,
  AuthorizationInput,
  CommandRuntimeEngine,
  CompletionOptions,
  Diagnostic,
  HelpOptions,
  IntrospectionEngine,
  ResolverOptions,
  RunResult,
  SyntaxConfig,
} from '../types';

import {
  buildAuthorizationInput,
  matchesPermissions,
  resolveEffectivePermissions,
  uniqueStrings,
} from './shared';
import {resolveNodeToken, tokenize} from './resolve';
import {resolvePath} from './parser';

export function formatCommandUsage(command: AnyBuiltCommand, options?: HelpOptions): string {
  var parts: string[] = [command.name];

  for (var i = 0; i < command.args.length; i += 1) {
    var arg = command.args[i];
    var wrapped = arg.spec.required ? '<' + arg.name + '>' : '[' + arg.name + ']';
    if (arg.spec.kind === 'array' && arg.spec.variadic) {
      wrapped = wrapped.slice(0, 1) + arg.name + '...' + wrapped.slice(wrapped.length - 1);
    }
    parts.push(wrapped);
  }

  for (var j = 0; j < command.options.length; j += 1) {
    var opt = command.options[j];
    var left = opt.spec.shortName ? '-' + opt.spec.shortName + ', --' + opt.name : '--' + opt.name;
    if (opt.spec.kind !== 'boolean') {
      left += ' <value>';
    }
    parts.push('[' + left + ']');
  }

  var lines: string[] = [parts.join(' ')];
  if (command.description) {
    lines.push(command.description);
  }

  if (options && options.includeAliases && command.aliases.length) {
    lines.push('Aliases: ' + command.aliases.join(', '));
  }

  if (options && options.verbose) {
    for (var k = 0; k < command.args.length; k += 1) {
      var argDef = command.args[k];
      var argLine = 'Arg ' + argDef.name;
      if (argDef.spec.description) {
        argLine += ': ' + argDef.spec.description;
      }
      if (options.includeDefaults && typeof argDef.spec.defaultValue !== 'undefined') {
        argLine += ' (default: ' + String(argDef.spec.defaultValue) + ')';
      }
      if (options.includeEnumValues && argDef.spec.enumValues && argDef.spec.enumValues.length) {
        argLine += ' [' + argDef.spec.enumValues.join(', ') + ']';
      }
      lines.push(argLine);
    }

    for (var m = 0; m < command.options.length; m += 1) {
      var optDef = command.options[m];
      var optLine = 'Opt --' + optDef.name;
      if (optDef.spec.shortName) {
        optLine += ' (-' + optDef.spec.shortName + ')';
      }
      if (optDef.spec.description) {
        optLine += ': ' + optDef.spec.description;
      }
      if (options.includeDefaults && typeof optDef.spec.defaultValue !== 'undefined') {
        optLine += ' (default: ' + String(optDef.spec.defaultValue) + ')';
      }
      if (options.includeEnumValues && optDef.spec.enumValues && optDef.spec.enumValues.length) {
        optLine += ' [' + optDef.spec.enumValues.join(', ') + ']';
      }
      lines.push(optLine);
    }
  }

  return lines.join('\n');
}

function formatGroupListing(chain: readonly AnyBuiltNode[], group: AnyBuiltGroup, authorization: AuthorizationInput, options?: HelpOptions): string {
  var lines: string[] = [];
  var includeUnauthorized = !!(options && options.includeUnauthorized);

  for (var i = 0; i < group.children.length; i += 1) {
    var child = group.children[i];
    if (!includeUnauthorized) {
      var visiblePermissions = resolveEffectivePermissions(chain.concat(child));
      if (!matchesPermissions(visiblePermissions, authorization)) {
        continue;
      }
    }
    lines.push(child.name + (child.description ? ': ' + child.description : ''));
  }

  return lines.join('\n');
}

function filterStartingWith(values: readonly string[], prefix: string): string[] {
  var out: string[] = [];
  for (var i = 0; i < values.length; i += 1) {
    if (values[i].indexOf(prefix) === 0) {
      out.push(values[i]);
    }
  }
  return out;
}

function visibleChildNames(chain: readonly AnyBuiltNode[], group: AnyBuiltGroup, authorization: AuthorizationInput, includeUnauthorized: boolean): string[] {
  var out: string[] = [];
  for (var i = 0; i < group.children.length; i += 1) {
    var child = group.children[i];
    if (!includeUnauthorized) {
      var permissions = resolveEffectivePermissions(chain.concat(child));
      if (!matchesPermissions(permissions, authorization)) {
        continue;
      }
    }
    out.push(child.name);
  }
  return out;
}

function visibleOptionNames(command: AnyBuiltCommand): string[] {
  var out: string[] = [];
  for (var i = 0; i < command.options.length; i += 1) {
    out.push('--' + command.options[i].name);
  }
  return out;
}

function readResolverFromEngine(engine: CommandRuntimeEngine<AnyBuiltGroup>): ResolverOptions | undefined {
  var config = engine.config;
  if (!config) {
    return undefined;
  }
  return config.resolver;
}

function readSyntaxFromEngine(engine: CommandRuntimeEngine<AnyBuiltGroup>): SyntaxConfig | undefined {
  var config = engine.config;
  if (!config) {
    return undefined;
  }
  return config.syntax;
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

function expandSyntaxPath(path: string, syntax?: SyntaxConfig): readonly string[] {
  var tokenized = tokenize(path);
  if (!tokenized.ok || !tokenized.tokens.length) {
    return [];
  }

  var tokens = tokenized.tokens;
  var firstToken = tokens[0];
  var prefixLen = 0;

  if (syntax && syntax.prefixes && syntax.prefixes.length > 0) {
    for (var p = 0; p < syntax.prefixes.length; p += 1) {
      if (firstToken.indexOf(syntax.prefixes[p]) === 0) {
        prefixLen = syntax.prefixes[p].length;
        break;
      }
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

  var firstRemainder = firstToken.slice(prefixLen);
  var expanded: string[];

  if (pathSeparators.length > 0 && firstRemainder) {
    expanded = splitBySeparators(firstRemainder, pathSeparators);
  } else if (firstRemainder) {
    expanded = [firstRemainder];
  } else {
    expanded = [];
  }

  return expanded.concat(tokens.slice(1));
}

export function attachIntrospection<TRoot extends AnyBuiltGroup>(engine: CommandRuntimeEngine<TRoot>): IntrospectionEngine<TRoot> {
  var resolver = readResolverFromEngine(engine as unknown as CommandRuntimeEngine<AnyBuiltGroup>);
  var syntax = readSyntaxFromEngine(engine as unknown as CommandRuntimeEngine<AnyBuiltGroup>);

  return Object.assign(engine, {
    analyze(input: string, auth?: AuthContext): AnalysisResult<AnyBuiltCommand> {
      var parsed = engine.parse(input);
      var validated = engine.validate(parsed);
      var authorized = engine.authorize(validated, auth);
      var diagnostics: Diagnostic[] = [];

      if (parsed.ok === false) {
        diagnostics = diagnostics.concat(parsed.diagnostics as Diagnostic[]);
      }
      if (validated.ok === false) {
        diagnostics = diagnostics.concat(validated.diagnostics as Diagnostic[]);
      }
      if (authorized.ok === false) {
        diagnostics = diagnostics.concat(authorized.diagnostics as Diagnostic[]);
      }

      return {
        input,
        isCommand: parsed.ok,
        parseOk: parsed.ok,
        validateOk: validated.ok,
        authorized: authorized.ok,
        executable: authorized.ok,
        parsed: parsed.ok ? parsed : undefined,
        validated: validated.ok ? validated : undefined,
        authorizedCommand: authorized.ok ? authorized : undefined,
        diagnostics,
      };
    },

    executeAnalysis(analysis: AnalysisResult<AnyBuiltCommand>): RunResult {
      if (analysis.authorizedCommand) {
        return engine.execute(analysis.authorizedCommand);
      }
      return {ok: false, diagnostics: analysis.diagnostics};
    },

    help(path?: string | readonly string[], options?: HelpOptions): string {
      var authorization = buildAuthorizationInput();
      var resolvedPath: readonly string[];
      if (typeof path === 'string') {
        resolvedPath = expandSyntaxPath(path, syntax);
      } else {
        resolvedPath = path ? path.slice() : [];
      }

      var resolved = resolvePath(engine.root, resolvedPath as readonly string[], resolver);
      if (!resolved) {
        return 'Not found.';
      }

      if (resolved.node.type === 'command') {
        return formatCommandUsage(resolved.node, options);
      }

      return formatGroupListing(resolved.chain, resolved.node, authorization, options);
    },

    usage(path?: string | readonly string[], options?: HelpOptions): string {
      var resolvedPath: readonly string[];
      if (typeof path === 'string') {
        resolvedPath = expandSyntaxPath(path, syntax);
      } else {
        resolvedPath = path ? path.slice() : [];
      }

      var resolved = resolvePath(engine.root, resolvedPath as readonly string[], resolver);
      if (!resolved) {
        return 'Not found.';
      }

      if (resolved.node.type === 'command') {
        return formatCommandUsage(resolved.node, options);
      }

      return resolved.chain.map((node) => node.name).join(' ');
    },

    list(path?: string | readonly string[], options?: HelpOptions): readonly string[] {
      var authorization = buildAuthorizationInput();
      var resolvedPath: readonly string[];
      if (typeof path === 'string') {
        resolvedPath = expandSyntaxPath(path, syntax);
      } else {
        resolvedPath = path ? path.slice() : [];
      }

      var resolved = resolvePath(engine.root, resolvedPath as readonly string[], resolver);
      if (!resolved) {
        return [];
      }

      if (resolved.node.type === 'command') {
        if (options && options.includeAliases) {
          return uniqueStrings([resolved.node.name].concat(resolved.node.aliases as string[]));
        }
        return [resolved.node.name];
      }

      var names = visibleChildNames(
        resolved.chain,
        resolved.node,
        authorization,
        !!(options && options.includeUnauthorized),
      );

      if (!(options && options.includeAliases)) {
        return names;
      }

      var withAliases = names.slice();
      for (var i = 0; i < resolved.node.children.length; i += 1) {
        var child = resolved.node.children[i];
        if (withAliases.indexOf(child.name) === -1) {
          continue;
        }
        for (var j = 0; j < child.aliases.length; j += 1) {
          withAliases.push(child.aliases[j]);
        }
      }

      return uniqueStrings(withAliases);
    },

    complete(input: string, options?: CompletionOptions): readonly string[] {
      var expanded = expandSyntaxPath(input, syntax);
      if (!expanded.length) {
        return [engine.root.name];
      }

      var tokens = expanded;
      var endsWithSpace = !!input && /\s$/.test(input);
      var authorization = buildAuthorizationInput();
      var includeUnauthorized = !!(options && options.includeUnauthorized);

      if (tokens.length === 1 && !endsWithSpace) {
        var rootCandidates = [engine.root.name].concat(engine.root.aliases as string[]);
        return filterStartingWith(rootCandidates, tokens[0]);
      }

      var currentGroup: AnyBuiltGroup = engine.root;
      var chain: AnyBuiltNode[] = [engine.root];
      var cursor = 1;

      while (cursor < tokens.length) {
        var isLast = cursor === tokens.length - 1;
        var token = tokens[cursor];

        if (!endsWithSpace && isLast) {
          return filterStartingWith(visibleChildNames(chain, currentGroup, authorization, includeUnauthorized), token);
        }

        var resolved = resolveNodeToken(token, currentGroup.children, resolver);
        if ('diagnostics' in resolved) {
          return [];
        }

        chain.push(resolved.node);
        if (resolved.node.type === 'command') {
          if (endsWithSpace) {
            return visibleOptionNames(resolved.node);
          }
          if (cursor < tokens.length - 1) {
            return filterStartingWith(visibleOptionNames(resolved.node), tokens[tokens.length - 1]);
          }
          return [resolved.node.name];
        }

        currentGroup = resolved.node;
        cursor += 1;
      }

      return visibleChildNames(chain, currentGroup, authorization, includeUnauthorized);
    },
  }) as IntrospectionEngine<TRoot>;
}
