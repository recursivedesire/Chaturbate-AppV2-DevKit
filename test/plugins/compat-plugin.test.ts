import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import test from 'ava';

import {
  executeCode,
  getImportSources,
  hasAnyExport,
  topLevelDeclarationNames,
  withTransformedFixture,
  type TransformFixtureResult,
} from './harness';

const REPO_ROOT = process.cwd();
const {createModuleIdentity} = require(path.join(REPO_ROOT, 'compat-identity.js')) as {
  createModuleIdentity: (absolutePath: string, entryRootDir: string) => {moduleVarName: string};
};
const DEVKIT_VERSION = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {version: string}).version;

function runCompatFixture(fixture: string, callback: (result: TransformFixtureResult) => void): void {
  withTransformedFixture({fixture, pipeline: 'compat'}, callback);
}

function hasGeneratedSymbol(names: string[], symbol: string): boolean {
  const pattern = new RegExp(`^[A-Za-z0-9_]+__[0-9a-f]{6}__${symbol}$`);
  return names.some((name) => pattern.test(name));
}

function countGeneratedSymbol(names: string[], symbol: string): number {
  const pattern = new RegExp(`^[A-Za-z0-9_]+__[0-9a-f]{6}__${symbol}$`);
  return names.filter((name) => pattern.test(name)).length;
}

function writeCachedLibBlob(workDir: string, kind: 'generated' | 'minified', code: string): void {
  const filePath = path.join(workDir, '.devkit', 'libs-cache', kind, 'Foo.js');
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, code);
}

function createFooBlobCode(moduleVarName: string, value: string): string {
  return [
    `const ${moduleVarName} = (() => {`,
    '  const __devkit_exports = {};',
    '  class Foo {',
    '    static value() {',
    `      return '${value}';`,
    '    }',
    '  }',
    '  __devkit_exports[\"Foo\"] = Foo;',
    '  return __devkit_exports;',
    '})();',
    '',
  ].join('\n');
}

test('compat strips API/sharedCode imports and keeps local inline content', t => {
  runCompatFixture('compat/strip-imports', (result) => {
    t.falsy(result.error);
    t.deepEqual(getImportSources(result.ast), []);
    t.false(hasAnyExport(result.ast));

    const names = topLevelDeclarationNames(result.ast);
    t.true(hasGeneratedSymbol(names, 'localFeature'));

    const runtime = executeCode(result.code, {globalThis: {}});
    t.falsy(runtime);
  });
});

test('compat full-file inline replaces side-effect imports', t => {
  runCompatFixture('compat/full-inline', (result) => {
    t.falsy(result.error);
    t.deepEqual(getImportSources(result.ast), []);

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__FULL_INLINE__, 1);
  });
});

test('compat partial named inline keeps requested export only', t => {
  runCompatFixture('compat/partial-inline-named', (result) => {
    t.falsy(result.error);

    const names = topLevelDeclarationNames(result.ast);
    t.true(hasGeneratedSymbol(names, 'Foo'));
    t.false(hasGeneratedSymbol(names, 'Bar'));
  });
});

test('compat deduplicates duplicate partial imports', t => {
  runCompatFixture('compat/duplicate-imports', (result) => {
    t.falsy(result.error);

    const names = topLevelDeclarationNames(result.ast);
    const fooCount = countGeneratedSymbol(names, 'Foo');
    t.is(fooCount, 1);

    const runtime = executeCode(result.code, {globalThis: {}});
    t.falsy(runtime);
  });
});

test('compat recursively inlines transitive imports including ../ paths', t => {
  runCompatFixture('compat/recursive-parent-import', (result) => {
    t.falsy(result.error);

    const names = topLevelDeclarationNames(result.ast);
    t.true(names.some((name) => /^at_lib_command_system__[0-9a-f]{6}__module$/.test(name)));

    const runtime = executeCode(result.code, {globalThis: {}});
    t.falsy(runtime);
  });
});

type SymbolCase = {
  name: string;
  fixture: string;
  symbol: string;
};

const symbolCases: SymbolCase[] = [
  {
    name: 'compat supports export class declarations during partial inline',
    fixture: 'compat/export-inline-class',
    symbol: 'ExportedClass',
  },
  {
    name: 'compat keeps export-list style declarations inlineable',
    fixture: 'compat/export-list-pass',
    symbol: 'ListedClass',
  },
  {
    name: 'compat resolves re-export chains',
    fixture: 'compat/reexport',
    symbol: 'ReExported',
  },
];

for (const scenario of symbolCases) {
  test(scenario.name, t => {
    runCompatFixture(scenario.fixture, (result) => {
      t.falsy(result.error);

      const names = topLevelDeclarationNames(result.ast);
      t.true(hasGeneratedSymbol(names, scenario.symbol));

      const runtime = executeCode(result.code, {globalThis: {}});
      t.falsy(runtime);
    });
  });
}

test('compat keeps non-exported dependencies required by inlined exports', t => {
  runCompatFixture('compat/dependency-retention', (result) => {
    t.falsy(result.error);

    const names = topLevelDeclarationNames(result.ast);
    t.true(hasGeneratedSymbol(names, 'run'));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__DEP_RETENTION__, 7);
  });
});

test('compat avoids identifier collision when two modules export same symbol name', t => {
  runCompatFixture('compat/rename-collision', (result) => {
    t.falsy(result.error);

    const names = topLevelDeclarationNames(result.ast);
    t.true(names.some((name) => /^alpha__[0-9a-f]{6}__Foo$/.test(name)));
    t.true(names.some((name) => /^beta__[0-9a-f]{6}__Foo$/.test(name)));

    const runtime = executeCode(result.code, {globalThis: {}});
    t.falsy(runtime);
  });
});

test('compat handles type-only and mixed imports without leaking module syntax', t => {
  runCompatFixture('compat/type-only-mixed', (result) => {
    t.falsy(result.error);
    t.deepEqual(getImportSources(result.ast), []);

    const names = topLevelDeclarationNames(result.ast);
    t.true(hasGeneratedSymbol(names, 'consume'));
    t.true(hasGeneratedSymbol(names, 'valueFactory'));

    const context: Record<string, unknown> = {
      globalThis: {},
      $app: {name: 'alias-app'},
    };
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__TYPE_CONSUME__, 'typed');
    t.is((context.globalThis as Record<string, unknown>).__TYPE_FACTORY__, true);
  });
});

test('compat resolves @api and @lib fixture aliases', t => {
  withTransformedFixture(
    {fixture: 'compat/alias-imports', pipeline: 'compat', enableAliases: true},
    (result) => {
      t.falsy(result.error);

      const context: Record<string, unknown> = {
        globalThis: {},
        $app: {name: 'alias-app'},
      };
      const runtime = executeCode(result.code, context);
      t.falsy(runtime);
      t.is((context.globalThis as Record<string, unknown>).__ALIAS_NAME__, 'alias-app');
    },
  );
});

test('compat extension resolution supports .ts/.js/extensionless modules', t => {
  runCompatFixture('compat/relative-resolution', (result) => {
    t.falsy(result.error);
    t.deepEqual(getImportSources(result.ast), []);

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__FROM_TS__, true);
    t.is((context.globalThis as Record<string, unknown>).__FROM_JS__, true);
    t.is((context.globalThis as Record<string, unknown>).__FROM_EXTLESS__, true);
  });
});

test('compat resolves dotted basename specifiers for relative and alias imports', t => {
  runCompatFixture('compat/dotted-basenames', (result) => {
    t.falsy(result.error);
    t.true(result.stderr.every((line) => !line.includes('unresolved inline target')));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__DOTTED_RELATIVE__, 11);
    t.is((context.globalThis as Record<string, unknown>).__DOTTED_ALIAS__, 'alias-5');
  });
});

test('compat emits script source type after export stripping', t => {
  runCompatFixture('compat/source-type-fallback', (result) => {
    t.falsy(result.error);
    t.is(result.sourceType, 'script');
  });
});

test('compat reports missing inline targets via stderr', t => {
  runCompatFixture('compat/missing-file', (result) => {
    t.falsy(result.error);
    t.true(result.stderr.some((line) => line.includes('[devportal-compat-plugin] unresolved inline target')));
  });
});

test('compat min mode falls back to generated lib cache and preserves naming parity', t => {
  let expectedModuleVar = '';
  withTransformedFixture(
    {
      fixture: 'compat/lib-cache',
      pipeline: 'compat',
      enableAliases: true,
      env: {DEVKIT_USE_MIN_LIBS: '1'},
      setup(workDir) {
        const sourcePath = path.join(workDir, 'libs', 'Foo.ts');
        expectedModuleVar = createModuleIdentity(sourcePath, workDir).moduleVarName;
        writeCachedLibBlob(workDir, 'generated', createFooBlobCode(expectedModuleVar, 'generated'));
      },
    },
    (result) => {
    t.falsy(result.error);
    const names = topLevelDeclarationNames(result.ast);
    t.true(names.includes(expectedModuleVar));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__LIB_CACHE_VALUE__, 'generated');
    },
  );
});

test('compat min mode uses minified lib cache and injects integrity metadata comment', t => {
  let minifiedBlob = '';
  let expectedMd5 = '';
  withTransformedFixture(
    {
      fixture: 'compat/lib-cache',
      pipeline: 'compat',
      enableAliases: true,
      env: {DEVKIT_USE_MIN_LIBS: '1'},
      setup(workDir) {
        const sourcePath = path.join(workDir, 'libs', 'Foo.ts');
        const moduleVar = createModuleIdentity(sourcePath, workDir).moduleVarName;
        writeCachedLibBlob(workDir, 'generated', createFooBlobCode(moduleVar, 'generated'));
        minifiedBlob = `const ${moduleVar}=(()=>{const __devkit_exports={};class Foo{static value(){return\"minified\"}}__devkit_exports[\"Foo\"]=Foo;return __devkit_exports;})();`;
        expectedMd5 = crypto.createHash('md5').update(Buffer.from(minifiedBlob)).digest('hex');
        writeCachedLibBlob(workDir, 'minified', minifiedBlob);
      },
    },
    (result) => {
    t.falsy(result.error);
    t.true(result.code.includes(`Minified DevKit lib Foo (v${DEVKIT_VERSION}, md5 ${expectedMd5}, source src/libs/Foo.ts)`));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__LIB_CACHE_VALUE__, 'minified');
    },
  );
});

test('compat min mode warns and falls back when minified lib cache is invalid', t => {
  withTransformedFixture(
    {
      fixture: 'compat/lib-cache',
      pipeline: 'compat',
      enableAliases: true,
      env: {DEVKIT_USE_MIN_LIBS: '1'},
      setup(workDir) {
        const sourcePath = path.join(workDir, 'libs', 'Foo.ts');
        const moduleVar = createModuleIdentity(sourcePath, workDir).moduleVarName;
        writeCachedLibBlob(workDir, 'generated', createFooBlobCode(moduleVar, 'generated'));
        writeCachedLibBlob(workDir, 'minified', 'const ????');
      },
    },
    (result) => {
    t.falsy(result.error);
    t.true(result.stderr.some((line) => line.includes('failed to parse cached lib module')));
    t.true(result.stderr.some((line) => line.includes('cache=\"minified\"')));

    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__LIB_CACHE_VALUE__, 'generated');
    },
  );
});

test('compat normal mode ignores minified and generated lib caches', t => {
  withTransformedFixture(
    {
      fixture: 'compat/lib-cache',
      pipeline: 'compat',
      enableAliases: true,
      setup(workDir) {
        const sourcePath = path.join(workDir, 'libs', 'Foo.ts');
        const moduleVar = createModuleIdentity(sourcePath, workDir).moduleVarName;
        writeCachedLibBlob(workDir, 'generated', createFooBlobCode(moduleVar, 'generated'));
        writeCachedLibBlob(workDir, 'minified', createFooBlobCode(moduleVar, 'minified'));
      },
    },
    (result) => {
    t.falsy(result.error);
    const context: Record<string, unknown> = {globalThis: {}};
    const runtime = executeCode(result.code, context);
    t.falsy(runtime);
    t.is((context.globalThis as Record<string, unknown>).__LIB_CACHE_VALUE__, 'source');
    },
  );
});
