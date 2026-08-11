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

/* ---------- Carrying images between machines (issue #38) ----------
 * A note body only ever holds a REFERENCE to a picture; the bytes live in
 * userData/images/. Two flows have to carry both halves or the pictures
 * arrive empty on the other side: a backup file (notes:export/import) and
 * a copied note (the clipboard payload). Both bundle the referenced images
 * as base64 under their content-hash names.
 *
 * Everything below treats the incoming bundle as UNTRUSTED (a backup file
 * or the clipboard can come from anywhere): a name must match
 * IMAGE_FILE_RE — never a path out of the payload — and the decoded bytes
 * must actually hash to that name before anything is written, so a hostile
 * bundle can't plant chosen content under a name a note then renders.
 */

// How many base64 characters of pictures a CLIPBOARD payload may carry
// (a backup file has no such limit — it's a file the user asked for).
// ~1.5 MB of image bytes: enough for a screenshot or two, small enough that
// the system clipboard, and every app the text might be pasted into, stays
// comfortable. utils.jsx holds the renderer-side copy of this number (it
// can't require this file); tests/backup.test.mjs guards them against drift.
const CLIPBOARD_IMAGE_BUDGET = 2 * 1024 * 1024;

// Every hash-named image referenced anywhere in `source` — a raw string, or
// any object (the store, a clipboard payload), which is scanned as its JSON
// text so bodies, titles and anything else are all covered at once. Only the
// exact reference shape counts; utils.jsx's IMAGE_REF_RE is its renderer-side
// mirror, and both agree with IMAGE_FILE_RE on what a name may look like.
function referencedImageNames(source) {
  let text = '';
  if (typeof source === 'string') text = source;
  else { try { text = JSON.stringify(source) || ''; } catch { text = ''; } }
  const names = new Set();
  for (const m of text.matchAll(/sticky-image:\/\/([0-9a-f]{16}\.(?:png|jpg|gif|webp))/g)) {
    names.add(m[1]);
  }
  return names;
}

// Do these bytes really belong under this name? The name IS the content
// hash, so re-hashing is the whole verification: same bytes, same name.
function imageBytesMatchName(name, bytes) {
  if (!IMAGE_FILE_RE.test(String(name == null ? '' : name))) return false;
  const mime = mimeForImageName(name);
  return !!mime && imageFileName(bytes, mime) === name;
}

// Read stored pictures back as base64, for bundling into a payload.
// Unknown/unstorable names and missing files are skipped silently — a
// reference whose file is gone simply travels without its picture, exactly
// as it renders today. `budget` caps the TOTAL base64 length: over it, the
// whole set is dropped ({}), because the clipboard policy is all-or-nothing
// (see notesToClipboardText in utils.jsx) and a half-carried set would be a
// worse surprise than none.
function readImages(dir, names, budget = Infinity) {
  const out = {};
  let total = 0;
  for (const name of names || []) {
    if (!IMAGE_FILE_RE.test(String(name)) || Object.hasOwn(out, name)) continue;
    try {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const b64 = fs.readFileSync(file).toString('base64');
      total += b64.length;
      if (total > budget) return {};
      out[name] = b64;
    } catch (err) {
      console.warn(`[storage] failed to read image ${name}: ${err.message}`);
    }
  }
  return out;
}

// The images a payload needs to carry: exactly the ones its own content
// references, never the whole images dir.
function collectImages(dir, source, budget = Infinity) {
  return readImages(dir, [...referencedImageNames(source)], budget);
}

// Write a bundle of base64 pictures back into the images dir. Fail soft and
// per entry — a picture that can't be written is reported, never thrown, so
// a restore always completes and the note simply renders without it.
//   written  — new file created
//   skipped  — already on disk; the name is the content hash, so the file
//              there is byte-identical and rewriting it would be pointless
//   rejected — [{ name, reason }] for anything refused or failed
function writeImages(dir, images) {
  const written = [], skipped = [], rejected = [];
  if (!images || typeof images !== 'object' || Array.isArray(images)) {
    return { written, skipped, rejected };
  }
  for (const [name, b64] of Object.entries(images)) {
    if (!IMAGE_FILE_RE.test(name)) { rejected.push({ name, reason: 'not a valid image name' }); continue; }
    if (typeof b64 !== 'string' || !b64) { rejected.push({ name, reason: 'no image data' }); continue; }
    let bytes;
    try { bytes = Buffer.from(b64, 'base64'); } catch { bytes = null; }
    if (!bytes || !bytes.length) { rejected.push({ name, reason: 'undecodable image data' }); continue; }
    // The security gate: the bytes must hash to the name they claim.
    if (!imageBytesMatchName(name, bytes)) {
      rejected.push({ name, reason: 'content does not match its hash name' });
      continue;
    }
    const file = path.join(dir, name);
    try {
      if (fs.existsSync(file)) { skipped.push(name); continue; }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, bytes);
      written.push(name);
    } catch (err) {
      rejected.push({ name, reason: err.message });
    }
  }
  return { written, skipped, rejected };
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
  const referenced = referencedImageNames(raw);
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
  referencedImageNames, imageBytesMatchName, readImages, collectImages, writeImages,
  CLIPBOARD_IMAGE_BUDGET,
};
