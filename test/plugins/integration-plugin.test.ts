import test from 'ava';

import {executeCode, withTransformedFixture, type Pipeline} from './harness';

type IntegrationCase = {
  name: string;
  fixture: string;
  pipeline: Pipeline;
  key: string;
  expected: unknown;
};

const cases: IntegrationCase[] = [
  {
    name: 'integration: macro in named-import module works in macro+compat order',
    fixture: 'integration/macro-in-inlined-module',
    pipeline: 'macro+compat',
    key: '__INT_A__',
    expected: 7,
  },
  {
    name: 'integration: macro in named-import module works in compat+macro order',
    fixture: 'integration/macro-in-inlined-module',
    pipeline: 'compat+macro',
    key: '__INT_A__',
    expected: 7,
  },
  {
    name: 'integration: macro in full-inline module works in macro+compat order',
    fixture: 'integration/inlined-module-defines-macro',
    pipeline: 'macro+compat',
    key: '__INT_B__',
    expected: 4,
  },
  {
    name: 'integration: macro in full-inline module works in compat+macro order',
    fixture: 'integration/inlined-module-defines-macro',
    pipeline: 'compat+macro',
    key: '__INT_B__',
    expected: 4,
  },
  {
    name: 'integration: mixed macro+inline side effects preserve dependency side effects',
    fixture: 'integration/mixed-side-effects',
    pipeline: 'macro+compat',
    key: '__INT_C__',
    expected: 42,
  },
];

for (const scenario of cases) {
  test(scenario.name, (t) => {
    withTransformedFixture(
      {fixture: scenario.fixture, pipeline: scenario.pipeline},
      (result) => {
        t.falsy(result.error);

        const context: Record<string, unknown> = {globalThis: {}};
        const runtime = executeCode(result.code, context);
        t.falsy(runtime);
        t.is((context.globalThis as Record<string, unknown>)[scenario.key], scenario.expected);
      },
    );
  });
}
