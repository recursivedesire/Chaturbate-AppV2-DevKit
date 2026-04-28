import test from 'ava';

import {executeCode, withTransformedFixture} from './harness';

type SmokeCase = {
  name: string;
  fixture: string;
  key: string;
  expected: unknown;
};

const cases: SmokeCase[] = [
  {
    name: 'smoke build: mini app compiles and executes with project Babel config',
    fixture: 'smoke/app-basic',
    key: '__SMOKE_A__',
    expected: 'Hello DevKit',
  },
  {
    name: 'smoke build: transitive imports compile and execute with project Babel config',
    fixture: 'smoke/app-transitive',
    key: '__SMOKE_B__',
    expected: 'smoke',
  },
];

for (const scenario of cases) {
  test(scenario.name, (t) => {
    withTransformedFixture(
      {
        fixture: scenario.fixture,
        pipeline: 'macro+compat',
        useProjectConfig: true,
      },
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
