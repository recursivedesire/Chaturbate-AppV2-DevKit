const fs = require('node:fs');
const path = require('node:path');

function ensureAlias(alias, targetDir, nodeModulesDir) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const aliasPath = path.join(nodeModulesDir, alias);

  try {
    if (fs.existsSync(aliasPath)) {
      const stat = fs.lstatSync(aliasPath);
      if (stat.isSymbolicLink()) {
        const currentLink = fs.readlinkSync(aliasPath);
        const currentTarget = path.resolve(nodeModulesDir, currentLink);
        if (currentTarget === targetDir) {
          return;
        }
      }
      fs.rmSync(aliasPath, {recursive: true, force: true});
    }
  } catch {
    fs.rmSync(aliasPath, {recursive: true, force: true});
  }

  const relativeTarget = path.relative(nodeModulesDir, targetDir) || '.';
  try {
    fs.symlinkSync(relativeTarget, aliasPath, 'dir');
  } catch (error) {
    if (!error || error.code !== 'EEXIST') {
      throw error;
    }
  }
}

(function registerAliases() {
  const root = process.cwd();
  const tempSrcDir = path.join(root, 'temp', 'src');
  const nodeModulesDir = path.join(root, 'temp', 'node_modules');

  fs.mkdirSync(nodeModulesDir, {recursive: true});

  ensureAlias('@api', path.join(tempSrcDir, 'api'), nodeModulesDir);
  ensureAlias('@lib', path.join(tempSrcDir, 'libs'), nodeModulesDir);
})();
