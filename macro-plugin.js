const fs = require('node:fs');
const nodePath = require('node:path');
const vm = require('node:vm');

const { transformFromAstSync, transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const { resolveExistingFile } = require('./compat-identity');

const TYPESCRIPT_PRESET_PATH = require.resolve('@babel/preset-typescript');
const ENV_PRESET_PATH = require.resolve('@babel/preset-env');
const PARSER_PLUGINS = ['typescript'];

const MAX_MACRO_DEPTH = 64;
const MAX_MACRO_CALLS = 2000;

const PREFIX_LEGACY = 'MACRO_';
const PREFIX_REMOVED_VALUE = 'VALUE_';
const PREFIX_REMOVED_EMIT = 'EMIT_';

const WRAPPER_IMPORT_SOURCE = '@lib/macro';
const WRAPPER_VALUE_EXPORT = 'VALUE';
const WRAPPER_EMIT_EXPORT = 'EMIT';

const LEGACY_LAST_DAY = '2026-12-31';
const LEGACY_REMOVAL_DATE = '2027-01-01';
const LEGACY_WARNING = `[macro-plugin] MACRO_* is deprecated; use VALUE(() => ...) from "${WRAPPER_IMPORT_SOURCE}" (removal after ${LEGACY_LAST_DAY}).`;
const PREFIX_REMOVED_MESSAGE = `Prefix macros VALUE_* and EMIT_* were removed. Import { VALUE, EMIT } from "${WRAPPER_IMPORT_SOURCE}" and use VALUE(() => ...) / EMIT(() => ...).`;
const STAGE2_SERIALIZER_SOURCE = `
function __devkit_stage2_serialize(value, knownBindings) {
  const seen = new Set();

  function serializeInner(current) {
    if (current === null || typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      return { kind: 'primitive', value: current };
    }

    if (typeof current === 'undefined') {
      return { kind: 'undefined' };
    }

    if (typeof current === 'bigint') {
      return { kind: 'bigint', value: String(current) };
    }

    if (typeof current === 'function') {
      if (knownBindings && typeof knownBindings === 'object') {
        for (const bindingName of Object.keys(knownBindings)) {
          if (knownBindings[bindingName] === current) {
            return { kind: 'binding_ref', name: bindingName };
          }
        }
      }

      const source = Function.prototype.toString.call(current);
      if (!source || source.includes('[native code]')) {
        throw new Error('Function value in VALUE(() => ...) is not source-backed.');
      }

      return { kind: 'function_source', source };
    }

    if (Array.isArray(current)) {
      if (seen.has(current)) {
        throw new Error('Cyclic array in VALUE(() => ...) cannot be serialized.');
      }

      seen.add(current);
      const items = current.map((item) => serializeInner(item));
      seen.delete(current);
      return { kind: 'array', items };
    }

    if (typeof current === 'object') {
      if (seen.has(current)) {
        throw new Error('Cyclic object in VALUE(() => ...) cannot be serialized.');
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        const constructorName = current && current.constructor && current.constructor.name
          ? current.constructor.name
          : 'unknown';
        throw new Error(
          'Unsupported object prototype in VALUE(() => ...); only plain objects are supported (received ' + constructorName + ').',
        );
      }

      seen.add(current);
      const entries = [];
      for (const key of Object.keys(current)) {
        entries.push({ key, value: serializeInner(current[key]) });
      }
      seen.delete(current);
      return { kind: 'object', entries };
    }

    throw new Error('Unsupported value type "' + typeof current + '" in VALUE(() => ...).');
  }

  return serializeInner(value);
}
`;

function toErrorMessage(error) {
  if (error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function formatCallStack(stack, nextName) {
  const names = nextName ? stack.concat(nextName) : stack.slice();
  return names.length > 0 ? names.join(' -> ') : '(root)';
}

function isLegacyMacroName(name) {
  return typeof name === 'string' && name.startsWith(PREFIX_LEGACY);
}

function isRemovedPrefixMacroName(name) {
  return typeof name === 'string'
    && (name.startsWith(PREFIX_REMOVED_VALUE) || name.startsWith(PREFIX_REMOVED_EMIT));
}

function getTodayDate() {
  const forcedDate = process.env.DEVKIT_MACRO_DATE;
  if (typeof forcedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(forcedDate)) {
    return forcedDate;
  }

  return new Date().toISOString().slice(0, 10);
}

function isLegacyEnabled() {
  return getTodayDate() < LEGACY_REMOVAL_DATE;
}

function isModuleSyntaxNode(node) {
  return node
    && (node.type === 'ImportDeclaration'
      || node.type === 'ExportNamedDeclaration'
      || node.type === 'ExportDefaultDeclaration'
      || node.type === 'ExportAllDeclaration');
}

function isIdentifierName(value) {
  return /^[$A-Z_a-z][$\w]*$/.test(value);
}

function isPathInside(childPath, parentPath) {
  const child = nodePath.resolve(childPath);
  const parent = nodePath.resolve(parentPath);
  if (child === parent) {
    return true;
  }

  const relative = nodePath.relative(parent, child);
  return relative.length > 0 && !relative.startsWith('..') && !nodePath.isAbsolute(relative);
}

function tryResolveExistingFile(basePath) {
  return resolveExistingFile(basePath);
}

function findNearestWithChild(startFile, childDirName) {
  let current = nodePath.dirname(startFile);
  while (true) {
    const candidate = nodePath.join(current, childDirName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return current;
    }

    const parent = nodePath.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
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
      for (const element of pattern.elements) {
        collectPatternNames(element, output);
      }
      break;
    case 'ObjectPattern':
      for (const property of pattern.properties) {
        if (!property) {
          continue;
        }

        if (property.type === 'ObjectProperty') {
          collectPatternNames(property.value, output);
        } else if (property.type === 'RestElement') {
          collectPatternNames(property.argument, output);
        }
      }
      break;
    default:
      break;
  }
}

function collectTopLevelBindingNamesFromDeclaration(declaration, output) {
  if (!declaration) {
    return;
  }

  if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
      && declaration.id
      && declaration.id.name) {
    output.push(declaration.id.name);
    return;
  }

  if (declaration.type === 'VariableDeclaration') {
    for (const declarator of declaration.declarations) {
      collectPatternNames(declarator.id, output);
    }
  }
}

function parseFunctionSourceToExpressionNode(source, parseSource) {
  if (!source || source.includes('[native code]')) {
    throw new Error(`Function value in ${parseSource} is not source-backed.`);
  }

  let parsed;
  try {
    parsed = parse(`(${source})`, {
      sourceType: 'script',
      plugins: PARSER_PLUGINS,
    });
  } catch (error) {
    throw new Error(`Function source in ${parseSource} is not parseable: ${toErrorMessage(error)}`);
  }

  const body = parsed.program.body;
  if (!Array.isArray(body) || body.length !== 1 || body[0].type !== 'ExpressionStatement') {
    throw new Error(`Function source in ${parseSource} did not parse as expression.`);
  }

  return body[0].expression;
}

function createBuildCodeFrameError(path, message) {
  if (path && typeof path.buildCodeFrameError === 'function') {
    return path.buildCodeFrameError(message);
  }

  const error = new Error(message);
  error.code = 'BABEL_TRANSFORM_ERROR';
  return error;
}

module.exports = function ({ types: t }) {
  let legacyDefinitions = new Map();
  let runtimeInitialized = false;
  let runtimeContext = null;
  let runtimeImplementations = new Map();
  let macroCallCount = 0;
  let macroStack = [];
  let runtimeFilename = 'macro-runtime.ts';
  let legacyWarningIssued = false;
  let legacyModeEnabled = true;

  let programPathRef = null;
  let entryFilename = null;
  let entryRootDir = null;
  let allowedRoots = [];
  let moduleCache = new Map();
  let wrapperBindingNames = new Set();

  function warnLegacyOnce() {
    if (legacyWarningIssued) {
      return;
    }
    console.error(LEGACY_WARNING);
    legacyWarningIssued = true;
  }

  function removedPrefixError(name) {
    return `${PREFIX_REMOVED_MESSAGE} Found: ${name}`;
  }

  function legacyRemovalError(name) {
    return `MACRO_* was removed after ${LEGACY_LAST_DAY}; use VALUE(() => ...) from "${WRAPPER_IMPORT_SOURCE}". Found: ${name}`;
  }

  function getLegacyDefinition(name) {
    return legacyDefinitions.get(name) || null;
  }

  function assertLegacyAllowedOrThrow(path, name) {
    if (legacyModeEnabled) {
      warnLegacyOnce();
      return;
    }

    throw createBuildCodeFrameError(path, `Error executing compile-time function: ${legacyRemovalError(name)}`);
  }

  function assertRemovedPrefixNotUsed(path, name) {
    if (isRemovedPrefixMacroName(name)) {
      throw createBuildCodeFrameError(path, `Error executing compile-time function: ${removedPrefixError(name)}`);
    }
  }

  function collectTopLevelLegacyMacros(programPath) {
    legacyDefinitions = new Map();
    const bodyPaths = programPath.get('body');

    for (const bodyPath of bodyPaths) {
      if (bodyPath.isFunctionDeclaration()) {
        const declaration = bodyPath.node;
        const functionName = declaration.id && declaration.id.name;

        if (isRemovedPrefixMacroName(functionName)) {
          throw createBuildCodeFrameError(bodyPath, `Error executing compile-time function: ${removedPrefixError(functionName)}`);
        }

        if (!isLegacyMacroName(functionName)) {
          continue;
        }

        assertLegacyAllowedOrThrow(bodyPath, functionName);

        legacyDefinitions.set(functionName, {
          name: functionName,
          node: t.cloneNode(declaration, true),
        });
      }

      if (bodyPath.isClassDeclaration()) {
        const className = bodyPath.node.id && bodyPath.node.id.name;
        if (isRemovedPrefixMacroName(className)) {
          throw createBuildCodeFrameError(bodyPath, `Error executing compile-time function: ${removedPrefixError(className)}`);
        }
      }
    }
  }

  function executeLegacyMacro(name, args) {
    const definition = getLegacyDefinition(name);
    if (!definition) {
      throw new Error(`Unknown macro target: ${name}`);
    }

    if (!legacyModeEnabled) {
      throw new Error(legacyRemovalError(name));
    }
    warnLegacyOnce();

    if (macroStack.length >= MAX_MACRO_DEPTH) {
      throw new Error(
        `Macro recursion depth limit exceeded (${MAX_MACRO_DEPTH}). Stack: ${formatCallStack(macroStack, name)}`,
      );
    }
    if (macroCallCount >= MAX_MACRO_CALLS) {
      throw new Error(
        `Macro invocation limit exceeded (${MAX_MACRO_CALLS}). Stack: ${formatCallStack(macroStack, name)}`,
      );
    }

    macroCallCount += 1;
    macroStack.push(name);
    try {
      const implementation = runtimeImplementations.get(name);
      if (typeof implementation !== 'function') {
        throw new Error(`Macro runtime implementation missing for ${name}`);
      }
      return implementation.apply(runtimeContext, args);
    } finally {
      macroStack.pop();
    }
  }

  function initializeLegacyRuntime(path) {
    if (runtimeInitialized || legacyDefinitions.size === 0) {
      return;
    }

    const runtimeAst = t.file(t.program(
      Array.from(legacyDefinitions.values()).map((definition) => t.cloneNode(definition.node, true)),
      [],
      'script',
    ));

    let runtimeCode = '';
    try {
      const transformed = transformFromAstSync(runtimeAst, undefined, {
        babelrc: false,
        configFile: false,
        sourceType: 'script',
        filename: runtimeFilename,
        presets: [TYPESCRIPT_PRESET_PATH],
      });
      runtimeCode = transformed && transformed.code ? transformed.code : '';
    } catch (error) {
      throw createBuildCodeFrameError(path, `Error preparing macro runtime: ${toErrorMessage(error)}`);
    }

    const contextObject = Object.create(null);
    runtimeContext = vm.createContext(contextObject);

    try {
      vm.runInContext(runtimeCode, runtimeContext, {
        timeout: 1000,
        filename: runtimeFilename,
      });
    } catch (error) {
      throw createBuildCodeFrameError(path, `Error preparing macro runtime: ${toErrorMessage(error)}`);
    }

    runtimeImplementations = new Map();
    for (const [name] of legacyDefinitions.entries()) {
      const implementation = runtimeContext[name];
      if (typeof implementation !== 'function') {
        throw createBuildCodeFrameError(path, `Error preparing macro runtime: macro "${name}" is not executable.`);
      }
      runtimeImplementations.set(name, implementation);
    }

    runtimeContext.__devkitInvokeMacro = (name, args) => executeLegacyMacro(name, args);
    for (const [name] of legacyDefinitions.entries()) {
      runtimeContext[name] = (...args) => runtimeContext.__devkitInvokeMacro(name, args);
    }

    runtimeInitialized = true;
  }

  function evaluateLegacyExpression(exprPath) {
    if (exprPath.isCallExpression()) {
      const calleePath = exprPath.get('callee');
      if (calleePath.isIdentifier() && isLegacyMacroName(calleePath.node.name)) {
        return evaluateLegacyCallAsValue(exprPath);
      }

      if (calleePath.isIdentifier() && isRemovedPrefixMacroName(calleePath.node.name)) {
        throw new Error(removedPrefixError(calleePath.node.name));
      }
    }

    const evaluated = exprPath.evaluate();
    if (!evaluated.confident) {
      const source = typeof exprPath.getSource === 'function' ? exprPath.getSource() : '';
      const detail = source && source.length > 0 ? source : exprPath.node.type;
      throw new Error(`Macro argument is not statically resolvable: ${detail}`);
    }
    return evaluated.value;
  }

  function resolveLegacyCallArguments(callPath, macroName) {
    const args = [];

    for (const argPath of callPath.get('arguments')) {
      if (argPath.isSpreadElement()) {
        const spreadValue = evaluateLegacyExpression(argPath.get('argument'));
        if (!Array.isArray(spreadValue)) {
          throw new Error(`Spread argument for macro "${macroName}" must resolve to an array.`);
        }
        args.push(...spreadValue);
        continue;
      }

      args.push(evaluateLegacyExpression(argPath));
    }

    return args;
  }

  function evaluateLegacyCallAsValue(callPath) {
    const calleePath = callPath.get('callee');
    if (!calleePath.isIdentifier()) {
      throw new Error('Expected a macro call with identifier callee.');
    }

    const macroName = calleePath.node.name;
    const definition = getLegacyDefinition(macroName);
    if (!definition) {
      throw new Error(`Unknown macro target: ${macroName}`);
    }

    const args = resolveLegacyCallArguments(callPath, macroName);
    return executeLegacyMacro(macroName, args);
  }

  function resolveWrapperMode(callPath) {
    const calleePath = callPath.get('callee');
    if (!calleePath.isIdentifier()) {
      return null;
    }

    const binding = callPath.scope.getBinding(calleePath.node.name);
    if (!binding || !binding.path || !binding.path.isImportSpecifier()) {
      return null;
    }

    const importSpecifier = binding.path;
    const importDeclaration = importSpecifier.parentPath;
    if (!importDeclaration || !importDeclaration.isImportDeclaration()) {
      return null;
    }

    const source = importDeclaration.node.source && importDeclaration.node.source.value;
    if (source !== WRAPPER_IMPORT_SOURCE) {
      return null;
    }

    const imported = importSpecifier.node.imported;
    if (!imported || imported.type !== 'Identifier') {
      return null;
    }

    if (imported.name === WRAPPER_VALUE_EXPORT) {
      return WRAPPER_VALUE_EXPORT;
    }
    if (imported.name === WRAPPER_EMIT_EXPORT) {
      return WRAPPER_EMIT_EXPORT;
    }

    return null;
  }

  function containsWrapperOrRemovedPrefixCall(node) {
    let found = false;

    function visit(current) {
      if (!current || found) {
        return;
      }

      if (Array.isArray(current)) {
        for (const item of current) {
          visit(item);
          if (found) {
            return;
          }
        }
        return;
      }

      if (typeof current !== 'object') {
        return;
      }

      if (current.type === 'CallExpression' && current.callee && current.callee.type === 'Identifier') {
        const callName = current.callee.name;
        if (wrapperBindingNames.has(callName)
          || isRemovedPrefixMacroName(callName)) {
          found = true;
          return;
        }
      }

      for (const key of Object.keys(current)) {
        if (key === 'loc' || key === 'start' || key === 'end') {
          continue;
        }
        visit(current[key]);
        if (found) {
          return;
        }
      }
    }

    visit(node);
    return found;
  }

  function resolveImportForCompile(specifier, fromFile) {
    const cwd = process.cwd();
    const fromDir = nodePath.dirname(fromFile);
    const allowedRootCandidates = [
      nodePath.join(cwd, 'src'),
      nodePath.join(cwd, 'test'),
      entryRootDir,
      entryRootDir ? nodePath.join(entryRootDir, 'src') : null,
      entryRootDir ? nodePath.join(entryRootDir, 'test') : null,
      nodePath.dirname(fromFile),
    ].filter(Boolean).map((item) => nodePath.resolve(item));

    let resolved = null;

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      resolved = tryResolveExistingFile(nodePath.resolve(fromDir, specifier));
    } else if (specifier.startsWith('@lib/')) {
      const rest = specifier.slice('@lib/'.length);
      const baseCandidates = [];

      const nearestRoot = findNearestWithChild(fromFile, 'libs');
      if (nearestRoot) {
        baseCandidates.push(nodePath.join(nearestRoot, 'libs', rest));
      }
      baseCandidates.push(nodePath.join(cwd, 'src', 'libs', rest));
      if (entryRootDir) {
        baseCandidates.push(nodePath.join(entryRootDir, 'libs', rest));
      }

      for (const base of baseCandidates) {
        resolved = tryResolveExistingFile(base);
        if (resolved) {
          break;
        }
      }
    } else if (specifier.startsWith('@api/')) {
      const rest = specifier.slice('@api/'.length);
      const baseCandidates = [];

      const nearestRoot = findNearestWithChild(fromFile, 'api');
      if (nearestRoot) {
        baseCandidates.push(nodePath.join(nearestRoot, 'api', rest));
      }
      baseCandidates.push(nodePath.join(cwd, 'src', 'api', rest));
      if (entryRootDir) {
        baseCandidates.push(nodePath.join(entryRootDir, 'api', rest));
      }

      for (const base of baseCandidates) {
        resolved = tryResolveExistingFile(base);
        if (resolved) {
          break;
        }
      }
    } else if (specifier.startsWith('src/') || specifier.startsWith('test/')) {
      resolved = tryResolveExistingFile(nodePath.join(cwd, specifier));
    } else {
      throw new Error(`Disallowed import "${specifier}" during compile evaluation (project-local imports only).`);
    }

    if (!resolved) {
      throw new Error(`Unable to resolve compile-time import "${specifier}" from ${fromFile}.`);
    }

    const isAllowed = allowedRootCandidates.some((root) => isPathInside(resolved, root));
    if (!isAllowed) {
      throw new Error(`Resolved import "${specifier}" to "${resolved}" outside allowed project-local roots.`);
    }

    return resolved;
  }

  function loadProjectModuleForCompile(absolutePath) {
    const cached = moduleCache.get(absolutePath);
    if (cached) {
      return cached.exports;
    }

    const moduleRecord = {
      exports: {},
      loading: true,
    };
    moduleCache.set(absolutePath, moduleRecord);

    const source = fs.readFileSync(absolutePath, 'utf8');
    const transformed = transformSync(source, {
      filename: absolutePath,
      sourceType: 'module',
      babelrc: false,
      configFile: false,
      presets: [
        [ENV_PRESET_PATH, {
          targets: {node: 'current'},
          modules: 'commonjs',
        }],
        TYPESCRIPT_PRESET_PATH,
      ],
    });

    const code = transformed && transformed.code ? transformed.code : '';
    const moduleObject = {exports: moduleRecord.exports};

    const localRequire = (specifier) => {
      const resolved = resolveImportForCompile(specifier, absolutePath);
      return loadProjectModuleForCompile(resolved);
    };

    const context = vm.createContext({
      console,
      require: localRequire,
      module: moduleObject,
      exports: moduleObject.exports,
      __filename: absolutePath,
      __dirname: nodePath.dirname(absolutePath),
    });
    context.globalThis = context;

    try {
      vm.runInContext(code, context, {
        timeout: 1000,
        filename: absolutePath,
      });
    } catch (error) {
      throw new Error(`Failed compile-time module execution for ${absolutePath}: ${toErrorMessage(error)}`);
    }

    moduleRecord.exports = moduleObject.exports;
    moduleRecord.loading = false;
    return moduleRecord.exports;
  }

  function evaluateWrapperThunk(callPath, thunkNode) {
    if (!programPathRef) {
      throw new Error('Macro program context unavailable for wrapper evaluation.');
    }

    const knownBindingNames = new Set();
    const evalNodes = [];
    const body = programPathRef.node.body || [];

    let serializerAst;
    try {
      serializerAst = parse(STAGE2_SERIALIZER_SOURCE, {
        sourceType: 'script',
        plugins: PARSER_PLUGINS,
      });
    } catch (error) {
      throw new Error(`Failed to prepare VALUE serializer: ${toErrorMessage(error)}`);
    }

    for (const node of body) {
      if (!node) {
        continue;
      }

      if (node.type === 'ImportDeclaration') {
        if (node.source && node.source.value === WRAPPER_IMPORT_SOURCE) {
          continue;
        }

        if (node.importKind === 'type') {
          continue;
        }

        evalNodes.push(t.cloneNode(node, true));
        for (const specifier of node.specifiers || []) {
          if (specifier.importKind === 'type') {
            continue;
          }
          if (specifier.local && specifier.local.name) {
            knownBindingNames.add(specifier.local.name);
          }
        }
        continue;
      }

      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
        if (node.id && node.id.name && !isRemovedPrefixMacroName(node.id.name)) {
          evalNodes.push(t.cloneNode(node, true));
          knownBindingNames.add(node.id.name);
        }
        continue;
      }

      if (node.type === 'VariableDeclaration') {
        const keptDeclarators = [];
        for (const declarator of node.declarations || []) {
          if (containsWrapperOrRemovedPrefixCall(declarator.init)) {
            continue;
          }
          keptDeclarators.push(t.cloneNode(declarator, true));
          const names = [];
          collectPatternNames(declarator.id, names);
          for (const name of names) {
            knownBindingNames.add(name);
          }
        }

        if (keptDeclarators.length > 0) {
          evalNodes.push(t.variableDeclaration(node.kind, keptDeclarators));
        }
        continue;
      }

      if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        const declaration = node.declaration;
        if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
          if (declaration.id && declaration.id.name && !isRemovedPrefixMacroName(declaration.id.name)) {
            evalNodes.push(t.cloneNode(declaration, true));
            knownBindingNames.add(declaration.id.name);
          }
          continue;
        }

        if (declaration.type === 'VariableDeclaration') {
          const keptDeclarators = [];
          for (const declarator of declaration.declarations || []) {
            if (containsWrapperOrRemovedPrefixCall(declarator.init)) {
              continue;
            }
            keptDeclarators.push(t.cloneNode(declarator, true));
            const names = [];
            collectPatternNames(declarator.id, names);
            for (const name of names) {
              knownBindingNames.add(name);
            }
          }

          if (keptDeclarators.length > 0) {
            evalNodes.push(t.variableDeclaration(declaration.kind, keptDeclarators));
          }
        }
      }
    }

    for (const serializerNode of serializerAst.program.body || []) {
      evalNodes.push(t.cloneNode(serializerNode, true));
    }

    const thunkIdentifier = t.identifier('__devkit_stage2_thunk');
    const resultIdentifier = t.identifier('__devkit_stage2_result');
    const knownBindingsIdentifier = t.identifier('__devkit_stage2_known_bindings');

    evalNodes.push(t.variableDeclaration('const', [
      t.variableDeclarator(thunkIdentifier, t.cloneNode(thunkNode, true)),
    ]));
    evalNodes.push(t.variableDeclaration('const', [
      t.variableDeclarator(resultIdentifier, t.callExpression(thunkIdentifier, [])),
    ]));

    const knownProperties = Array.from(knownBindingNames)
      .filter((name) => isIdentifierName(name))
      .map((name) => t.objectProperty(
        t.identifier(name),
        t.conditionalExpression(
          t.binaryExpression(
            '===',
            t.unaryExpression('typeof', t.identifier(name), true),
            t.stringLiteral('undefined'),
          ),
          t.identifier('undefined'),
          t.identifier(name),
        ),
      ));

    evalNodes.push(t.expressionStatement(t.assignmentExpression(
      '=',
      t.memberExpression(t.identifier('globalThis'), t.identifier('__devkit_stage2_result')),
      resultIdentifier,
    )));

    evalNodes.push(t.variableDeclaration('const', [
      t.variableDeclarator(
        knownBindingsIdentifier,
        t.objectExpression(knownProperties),
      ),
    ]));

    evalNodes.push(t.expressionStatement(t.assignmentExpression(
      '=',
      t.memberExpression(t.identifier('globalThis'), t.identifier('__devkit_stage2_serialized_result')),
      t.callExpression(
        t.identifier('__devkit_stage2_serialize'),
        [resultIdentifier, knownBindingsIdentifier],
      ),
    )));

    const evalAst = t.file(t.program(evalNodes, [], 'module'));

    let evalCode = '';
    try {
      const transformed = transformFromAstSync(evalAst, undefined, {
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        filename: `${entryFilename}.stage2-eval.ts`,
        presets: [
          [ENV_PRESET_PATH, {
            targets: {node: 'current'},
            modules: 'commonjs',
          }],
          TYPESCRIPT_PRESET_PATH,
        ],
      });
      evalCode = transformed && transformed.code ? transformed.code : '';
    } catch (error) {
      throw new Error(`Failed to prepare compile evaluation code: ${toErrorMessage(error)}`);
    }

    const localRequire = (specifier) => {
      const resolved = resolveImportForCompile(specifier, entryFilename);
      return loadProjectModuleForCompile(resolved);
    };

    const context = vm.createContext({
      console,
      require: localRequire,
      module: {exports: {}},
      exports: {},
      __filename: entryFilename,
      __dirname: nodePath.dirname(entryFilename),
      __devkit_stage2_result: undefined,
      __devkit_stage2_serialized_result: undefined,
    });
    context.globalThis = context;

    try {
      vm.runInContext(evalCode, context, {
        timeout: 1000,
        filename: `${entryFilename}.stage2-eval.js`,
      });
    } catch (error) {
      throw new Error(`Failed wrapper thunk evaluation: ${toErrorMessage(error)}`);
    }

    return {
      result: context.__devkit_stage2_result,
      serializedResult: context.__devkit_stage2_serialized_result,
    };
  }

  function serializedValueToAstNode(payload, parseSource, visited) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`Invalid serialized payload in ${parseSource}.`);
    }

    if (visited.has(payload)) {
      throw new Error(`Invalid cyclic serialized payload in ${parseSource}.`);
    }

    const kind = payload.kind;
    switch (kind) {
      case 'primitive':
        return t.valueToNode(payload.value);
      case 'undefined':
        return t.identifier('undefined');
      case 'bigint':
        if (typeof payload.value !== 'string') {
          throw new Error(`Invalid bigint payload in ${parseSource}.`);
        }
        return t.bigIntLiteral(payload.value);
      case 'binding_ref':
        if (typeof payload.name !== 'string' || !isIdentifierName(payload.name)) {
          throw new Error(`Invalid binding_ref payload in ${parseSource}.`);
        }
        return t.identifier(payload.name);
      case 'function_source': {
        if (typeof payload.source !== 'string') {
          throw new Error(`Invalid function_source payload in ${parseSource}.`);
        }
        const fnExpression = parseFunctionSourceToExpressionNode(payload.source, parseSource);
        return t.cloneNode(fnExpression, true);
      }
      case 'array': {
        if (!Array.isArray(payload.items)) {
          throw new Error(`Invalid array payload in ${parseSource}.`);
        }

        visited.add(payload);
        const elements = payload.items.map((item) => serializedValueToAstNode(item, parseSource, visited));
        visited.delete(payload);
        return t.arrayExpression(elements);
      }
      case 'object': {
        if (!Array.isArray(payload.entries)) {
          throw new Error(`Invalid object payload in ${parseSource}.`);
        }

        visited.add(payload);
        const properties = [];
        for (const entry of payload.entries) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Invalid object entry payload in ${parseSource}.`);
          }
          if (typeof entry.key !== 'string') {
            throw new Error(`Invalid object key payload in ${parseSource}.`);
          }
          const keyNode = isIdentifierName(entry.key) ? t.identifier(entry.key) : t.stringLiteral(entry.key);
          const valueNode = serializedValueToAstNode(entry.value, parseSource, visited);
          properties.push(t.objectProperty(keyNode, valueNode, false, false));
        }
        visited.delete(payload);
        return t.objectExpression(properties);
      }
      default:
        throw new Error(`Unsupported serialized payload kind "${String(kind)}" in ${parseSource}.`);
    }
  }

  function normalizeEmitResult(result, sourceName) {
    if (typeof result === 'string') {
      return [result];
    }

    if (Array.isArray(result)) {
      for (let i = 0; i < result.length; i += 1) {
        if (typeof result[i] !== 'string') {
          throw new Error(`EMIT result from ${sourceName} has non-string item at index ${i}.`);
        }
      }
      return result;
    }

    throw new Error(`EMIT result from ${sourceName} must be string or string[]; received ${typeof result}.`);
  }

  function parseEmitSnippet(snippet, index, sourceName) {
    let parsed;
    try {
      parsed = parse(snippet, {
        sourceType: 'module',
        plugins: PARSER_PLUGINS,
      });
    } catch (error) {
      throw new Error(`EMIT snippet ${index} from ${sourceName} failed to parse: ${toErrorMessage(error)}`);
    }

    const body = parsed.program.body || [];
    for (const node of body) {
      if (isModuleSyntaxNode(node)) {
        throw new Error(`EMIT snippet ${index} from ${sourceName} contains forbidden module syntax (${node.type}).`);
      }
    }

    return body.map((node) => t.cloneNode(node, true));
  }

  function ensureEmitCallSite(callPath) {
    const statementPath = callPath.parentPath;
    if (!statementPath || !statementPath.isExpressionStatement()) {
      throw new Error('EMIT(() => ...) must be used as standalone expression statement.');
    }

    const ownerPath = statementPath.parentPath;
    if (!ownerPath || !(ownerPath.isProgram() || ownerPath.isBlockStatement() || ownerPath.isSwitchCase())) {
      throw new Error('EMIT(() => ...) is only supported in Program/BlockStatement/SwitchCase statement lists.');
    }

    return statementPath;
  }

  function validateWrapperThunk(callPath, wrapperName) {
    const argPaths = callPath.get('arguments');
    if (argPaths.length !== 1) {
      throw new Error(`${wrapperName} requires exactly one thunk argument.`);
    }

    const thunkPath = argPaths[0];
    if (!(thunkPath.isArrowFunctionExpression() || thunkPath.isFunctionExpression())) {
      throw new Error(`${wrapperName} argument must be a zero-argument function.`);
    }

    if ((thunkPath.node.params || []).length !== 0) {
      throw new Error(`${wrapperName} thunk must have zero parameters.`);
    }

    return thunkPath.node;
  }

  function expandWrapperEmit(callPath, thunkNode) {
    const statementPath = ensureEmitCallSite(callPath);
    const evaluated = evaluateWrapperThunk(callPath, thunkNode);
    const snippets = normalizeEmitResult(evaluated.result, 'EMIT(() => ...)');

    const emittedNodes = [];
    snippets.forEach((snippet, index) => {
      emittedNodes.push(...parseEmitSnippet(snippet, index, 'EMIT(() => ...)'));
    });

    if (emittedNodes.length === 0) {
      statementPath.remove();
      return;
    }

    statementPath.replaceWithMultiple(emittedNodes);
  }

  function replaceWrapperValue(callPath, thunkNode) {
    const evaluated = evaluateWrapperThunk(callPath, thunkNode);
    const valueNode = serializedValueToAstNode(
      evaluated.serializedResult,
      'VALUE(() => ...)',
      new Set(),
    );

    callPath.replaceWith(valueNode);
  }

  function isInsideLegacyMacroDefinition(callPath) {
    return Boolean(callPath.findParent((parentPath) => {
      if (!parentPath.isFunctionDeclaration()) {
        return false;
      }

      if (!parentPath.parentPath || !parentPath.parentPath.isProgram()) {
        return false;
      }

      const declaration = parentPath.node;
      return declaration.id && isLegacyMacroName(declaration.id.name);
    }));
  }

  function cleanupMacroImportDeclarations(programPath) {
    if (programPath && programPath.scope && typeof programPath.scope.crawl === 'function') {
      programPath.scope.crawl();
    }

    const bodyPaths = programPath.get('body');
    for (const bodyPath of bodyPaths) {
      if (!bodyPath.isImportDeclaration()) {
        continue;
      }

      const source = bodyPath.node.source && bodyPath.node.source.value;
      if (!Array.isArray(bodyPath.node.specifiers) || bodyPath.node.specifiers.length === 0) {
        continue;
      }

      const keptSpecifiers = [];
      for (const specifierPath of bodyPath.get('specifiers')) {
        if (specifierPath.isImportSpecifier() && source === WRAPPER_IMPORT_SOURCE) {
          const imported = specifierPath.node.imported;
          if (imported
            && imported.type === 'Identifier'
            && (imported.name === WRAPPER_VALUE_EXPORT || imported.name === WRAPPER_EMIT_EXPORT)) {
            continue;
          }
        }

        const local = specifierPath.node.local;
        const localName = local && local.name;
        if (!localName) {
          keptSpecifiers.push(specifierPath.node);
          continue;
        }

        const binding = bodyPath.scope.getBinding(localName);
        if (binding && binding.referencePaths.length > 0) {
          keptSpecifiers.push(specifierPath.node);
        }
      }

      if (keptSpecifiers.length === 0) {
        bodyPath.remove();
        continue;
      }

      bodyPath.node.specifiers = keptSpecifiers;
    }
  }

  return {
    pre(file) {
      legacyDefinitions = new Map();
      runtimeInitialized = false;
      runtimeContext = null;
      runtimeImplementations = new Map();
      macroCallCount = 0;
      macroStack = [];
      runtimeFilename = file && file.opts && typeof file.opts.filename === 'string'
        ? `${file.opts.filename}.macro-runtime.ts`
        : 'macro-runtime.ts';
      legacyWarningIssued = false;
      legacyModeEnabled = isLegacyEnabled();

      programPathRef = null;
      entryFilename = file && file.opts && typeof file.opts.filename === 'string'
        ? file.opts.filename
        : process.cwd();
      entryRootDir = findNearestWithChild(entryFilename, 'libs') || nodePath.dirname(entryFilename);

      allowedRoots = [
        nodePath.join(process.cwd(), 'src'),
        nodePath.join(process.cwd(), 'test'),
        entryRootDir,
        nodePath.join(entryRootDir, 'src'),
        nodePath.join(entryRootDir, 'test'),
        nodePath.dirname(entryFilename),
      ].map((item) => nodePath.resolve(item));

      moduleCache = new Map();
      wrapperBindingNames = new Set();
    },
    visitor: {
      Program: {
        enter(path) {
          programPathRef = path;
          collectTopLevelLegacyMacros(path);

          wrapperBindingNames = new Set();
          for (const bodyPath of path.get('body')) {
            if (!bodyPath.isImportDeclaration()) {
              continue;
            }

            const source = bodyPath.node.source && bodyPath.node.source.value;
            if (source !== WRAPPER_IMPORT_SOURCE) {
              continue;
            }

            for (const specifierPath of bodyPath.get('specifiers')) {
              if (!specifierPath.isImportSpecifier()) {
                continue;
              }

              const imported = specifierPath.node.imported;
              if (!imported || imported.type !== 'Identifier') {
                continue;
              }

              if (imported.name !== WRAPPER_VALUE_EXPORT && imported.name !== WRAPPER_EMIT_EXPORT) {
                continue;
              }

              const local = specifierPath.node.local;
              if (local && local.name) {
                wrapperBindingNames.add(local.name);
              }
            }
          }
        },
        exit(path) {
          cleanupMacroImportDeclarations(path);

          path.traverse({
            FunctionDeclaration(functionPath) {
              const declaration = functionPath.node;
              const functionName = declaration.id && declaration.id.name;
              if (isLegacyMacroName(functionName)) {
                functionPath.remove();
              }
            },
          });
        },
      },
      CallExpression(path) {
        const calleePath = path.get('callee');
        if (!calleePath.isIdentifier()) {
          return;
        }

        const callName = calleePath.node.name;

        assertRemovedPrefixNotUsed(path, callName);

        if (isInsideLegacyMacroDefinition(path)) {
          return;
        }

        const wrapperMode = resolveWrapperMode(path);
        if (wrapperMode) {
          try {
            const thunkNode = validateWrapperThunk(path, wrapperMode);

            if (wrapperMode === WRAPPER_VALUE_EXPORT) {
              replaceWrapperValue(path, thunkNode);
              return;
            }

            if (wrapperMode === WRAPPER_EMIT_EXPORT) {
              expandWrapperEmit(path, thunkNode);
              return;
            }
          } catch (error) {
            throw createBuildCodeFrameError(path, `Error executing compile-time function: ${toErrorMessage(error)}`);
          }
        }

        if (!isLegacyMacroName(callName)) {
          return;
        }

        assertLegacyAllowedOrThrow(path, callName);
        initializeLegacyRuntime(path);

        try {
          const result = evaluateLegacyCallAsValue(path);

          let replacementNode;
          try {
            replacementNode = t.valueToNode(result);
          } catch (error) {
            throw new Error(`Macro result is not serializable to AST literal: ${toErrorMessage(error)}`);
          }

          path.replaceWith(replacementNode);
        } catch (error) {
          throw createBuildCodeFrameError(path, `Error executing compile-time function: ${toErrorMessage(error)}`);
        }
      },
    },
  };
};
