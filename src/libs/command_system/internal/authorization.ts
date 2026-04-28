import type {
  AnyBuiltCommand,
  AuthContext,
  AuthorizationResult,
  ValidationResult,
} from '../types';

import {
  buildAuthorizationInput,
  matchesPermissions,
  resolveEffectivePermissions,
} from './shared';

export function authorizeCommand(validated: ValidationResult<AnyBuiltCommand>, auth?: AuthContext): AuthorizationResult<AnyBuiltCommand> {
  if (validated.ok === false) {
    return {ok: false, validated, diagnostics: validated.diagnostics};
  }

  var authorization = buildAuthorizationInput(auth);
  var permissions = resolveEffectivePermissions(validated.parsed.chain);
  if (!matchesPermissions(permissions, authorization)) {
    return {
      ok: false,
      validated,
      diagnostics: [{stage: 'authorize', code: 'PERMISSION_DENIED', message: 'You do not have permission to execute this command.', path: validated.parsed.path}],
    };
  }

  return {
    ok: true,
    validated,
    target: validated.target,
    args: validated.args,
    options: validated.options,
    authorization,
  };
}
