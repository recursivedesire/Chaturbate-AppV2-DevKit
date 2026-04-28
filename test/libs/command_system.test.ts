import test from 'ava';
import proxyquire from 'proxyquire';

import {User} from '@api/$user';

const $user: User = {username: 'Foo', colorGroup: 'f'} as User;
(globalThis as { $user?: User }).$user = $user;

const {
  command,
  group,
  buildCli,
  stringArg,
  numberArg,
  booleanArg,
  selectArg,
  arrayArg,
  stringOption,
  numberOption,
  booleanOption,
  selectOption,
  arrayOption,
  isAuthorizedFor,
  isParsedFor,
  isValidatedFor,
} = proxyquire('@lib/command_system', {
  '@api/$user': {$user},
});

const {buildCliRuntime} = proxyquire('@lib/command_system/runtime', {
  '@api/$user': {$user},
});

const {attachIntrospection} = proxyquire('@lib/command_system/introspection', {
  '@api/$user': {$user},
});

const {
  command: builderCommand,
  group: builderGroup,
  stringArg: builderStringArg,
} = proxyquire('@lib/command_system/builder', {
  '@api/$user': {$user},
});

test('builder build() is idempotent and built schema is frozen', t => {
  const builder = command('ping')
    .description('Ping command')
    .run(() => ({success: true, message: 'pong'}));

  const builtA = builder.build();
  const builtB = builder.build();

  t.is(builtA, builtB);
  t.true(Object.isFrozen(builtA));
  t.true(Object.isFrozen(builtA.args));
  t.true(Object.isFrozen(builtA.options));
});

test('builder rejects duplicate arg and option names at build()', t => {
  t.throws(() => {
    command('dup-arg')
      .arg('name', stringArg())
      .arg('name', stringArg())
      .run(() => ({success: true}))
      .build();
  }, {message: /Duplicate argument name/});

  t.throws(() => {
    command('dup-opt')
      .option('mode', stringOption())
      .option('mode', stringOption())
      .run(() => ({success: true}))
      .build();
  }, {message: /Duplicate option name/});
});

test('group build rejects name-alias collisions', t => {
  t.throws(() => {
    const a = command('alpha').alias('beta').run(() => ({success: true}));
    const b = command('beta').run(() => ({success: true}));
    group('/cli').commands(a, b).build();
  }, {message: /Name\/alias collision/});
});

test('parse/validate supports --long, -short, equals syntax and type coercion', t => {
  const cli = buildCli(group('/cli').command(
    command('echo')
      .arg('value', stringArg())
      .option('count', numberOption().short('c').default(1))
      .option('enabled', booleanOption().short('e').default(false))
      .option('mode', selectOption(['soft', 'hard']).default('soft'))
      .run(() => ({success: true})),
  ));

  const parsed = cli.parse('/cli echo hi --count=2 -e --mode hard');
  t.true(parsed.ok);

  const validated = cli.validate(parsed);
  t.true(validated.ok);
  if (!validated.ok) {
    return;
  }

  t.is(validated.args.value, 'hi');
  t.is(validated.options.count, 2);
  t.is(validated.options.enabled, true);
  t.is(validated.options.mode, 'hard');
});

test('parser honors -- option terminator and keeps dashed args', t => {
  const cli = buildCli(group('/cli').command(
    command('tail')
      .arg('value', stringArg())
      .run(({args}) => ({success: true, message: String(args.value)})),
  ));

  const validated = cli.validate(cli.parse('/cli tail -- -x'));
  t.true(validated.ok);
  if (!validated.ok) {
    return;
  }
  t.is(validated.args.value, '-x');
});

test('variadic arg and repeatable option are validated as arrays', t => {
  const cli = buildCli(group('/cli').command(
    command('collect')
      .arg('items', arrayArg(stringArg()).variadic())
      .option('tag', arrayOption(stringArg()).repeatable().short('t'))
      .run(({args, options}) => ({
        success: true,
        data: {items: args.items, tags: options.tag},
      })),
  ));

  const run = cli.run('/cli collect a b c -t red -t blue');
  t.true(run.ok);
  if (!run.ok || !run.result) {
    return;
  }

  const data = run.result.data as {items: readonly string[]; tags: readonly string[]};
  t.deepEqual(data.items, ['a', 'b', 'c']);
  t.deepEqual(data.tags, ['red', 'blue']);
});

test('resolver supports optional abbreviations and reports ambiguity', t => {
  const root = group('/cli').commands(
    command('listA').run(() => ({success: true})),
    command('listB').run(() => ({success: true})),
  );
  const cli = buildCli(root, {resolver: {allowAbbreviations: true}});

  const ambiguous = cli.parse('/cli li');
  t.false(ambiguous.ok);
  if (!ambiguous.ok) {
    t.is(ambiguous.diagnostics[0].code, 'AMBIGUOUS_COMMAND');
  }

  const unknown = cli.parse('/cli missing');
  t.false(unknown.ok);
  if (!unknown.ok) {
    t.is(unknown.diagnostics[0].code, 'UNKNOWN_COMMAND');
  }
});

test('permission modes inherit/replace/extend work with default $user authorization', t => {
  const cli = buildCli(
    group('/cli')
      .permissions('o')
      .commands(
        command('inherit-only').run(() => ({success: true})),
        command('replace-f').permissions('f').run(() => ({success: true})),
        command('extend-f').extendPermissions('f').run(() => ({success: true})),
      ),
  );

  t.false(cli.authorize(cli.validate(cli.parse('/cli inherit-only'))).ok);
  t.true(cli.authorize(cli.validate(cli.parse('/cli replace-f'))).ok);
  t.true(cli.authorize(cli.validate(cli.parse('/cli extend-f'))).ok);
});

test('authorization supports runtime labels extension', t => {
  const restricted = command('feature').permissions('feature-x').run(() => ({success: true})).build();
  const cli = buildCli(group('/cli').command(restricted));

  const validated = cli.validate(cli.parse('/cli feature'));
  t.true(validated.ok);

  const denied = cli.authorize(validated);
  t.false(denied.ok);

  const allowed = cli.authorize(validated, {labels: ['feature-x']});
  t.true(allowed.ok);
});

test('run normalizes handler returns string and void', t => {
  const cli = buildCli(group('/cli').commands(
    command('as-string').run(() => 'hello'),
    command('as-void').run(() => undefined),
  ));

  const stringResult = cli.run('/cli as-string');
  t.true(stringResult.ok);
  t.is(stringResult.result?.success, true);
  t.is(stringResult.result?.message, 'hello');

  const voidResult = cli.run('/cli as-void');
  t.true(voidResult.ok);
  t.is(voidResult.result?.success, true);
  t.is(voidResult.result?.message, undefined);
});

test('execution errors produce structured diagnostics', t => {
  const cli = buildCli(group('/cli').command(
    command('explode').run(() => {
      throw new Error('boom');
    }),
  ));

  const run = cli.run('/cli explode');
  t.false(run.ok);
  t.is(run.diagnostics[0].code, 'EXECUTION_ERROR');
  t.is(run.diagnostics[0].stage, 'execute');
});

test('help/usage/list honor unauthorized visibility toggles', t => {
  const cli = buildCli(group('/cli').commands(
    command('public').permissions('f').alias('pub').run(() => ({success: true})),
    command('secret').permissions('o').alias('sec').run(() => ({success: true})),
  ));

  const helpDefault = cli.help('/cli');
  t.true(helpDefault.includes('public'));
  t.false(helpDefault.includes('secret'));

  const helpWithUnauthorized = cli.help('/cli', {includeUnauthorized: true});
  t.true(helpWithUnauthorized.includes('secret'));

  const listDefault = cli.list('/cli');
  t.deepEqual(listDefault, ['public']);

  const listAll = cli.list('/cli', {includeUnauthorized: true, includeAliases: true});
  t.true(listAll.includes('public'));
  t.true(listAll.includes('pub'));
  t.true(listAll.includes('secret'));
  t.true(listAll.includes('sec'));

  const usage = cli.usage('/cli public', {includeAliases: true});
  t.true(usage.includes('public'));
  t.true(usage.includes('Aliases: pub'));
});

test('complete honors visibility by default and can include unauthorized commands', t => {
  const cli = buildCli(group('/cli').commands(
    command('status').permissions('f').run(() => ({success: true})),
    command('shutdown').permissions('o').run(() => ({success: true})),
  ));

  const defaultSuggestions = cli.complete('/cli sh');
  t.deepEqual(defaultSuggestions, []);

  const allSuggestions = cli.complete('/cli sh', {includeUnauthorized: true});
  t.true(allSuggestions.includes('shutdown'));
});

test('analyze + executeAnalysis allow parse-once execute-later behavior', t => {
  const ping = command('ping').run(() => ({success: true, message: 'pong'})).build();
  const cli = buildCli(group('/cli').command(ping));

  const analysis = cli.analyze('/cli ping');
  t.true(analysis.parseOk);
  t.true(analysis.validateOk);
  t.true(analysis.authorized);
  t.true(analysis.executable);

  const executed = cli.executeAnalysis(analysis);
  t.true(executed.ok);
  t.is(executed.result?.message, 'pong');

  const deniedCli = buildCli(group('/cli').command(command('secret').permissions('o').run(() => ({success: true}))));
  const deniedAnalysis = deniedCli.analyze('/cli secret');
  t.false(deniedAnalysis.executable);
  const deniedExecution = deniedCli.executeAnalysis(deniedAnalysis);
  t.false(deniedExecution.ok);
});

test('result guards narrow per-command parse/validate/authorize flow', t => {
  const ping = command('ping').run(() => ({success: true, message: 'pong'})).build();
  const other = command('other').run(() => ({success: true})).build();
  const cli = buildCli(group('/cli').commands(ping, other));

  const parsed = cli.parse('/cli ping');
  t.true(isParsedFor(parsed, ping));
  t.false(isParsedFor(parsed, other));

  const validated = cli.validate(parsed);
  t.true(isValidatedFor(validated, ping));

  const authorized = cli.authorize(validated);
  t.true(isAuthorizedFor(authorized, ping));
});

test('framework outputs are deterministic plain-data friendly for macro workflows', t => {
  const cli = buildCli(group('/cli').command(
    command('snapshot')
      .arg('count', numberArg())
      .option('enabled', booleanOption().default(true))
      .option('mode', selectOption(['a', 'b']).default('a'))
      .run(({args, options}) => ({success: true, data: {args, options}})),
  ));

  const a = cli.analyze('/cli snapshot 5 --enabled false --mode b');
  const b = cli.analyze('/cli snapshot 5 --enabled false --mode b');

  t.deepEqual(
    {
      parseOk: a.parseOk,
      validateOk: a.validateOk,
      authorized: a.authorized,
      executable: a.executable,
      diagnostics: a.diagnostics,
    },
    {
      parseOk: b.parseOk,
      validateOk: b.validateOk,
      authorized: b.authorized,
      executable: b.executable,
      diagnostics: b.diagnostics,
    },
  );

  t.notThrows(() => {
    JSON.stringify(a);
    JSON.stringify(cli.run('/cli snapshot 5 --enabled false --mode b'));
  });
});

test('typed value factories support regex/validator/custom parser constraints', t => {
  const cli = buildCli(group('/cli').command(
    command('typed')
      .arg('age', numberArg().validate((v) => v >= 18 || 'must be adult'))
      .arg('code', stringArg().regex(/^X\d+$/))
      .arg('choice', selectArg(['one', 'two']))
      .option('name', stringOption().parse((raw) => raw.trim()).required().short('n'))
      .option('flags', arrayOption(booleanArg()).repeatable())
      .run(({args, options}) => ({success: true, data: {args, options}})),
  ));

  const bad = cli.run('/cli typed 17 X12 one -n Alice');
  t.false(bad.ok);
  t.is(bad.diagnostics[0].code, 'INVALID_VALUE');

  const good = cli.run('/cli typed 18 X12 one -n " Alice " --flags true --flags false');
  t.true(good.ok);
  t.deepEqual(good.result?.data, {
    args: {age: 18, code: 'X12', choice: 'one'},
    options: {name: 'Alice', flags: [true, false]},
  });
});

test('runtime-only module executes built IR without introspection surface', t => {
  const schema = builderGroup('/cli').command(
    builderCommand('ping')
      .arg('name', builderStringArg())
      .run(({args}) => ({success: true, message: `pong-${String(args.name)}`})),
  ).build();

  const runtime = buildCliRuntime(schema);
  t.false('help' in (runtime as Record<string, unknown>));

  const run = runtime.run('/cli ping Ada');
  t.true(run.ok);
  t.is(run.result?.message, 'pong-Ada');
});

test('attachIntrospection adds help/list/complete/analyze methods to runtime engine', t => {
  const schema = builderGroup('/cli').commands(
    builderCommand('public').permissions('f').run(() => ({success: true})),
    builderCommand('secret').permissions('o').run(() => ({success: true})),
  ).build();

  const cli = attachIntrospection(buildCliRuntime(schema));
  const help = cli.help('/cli');
  t.true(help.includes('public'));
  t.false(help.includes('secret'));
  t.deepEqual(cli.complete('/cli se', {includeUnauthorized: true}), ['secret']);

  const analysis = cli.analyze('/cli public');
  t.true(analysis.executable);
  const executed = cli.executeAnalysis(analysis);
  t.true(executed.ok);
});
