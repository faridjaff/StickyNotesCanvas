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

// The reverse table, for the two ways a picture arrives as a FILE instead of
// bytes + a mime type: dropped on a note, or chosen in the "Insert image…"
// picker. There the extension is all the app has to go on. Derived from the
// forward table so the supported set can never drift, plus '.jpeg' — the one
// spelling the forward table can't produce, stored as image/jpeg like '.jpg'.
// utils.jsx's imageMimeForFile is the renderer-side mirror of this.
const IMAGE_MIME_BY_EXT = { jpeg: 'image/jpeg' };
for (const [mime, ext] of Object.entries(IMAGE_EXT_BY_MIME)) IMAGE_MIME_BY_EXT[ext] = mime;

function mimeForImageName(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name == null ? '' : name));
  return (m && IMAGE_MIME_BY_EXT[m[1].toLowerCase()]) || null;
}

// A note body is not a place for a 100 MB photo, and the whole file is read
// into memory to hash it — refuse the absurd ones instead of stalling.
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

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

// Read a picture off disk and store it exactly like a pasted one. Called
// from the main process only — inside the flatpak sandbox the app has no
// filesystem permission of its own, so `filePath` only ever reads when it is
// a path the portals granted: a /run/user/<uid>/doc/… document-portal path
// (what a drag-and-drop from the file manager is rewritten to) or a file the
// user just chose in the file-chooser portal. A raw host path fails here,
// which is exactly right. Throws with a readable message on anything the
// caller should report instead of storing.
function saveImageFromFile(dir, filePath) {
  const mime = mimeForImageName(filePath);
  if (!mime) throw new Error(`unsupported image type: ${path.extname(String(filePath || '')) || '(none)'}`);
  const st = fs.statSync(filePath);
  if (!st.isFile()) throw new Error('not a file');
  if (st.size === 0) throw new Error('the file is empty');
  if (st.size > MAX_IMAGE_BYTES) {
    throw new Error(`image is too large (${Math.ceil(st.size / 1048576)} MB, limit ${MAX_IMAGE_BYTES / 1048576} MB)`);
  }
  return saveImage(dir, fs.readFileSync(filePath), mime);
}

/* ---------- Importing a markdown FILE as a note ----------
 * The inverse of the context menu's "Download": a .md file the user picked
 * becomes a note, its contents the body and its filename the title.
 */

// No size limit on an imported file: a huge one may well make a sluggish
// note, but nobody has measured where that starts, and the same question is
// open for pasted text (issue #39). Both paths stay uncapped until it is
// measured, rather than guessing two different numbers.

// Read one file for the markdown importer: { name, content } on success,
// { name, error } with a message worth showing the user on anything else.
// Never throws — one unreadable file must not sink the rest of a multi-file
// selection. Called from the main process only, for the same reason as
// saveImageFromFile above: inside the flatpak sandbox the app has no
// filesystem permission of its own, and this is the process the file-chooser
// portal granted the chosen file to.
function readMarkdownFile(filePath) {
  const name = path.basename(String(filePath || '')) || 'file';
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return { name, error: 'not a file' };
    const bytes = fs.readFileSync(filePath);
    // A NUL byte means this was never text (a PDF or an image renamed .md,
    // a UTF-16 file); fatal decoding rejects everything else that isn't
    // UTF-8. Both would otherwise land in a note as mojibake.
    if (bytes.includes(0)) return { name, error: 'not a text file' };
    try {
      // ignoreBOM keeps a leading BOM in the string instead of eating it
      // here: normalising the text (BOM, CRLF, trailing whitespace) is
      // utils.jsx's markdownFileBody, the one place both this route and the
      // web demo's browser-side read go through.
      return { name, content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
    } catch {
      return { name, error: 'not UTF-8 text' };
    }
  } catch (err) {
    return { name, error: err.message };
  }
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

module.exports = {
  load, save, imageFileName, mimeForImageName, saveImage, saveImageFromFile,
  sweepOrphanImages, readMarkdownFile, IMAGE_FILE_RE, MAX_IMAGE_BYTES,
};
