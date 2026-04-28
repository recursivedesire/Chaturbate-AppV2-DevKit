const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');
const babelParser = require('@babel/parser');
const {
  sanitizeIdentifierFragment,
  createModuleIdentity,
  isLibModulePath,
  getLibRelativeJsPath,
  stripKnownExtension,
  toPosixPath,
  resolveExistingFile,
} = require('./compat-identity');

const DEVKIT_VERSION = require('./package.json').version;
const CACHE_ROOT = '.devkit/libs-cache';

function shouldStripImport(specifier) {
  return specifier.includes('@api/') || /shared(?:Code|_code)(\.js|\.ts)?$/.test(specifier);
}

function isInlineSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('@api/') || specifier.startsWith('@lib/');
}

function isImportDeclarationTypeOnly(node) {
  if (node.importKind === 'type') {
    return true;
  }

  if (!Array.isArray(node.specifiers) || node.specifiers.length === 0) {
    return false;
  }

  return node.specifiers.every((specifier) => specifier.importKind === 'type');
}

function getRuntimeImportSpecifiers(node, t) {
  if (!Array.isArray(node.specifiers)) {
    return [];
  }

  return node.specifiers.filter((specifier) => {
    if (specifier.importKind === 'type') {
      return false;
    }

    if (node.importKind === 'type') {
      return false;
    }

    return t.isImportSpecifier(specifier) || t.isImportDefaultSpecifier(specifier) || t.isImportNamespaceSpecifier(specifier);
  });
}

function collectPatternNames(pattern, output) {
  if (!pattern) {
    return;
  }

  switch (pattern.type) {
    case 'Identifier':
      output.push(pattern.name);
      break;
    case 'RestElement':
      collectPatternNames(pattern.argument, output);
      break;
    case 'AssignmentPattern':
      collectPatternNames(pattern.left, output);
      break;
    case 'ArrayPattern':
      pattern.elements.forEach((element) => collectPatternNames(element, output));
      break;
    case 'ObjectPattern':
      pattern.properties.forEach((property) => {
        if (!property) {
          return;
        }

        if (property.type === 'ObjectProperty') {
          collectPatternNames(property.value, output);
        } else if (property.type === 'RestElement') {
          collectPatternNames(property.argument, output);
        }
      });
      break;
    default:
      break;
  }
}

function shouldSkipRuntimeNode(node) {
  if (!node || typeof node.type !== 'string') {
    return false;
  }

  if (node.declare === true) {
    return true;
  }

  switch (node.type) {
    case 'TSDeclareFunction':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSModuleDeclaration':
    case 'TSImportEqualsDeclaration':
    case 'TSExportAssignment':
    case 'TSNamespaceExportDeclaration':
      return true;
    default:
      return false;
  }
}

function resolveInlineSpecifier(specifier, fromFile, entryRootDir) {
  let unresolvedBase = null;

  if (specifier.startsWith('@api/')) {
    unresolvedBase = nodePath.join(entryRootDir, 'api', specifier.slice('@api/'.length));
  } else if (specifier.startsWith('@lib/')) {
    unresolvedBase = nodePath.join(entryRootDir, 'libs', specifier.slice('@lib/'.length));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    unresolvedBase = nodePath.resolve(nodePath.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const absolutePath = resolveExistingFile(unresolvedBase);
  if (!absolutePath) {
    return null;
  }

  return {
    absolutePath,
  };
}

function shouldRenameIdentifier(parentNode, propertyKey) {
  if (!parentNode || typeof parentNode.type !== 'string') {
    return true;
  }

  if ((parentNode.type === 'ObjectProperty' || parentNode.type === 'ObjectMethod' || parentNode.type === 'ClassMethod' || parentNode.type === 'ClassProperty' || parentNode.type === 'ClassAccessorProperty' || parentNode.type === 'ClassPrivateProperty') && propertyKey === 'key' && parentNode.computed !== true) {
    return false;
  }

  if ((parentNode.type === 'MemberExpression' || parentNode.type === 'OptionalMemberExpression') && propertyKey === 'property' && parentNode.computed !== true) {
    return false;
  }

  if ((parentNode.type === 'BreakStatement' || parentNode.type === 'ContinueStatement' || parentNode.type === 'LabeledStatement') && propertyKey === 'label') {
    return false;
  }

  if (parentNode.type === 'ImportSpecifier' && propertyKey === 'imported') {
    return false;
  }

  if (parentNode.type === 'ExportSpecifier' && propertyKey === 'exported') {
    return false;
  }

  return true;
}

function renameIdentifiersInNode(node, renameMap, parentNode = null, propertyKey = null) {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => renameIdentifiersInNode(item, renameMap, parentNode, propertyKey));
    return;
  }

  if (typeof node !== 'object') {
    return;
  }

  if (node.type === 'Identifier' && shouldRenameIdentifier(parentNode, propertyKey)) {
    const replacement = renameMap.get(node.name);
    if (replacement) {
      node.name = replacement;
    }
    return;
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') {
      continue;
    }

    renameIdentifiersInNode(node[key], renameMap, node, key);
  }
}

function getExportedName(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type === 'StringLiteral') {
    return node.value;
  }

  return null;
}

function createCompatContext(path, state, t) {
  const entryFile = state.file && state.file.opts && state.file.opts.filename ? nodePath.resolve(state.file.opts.filename) : null;
  const entryRootDir = entryFile ? nodePath.dirname(entryFile) : process.cwd();
  const defaultCacheRoot = nodePath.join(process.cwd(), CACHE_ROOT);
  const entryCacheRoot = nodePath.join(entryRootDir, CACHE_ROOT);
  const cacheRoots = Array.from(new Set([defaultCacheRoot, entryCacheRoot]));

  const usedTopLevelNames = new Set(Object.keys(path.scope.bindings));

  return {
    t,
    state,
    entryFile,
    entryRootDir,
    usedTopLevelNames,
    moduleMap: new Map(),
    modulePreludeNodes: [],
    exportBindingMap: new Map(),
    exportBindingNodes: [],
    loggedErrors: new Set(),
    useMinLibs: process.env.DEVKIT_USE_MIN_LIBS === '1',
    cacheRoots,
  };
}

function logCompatError(context, message, details) {
  const detailText = Object.entries(details)
    .map(([key, value]) => `${key}="${String(value).replace(/"/g, '\\"')}"`)
    .join(' ');

  const finalMessage = `[devportal-compat-plugin] ${message} ${detailText}`.trim();
  if (context.loggedErrors.has(finalMessage)) {
    return;
  }

  context.loggedErrors.add(finalMessage);
  console.error(finalMessage);
}

function allocateGlobalName(baseName, context) {
  let candidate = baseName;
  let index = 1;

  while (context.usedTopLevelNames.has(candidate)) {
    candidate = `${baseName}__${index}`;
    index += 1;
  }

  context.usedTopLevelNames.add(candidate);
  return candidate;
}

function parseModuleInfo(absolutePath, context) {
  if (context.moduleMap.has(absolutePath)) {
    return context.moduleMap.get(absolutePath);
  }

  let source = '';
  try {
    source = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    logCompatError(context, 'failed to read module', {
      file: absolutePath,
      reason: error && error.message ? error.message : String(error),
    });
    return null;
  }

  let parsed = null;
  try {
    parsed = babelParser.parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods'],
    });
  } catch (error) {
    logCompatError(context, 'failed to parse module', {
      file: absolutePath,
      reason: error && error.message ? error.message : String(error),
    });
    return null;
  }

  const moduleIdentity = createModuleIdentity(absolutePath, context.entryRootDir);
  const moduleVarName = allocateGlobalName(moduleIdentity.moduleVarName, context);
  const libRelativeJsPath = getLibRelativeJsPath(absolutePath, context.entryRootDir);
  const libName = libRelativeJsPath ? nodePath.basename(libRelativeJsPath, '.js') : null;

  const info = {
    absolutePath,
    body: parsed.program.body,
    prefixBase: moduleIdentity.prefixBase,
    moduleVarName,
    libRelativeJsPath,
    libName,
    building: false,
    built: false,
  };

  context.moduleMap.set(absolutePath, info);
  return info;
}

function resolveCacheFilePath(context, moduleInfo, kind) {
  if (!moduleInfo.libRelativeJsPath) {
    return null;
  }

  for (const cacheRoot of context.cacheRoots) {
    const filePath = nodePath.join(cacheRoot, kind, moduleInfo.libRelativeJsPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return null;
}

function getCanonicalLibSourcePath(moduleInfo) {
  if (!moduleInfo.libRelativeJsPath) {
    return null;
  }

  return `src/libs/${stripKnownExtension(toPosixPath(moduleInfo.libRelativeJsPath))}.ts`;
}

function findModuleDeclarationInProgram(programBody, t) {
  for (const node of programBody) {
    if (!t.isVariableDeclaration(node)) {
      continue;
    }

    if (node.declarations.length !== 1) {
      continue;
    }

    const declaration = node.declarations[0];
    if (!t.isIdentifier(declaration.id)) {
      continue;
    }

    if (declaration.id.name.endsWith('__module')) {
      return {node, declaration};
    }

    if (!t.isCallExpression(declaration.init)) {
      continue;
    }

    const callee = declaration.init.callee;
    if (t.isArrowFunctionExpression(callee) || t.isFunctionExpression(callee)) {
      return {node, declaration};
    }
  }

  return null;
}

function readCachedModuleDeclaration(context, moduleInfo, kind) {
  const t = context.t;
  const cacheFilePath = resolveCacheFilePath(context, moduleInfo, kind);
  if (!cacheFilePath) {
    return null;
  }

  let rawBuffer = null;
  try {
    rawBuffer = fs.readFileSync(cacheFilePath);
  } catch (error) {
    logCompatError(context, 'failed to read cached lib module', {
      cache: kind,
      file: cacheFilePath,
      reason: error && error.message ? error.message : String(error),
    });
    return null;
  }

  let parsed = null;
  try {
    parsed = babelParser.parse(rawBuffer.toString('utf8'), {
      sourceType: 'script',
      plugins: ['typescript'],
    });
  } catch (error) {
    logCompatError(context, 'failed to parse cached lib module', {
      cache: kind,
      file: cacheFilePath,
      reason: error && error.message ? error.message : String(error),
    });
    return null;
  }

  const match = findModuleDeclarationInProgram(parsed.program.body, t);
  if (!match) {
    logCompatError(context, 'invalid cached lib module shape', {
      cache: kind,
      file: cacheFilePath,
      reason: 'missing-module-declaration',
    });
    return null;
  }

  const declarationNode = t.cloneNode(match.node, true);
  const firstDeclarator = declarationNode.declarations[0];
  if (t.isIdentifier(firstDeclarator.id) && firstDeclarator.id.name !== moduleInfo.moduleVarName) {
    firstDeclarator.id.name = moduleInfo.moduleVarName;
  }

  if (kind === 'minified') {
    const md5 = crypto.createHash('md5').update(rawBuffer).digest('hex');
    const displayName = moduleInfo.libName || 'Unknown';
    const sourcePath = getCanonicalLibSourcePath(moduleInfo) || 'src/libs/<unknown>.ts';
    declarationNode.leadingComments = [{
      type: 'CommentLine',
      value: ` Minified DevKit lib ${displayName} (v${DEVKIT_VERSION}, md5 ${md5}, source ${sourcePath})`,
    }];
  }

  return declarationNode;
}

function createExportsAssignmentStatement(t, exportsIdentifier, exportedName, valueExpression) {
  return t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(exportsIdentifier, t.stringLiteral(exportedName), true),
      valueExpression,
    ),
  );
}

function ensureModuleBuilt(absolutePath, context) {
  const t = context.t;
  const moduleInfo = parseModuleInfo(absolutePath, context);
  if (!moduleInfo) {
    return null;
  }

  if (moduleInfo.built) {
    return moduleInfo;
  }

  if (moduleInfo.building) {
    return moduleInfo;
  }

  moduleInfo.building = true;

  const isLibModule = isLibModulePath(moduleInfo.absolutePath, context.entryRootDir);
  if (context.useMinLibs && isLibModule) {
    const minifiedDeclaration = readCachedModuleDeclaration(context, moduleInfo, 'minified');
    if (minifiedDeclaration) {
      context.modulePreludeNodes.push(minifiedDeclaration);
      moduleInfo.built = true;
      moduleInfo.building = false;
      return moduleInfo;
    }

    const generatedDeclaration = readCachedModuleDeclaration(context, moduleInfo, 'generated');
    if (generatedDeclaration) {
      context.modulePreludeNodes.push(generatedDeclaration);
      moduleInfo.built = true;
      moduleInfo.building = false;
      return moduleInfo;
    }
  }

  const exportsIdentifier = t.identifier('__devkit_exports');
  const moduleStatements = [];
  const exportStatements = [];

  let depCounter = 0;
  let defaultCounter = 0;
  let exportAllCounter = 0;

  const macroRenameMap = new Map();
  for (const node of moduleInfo.body) {
    let declaration = null;

    if (node.type === 'FunctionDeclaration') {
      declaration = node;
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration && node.declaration.type === 'FunctionDeclaration') {
      declaration = node.declaration;
    }

    if (declaration && declaration.id && typeof declaration.id.name === 'string' && declaration.id.name.startsWith('MACRO_')) {
      macroRenameMap.set(declaration.id.name, `__devkit_macro_${sanitizeIdentifierFragment(declaration.id.name)}`);
    }
  }

  const ensureDependencyIdentifier = (specifier) => {
    const resolved = resolveInlineSpecifier(specifier, moduleInfo.absolutePath, context.entryRootDir);
    if (!resolved) {
      logCompatError(context, 'unresolved inline target', {
        from: moduleInfo.absolutePath,
        specifier,
        reason: 'not-found',
      });
      return null;
    }

    const dependencyInfo = ensureModuleBuilt(resolved.absolutePath, context);
    if (!dependencyInfo) {
      return null;
    }

    const depIdentifier = t.identifier(`__devkit_dep_${depCounter}`);
    depCounter += 1;

    moduleStatements.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(depIdentifier, t.identifier(dependencyInfo.moduleVarName)),
      ]),
    );

    return depIdentifier;
  };

  for (const originalNode of moduleInfo.body) {
    const node = t.cloneNode(originalNode, true);

    if (macroRenameMap.size > 0) {
      renameIdentifiersInNode(node, macroRenameMap);
    }

    if (node.type === 'ImportDeclaration') {
      if (shouldStripImport(node.source.value)) {
        continue;
      }

      if (isImportDeclarationTypeOnly(node)) {
        continue;
      }

      const runtimeSpecifiers = getRuntimeImportSpecifiers(node, t);
      if (!isInlineSpecifier(node.source.value)) {
        continue;
      }

      const dependencyIdentifier = ensureDependencyIdentifier(node.source.value);
      if (!dependencyIdentifier) {
        continue;
      }

      if (runtimeSpecifiers.length === 0) {
        continue;
      }

      for (const specifier of runtimeSpecifiers) {
        if (t.isImportNamespaceSpecifier(specifier)) {
          moduleStatements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(t.identifier(specifier.local.name), dependencyIdentifier),
            ]),
          );
          continue;
        }

        const importedName = t.isImportDefaultSpecifier(specifier)
          ? 'default'
          : getExportedName(specifier.imported);

        if (!importedName) {
          continue;
        }

        moduleStatements.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(specifier.local.name),
              t.memberExpression(dependencyIdentifier, t.stringLiteral(importedName), true),
            ),
          ]),
        );
      }

      continue;
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        if (node.exportKind === 'type') {
          continue;
        }

        if (shouldStripImport(node.source.value)) {
          continue;
        }

        if (!isInlineSpecifier(node.source.value)) {
          continue;
        }

        const dependencyIdentifier = ensureDependencyIdentifier(node.source.value);
        if (!dependencyIdentifier) {
          continue;
        }

        for (const specifier of node.specifiers || []) {
          if (!t.isExportSpecifier(specifier)) {
            continue;
          }

          if (specifier.exportKind === 'type') {
            continue;
          }

          const importedName = getExportedName(specifier.local);
          const exportedName = getExportedName(specifier.exported);

          if (!importedName || !exportedName) {
            continue;
          }

          exportStatements.push(
            createExportsAssignmentStatement(
              t,
              exportsIdentifier,
              exportedName,
              t.memberExpression(dependencyIdentifier, t.stringLiteral(importedName), true),
            ),
          );
        }

        continue;
      }

      if (node.declaration) {
        if (shouldSkipRuntimeNode(node.declaration)) {
          continue;
        }

        moduleStatements.push(node.declaration);

        if (t.isFunctionDeclaration(node.declaration) || t.isClassDeclaration(node.declaration)) {
          if (node.declaration.id && node.declaration.id.name) {
            exportStatements.push(
              createExportsAssignmentStatement(
                t,
                exportsIdentifier,
                node.declaration.id.name,
                t.identifier(node.declaration.id.name),
              ),
            );
          }
        } else if (t.isVariableDeclaration(node.declaration)) {
          const names = [];
          for (const declaration of node.declaration.declarations) {
            collectPatternNames(declaration.id, names);
          }

          for (const declaredName of names) {
            exportStatements.push(
              createExportsAssignmentStatement(
                t,
                exportsIdentifier,
                declaredName,
                t.identifier(declaredName),
              ),
            );
          }
        }

        continue;
      }

      for (const specifier of node.specifiers || []) {
        if (!t.isExportSpecifier(specifier)) {
          continue;
        }

        if (node.exportKind === 'type' || specifier.exportKind === 'type') {
          continue;
        }

        const localName = getExportedName(specifier.local);
        const exportedName = getExportedName(specifier.exported);

        if (!localName || !exportedName) {
          continue;
        }

        exportStatements.push(
          createExportsAssignmentStatement(
            t,
            exportsIdentifier,
            exportedName,
            t.identifier(localName),
          ),
        );
      }

      continue;
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration;

      if (t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) {
        if (declaration.id && declaration.id.name) {
          moduleStatements.push(declaration);
          exportStatements.push(
            createExportsAssignmentStatement(
              t,
              exportsIdentifier,
              'default',
              t.identifier(declaration.id.name),
            ),
          );
        } else {
          const defaultIdentifier = t.identifier(`__devkit_default_${defaultCounter}`);
          defaultCounter += 1;

          const expression = t.isFunctionDeclaration(declaration)
            ? t.functionExpression(null, declaration.params, declaration.body, declaration.generator, declaration.async)
            : t.classExpression(null, declaration.superClass, declaration.body, declaration.decorators || []);

          moduleStatements.push(
            t.variableDeclaration('const', [
              t.variableDeclarator(defaultIdentifier, expression),
            ]),
          );

          exportStatements.push(
            createExportsAssignmentStatement(
              t,
              exportsIdentifier,
              'default',
              defaultIdentifier,
            ),
          );
        }
      } else {
        const defaultIdentifier = t.identifier(`__devkit_default_${defaultCounter}`);
        defaultCounter += 1;

        moduleStatements.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(defaultIdentifier, declaration),
          ]),
        );

        exportStatements.push(
          createExportsAssignmentStatement(
            t,
            exportsIdentifier,
            'default',
            defaultIdentifier,
          ),
        );
      }

      continue;
    }

    if (node.type === 'ExportAllDeclaration') {
      if (shouldStripImport(node.source.value)) {
        continue;
      }

      if (!isInlineSpecifier(node.source.value)) {
        continue;
      }

      const dependencyIdentifier = ensureDependencyIdentifier(node.source.value);
      if (!dependencyIdentifier) {
        continue;
      }

      const keyIdentifier = t.identifier(`__devkit_export_key_${exportAllCounter}`);
      exportAllCounter += 1;

      exportStatements.push(
        t.forInStatement(
          t.variableDeclaration('const', [t.variableDeclarator(keyIdentifier)]),
          dependencyIdentifier,
          t.blockStatement([
            t.ifStatement(
              t.binaryExpression('===', keyIdentifier, t.stringLiteral('default')),
              t.continueStatement(),
            ),
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(exportsIdentifier, keyIdentifier, true),
                t.memberExpression(dependencyIdentifier, keyIdentifier, true),
              ),
            ),
          ]),
        ),
      );

      continue;
    }

    if (shouldSkipRuntimeNode(node)) {
      continue;
    }

    moduleStatements.push(node);
  }

  const factoryBody = [
    t.variableDeclaration('const', [
      t.variableDeclarator(exportsIdentifier, t.objectExpression([])),
    ]),
    ...moduleStatements,
    ...exportStatements,
    t.returnStatement(exportsIdentifier),
  ];

  const moduleDeclaration = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(moduleInfo.moduleVarName),
      t.callExpression(
        t.arrowFunctionExpression([], t.blockStatement(factoryBody)),
        [],
      ),
    ),
  ]);

  context.modulePreludeNodes.push(moduleDeclaration);

  moduleInfo.built = true;
  moduleInfo.building = false;
  return moduleInfo;
}

function ensureExportBinding(absolutePath, exportedName, context) {
  const key = `${absolutePath}::${exportedName}`;
  const existing = context.exportBindingMap.get(key);
  if (existing) {
    return existing;
  }

  const moduleInfo = ensureModuleBuilt(absolutePath, context);
  if (!moduleInfo) {
    return null;
  }

  const symbolNameFragment = sanitizeIdentifierFragment(exportedName === '*' ? 'namespace' : exportedName || 'default');
  const symbolName = allocateGlobalName(`${moduleInfo.prefixBase}__${symbolNameFragment}`, context);

  const declaration = context.t.variableDeclaration('const', [
    context.t.variableDeclarator(
      context.t.identifier(symbolName),
      context.t.memberExpression(
        context.t.identifier(moduleInfo.moduleVarName),
        context.t.stringLiteral(exportedName),
        true,
      ),
    ),
  ]);

  context.exportBindingMap.set(key, symbolName);
  context.exportBindingNodes.push(declaration);
  return symbolName;
}

module.exports = function (babel) {
  const {types: t} = babel;

  return {
    name: 'devportal-compat-plugin',
    visitor: {
      Program: {
        exit(path, state) {
          const context = createCompatContext(path, state, t);

          const importPaths = path.get('body').filter((childPath) => childPath.isImportDeclaration());

          for (const importPath of importPaths) {
            if (importPath.removed) {
              continue;
            }

            const importNode = importPath.node;
            const importSource = importNode.source.value;

            if (shouldStripImport(importSource)) {
              importPath.remove();
              continue;
            }

            if (!isInlineSpecifier(importSource)) {
              continue;
            }

            if (isImportDeclarationTypeOnly(importNode)) {
              importPath.remove();
              continue;
            }

            const resolved = resolveInlineSpecifier(importSource, context.entryFile || process.cwd(), context.entryRootDir);
            if (!resolved) {
              logCompatError(context, 'unresolved inline target', {
                from: context.entryFile || process.cwd(),
                specifier: importSource,
                reason: 'not-found',
              });
              importPath.remove();
              continue;
            }

            const runtimeSpecifiers = getRuntimeImportSpecifiers(importNode, t);
            const replacementNodes = [];

            ensureModuleBuilt(resolved.absolutePath, context);

            if (runtimeSpecifiers.length > 0) {
              for (const specifier of runtimeSpecifiers) {
                if (t.isImportNamespaceSpecifier(specifier)) {
                  const namespaceName = ensureExportBinding(resolved.absolutePath, '*', context);
                  if (!namespaceName) {
                    continue;
                  }

                  if (specifier.local.name !== namespaceName) {
                    replacementNodes.push(
                      t.variableDeclaration('const', [
                        t.variableDeclarator(
                          t.identifier(specifier.local.name),
                          t.identifier(namespaceName),
                        ),
                      ]),
                    );
                  }
                  continue;
                }

                const exportedName = t.isImportDefaultSpecifier(specifier)
                  ? 'default'
                  : getExportedName(specifier.imported);

                if (!exportedName) {
                  continue;
                }

                const generatedName = ensureExportBinding(resolved.absolutePath, exportedName, context);
                if (!generatedName) {
                  continue;
                }

                if (specifier.local.name !== generatedName) {
                  replacementNodes.push(
                    t.variableDeclaration('const', [
                      t.variableDeclarator(
                        t.identifier(specifier.local.name),
                        t.identifier(generatedName),
                      ),
                    ]),
                  );
                }
              }
            }

            if (replacementNodes.length > 0) {
              importPath.replaceWithMultiple(replacementNodes);
            } else {
              importPath.remove();
            }
          }

          const exportPaths = path.get('body').filter((childPath) =>
            childPath.isExportNamedDeclaration() || childPath.isExportDefaultDeclaration() || childPath.isExportAllDeclaration(),
          );

          for (const exportPath of exportPaths) {
            if (exportPath.removed) {
              continue;
            }

            const exportNode = exportPath.node;

            if (t.isExportNamedDeclaration(exportNode)) {
              if (exportNode.declaration) {
                exportPath.replaceWith(exportNode.declaration);
              } else {
                exportPath.remove();
              }
              continue;
            }

            if (t.isExportDefaultDeclaration(exportNode)) {
              if (t.isFunctionDeclaration(exportNode.declaration) || t.isClassDeclaration(exportNode.declaration)) {
                if (exportNode.declaration.id) {
                  exportPath.replaceWith(exportNode.declaration);
                } else {
                  exportPath.replaceWith(t.expressionStatement(exportNode.declaration));
                }
              } else {
                exportPath.replaceWith(t.expressionStatement(exportNode.declaration));
              }
              continue;
            }

            exportPath.remove();
          }

          const prelude = [...context.modulePreludeNodes, ...context.exportBindingNodes];
          if (prelude.length > 0) {
            path.unshiftContainer('body', prelude);
          }

          const hasModuleSyntax = path.node.body.some((node) =>
            t.isImportDeclaration(node) ||
            t.isExportNamedDeclaration(node) ||
            t.isExportDefaultDeclaration(node) ||
            t.isExportAllDeclaration(node),
          );

          if (!hasModuleSyntax) {
            path.node.sourceType = 'script';
          }
        },
      },
    },
  };
};
