// Packs each built extension (dist/<target>/) into a byte-for-byte reproducible
// zip, one per browser:
//   release/cointrunk-wallet-<version>-chrome.zip   (+ .sha256 next to it)
//   release/cointrunk-wallet-<version>-firefox.zip  (+ .sha256 next to it)
//
// The same source + lockfile + Node/pnpm versions always give the same zip, so a
// store reviewer can rebuild it and compare one SHA-256 (see BUILD.md). Generic
// zip tools leak the build machine into the archive (file mtimes, permissions,
// directory order, zlib version), so this writes the zip itself:
//   - entries sorted by path, '/' separators, files only (no directory entries)
//   - every timestamp fixed to 1980-01-01 00:00 (the zip epoch)
//   - no permissions or extra fields
//   - stored, not deflated: compressed bytes depend on the zlib build bundled
//     with Node, stored bytes depend on nothing
//
// It only reads dist/ and manifest.json, never git, so it works the same in an
// unpacked source package as in a checkout.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { crc32 } from 'node:zlib';

const DIST_DIR = 'dist';
const RELEASE_DIR = 'release';
const TARGETS = ['chrome', 'firefox'];

// MS-DOS date/time of 1980-01-01 00:00: day 1, month 1, year 0 (= 1980).
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const VERSION = 20; // zip spec 2.0, MS-DOS "made by" (no unix permissions)
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

function buildZip(dir, files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of files) {
    const data = readFileSync(join(dir, name));
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(METHOD_STORED, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(METHOD_STORED, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    // extra length, comment length, disk number, internal + external attributes: all 0
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, end]);
}

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
mkdirSync(RELEASE_DIR, { recursive: true });

for (const target of TARGETS) {
  const dir = join(DIST_DIR, target);
  const files = existsSync(dir) ? listFiles(dir) : [];
  if (!files.includes('manifest.json')) {
    console.error(`${dir}/manifest.json not found: run \`pnpm build\` first.`);
    process.exit(1);
  }

  const zip = buildZip(dir, files);
  const zipName = `cointrunk-wallet-${version}-${target}.zip`;
  const sha256 = createHash('sha256').update(zip).digest('hex');

  writeFileSync(join(RELEASE_DIR, zipName), zip);
  writeFileSync(join(RELEASE_DIR, `${zipName}.sha256`), `${sha256}  ${zipName}\n`);

  console.log(`${RELEASE_DIR}/${zipName}: ${files.length} files, ${zip.length} bytes`);
  console.log(`sha256 ${sha256}`);
}
