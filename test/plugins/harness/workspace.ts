import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PreparedWorkspace = {
  fixtureDir: string;
  workDir: string;
  cleanup: () => void;
};

type SharedManifest = {
  files?: string[];
};

function listDirectories(root: string): string[] {
  const dirs = [root];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current, {withFileTypes: true});

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const full = path.join(current, entry.name);
      dirs.push(full);
      stack.push(full);
    }
  }

  return dirs;
}

function ensureAliasLinks(root: string): void {
  const aliasTargets: Array<{alias: string; target: string}> = [
    {alias: '@api', target: path.join(root, 'api')},
    {alias: '@lib', target: path.join(root, 'libs')},
  ];

  const dirs = listDirectories(root);

  for (const dir of dirs) {
    for (const {alias, target} of aliasTargets) {
      if (!fs.existsSync(target)) {
        continue;
      }

      const aliasPath = path.join(dir, alias);
      if (fs.existsSync(aliasPath)) {
        continue;
      }

      try {
        const relativeTarget = path.relative(dir, target) || '.';
        fs.symlinkSync(relativeTarget, aliasPath, 'dir');
      } catch {
        fs.cpSync(target, aliasPath, {recursive: true});
      }
    }
  }
}

function copySharedAssets(repoRoot: string, fixtureDir: string, workDir: string): void {
  const manifestPath = path.join(fixtureDir, 'fixture.shared.json');
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SharedManifest;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!files.length) {
    return;
  }

  const sharedRoot = path.join(repoRoot, 'test', 'fixtures', '_shared');
  for (const relativePath of files) {
    const sourcePath = path.join(sharedRoot, relativePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Shared fixture asset not found: ${relativePath}`);
    }

    const targetPath = path.join(workDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), {recursive: true});
    fs.cpSync(sourcePath, targetPath, {recursive: true});
  }
}

export function prepareFixtureWorkspace(
  repoRoot: string,
  fixture: string,
  enableAliases: boolean,
  setup?: (workDir: string) => void,
): PreparedWorkspace {
  const fixtureDir = path.join(repoRoot, 'test', 'fixtures', fixture);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'devkit-plugin-test-'));
  const workDir = path.join(tempRoot, 'fixture');

  fs.mkdirSync(workDir, {recursive: true});
  copySharedAssets(repoRoot, fixtureDir, workDir);
  fs.cpSync(fixtureDir, workDir, {recursive: true});

  if (enableAliases) {
    ensureAliasLinks(workDir);
  }

  setup?.(workDir);

  return {
    fixtureDir,
    workDir,
    cleanup: () => fs.rmSync(tempRoot, {recursive: true, force: true}),
  };
}
