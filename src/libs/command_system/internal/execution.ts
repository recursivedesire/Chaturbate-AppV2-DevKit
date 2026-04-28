import type {
  AnyBuiltCommand,
  AuthorizationResult,
  RunResult,
} from '../types';

import {toCommandResult} from './shared';

export function executeCommand(authorized: AuthorizationResult<AnyBuiltCommand>): RunResult {
  if (authorized.ok === false) {
    return {ok: false, diagnostics: authorized.diagnostics};
  }

  try {
    return {
      ok: true,
      result: toCommandResult(authorized.target.handler({
        args: authorized.args,
        options: authorized.options,
        path: authorized.validated.parsed.path,
        rawInput: authorized.validated.parsed.input,
      })),
      diagnostics: [],
    };
  } catch (_error) {
    return {ok: false, diagnostics: [{stage: 'execute', code: 'EXECUTION_ERROR', message: 'An error occurred while executing the command.', path: authorized.validated.parsed.path}]};
  }
}
