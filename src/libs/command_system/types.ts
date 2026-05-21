export type Dict = Record<string, unknown>;
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
export type Many<T> = T | readonly T[];

export type DefaultColorGroup = 'o' | 'm' | 'f' | 'l' | 'p' | 'tr' | 't' | 'g';

export type CommandResult = {
  success: boolean;
  message?: string;
  data?: unknown;
};

export type DiagnosticStage = 'parse' | 'validate' | 'authorize' | 'execute';

export type DiagnosticCode =
  | 'INVALID_PREFIX'
  | 'UNKNOWN_COMMAND'
  | 'AMBIGUOUS_COMMAND'
  | 'UNEXPECTED_TOKEN'
  | 'MISSING_ARGUMENT'
  | 'TOO_MANY_ARGUMENTS'
  | 'UNKNOWN_OPTION'
  | 'MISSING_OPTION'
  | 'MISSING_OPTION_VALUE'
  | 'INVALID_VALUE'
  | 'DUPLICATE_NAME'
  | 'DUPLICATE_ALIAS'
  | 'NAME_ALIAS_COLLISION'
  | 'PERMISSION_DENIED'
  | 'MISSING_HANDLER'
  | 'INVALID_DEFINITION'
  | 'EXECUTION_ERROR';

export type Diagnostic = {
  stage: DiagnosticStage;
  code: DiagnosticCode;
  message: string;
  path?: readonly string[];
  parameter?: string;
  token?: string;
};

export type AuthContext = {
  labels?: readonly string[];
};

export type AuthorizationInput = {
  username?: string;
  colorGroup?: DefaultColorGroup | string;
  labels?: readonly string[];
};

export type AuthorizationOptions = {
  includeUnauthorizedInHelp?: boolean;
  includeUnauthorizedInCompletion?: boolean;
};

export type BaseValueType = 'string' | 'number' | 'boolean' | 'select' | 'array';

export type ValueParser<T> = (raw: string) => T;
export type ValueValidator<T> = (value: T) => boolean | string;

export type BuiltValueSpec<T> = Readonly<{
  kind: BaseValueType;
  required: boolean;
  defaultValue?: Exclude<T, undefined>;
  regex?: RegExp;
  parser: ValueParser<Exclude<T, undefined>>;
  validator?: ValueValidator<Exclude<T, undefined>>;
  enumValues?: readonly Exclude<T, undefined>[];
  itemSpec?: BuiltValueSpec<unknown>;
  variadic?: boolean;
  repeatable?: boolean;
  shortName?: string;
  description?: string;
}>;

export interface ArgValueBuilder<T> {
  description(text: string): ArgValueBuilder<T>;
  regex(pattern: RegExp): ArgValueBuilder<T>;
  validate(validator: ValueValidator<Exclude<T, undefined>>): ArgValueBuilder<T>;
  parse<TNext>(parser: ValueParser<TNext>): ArgValueBuilder<TNext>;
  optional(): ArgValueBuilder<T | undefined>;
  default(value: Exclude<T, undefined>): ArgValueBuilder<Exclude<T, undefined>>;
  build(): BuiltValueSpec<T>;
}

export interface OptionValueBuilder<T> {
  description(text: string): OptionValueBuilder<T>;
  short(name: string): OptionValueBuilder<T>;
  regex(pattern: RegExp): OptionValueBuilder<T>;
  validate(validator: ValueValidator<Exclude<T, undefined>>): OptionValueBuilder<T>;
  parse<TNext>(parser: ValueParser<TNext>): OptionValueBuilder<TNext | Extract<T, undefined>>;
  required(): OptionValueBuilder<Exclude<T, undefined>>;
  default(value: Exclude<T, undefined>): OptionValueBuilder<Exclude<T, undefined>>;
  build(): BuiltValueSpec<T>;
}

export interface ArrayArgValueBuilder<TItem> extends ArgValueBuilder<readonly TItem[]> {
  variadic(): ArrayArgValueBuilder<TItem>;
}

export interface ArrayOptionValueBuilder<TItem> extends OptionValueBuilder<readonly TItem[] | undefined> {
  repeatable(): ArrayOptionValueBuilder<TItem>;
}

export type ArgSpecInput<T = unknown> = BuiltValueSpec<T> | ArgValueBuilder<T>;
export type OptionSpecInput<T = unknown> = BuiltValueSpec<T> | OptionValueBuilder<T>;

export type OutputOf<TSpec> =
  TSpec extends BuiltValueSpec<infer T>
    ? T
    : TSpec extends ArgValueBuilder<infer T>
      ? T
      : TSpec extends OptionValueBuilder<infer T>
        ? T
        : never;

export type PermissionMode = 'inherit' | 'replace' | 'extend';

export type BuiltArg<TName extends string = string, TValue = unknown> = Readonly<{
  name: TName;
  spec: BuiltValueSpec<TValue>;
}>;

export type BuiltOption<TName extends string = string, TValue = unknown> = Readonly<{
  name: TName;
  spec: BuiltValueSpec<TValue>;
}>;

export type CommandHandler<TArgs extends Dict = Dict, TOptions extends Dict = Dict> = (input: {
  args: Readonly<TArgs>;
  options: Readonly<TOptions>;
  path: readonly string[];
  rawInput: string;
}) => CommandResult | string | void;

export type BuiltCommand<TArgs extends Dict = Dict, TOptions extends Dict = Dict> = Readonly<{
  type: 'command';
  name: string;
  aliases: readonly string[];
  description?: string;
  args: readonly BuiltArg[];
  options: readonly BuiltOption[];
  permissions: readonly string[];
  permissionMode: PermissionMode;
  handler: CommandHandler<TArgs, TOptions>;
}>;

export type BuiltGroup<TChildren extends readonly AnyBuiltNode[] = readonly AnyBuiltNode[]> = Readonly<{
  type: 'group';
  name: string;
  aliases: readonly string[];
  description?: string;
  permissions: readonly string[];
  permissionMode: PermissionMode;
  children: TChildren;
  defaultCommand?: BuiltCommand<{}, {}>;
}>;

export type AnyBuiltCommand = BuiltCommand<any, any>;
export type AnyBuiltGroup = BuiltGroup<any>;
export type AnyBuiltNode = AnyBuiltCommand | AnyBuiltGroup;

export type ArgsOf<TCommand extends AnyBuiltCommand> =
  TCommand extends BuiltCommand<infer TArgs, any> ? TArgs : never;

export type OptionsOf<TCommand extends AnyBuiltCommand> =
  TCommand extends BuiltCommand<any, infer TOptions> ? TOptions : never;

export type CommandsOf<TNode extends AnyBuiltNode> =
  TNode extends BuiltCommand<any, any>
    ? TNode
    : TNode extends BuiltGroup<infer TChildren>
      ? CommandsOf<TChildren[number]>
      : never;

export type AnyCommandInput = AnyBuiltCommand | CommandBuilder<any, any>;
export type AnyGroupInput = AnyBuiltGroup | GroupBuilder<any>;
export type AnyNodeInput = AnyCommandInput | AnyGroupInput;

export type BuiltNodeFrom<T> =
  T extends BuiltCommand<any, any>
    ? T
    : T extends CommandBuilder<infer TArgs, infer TOptions>
      ? BuiltCommand<TArgs, TOptions>
      : T extends BuiltGroup<infer TChildren>
        ? BuiltGroup<TChildren>
        : T extends GroupBuilder<infer TChildren>
          ? BuiltGroup<TChildren>
          : never;

export type BuiltNodesFrom<T extends readonly unknown[]> = {
  [K in keyof T]: BuiltNodeFrom<T[K]>;
};

export type ParsedCommand<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  ok: true;
  input: string;
  path: readonly string[];
  target: TCommand;
  chain: readonly AnyBuiltNode[];
  tokens: readonly string[];
  rawArgs: readonly string[];
  rawOptions: Readonly<Record<string, string | boolean | readonly string[]>>;
  optionTerminatorUsed: boolean;
};

export type ParseFailure = {
  ok: false;
  input: string;
  diagnostics: readonly Diagnostic[];
};

export type ParseResult<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = ParsedCommand<TCommand> | ParseFailure;

export type ValidatedCommand<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  ok: true;
  parsed: ParsedCommand<TCommand>;
  target: TCommand;
  args: Readonly<ArgsOf<TCommand>>;
  options: Readonly<OptionsOf<TCommand>>;
};

export type ValidationFailure<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  ok: false;
  parsed: ParseResult<TCommand>;
  diagnostics: readonly Diagnostic[];
};

export type ValidationResult<TCommand extends AnyBuiltCommand = AnyBuiltCommand> =
  | ValidatedCommand<TCommand>
  | ValidationFailure<TCommand>;

export type AuthorizedCommand<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  ok: true;
  validated: ValidatedCommand<TCommand>;
  target: TCommand;
  args: Readonly<ArgsOf<TCommand>>;
  options: Readonly<OptionsOf<TCommand>>;
  authorization: Readonly<AuthorizationInput>;
};

export type AuthorizationFailure<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  ok: false;
  validated: ValidationResult<TCommand>;
  diagnostics: readonly Diagnostic[];
};

export type AuthorizationResult<TCommand extends AnyBuiltCommand = AnyBuiltCommand> =
  | AuthorizedCommand<TCommand>
  | AuthorizationFailure<TCommand>;

export type AnalysisResult<TCommand extends AnyBuiltCommand = AnyBuiltCommand> = {
  input: string;
  isCommand: boolean;
  parseOk: boolean;
  validateOk: boolean;
  authorized: boolean;
  executable: boolean;
  parsed?: ParsedCommand<TCommand>;
  validated?: ValidatedCommand<TCommand>;
  authorizedCommand?: AuthorizedCommand<TCommand>;
  diagnostics: readonly Diagnostic[];
};

export type RunResult = {
  ok: boolean;
  result?: CommandResult;
  diagnostics: readonly Diagnostic[];
};

export interface CommonNodeBuilder<TSelf, TBuilt> {
  description(text: string): TSelf;

  alias(name: string): TSelf;
  aliases(...names: readonly string[]): TSelf;
  aliases(names: readonly string[]): TSelf;

  permission(name: string): TSelf;
  permissions(...names: readonly string[]): TSelf;
  permissions(names: readonly string[]): TSelf;

  extendPermission(name: string): TSelf;
  extendPermissions(...names: readonly string[]): TSelf;
  extendPermissions(names: readonly string[]): TSelf;

  build(): TBuilt;
}

export interface CommandBuilder<TArgs extends Dict = {}, TOptions extends Dict = {}>
  extends CommonNodeBuilder<CommandBuilder<TArgs, TOptions>, BuiltCommand<TArgs, TOptions>> {
  arg<K extends string, TSpec extends ArgSpecInput<any>>(
    name: K,
    spec: TSpec,
  ): CommandBuilder<Simplify<TArgs & Record<K, OutputOf<TSpec>>>, TOptions>;

  option<K extends string, TSpec extends OptionSpecInput<any>>(
    name: K,
    spec: TSpec,
  ): CommandBuilder<TArgs, Simplify<TOptions & Record<K, OutputOf<TSpec>>>>;

  run(handler: CommandHandler<TArgs, TOptions>): CommandBuilder<TArgs, TOptions>;
}

export interface GroupBuilder<TChildren extends readonly AnyBuiltNode[] = readonly []>
  extends CommonNodeBuilder<GroupBuilder<TChildren>, BuiltGroup<TChildren>> {
  run(handler: CommandHandler<{}, {}>): GroupBuilder<TChildren>;

  command<TCommand extends AnyCommandInput>(
    command: TCommand,
  ): GroupBuilder<[...TChildren, BuiltNodeFrom<TCommand>]>;

  commands<TCommands extends readonly AnyNodeInput[]>(
    ...commands: TCommands
  ): GroupBuilder<[...TChildren, ...BuiltNodesFrom<TCommands>]>;

  commands<TCommands extends readonly AnyNodeInput[]>(
    commands: TCommands,
  ): GroupBuilder<[...TChildren, ...BuiltNodesFrom<TCommands>]>;

  group<TGroup extends AnyGroupInput>(
    group: TGroup,
  ): GroupBuilder<[...TChildren, BuiltNodeFrom<TGroup>]>;

  groups<TGroups extends readonly AnyGroupInput[]>(
    ...groups: TGroups
  ): GroupBuilder<[...TChildren, ...BuiltNodesFrom<TGroups>]>;

  groups<TGroups extends readonly AnyGroupInput[]>(
    groups: TGroups,
  ): GroupBuilder<[...TChildren, ...BuiltNodesFrom<TGroups>]>;
}

export type ResolverOptions = {
  allowAbbreviations?: boolean;
};

export type HelpOptions = {
  includeDefaults?: boolean;
  includeEnumValues?: boolean;
  includeAliases?: boolean;
  includeUnauthorized?: boolean;
  verbose?: boolean;
};

export type CompletionOptions = {
  includeUnauthorized?: boolean;
};

export type SyntaxConfig = {
  prefixes?: readonly string[];
  pathSeparators?: readonly string[];
};

export type EngineConfig = {
  resolver?: ResolverOptions;
  authorization?: AuthorizationOptions;
  syntax?: SyntaxConfig;
  inputRewriter?: {rewrite(input: string): string};
};

export interface CommandEngine<TRoot extends AnyBuiltGroup = AnyBuiltGroup> {
  readonly root: TRoot;

  parse(input: string): ParseResult;
  validate(parsed: ParseResult): ValidationResult;
  authorize(
    validated: ValidationResult,
    auth?: AuthContext,
  ): AuthorizationResult;
  analyze(input: string, auth?: AuthContext): AnalysisResult;
  execute(authorized: AuthorizationResult): RunResult;
  executeAnalysis(analysis: AnalysisResult): RunResult;
  run(input: string, auth?: AuthContext): RunResult;
  help(path?: string | readonly string[], options?: HelpOptions): string;
  usage(path?: string | readonly string[], options?: HelpOptions): string;
  list(path?: string | readonly string[], options?: HelpOptions): readonly string[];
  complete(input: string, options?: CompletionOptions): readonly string[];
}

export interface CommandRuntimeEngine<TRoot extends AnyBuiltGroup = AnyBuiltGroup> {
  readonly root: TRoot;
  readonly config?: EngineConfig;

  parse(input: string): ParseResult<AnyBuiltCommand>;
  validate(parsed: ParseResult<AnyBuiltCommand>): ValidationResult<AnyBuiltCommand>;
  authorize(validated: ValidationResult<AnyBuiltCommand>, auth?: AuthContext): AuthorizationResult<AnyBuiltCommand>;
  execute(authorized: AuthorizationResult<AnyBuiltCommand>): RunResult;
  run(input: string, auth?: AuthContext): RunResult;
}

export interface IntrospectionEngine<TRoot extends AnyBuiltGroup = AnyBuiltGroup> extends CommandRuntimeEngine<TRoot> {
  analyze(input: string, auth?: AuthContext): AnalysisResult<AnyBuiltCommand>;
  executeAnalysis(analysis: AnalysisResult<AnyBuiltCommand>): RunResult;

  help(path?: string | readonly string[], options?: HelpOptions): string;
  usage(path?: string | readonly string[], options?: HelpOptions): string;
  list(path?: string | readonly string[], options?: HelpOptions): readonly string[];
  complete(input: string, options?: CompletionOptions): readonly string[];
}
