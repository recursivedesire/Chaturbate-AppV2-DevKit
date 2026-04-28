import type {
  AnyBuiltCommand,
  BuiltValueSpec,
  Diagnostic,
  ParseResult,
  ValidationResult,
} from '../types';

import {
  deepFreeze,
  isReadonlyArray,
  regexTest,
} from './shared';

function coerceSingleValue(raw: string | boolean, spec: BuiltValueSpec<unknown>, diagnostics: Diagnostic[], path: readonly string[], parameter: string): unknown {
  if (spec.kind === 'array') {
    diagnostics.push({stage: 'validate', code: 'INVALID_VALUE', message: 'Array values must be supplied as repeated or variadic inputs.', path, parameter, token: String(raw)});
    return undefined;
  }

  if (spec.kind === 'boolean' && raw === true) {
    return true;
  }

  var rawString = String(raw);
  if (spec.regex && !regexTest(spec.regex, rawString)) {
    diagnostics.push({stage: 'validate', code: 'INVALID_VALUE', message: 'Invalid value for "' + parameter + '".', path, parameter, token: rawString});
    return undefined;
  }

  var parsed: unknown;
  try {
    parsed = spec.parser(rawString);
  } catch (_error) {
    diagnostics.push({stage: 'validate', code: 'INVALID_VALUE', message: 'Could not parse value for "' + parameter + '".', path, parameter, token: rawString});
    return undefined;
  }

  if (spec.validator) {
    var validated = spec.validator(parsed as never);
    if (validated !== true) {
      diagnostics.push({
        stage: 'validate',
        code: 'INVALID_VALUE',
        message: typeof validated === 'string' ? validated : 'Invalid value for "' + parameter + '".',
        path,
        parameter,
        token: rawString,
      });
      return undefined;
    }
  }

  return parsed;
}

function coerceArrayValue(raw: readonly (string | boolean)[], itemSpec: BuiltValueSpec<unknown>, diagnostics: Diagnostic[], path: readonly string[], parameter: string): unknown[] {
  var out: unknown[] = [];
  for (var i = 0; i < raw.length; i += 1) {
    var parsed = coerceSingleValue(raw[i], itemSpec, diagnostics, path, parameter);
    if (typeof parsed !== 'undefined') {
      out.push(parsed);
    }
  }
  return out;
}

function normalizeRawOptionValues(raw: string | boolean | readonly string[]): (string | boolean)[] {
  if (isReadonlyArray<string>(raw)) {
    var out: (string | boolean)[] = [];
    for (var i = 0; i < raw.length; i += 1) {
      out.push(raw[i]);
    }
    return out;
  }
  return [raw];
}

export function validateCommand(parsed: ParseResult<AnyBuiltCommand>): ValidationResult<AnyBuiltCommand> {
  if (parsed.ok === false) {
    return {ok: false, parsed, diagnostics: parsed.diagnostics};
  }

  var diagnostics: Diagnostic[] = [];
  var args: Record<string, unknown> = {};
  var options: Record<string, unknown> = {};
  var argIndex = 0;
  var path = parsed.path;
  var command = parsed.target;

  for (var i = 0; i < command.args.length; i += 1) {
    var argDef = command.args[i];
    var argSpec = argDef.spec;

    if (argSpec.kind === 'array' && argSpec.variadic) {
      var rest = parsed.rawArgs.slice(argIndex);
      if (!rest.length) {
        if (typeof argSpec.defaultValue !== 'undefined') {
          args[argDef.name] = argSpec.defaultValue;
        } else if (argSpec.required) {
          diagnostics.push({stage: 'validate', code: 'MISSING_ARGUMENT', message: 'Missing argument "' + argDef.name + '".', path, parameter: argDef.name});
        } else {
          args[argDef.name] = undefined;
        }
      } else if (argSpec.itemSpec) {
        args[argDef.name] = coerceArrayValue(rest, argSpec.itemSpec, diagnostics, path, argDef.name);
      } else {
        diagnostics.push({stage: 'validate', code: 'INVALID_DEFINITION', message: 'Array argument "' + argDef.name + '" is missing an item spec.', path, parameter: argDef.name});
      }
      argIndex = parsed.rawArgs.length;
      continue;
    }

    if (argIndex >= parsed.rawArgs.length) {
      if (typeof argSpec.defaultValue !== 'undefined') {
        args[argDef.name] = argSpec.defaultValue;
      } else if (argSpec.required) {
        diagnostics.push({stage: 'validate', code: 'MISSING_ARGUMENT', message: 'Missing argument "' + argDef.name + '".', path, parameter: argDef.name});
      } else {
        args[argDef.name] = undefined;
      }
      continue;
    }

    args[argDef.name] = coerceSingleValue(parsed.rawArgs[argIndex], argSpec, diagnostics, path, argDef.name);
    argIndex += 1;
  }

  if (argIndex < parsed.rawArgs.length) {
    diagnostics.push({stage: 'validate', code: 'TOO_MANY_ARGUMENTS', message: 'Too many positional arguments were provided.', path});
  }

  for (var j = 0; j < command.options.length; j += 1) {
    var optDef = command.options[j];
    var optSpec = optDef.spec;
    var raw = parsed.rawOptions[optDef.name];

    if (typeof raw === 'undefined') {
      if (typeof optSpec.defaultValue !== 'undefined') {
        options[optDef.name] = optSpec.defaultValue;
      } else if (optSpec.required) {
        diagnostics.push({stage: 'validate', code: 'MISSING_OPTION', message: 'Missing required option "' + optDef.name + '".', path, parameter: optDef.name});
      } else {
        options[optDef.name] = undefined;
      }
      continue;
    }

    if (optSpec.kind === 'array') {
      if (!optSpec.itemSpec) {
        diagnostics.push({stage: 'validate', code: 'INVALID_DEFINITION', message: 'Array option "' + optDef.name + '" is missing an item spec.', path, parameter: optDef.name});
        continue;
      }
      var arrayRaw = normalizeRawOptionValues(raw);
      options[optDef.name] = coerceArrayValue(arrayRaw, optSpec.itemSpec, diagnostics, path, optDef.name);
      continue;
    }

    if (optSpec.repeatable) {
      var repeatedRaw = normalizeRawOptionValues(raw);
      options[optDef.name] = coerceArrayValue(repeatedRaw, optSpec, diagnostics, path, optDef.name);
      continue;
    }

    options[optDef.name] = coerceSingleValue(raw as string | boolean, optSpec, diagnostics, path, optDef.name);
  }

  if (diagnostics.length) {
    return {ok: false, parsed, diagnostics};
  }

  return {
    ok: true,
    parsed,
    target: command,
    args: deepFreeze(args),
    options: deepFreeze(options),
  };
}
