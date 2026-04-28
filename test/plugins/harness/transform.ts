import fs from 'node:fs';
import path from 'node:path';

import {transformSync} from '@babel/core';

import {parseCode} from './ast-runtime';
import type {Pipeline} from './types';

function pluginPath(repoRoot: string, name: 'devportal-compat-plugin.js' | 'macro-plugin.js'): string {
  return path.join(repoRoot, name);
}

function pluginsForPipeline(repoRoot: string, pipeline: Pipeline): string[] {
  switch (pipeline) {
    case 'compat':
      return [pluginPath(repoRoot, 'devportal-compat-plugin.js')];
    case 'macro':
      return [pluginPath(repoRoot, 'macro-plugin.js')];
    case 'macro+compat':
      return [pluginPath(repoRoot, 'macro-plugin.js'), pluginPath(repoRoot, 'devportal-compat-plugin.js')];
    case 'compat+macro':
      return [pluginPath(repoRoot, 'devportal-compat-plugin.js'), pluginPath(repoRoot, 'macro-plugin.js')];
    default:
      return [pluginPath(repoRoot, 'devportal-compat-plugin.js')];
  }
}

export type TransformRunResult = {
  code: string;
  sourceType: string;
  ast: any;
  stderr: string[];
  error?: Error;
};

export function runTransform(options: {
  repoRoot: string;
  workDir: string;
  entry: string;
  pipeline: Pipeline;
  useProjectConfig?: boolean;
  env?: Record<string, string | undefined>;
}): TransformRunResult {
  const entryPath = path.join(options.workDir, options.entry);
  const stderr: string[] = [];

  const oldConsoleError = console.error;
  const envOverrides = options.env ?? {};
  const envPrevious = new Map<string, string | undefined>();
  for (const key of Object.keys(envOverrides)) {
    envPrevious.set(key, process.env[key]);
    const overrideValue = envOverrides[key];
    if (typeof overrideValue === 'undefined') {
      delete process.env[key];
    } else {
      process.env[key] = overrideValue;
    }
  }

  let code = '';
  let sourceType = 'script';
  let ast: any = parseCode('').ast;
  let error: Error | undefined;

  console.error = (...args: unknown[]) => {
    stderr.push(args.map(String).join(' '));
  };

  try {
    const source = fs.readFileSync(entryPath, 'utf8');

    const transformed = transformSync(source, options.useProjectConfig
      ? {
          filename: entryPath,
          sourceType: 'module',
          configFile: path.join(options.repoRoot, '.babelrc'),
          babelrc: false,
        }
      : {
          filename: entryPath,
          sourceType: 'module',
          babelrc: false,
          configFile: false,
          presets: [
            ['@babel/preset-env', {
              targets: {node: 'current'},
              modules: false,
              loose: true,
              exclude: [
                'transform-modules-commonjs',
                'transform-regenerator',
                'transform-async-to-generator',
                '@babel/plugin-transform-for-of',
              ],
            }],
            '@babel/preset-typescript',
          ],
          plugins: pluginsForPipeline(options.repoRoot, options.pipeline),
        });

    code = transformed?.code ?? '';
    const parsed = parseCode(code);
    ast = parsed.ast;
    sourceType = parsed.sourceType;
  } catch (err) {
    error = err as Error;
    const parsed = parseCode('');
    ast = parsed.ast;
    sourceType = parsed.sourceType;
  } finally {
    console.error = oldConsoleError;
    for (const [key, previousValue] of envPrevious.entries()) {
      if (typeof previousValue === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }

  return {
    code,
    sourceType,
    ast,
    stderr,
    error,
  };
}
