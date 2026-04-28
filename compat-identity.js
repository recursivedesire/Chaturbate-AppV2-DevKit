const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');

const HASH_LENGTH = 6;
const SUPPORTED_EXTENSIONS = ['.ts', '.js'];

function toPosixPath(value) {
  return value.split(nodePath.sep).join('/');
}

function normalizeAbsolutePath(value) {
  return toPosixPath(nodePath.resolve(value));
}

function stripKnownExtension(value) {
  for (const extension of SUPPORTED_EXTENSIONS) {
    if (value.endsWith(extension)) {
      return value.slice(0, -extension.length);
    }
  }

  return value;
}

function hasSupportedExtension(value) {
  return SUPPORTED_EXTENSIONS.includes(nodePath.extname(value));
}

function sanitizeIdentifierFragment(value) {
  const withSeparators = value.replace(/[\\/]+/g, '_');
  const withAt = withSeparators.replace(/@/g, 'at_');
  const withDollar = withAt.replace(/\$/g, 'dollar_');
  const cleaned = withDollar.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const nonEmpty = cleaned.length > 0 ? cleaned : 'module';

  if (/^[0-9]/.test(nonEmpty)) {
    return `m_${nonEmpty}`;
  }

  return nonEmpty;
}

function hashPath(absolutePath) {
  const normalized = normalizeAbsolutePath(absolutePath);
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, HASH_LENGTH);
}

function isWithinRoot(rootPath, candidatePath) {
  const normalizedRoot = normalizeAbsolutePath(rootPath);
  const normalizedCandidate = normalizeAbsolutePath(candidatePath);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  return normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function createCanonicalBreadcrumb(absolutePath, entryRootDir) {
  const normalizedAbsolute = normalizeAbsolutePath(absolutePath);
  const normalizedRoot = normalizeAbsolutePath(entryRootDir);
  const apiRoot = normalizeAbsolutePath(nodePath.join(entryRootDir, 'api'));
  const libsRoot = normalizeAbsolutePath(nodePath.join(entryRootDir, 'libs'));

  const withPathPrefix = (prefix, rootPath) => {
    if (normalizedAbsolute === rootPath) {
      return prefix;
    }

    if (!normalizedAbsolute.startsWith(`${rootPath}/`)) {
      return null;
    }

    const relative = normalizedAbsolute.slice(rootPath.length + 1);
    return `${prefix}/${stripKnownExtension(relative)}`;
  };

  const asApi = withPathPrefix('@api', apiRoot);
  if (asApi) {
    return asApi;
  }

  const asLib = withPathPrefix('@lib', libsRoot);
  if (asLib) {
    return asLib;
  }

  if (normalizedAbsolute === normalizedRoot) {
    return 'entry';
  }

  if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
    const relative = normalizedAbsolute.slice(normalizedRoot.length + 1);
    return stripKnownExtension(relative);
  }

  return stripKnownExtension(nodePath.basename(normalizedAbsolute));
}

function createModuleIdentity(absolutePath, entryRootDir) {
  const breadcrumbSource = createCanonicalBreadcrumb(absolutePath, entryRootDir);
  const breadcrumbSanitized = sanitizeIdentifierFragment(breadcrumbSource);
  const shortHash = hashPath(absolutePath);
  const prefixBase = `${breadcrumbSanitized}__${shortHash}`;

  return {
    breadcrumbSource,
    breadcrumbSanitized,
    shortHash,
    prefixBase,
    moduleVarName: `${prefixBase}__module`,
  };
}

function isLibModulePath(absolutePath, entryRootDir) {
  const libsRoot = nodePath.join(entryRootDir, 'libs');
  return isWithinRoot(libsRoot, absolutePath);
}

function getLibRelativeJsPath(absolutePath, entryRootDir) {
  if (!isLibModulePath(absolutePath, entryRootDir)) {
    return null;
  }

  const libsRoot = nodePath.join(entryRootDir, 'libs');
  const relative = stripKnownExtension(nodePath.relative(libsRoot, absolutePath));
  return `${toPosixPath(relative)}.js`;
}

function resolveExistingFile(basePath) {
  const candidates = [basePath];
  const ext = nodePath.extname(basePath);

  if (!ext || !hasSupportedExtension(basePath)) {
    for (const extension of SUPPORTED_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return nodePath.resolve(candidate);
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const extension of SUPPORTED_EXTENSIONS) {
      const indexCandidate = nodePath.join(basePath, `index${extension}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
        return nodePath.resolve(indexCandidate);
      }
    }
  }

  return null;
}

module.exports = {
  HASH_LENGTH,
  SUPPORTED_EXTENSIONS,
  toPosixPath,
  normalizeAbsolutePath,
  stripKnownExtension,
  hasSupportedExtension,
  sanitizeIdentifierFragment,
  hashPath,
  createCanonicalBreadcrumb,
  createModuleIdentity,
  isLibModulePath,
  getLibRelativeJsPath,
  resolveExistingFile,
};
