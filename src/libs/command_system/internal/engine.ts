import type {
  AnyBuiltCommand,
  AnyBuiltGroup,
  AuthContext,
  AuthorizationResult,
  CommandRuntimeEngine,
  EngineConfig,
  ParseResult,
  ParsedCommand,
  ValidatedCommand,
  ValidationResult,
  AuthorizedCommand,
  RunResult,
} from '../types';

import {hasOwn, isObject} from './shared';
import {parseCommandTokens} from './parser';
import {validateCommand} from './validation';
import {authorizeCommand} from './authorization';
import {executeCommand} from './execution';

class CommandRuntimeEngineImpl<TRoot extends AnyBuiltGroup> implements CommandRuntimeEngine<TRoot> {
  readonly root: TRoot;
  readonly config?: EngineConfig;

  constructor(root: TRoot, config?: EngineConfig) {
    this.root = root;
    this.config = config || {};
  }

  parse(input: string): ParseResult<AnyBuiltCommand> {
    return parseCommandTokens(input, this.root, this.config?.resolver, this.config?.syntax, this.config?.inputRewriter);
  }

  validate(parsed: ParseResult<AnyBuiltCommand>): ValidationResult<AnyBuiltCommand> {
    return validateCommand(parsed);
  }

  authorize(validated: ValidationResult<AnyBuiltCommand>, auth?: AuthContext): AuthorizationResult<AnyBuiltCommand> {
    return authorizeCommand(validated, auth);
  }

  execute(authorized: AuthorizationResult<AnyBuiltCommand>): RunResult {
    return executeCommand(authorized);
  }

  run(input: string, auth?: AuthContext): RunResult {
    return this.execute(this.authorize(this.validate(this.parse(input)), auth));
  }
}

function isBuiltGroup(value: unknown): value is AnyBuiltGroup {
  return isObject(value)
    && hasOwn(value, 'type')
    && (value as {type: unknown}).type === 'group'
    && hasOwn(value, 'children');
}

export function isParsedFor<TCommand extends AnyBuiltCommand>(result: ParseResult<AnyBuiltCommand>, command: TCommand): result is ParsedCommand<TCommand> {
  return !!result.ok && result.target === command;
}

export function isValidatedFor<TCommand extends AnyBuiltCommand>(result: ValidationResult<AnyBuiltCommand>, command: TCommand): result is ValidatedCommand<TCommand> {
  return !!result.ok && result.target === command;
}

export function isAuthorizedFor<TCommand extends AnyBuiltCommand>(result: AuthorizationResult<AnyBuiltCommand>, command: TCommand): result is AuthorizedCommand<TCommand> {
  return !!result.ok && result.target === command;
}

export function buildCliRuntime<TRoot extends AnyBuiltGroup>(root: TRoot, config?: EngineConfig): CommandRuntimeEngine<TRoot> {
  if (!isBuiltGroup(root)) {
    throw new Error('buildCliRuntime() expects a built command group (serializable IR).');
  }

  return new CommandRuntimeEngineImpl(root, config);
}
