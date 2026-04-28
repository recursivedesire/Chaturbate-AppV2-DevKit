import vm from 'node:vm';

import {parse} from '@babel/parser';

import type {AstNode} from './types';

export function parseCode(code: string): {ast: any; sourceType: string} {
  const moduleAst = parse(code, {
    sourceType: 'unambiguous',
    plugins: ['typescript'],
  });

  return {
    ast: moduleAst,
    sourceType: moduleAst.program.sourceType,
  };
}

export function getImportSources(ast: any): string[] {
  const sources: string[] = [];
  const body = ast.program.body as Array<{type: string; source?: {value?: string}}>;

  for (const node of body) {
    if (node.type === 'ImportDeclaration' && node.source?.value) {
      sources.push(node.source.value);
    }
  }

  return sources;
}

export function hasAnyExport(ast: any): boolean {
  const body = ast.program.body as AstNode[];
  return body.some((node) => node.type.startsWith('Export'));
}

export function topLevelDeclarationNames(ast: any): string[] {
  const names: string[] = [];
  const body = ast.program.body as AstNode[];

  for (const node of body) {
    if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.name) {
      names.push(node.id.name);
      continue;
    }

    if (node.type === 'VariableDeclaration' && Array.isArray(node.declarations)) {
      for (const declaration of node.declarations) {
        if (declaration.id?.name) {
          names.push(declaration.id.name);
        }
      }
    }
  }

  return names;
}

export function executeCode(code: string, context: Record<string, unknown> = {}): Error | undefined {
  try {
    vm.runInNewContext(code, context, {timeout: 1000});
    return undefined;
  } catch (error) {
    return error as Error;
  }
}
