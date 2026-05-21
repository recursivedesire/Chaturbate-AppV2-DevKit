import type {
  AnyBuiltNode,
  AnyCommandInput,
  AnyGroupInput,
  AnyNodeInput,
  ArgSpecInput,
  ArgValueBuilder,
  ArrayArgValueBuilder,
  ArrayOptionValueBuilder,
  BuiltArg,
  BuiltCommand,
  BuiltGroup,
  BuiltNodeFrom,
  BuiltOption,
  BuiltValueSpec,
  CommandBuilder,
  CommandHandler,
  Dict,
  GroupBuilder,
  Many,
  OptionSpecInput,
  OptionValueBuilder,
  OutputOf,
  PermissionMode,
  Simplify,
  ValueParser,
  ValueValidator,
} from '../types';

import {
  deepFreeze,
  isBuiltNode,
  isBuiltValueSpec,
  isReadonlyArray,
  normalizeMany,
  uniqueStrings,
} from './shared';

export function buildArgSpec<T>(spec: ArgSpecInput<T>): BuiltValueSpec<T> {
  return isBuiltValueSpec(spec) ? spec : spec.build();
}

export function buildOptionSpec<T>(spec: OptionSpecInput<T>): BuiltValueSpec<T> {
  return isBuiltValueSpec(spec) ? spec : spec.build();
}

function buildNode(input: AnyNodeInput): AnyBuiltNode {
  return isBuiltNode(input) ? input : input.build();
}

type ValueBuilderState<T> = {
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
};

class ValueBuilderImpl<T> {
  protected readonly kind: string;
  protected readonly mode: 'arg' | 'option';
  protected readonly state: ValueBuilderState<T>;
  private built?: BuiltValueSpec<T>;

  constructor(kind: string, mode: 'arg' | 'option', state: ValueBuilderState<T>) {
    this.kind = kind;
    this.mode = mode;
    this.state = state;
  }

  protected ensureMutable(): void {
    if (this.built) {
      throw new Error('Cannot modify a value builder after build().');
    }
  }

  description(text: string): this {
    this.ensureMutable();
    this.state.description = text;
    return this;
  }

  regex(pattern: RegExp): this {
    this.ensureMutable();
    this.state.regex = pattern;
    return this;
  }

  validate(validator: ValueValidator<any>): this {
    this.ensureMutable();
    this.state.validator = validator;
    return this;
  }

  parse<TNext>(parser: ValueParser<TNext>): any {
    this.ensureMutable();
    (this.state as unknown as ValueBuilderState<TNext>).parser = parser as ValueParser<Exclude<TNext, undefined>>;
    return this as unknown as ValueBuilderImpl<TNext>;
  }

  optional(): any {
    this.ensureMutable();
    if (this.mode === 'arg') {
      this.state.required = false;
    }
    return this as unknown as ValueBuilderImpl<T | undefined>;
  }

  required(): any {
    this.ensureMutable();
    if (this.mode === 'option') {
      this.state.required = true;
    }
    return this as unknown as ValueBuilderImpl<Exclude<T, undefined>>;
  }

  default(value: Exclude<T, undefined>): any {
    this.ensureMutable();
    this.state.required = false;
    this.state.defaultValue = value;
    return this as unknown as ValueBuilderImpl<Exclude<T, undefined>>;
  }

  short(name: string): this {
    this.ensureMutable();
    if (this.mode === 'option') {
      this.state.shortName = name;
    }
    return this;
  }

  variadic(): any {
    this.ensureMutable();
    this.state.variadic = true;
    return this;
  }

  repeatable(): any {
    this.ensureMutable();
    this.state.repeatable = true;
    return this;
  }

  build(): BuiltValueSpec<T> {
    if (this.built) {
      return this.built;
    }
    this.built = deepFreeze({
      kind: this.kind,
      required: this.state.required,
      defaultValue: this.state.defaultValue,
      regex: this.state.regex,
      parser: this.state.parser,
      validator: this.state.validator,
      enumValues: this.state.enumValues ? this.state.enumValues.slice() : undefined,
      itemSpec: this.state.itemSpec,
      variadic: !!this.state.variadic,
      repeatable: !!this.state.repeatable,
      shortName: this.state.shortName,
      description: this.state.description,
    }) as BuiltValueSpec<T>;
    return this.built;
  }
}

class ArgValueBuilderImpl<T> extends ValueBuilderImpl<T> {}
class OptionValueBuilderImpl<T> extends ValueBuilderImpl<T> {}
class ArrayArgValueBuilderImpl<TItem> extends ValueBuilderImpl<readonly TItem[]> {}
class ArrayOptionValueBuilderImpl<TItem> extends ValueBuilderImpl<readonly TItem[] | undefined> {}

type NodeBuilderState = {
  name: string;
  description?: string;
  aliases: string[];
  permissions: string[];
  permissionMode: PermissionMode;
};

abstract class BaseNodeBuilder<TBuilt> {
  protected readonly state: NodeBuilderState;
  private built?: TBuilt;

  constructor(name: string) {
    this.state = {
      name,
      aliases: [],
      permissions: [],
      permissionMode: 'inherit',
    };
  }

  protected ensureMutable(): void {
    if (this.built) {
      throw new Error('Cannot modify a builder after build().');
    }
  }

  protected getBuilt(): TBuilt | undefined {
    return this.built;
  }

  protected setBuilt(value: TBuilt): TBuilt {
    this.built = value;
    return value;
  }

  description(text: string): this {
    this.ensureMutable();
    this.state.description = text;
    return this;
  }

  alias(name: string): this {
    return this.aliases(name);
  }

  aliases(first?: Many<string>, ...rest: readonly string[]): this {
    this.ensureMutable();
    this.state.aliases = uniqueStrings(this.state.aliases.concat(normalizeMany(first, rest)));
    return this;
  }

  permission(name: string): this {
    return this.permissions(name);
  }

  permissions(first?: Many<string>, ...rest: readonly string[]): this {
    this.ensureMutable();
    this.state.permissionMode = 'replace';
    this.state.permissions = uniqueStrings(normalizeMany(first, rest));
    return this;
  }

  extendPermission(name: string): this {
    return this.extendPermissions(name);
  }

  extendPermissions(first?: Many<string>, ...rest: readonly string[]): this {
    this.ensureMutable();
    this.state.permissionMode = 'extend';
    this.state.permissions = uniqueStrings(normalizeMany(first, rest));
    return this;
  }
}

class CommandBuilderImpl<TArgs extends Dict = {}, TOptions extends Dict = {}> extends BaseNodeBuilder<BuiltCommand<TArgs, TOptions>> {
  private readonly args: BuiltArg[] = [];
  private readonly options: BuiltOption[] = [];
  private handler?: CommandHandler<TArgs, TOptions>;

  arg<K extends string, TSpec extends ArgSpecInput<any>>(name: K, spec: TSpec): any {
    this.ensureMutable();
    this.args.push({name, spec: buildArgSpec(spec)});
    return this as unknown as CommandBuilder<Simplify<TArgs & Record<K, OutputOf<TSpec>>>, TOptions>;
  }

  option<K extends string, TSpec extends OptionSpecInput<any>>(name: K, spec: TSpec): any {
    this.ensureMutable();
    this.options.push({name, spec: buildOptionSpec(spec)});
    return this as unknown as CommandBuilder<TArgs, Simplify<TOptions & Record<K, OutputOf<TSpec>>>>;
  }

  run(handler: CommandHandler<TArgs, TOptions>): this {
    this.ensureMutable();
    this.handler = handler;
    return this;
  }

  build(): BuiltCommand<TArgs, TOptions> {
    var existing = this.getBuilt();
    if (existing) {
      return existing;
    }
    if (!this.handler) {
      throw new Error('Command "' + this.state.name + '" is missing a handler.');
    }
    validateParameterDefinitions(this.state.name, this.args, this.options);
    return this.setBuilt(deepFreeze({
      type: 'command' as const,
      name: this.state.name,
      aliases: this.state.aliases.slice(),
      description: this.state.description,
      args: this.args.slice(),
      options: this.options.slice(),
      permissions: this.state.permissions.slice(),
      permissionMode: this.state.permissionMode,
      handler: this.handler,
    }));
  }
}

class GroupBuilderImpl<TChildren extends readonly AnyBuiltNode[] = readonly []> extends BaseNodeBuilder<BuiltGroup<TChildren>> {
  private readonly children: AnyBuiltNode[] = [];
  private defaultHandler?: CommandHandler<{}, {}>;

  run(handler: CommandHandler<{}, {}>): GroupBuilder<TChildren> {
    this.ensureMutable();
    this.defaultHandler = handler;
    return this as unknown as GroupBuilder<TChildren>;
  }

  command<TCommand extends AnyCommandInput>(command: TCommand): any {
    this.ensureMutable();
    this.children.push(buildNode(command));
    return this as unknown as GroupBuilder<[...TChildren, BuiltNodeFrom<TCommand>]>;
  }

  commands(first?: readonly AnyNodeInput[] | AnyNodeInput, ...rest: readonly AnyNodeInput[]): any {
    this.ensureMutable();
    var values: AnyNodeInput[];
    if (isReadonlyArray<AnyNodeInput>(first)) {
      values = first.slice() as AnyNodeInput[];
    } else {
      values = [];
      if (typeof first !== 'undefined') {
        values.push(first);
      }
      for (var i = 0; i < rest.length; i += 1) {
        values.push(rest[i]);
      }
    }
    for (var j = 0; j < values.length; j += 1) {
      this.children.push(buildNode(values[j]));
    }
    return this;
  }

  group<TGroup extends AnyGroupInput>(group: TGroup): any {
    this.ensureMutable();
    var built = buildNode(group);
    if (built.type !== 'group') {
      throw new Error('group() only accepts groups.');
    }
    this.children.push(built);
    return this as unknown as GroupBuilder<[...TChildren, BuiltNodeFrom<TGroup>]>;
  }

  groups(first?: readonly AnyGroupInput[] | AnyGroupInput, ...rest: readonly AnyGroupInput[]): any {
    this.ensureMutable();
    var values: AnyGroupInput[];
    if (isReadonlyArray<AnyGroupInput>(first)) {
      values = first.slice() as AnyGroupInput[];
    } else {
      values = [];
      if (typeof first !== 'undefined') {
        values.push(first);
      }
      for (var i = 0; i < rest.length; i += 1) {
        values.push(rest[i]);
      }
    }

    for (var j = 0; j < values.length; j += 1) {
      var built = buildNode(values[j]);
      if (built.type !== 'group') {
        throw new Error('groups() only accepts groups.');
      }
      this.children.push(built);
    }

    return this;
  }

  build(): BuiltGroup<TChildren> {
    var existing = this.getBuilt();
    if (existing) {
      return existing;
    }
    validateChildDefinitions(this.state.name, this.children);
    var defaultCommand: BuiltCommand<{}, {}> | undefined;
    if (this.defaultHandler) {
      defaultCommand = deepFreeze({
        type: 'command' as const,
        name: '$default',
        aliases: [] as readonly string[],
        args: [] as readonly BuiltArg[],
        options: [] as readonly BuiltOption[],
        permissions: [] as readonly string[],
        permissionMode: 'inherit' as PermissionMode,
        handler: this.defaultHandler,
      });
    }
    return this.setBuilt(deepFreeze({
      type: 'group' as const,
      name: this.state.name,
      aliases: this.state.aliases.slice(),
      description: this.state.description,
      permissions: this.state.permissions.slice(),
      permissionMode: this.state.permissionMode,
      children: this.children.slice() as unknown as TChildren,
      defaultCommand,
    }));
  }
}

function validateParameterDefinitions(commandName: string, args: readonly BuiltArg[], options: readonly BuiltOption[]): void {
  var seenArgs: string[] = [];
  var seenOptions: string[] = [];
  var shortOptions: string[] = [];
  var i: number;

  for (i = 0; i < args.length; i += 1) {
    if (seenArgs.indexOf(args[i].name) !== -1) {
      throw new Error('Duplicate argument name "' + args[i].name + '" in command "' + commandName + '".');
    }
    seenArgs.push(args[i].name);
    if (args[i].spec.kind === 'array' && args[i].spec.variadic && i !== args.length - 1) {
      throw new Error('Variadic argument "' + args[i].name + '" must be the last argument in command "' + commandName + '".');
    }
  }

  for (i = 0; i < options.length; i += 1) {
    if (seenOptions.indexOf(options[i].name) !== -1) {
      throw new Error('Duplicate option name "' + options[i].name + '" in command "' + commandName + '".');
    }
    if (seenArgs.indexOf(options[i].name) !== -1) {
      throw new Error('Argument/option name collision for "' + options[i].name + '" in command "' + commandName + '".');
    }
    seenOptions.push(options[i].name);
    if (options[i].spec.shortName) {
      if (options[i].spec.shortName!.length !== 1) {
        throw new Error('Short option for "' + options[i].name + '" must be a single character.');
      }
      if (shortOptions.indexOf(options[i].spec.shortName!) !== -1) {
        throw new Error('Duplicate short option "' + options[i].spec.shortName + '" in command "' + commandName + '".');
      }
      shortOptions.push(options[i].spec.shortName!);
    }
  }
}

function validateChildDefinitions(groupName: string, children: readonly AnyBuiltNode[]): void {
  var names: string[] = [];
  var aliases: string[] = [];
  for (var i = 0; i < children.length; i += 1) {
    var child = children[i];
    if (names.indexOf(child.name) !== -1) {
      throw new Error('Duplicate child name "' + child.name + '" in group "' + groupName + '".');
    }
    if (aliases.indexOf(child.name) !== -1) {
      throw new Error('Name/alias collision for child "' + child.name + '" in group "' + groupName + '".');
    }
    names.push(child.name);
    for (var j = 0; j < child.aliases.length; j += 1) {
      var alias = child.aliases[j];
      if (aliases.indexOf(alias) !== -1) {
        throw new Error('Duplicate child alias "' + alias + '" in group "' + groupName + '".');
      }
      if (names.indexOf(alias) !== -1) {
        throw new Error('Name/alias collision for alias "' + alias + '" in group "' + groupName + '".');
      }
      aliases.push(alias);
    }
  }
}

export function command(name: string): CommandBuilder<{}, {}> {
  return new CommandBuilderImpl(name) as unknown as CommandBuilder<{}, {}>;
}

export function group(name: string): GroupBuilder<readonly []> {
  return new GroupBuilderImpl(name) as unknown as GroupBuilder<readonly []>;
}

export function stringArg(): ArgValueBuilder<string> {
  return new ArgValueBuilderImpl<string>('string', 'arg', {
    required: true,
    parser: function (raw: string): string {
      return raw;
    },
  }) as unknown as ArgValueBuilder<string>;
}

export function numberArg(): ArgValueBuilder<number> {
  return new ArgValueBuilderImpl<number>('number', 'arg', {
    required: true,
    parser: function (raw: string): number {
      var value = Number(raw);
      if (isNaN(value)) {
        throw new Error('Invalid number');
      }
      return value;
    },
  }) as unknown as ArgValueBuilder<number>;
}

export function booleanArg(): ArgValueBuilder<boolean> {
  return new ArgValueBuilderImpl<boolean>('boolean', 'arg', {
    required: true,
    parser: function (raw: string): boolean {
      if (raw === 'true' || raw === '1') {
        return true;
      }
      if (raw === 'false' || raw === '0') {
        return false;
      }
      throw new Error('Invalid boolean');
    },
  }) as unknown as ArgValueBuilder<boolean>;
}

export function selectArg<T extends string | number | boolean>(values: readonly T[]): ArgValueBuilder<T> {
  return new ArgValueBuilderImpl<T>('select', 'arg', {
    required: true,
    parser: function (raw: string): Exclude<T, undefined> {
      return raw as unknown as Exclude<T, undefined>;
    },
    validator: function (value: Exclude<T, undefined>): boolean {
      for (var i = 0; i < values.length; i += 1) {
        if (values[i] === value) {
          return true;
        }
      }
      return false;
    },
    enumValues: values as readonly Exclude<T, undefined>[],
  }) as unknown as ArgValueBuilder<T>;
}

export function arrayArg<TItem>(item: ArgSpecInput<TItem>): ArrayArgValueBuilder<TItem> {
  return new ArrayArgValueBuilderImpl<TItem>('array', 'arg', {
    required: true,
    parser: function (): readonly TItem[] {
      return [];
    },
    itemSpec: buildArgSpec(item),
    variadic: false,
  }) as unknown as ArrayArgValueBuilder<TItem>;
}

export function stringOption(): OptionValueBuilder<string | undefined> {
  return new OptionValueBuilderImpl<string | undefined>('string', 'option', {
    required: false,
    parser: function (raw: string): string {
      return raw;
    },
  }) as unknown as OptionValueBuilder<string | undefined>;
}

export function numberOption(): OptionValueBuilder<number | undefined> {
  return new OptionValueBuilderImpl<number | undefined>('number', 'option', {
    required: false,
    parser: function (raw: string): number {
      var value = Number(raw);
      if (isNaN(value)) {
        throw new Error('Invalid number');
      }
      return value;
    },
  }) as unknown as OptionValueBuilder<number | undefined>;
}

export function booleanOption(): OptionValueBuilder<boolean | undefined> {
  return new OptionValueBuilderImpl<boolean | undefined>('boolean', 'option', {
    required: false,
    parser: function (raw: string): boolean {
      if (raw === 'true' || raw === '1') {
        return true;
      }
      if (raw === 'false' || raw === '0') {
        return false;
      }
      throw new Error('Invalid boolean');
    },
  }) as unknown as OptionValueBuilder<boolean | undefined>;
}

export function selectOption<T extends string | number | boolean>(values: readonly T[]): OptionValueBuilder<T | undefined> {
  return new OptionValueBuilderImpl<T | undefined>('select', 'option', {
    required: false,
    parser: function (raw: string): Exclude<T, undefined> {
      return raw as unknown as Exclude<T, undefined>;
    },
    validator: function (value: Exclude<T, undefined>): boolean {
      for (var i = 0; i < values.length; i += 1) {
        if (values[i] === value) {
          return true;
        }
      }
      return false;
    },
    enumValues: values as readonly Exclude<T, undefined>[],
  }) as unknown as OptionValueBuilder<T | undefined>;
}

export function arrayOption<TItem>(item: ArgSpecInput<TItem>): ArrayOptionValueBuilder<TItem> {
  return new ArrayOptionValueBuilderImpl<TItem>('array', 'option', {
    required: false,
    parser: function (): readonly TItem[] {
      return [];
    },
    itemSpec: buildArgSpec(item),
    repeatable: true,
  }) as unknown as ArrayOptionValueBuilder<TItem>;
}
