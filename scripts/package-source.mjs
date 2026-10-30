// Packs the committed source tree into the archive store reviewers rebuild from
// (Mozilla AMO requires it for bundled/minified extensions):
//   release/cointrunk-wallet-<version>-source.zip
//
// It is `git archive` of HEAD, so it holds exactly the tracked files (BUILD.md
// with the build steps, the lockfile, manifest, config and src/) and nothing
// local: no node_modules, dist/, .env or untracked files. Commit first: working
// tree changes are not included.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const RELEASE_DIR = 'release';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const name = `cointrunk-wallet-${version}-source`;

const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  encoding: 'utf8',
});
if (dirty.trim() !== '') {
  console.warn('warning: uncommitted changes are NOT in the source package (it archives HEAD)');
}

mkdirSync(RELEASE_DIR, { recursive: true });
execFileSync('git', [
  'archive',
  '--format=zip',
  `--prefix=${name}/`,
  `--output=${RELEASE_DIR}/${name}.zip`,
  'HEAD',
]);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(`${RELEASE_DIR}/${name}.zip: source of commit ${commit}`);
