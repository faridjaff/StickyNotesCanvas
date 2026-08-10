const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function load(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] Failed to parse ${filePath}: ${err.message}`);
    return {};
  }
}

function save(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

/* ---------- Pasted note images ----------
 * Images pasted into a note body are stored as files in an images/ dir
 * next to notes.json, named by content hash: <first 16 hex chars of the
 * sha256 of the bytes>.<ext>. Hashing dedups repeated pastes of the same
 * picture and keeps names collision-safe without any counter state. The
 * note body references the file as sticky-image://<name>, which main.js
 * serves via a custom protocol and mdToHtml renders as an <img>.
 */

const IMAGE_EXT_BY_MIME = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/gif':  'gif',
  'image/webp': 'webp',
};

// The only filenames the images dir may contain or serve. Everything that
// touches an image file (save, protocol handler, orphan sweep) validates
// against this, so traversal names or non-image files are rejected everywhere.
const IMAGE_FILE_RE = /^[0-9a-f]{16}\.(?:png|jpg|gif|webp)$/;

function imageFileName(bytes, mime) {
  const ext = IMAGE_EXT_BY_MIME[String(mime || '').toLowerCase()];
  if (!ext) return null;
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `${hash}.${ext}`;
}

function saveImage(dir, bytes, mime) {
  const name = imageFileName(bytes, mime);
  if (!name) throw new Error(`unsupported image type: ${mime || '(none)'}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes);
  return name;
}

// Notes are saved wholesale (there is no per-note delete at the storage
// level), so deleting a note — or undoing a paste — can orphan its image
// files. Called once at app startup, when no paste can be in flight: every
// hash-named file in the images dir that notes.json no longer references
// is removed. Files that don't match IMAGE_FILE_RE are never touched.
function sweepOrphanImages(dir, notesFilePath) {
  if (!fs.existsSync(dir)) return [];
  let raw = '';
  try { raw = fs.readFileSync(notesFilePath, 'utf8'); } catch {}
  const referenced = new Set();
  for (const m of raw.matchAll(/sticky-image:\/\/([0-9a-f]{16}\.(?:png|jpg|gif|webp))/g)) {
    referenced.add(m[1]);
  }
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!IMAGE_FILE_RE.test(name) || referenced.has(name)) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
      removed.push(name);
    } catch (err) {
      console.warn(`[storage] failed to remove orphan image ${name}: ${err.message}`);
    }
  }
  return removed;
}

module.exports = { load, save, imageFileName, saveImage, sweepOrphanImages, IMAGE_FILE_RE };
