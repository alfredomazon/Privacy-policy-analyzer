import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const manifestPath = path.join(rootDir, "manifest.json");

const runtimeFiles = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.css",
  "popup.js"
];

const runtimeDirs = [
  "content",
  "icons",
  "lib",
  "resources"
];

const optionalRuntimeDirs = [
  "_locales"
];

const textEncoder = new TextEncoder();
const crcTable = makeCrcTable();
const zipDosTime = 0;
const zipDosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const packageName = slugify(manifest.name || "extension");
const version = manifest.version || "0.0.0";
const releaseName = `${packageName}-${version}`;
const releaseDir = path.join(distDir, releaseName);
const zipPath = path.join(distDir, `${releaseName}.zip`);

await fs.rm(releaseDir, { recursive: true, force: true });
await fs.rm(zipPath, { force: true });
await fs.mkdir(releaseDir, { recursive: true });

const entries = [];

for (const file of runtimeFiles) {
  await copyFileIntoRelease(file);
  entries.push(file);
}

for (const dir of runtimeDirs) {
  const files = await listFiles(path.join(rootDir, dir));
  for (const absoluteFile of files) {
    const relativeFile = toArchivePath(path.relative(rootDir, absoluteFile));
    await copyFileIntoRelease(relativeFile);
    entries.push(relativeFile);
  }
}

for (const dir of optionalRuntimeDirs) {
  const absoluteDir = path.join(rootDir, dir);
  if (!(await exists(absoluteDir))) {
    continue;
  }

  const files = await listFiles(absoluteDir);
  for (const absoluteFile of files) {
    const relativeFile = toArchivePath(path.relative(rootDir, absoluteFile));
    await copyFileIntoRelease(relativeFile);
    entries.push(relativeFile);
  }
}

entries.sort();
await writeZip(zipPath, entries.map((name) => ({
  name,
  absolutePath: path.join(releaseDir, name)
})));

console.log(`Created ${path.relative(rootDir, zipPath)}`);
console.log(`Included ${entries.length} files.`);

async function copyFileIntoRelease(relativePath) {
  const source = path.join(rootDir, relativePath);
  const destination = path.join(releaseDir, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function listFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const dirent of dirents) {
    const childPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results.push(...await listFiles(childPath));
    } else if (dirent.isFile()) {
      results.push(childPath);
    }
  }

  return results;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeZip(outputPath, files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const fileName = toArchivePath(file.name);
    const fileNameBytes = textEncoder.encode(fileName);
    const data = await fs.readFile(file.absolutePath);
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(zipDosTime, 10);
    localHeader.writeUInt16LE(zipDosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileNameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, Buffer.from(fileNameBytes), data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(zipDosTime, 12);
    centralHeader.writeUInt16LE(zipDosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileNameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, Buffer.from(fileNameBytes));
    offset += localHeader.length + fileNameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
}

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }

  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toArchivePath(filePath) {
  return filePath.split(path.sep).join("/");
}
