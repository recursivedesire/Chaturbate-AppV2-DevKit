#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');
const {parse} = require('@babel/parser');
const terser = require('terser');
const {createModuleIdentity, stripKnownExtension, toPosixPath} = require('../compat-identity');
const {version: DEVKIT_VERSION} = require('../package.json');

const REPO_ROOT = nodePath.resolve(__dirname, '..');
const SRC_ROOT = nodePath.join(REPO_ROOT, 'src');
const LIBS_SRC_ROOT = nodePath.join(SRC_ROOT, 'libs');
const DIST_LIBS_ROOT = nodePath.join(REPO_ROOT, 'dist', 'libs');
const CACHE_ROOT = nodePath.join(REPO_ROOT, '.devkit', 'libs-cache');
const GENERATED_CACHE_ROOT = nodePath.join(CACHE_ROOT, 'generated');
const MINIFIED_CACHE_ROOT = nodePath.join(CACHE_ROOT, 'minified');
const HASH_MANIFEST_PATH = nodePath.join(REPO_ROOT, 'DEVKIT_LIB_HASHES.md');

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, {recursive: true});
}

function clearDirectory(dirPath) {
  fs.rmSync(dirPath, {recursive: true, force: true});
  ensureDirectory(dirPath);
}

function listFilesRecursively(rootDir, extension) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) {
      continue;
    }

    const entries = fs.readdirSync(current, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = nodePath.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  files.sort();
  return files;
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

function collectRuntimeExports(sourcePath) {
  const sourceCode = fs.readFileSync(sourcePath, 'utf8');
  const ast = parse(sourceCode, {
    sourceType: 'module',
    plugins: ['typescript'],
  });

  const exportsList = [];
  const seen = new Set();
  const runtimeBindings = new Set();

  const addRuntimeBindingsFromDeclaration = (declaration) => {
    if (!declaration) {
      return;
    }

    if (declaration.type === 'ClassDeclaration' || declaration.type === 'FunctionDeclaration') {
      if (declaration.id && declaration.id.name) {
        runtimeBindings.add(declaration.id.name);
      }
      return;
    }

    if (declaration.type === 'VariableDeclaration') {
      const names = [];
      for (const item of declaration.declarations) {
        collectPatternNames(item.id, names);
      }

      for (const name of names) {
        runtimeBindings.add(name);
      }
      return;
    }

    if (declaration.type === 'TSEnumDeclaration' && declaration.id && declaration.id.name) {
      runtimeBindings.add(declaration.id.name);
    }
  };

  const pushExport = (exportedName, localName) => {
    const key = `${exportedName}::${localName}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    exportsList.push({exportedName, localName});
  };

  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      if (node.importKind === 'type') {
        continue;
      }

      for (const specifier of node.specifiers || []) {
        if (specifier.importKind === 'type') {
          continue;
        }

        if (specifier.local && specifier.local.name) {
          runtimeBindings.add(specifier.local.name);
        }
      }

      continue;
    }

    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      addRuntimeBindingsFromDeclaration(node.declaration);
      continue;
    }

    addRuntimeBindingsFromDeclaration(node);
  }

  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.exportKind === 'type') {
        continue;
      }

      if (node.source) {
        continue;
      }

      if (node.declaration) {
        const declaration = node.declaration;
        if (declaration.type === 'ClassDeclaration' || declaration.type === 'FunctionDeclaration') {
          if (declaration.id && declaration.id.name) {
            pushExport(declaration.id.name, declaration.id.name);
          }
          continue;
        }

        if (declaration.type === 'VariableDeclaration') {
          const names = [];
          for (const item of declaration.declarations) {
            collectPatternNames(item.id, names);
          }

          for (const name of names) {
            pushExport(name, name);
          }
        }

        continue;
      }

      for (const specifier of node.specifiers || []) {
        if (specifier.type !== 'ExportSpecifier') {
          continue;
        }

        if (specifier.exportKind === 'type') {
          continue;
        }

        const localName = getExportedName(specifier.local);
        const exportedName = getExportedName(specifier.exported);
        if (localName && exportedName && runtimeBindings.has(localName)) {
          pushExport(exportedName, localName);
        }
      }

      continue;
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration;
      if ((declaration.type === 'ClassDeclaration' || declaration.type === 'FunctionDeclaration') && declaration.id && declaration.id.name) {
        pushExport('default', declaration.id.name);
        continue;
      }

      throw new Error(`Unsupported anonymous default export in ${sourcePath}`);
    }

    if (node.type === 'ExportAllDeclaration') {
      continue;
    }
  }

  return exportsList;
}

function indentCode(code, spaces) {
  const prefix = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

function createModuleBlob(moduleVarName, runtimeCode, exportsList) {
  const lines = [];
  lines.push(`const ${moduleVarName} = (() => {`);
  lines.push('  const __devkit_exports = {};');

  const trimmedRuntime = runtimeCode.trim();
  if (trimmedRuntime.length > 0) {
    lines.push(indentCode(trimmedRuntime, 2));
  }

  for (const item of exportsList) {
    lines.push(`  __devkit_exports[${JSON.stringify(item.exportedName)}] = ${item.localName};`);
  }

  lines.push('  return __devkit_exports;');
  lines.push('})();');
  lines.push('');

  return lines.join('\n');
}

function toFsPath(posixRelativePath) {
  return posixRelativePath.split('/').join(nodePath.sep);
}

function libRelativeJsToSourcePath(relativeJsPath) {
  const posixRelative = toPosixPath(relativeJsPath);
  return `src/libs/${stripKnownExtension(posixRelative)}.ts`;
}

function writeMinifiedHashesManifest() {
  const minifiedFiles = listFilesRecursively(MINIFIED_CACHE_ROOT, '.js');
  const generatedAt = new Date().toISOString();

  const lines = [
    '# DevKit Library Hashes',
    '',
    `Generated at: \`${generatedAt}\``,
    '',
    `DevKit version: \`${DEVKIT_VERSION}\``,
    '',
    'This file is auto-generated from `.devkit/libs-cache/minified` by `node script/lib-cache.js minified`.',
    'Use it to verify minified lib blobs when `DEVKIT_USE_MIN_LIBS=1` / `pnpm build:min` is used.',
    '',
    '| Output file | Canonical source path | MD5 |',
    '|---|---|---|',
  ];

  for (const minifiedFile of minifiedFiles) {
    const relativeJs = toPosixPath(nodePath.relative(MINIFIED_CACHE_ROOT, minifiedFile));
    const sourcePath = libRelativeJsToSourcePath(relativeJs);
    const md5 = crypto.createHash('md5').update(fs.readFileSync(minifiedFile)).digest('hex');
    lines.push(`| \`${relativeJs}\` | \`${sourcePath}\` | \`${md5}\` |`);
  }

  lines.push('');
  lines.push('Quick check example:');
  lines.push('```bash');
  lines.push("md5sum .devkit/libs-cache/minified/<file>.js");
  lines.push('```');
  lines.push('');

  fs.writeFileSync(HASH_MANIFEST_PATH, lines.join('\n'));
}

function generateCompatLibCache() {
  const sourceFiles = listFilesRecursively(LIBS_SRC_ROOT, '.ts').filter((filePath) => !filePath.endsWith('.test.ts'));
  clearDirectory(GENERATED_CACHE_ROOT);

  for (const sourcePath of sourceFiles) {
    const relativeTs = toPosixPath(nodePath.relative(LIBS_SRC_ROOT, sourcePath));
    const relativeJs = `${stripKnownExtension(relativeTs)}.js`;
    const distPath = nodePath.join(DIST_LIBS_ROOT, toFsPath(relativeJs));
    const exportsList = collectRuntimeExports(sourcePath);

    if (!fs.existsSync(distPath)) {
      if (exportsList.length === 0) {
        continue;
      }
      throw new Error(`Missing compiled library output: ${distPath}`);
    }

    const runtimeCode = fs.readFileSync(distPath, 'utf8');
    if (exportsList.length === 0 && runtimeCode.trim().length === 0) {
      continue;
    }
    const moduleVarName = createModuleIdentity(sourcePath, SRC_ROOT).moduleVarName;
    const blobCode = createModuleBlob(moduleVarName, runtimeCode, exportsList);

    const outputPath = nodePath.join(GENERATED_CACHE_ROOT, toFsPath(relativeJs));
    ensureDirectory(nodePath.dirname(outputPath));
    fs.writeFileSync(outputPath, blobCode);
  }
}

async function generateMinifiedLibCache() {
  const generatedFiles = listFilesRecursively(GENERATED_CACHE_ROOT, '.js');

  if (generatedFiles.length === 0) {
    throw new Error('No generated compat library blobs found. Run script/libs first.');
  }

  clearDirectory(MINIFIED_CACHE_ROOT);

  for (const generatedPath of generatedFiles) {
    const relative = nodePath.relative(GENERATED_CACHE_ROOT, generatedPath);
    const sourceCode = fs.readFileSync(generatedPath, 'utf8');
    const result = await terser.minify(sourceCode, {
      compress: true,
      mangle: true,
      keep_classnames: true,
      keep_fnames: true,
    });

    if (!result.code) {
      throw new Error(`Failed to minify generated blob: ${generatedPath}`);
    }

    const outputPath = nodePath.join(MINIFIED_CACHE_ROOT, relative);
    ensureDirectory(nodePath.dirname(outputPath));
    fs.writeFileSync(outputPath, result.code);
  }

  writeMinifiedHashesManifest();
}

async function main() {
  const mode = process.argv[2] || 'generated';

  if (mode === 'generated') {
    generateCompatLibCache();
    return;
  }

  if (mode === 'minified') {
    await generateMinifiedLibCache();
    return;
  }

  if (mode === 'all') {
    generateCompatLibCache();
    await generateMinifiedLibCache();
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
