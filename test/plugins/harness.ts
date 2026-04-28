import {
  executeCode,
  getImportSources,
  hasAnyExport,
  topLevelDeclarationNames,
} from './harness/ast-runtime';
import {prepareFixtureWorkspace} from './harness/workspace';
import {runTransform} from './harness/transform';

import type {
  AstNode,
  Pipeline,
  TransformFixtureOptions,
  TransformFixtureResult,
} from './harness/types';

const REPO_ROOT = process.cwd();

export type {
  AstNode,
  Pipeline,
  TransformFixtureOptions,
  TransformFixtureResult,
};

export function transformFixture(options: TransformFixtureOptions): TransformFixtureResult {
  const prepared = prepareFixtureWorkspace(
    REPO_ROOT,
    options.fixture,
    options.enableAliases !== false,
    options.setup,
  );

  const transformed = runTransform({
    repoRoot: REPO_ROOT,
    workDir: prepared.workDir,
    entry: options.entry ?? 'entry.ts',
    pipeline: options.pipeline,
    useProjectConfig: options.useProjectConfig,
    env: options.env,
  });

  return {
    code: transformed.code,
    ast: transformed.ast,
    sourceType: transformed.sourceType,
    stderr: transformed.stderr,
    error: transformed.error,
    workDir: prepared.workDir,
    cleanup: prepared.cleanup,
  };
}

export function withTransformedFixture<T>(
  options: TransformFixtureOptions,
  callback: (result: TransformFixtureResult) => T,
): T {
  const result = transformFixture(options);
  try {
    return callback(result);
  } finally {
    result.cleanup();
  }
}

export {
  executeCode,
  getImportSources,
  hasAnyExport,
  topLevelDeclarationNames,
};
