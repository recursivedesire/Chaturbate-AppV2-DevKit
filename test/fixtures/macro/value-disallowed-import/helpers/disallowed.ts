import fs from 'node:fs';

export function readPkgLength() {
  return fs.readFileSync('package.json', 'utf8').length;
}
