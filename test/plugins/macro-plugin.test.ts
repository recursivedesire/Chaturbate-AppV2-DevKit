import test, {ExecutionContext} from 'ava';

import {executeCode, transformFixture} from './harness';

function runMacroFixture(
  fixture: string,
  env?: Record<string, string | undefined>,
): ReturnType<typeof transformFixture> {
  return transformFixture({fixture, pipeline: 'macro', env});
}

function assertNoMacroArtifacts(t: ExecutionContext, code: string): void {
  t.false(/\bfunction\s+MACRO_/.test(code));
  t.false(/['"]@lib\/macro['"]/.test(code));
}

function assertMacroSuccess(
  t: ExecutionContext,
  fixture: string,
  key: string,
  expectedValue: unknown,
  env?: Record<string, string | undefined>,
): void {
  const result = runMacroFixture(fixture, env);
  try {
    t.falsy(result.error);
    assertNoMacroArtifacts(t, result.code);

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.deepEqual((context.globalThis as Record<string, unknown>)[key], expectedValue);
  } finally {
    result.cleanup();
  }
}

function assertMacroFailure(
  t: ExecutionContext,
  fixture: string,
  message: string,
  env?: Record<string, string | undefined>,
): void {
  const result = runMacroFixture(fixture, env);
  try {
    t.truthy(result.error);
    t.true(String(result.error?.message).includes(message));
  } finally {
    result.cleanup();
  }
}

test('VALUE wrapper replaces literal thunk results', t => {
  assertMacroSuccess(t, 'macro/literal', '__VALUE_LITERAL__', 3);
});

test('VALUE wrapper resolves const/static object-array-template expressions', t => {
  assertMacroSuccess(t, 'macro/const-identifier', '__VALUE_CONST_IDENTIFIER__', '<<alpha>>');
  assertMacroSuccess(t, 'macro/static-complex', '__VALUE_STATIC_COMPLEX__', 'Nova:1,2,3:state-ready');
  assertMacroSuccess(t, 'macro/spread', '__VALUE_SPREAD__', 'x-y-z');
});

test('VALUE wrapper serializes plain object graphs across VM boundary', t => {
  assertMacroSuccess(t, 'macro/value-plain-object', '__VALUE_PLAIN_OBJECT__', {
    user: {
      name: 'Ada',
      labels: ['admin', 'ops'],
    },
    flags: [true, false, true],
    meta: {
      retries: 2,
    },
  });
});

test('VALUE wrapper accepts null-prototype objects and serializes entries', t => {
  assertMacroSuccess(t, 'macro/value-null-proto-object', '__VALUE_NULL_PROTO__', {
    title: 'zero-proto',
    values: [1, 2, 3],
    nested: {
      ok: true,
    },
  });
});

test('VALUE wrapper supports alias imports', t => {
  assertMacroSuccess(t, 'macro/value-alias', '__VALUE_ALIAS__', 42);
});

test('VALUE wrapper resolves static project-local imports', t => {
  assertMacroSuccess(t, 'macro/value-imported-static', '__VALUE_IMPORTED_STATIC__', 'Beta:2-4-6');
});

test('VALUE wrapper preserves resolvable function bindings', t => {
  const result = runMacroFixture('macro/value-function-binding');
  try {
    t.falsy(result.error);
    assertNoMacroArtifacts(t, result.code);
    t.regex(result.code, /const fn = helper;/);

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__VALUE_FN_BINDING__, 11);
  } finally {
    result.cleanup();
  }
});

test('VALUE wrapper inlines source-backed function results when no binding exists', t => {
  assertMacroSuccess(t, 'macro/value-function-inline', '__VALUE_FN_INLINE__', 13);
});

test('VALUE wrapper rejects missing thunk', t => {
  assertMacroFailure(t, 'macro/value-missing-thunk', 'VALUE requires exactly one thunk argument');
});

test('VALUE wrapper rejects invalid thunk', t => {
  assertMacroFailure(t, 'macro/value-invalid-thunk', 'VALUE argument must be a zero-argument function');
});

test('VALUE wrapper rejects non-source-backed function values', t => {
  assertMacroFailure(t, 'macro/non-serializable-return', 'not source-backed');
});

test('VALUE wrapper rejects unsupported object prototypes', t => {
  assertMacroFailure(t, 'macro/value-unsupported-date', 'received Date');
  assertMacroFailure(t, 'macro/value-unsupported-map', 'received Map');
  assertMacroFailure(t, 'macro/value-unsupported-class-instance', 'received ExampleBox');
  assertMacroFailure(t, 'macro/value-unsupported-custom-proto', 'Unsupported object prototype');
});

test('VALUE wrapper rejects cyclic objects and arrays', t => {
  assertMacroFailure(t, 'macro/value-cycle-object', 'Cyclic object');
  assertMacroFailure(t, 'macro/value-cycle-array', 'Cyclic array');
});

test('VALUE wrapper rejects disallowed import execution during compile evaluation', t => {
  assertMacroFailure(t, 'macro/value-disallowed-import', 'Disallowed import "node:fs"');
});

test('legacy MACRO_ alias stays functional and warns once per transformed file', t => {
  const result = runMacroFixture('macro/legacy-warning');
  try {
    t.falsy(result.error);
    assertNoMacroArtifacts(t, result.code);

    const warnings = result.stderr.filter((line) => line.includes('MACRO_* is deprecated'));
    t.is(warnings.length, 1);
    t.true(warnings[0].includes('use VALUE(() => ...) from "@lib/macro"'));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__LEGACY_WARNING__, 10);
  } finally {
    result.cleanup();
  }
});

test('legacy MACRO_ alias is rejected on and after 2027-01-01', t => {
  assertMacroFailure(
    t,
    'macro/legacy-removed',
    'MACRO_* was removed after 2026-12-31',
    {DEVKIT_MACRO_DATE: '2027-01-01'},
  );
});

test('removed VALUE_/EMIT_ prefixes fail with migration guidance', t => {
  assertMacroFailure(t, 'macro/removed-prefix-value', 'Prefix macros VALUE_* and EMIT_* were removed');
  assertMacroFailure(t, 'macro/removed-prefix-emit', 'Prefix macros VALUE_* and EMIT_* were removed');
});

test('EMIT wrapper expands snippets in program body', t => {
  assertMacroSuccess(t, 'macro/emit-program', '__EMIT_PROGRAM__', 5);
});

test('EMIT wrapper expands snippets in block bodies', t => {
  assertMacroSuccess(t, 'macro/emit-block', '__EMIT_BLOCK__', 7);
});

test('EMIT wrapper expands snippets in switch case consequents', t => {
  assertMacroSuccess(t, 'macro/emit-switch', '__EMIT_SWITCH__', 'ok');
});

test('EMIT wrapper rejects missing thunk', t => {
  assertMacroFailure(t, 'macro/emit-missing-thunk', 'EMIT requires exactly one thunk argument');
});

test('EMIT wrapper rejects invalid thunk', t => {
  assertMacroFailure(t, 'macro/emit-invalid-thunk', 'EMIT argument must be a zero-argument function');
});

test('EMIT wrapper rejects use outside standalone expression statements', t => {
  assertMacroFailure(t, 'macro/emit-invalid-context', 'EMIT(() => ...) must be used as standalone expression statement');
});

test('EMIT wrapper rejects invalid return types', t => {
  assertMacroFailure(t, 'macro/emit-bad-return', 'must be string or string[]');
});

test('EMIT wrapper rejects unparseable snippets', t => {
  assertMacroFailure(t, 'macro/emit-bad-snippet', 'failed to parse');
});

test('EMIT wrapper rejects snippets that contain import/export syntax', t => {
  assertMacroFailure(t, 'macro/emit-module-syntax', 'contains forbidden module syntax');
});
