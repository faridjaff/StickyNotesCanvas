const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ==================================================================== */
/* APP                                                                  */
/* ==================================================================== */
function App() {
  // Restoring a backup replaces the ENTIRE store, so every entry point
  // (Backup dropdown and Electron's File menu) funnels through this confirm
  // dialog first; only its Confirm button runs the actual import.
  const [confirmRestore, setConfirmRestore] = useState(false);
  const requestRestore = useCallback(() => setConfirmRestore(true), []);
  const { store, setKey, exportNow, importNow, takeSnapshot, undo, redo } = useStickyStore(requestRestore);
  const update = useUpdateCheck();
  // File → "Import notes from image using your AI…". Simple modal that surfaces a
  // copyable prompt template the user hands to an LLM along with an image;
  // the LLM's reply is pasted here (Ctrl+V) and hits the existing paste
  // handler. No network calls from the app itself — bring your own LLM.
  const [importHelpOpen, setImportHelpOpen] = useState(false);
  const openImportHelp = useCallback(() => setImportHelpOpen(true), []);
  useEffect(() => {
    if (!window.stickyAPI?.onMenuImportHelp) return;
    const off = window.stickyAPI.onMenuImportHelp(openImportHelp);
    return () => off && off();
  }, [openImportHelp]);
  // One-time "what's new" after an update — see whatsNewInfo. The recorded
  // version updates unconditionally so the note shows exactly once.
  const [whatsNew, setWhatsNew] = useState(null);
  useEffect(() => {
    const current = window.stickyAPI?.appVersion;
    if (!current) return;
    let seen = null;
    try { seen = localStorage.getItem('stickies.whatsNewSeen'); } catch {}
    try { localStorage.setItem('stickies.whatsNewSeen', WHATS_NEW_ID); } catch {}
    setWhatsNew(whatsNewInfo(current, seen, window.stickyAPI.isFirstRun));
  }, []);
  if (!store) return <Loading/>;
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
      <MobileDemoBanner />
      <div style={{flex:'1 1 auto', minHeight:0, position:'relative'}}>
        {update.available && <UpdateBanner info={update.available} onDismiss={update.dismiss}/>}
        <AppInner store={store} setKey={setKey} exportNow={exportNow} importNow={requestRestore}
          takeSnapshot={takeSnapshot} undo={undo} redo={redo}
          onImportFromImage={openImportHelp} />
      </div>
      <InfoDialog info={update.info} onClose={update.closeInfo} />
      <InfoDialog info={whatsNew} onClose={() => setWhatsNew(null)} />
      <ImportFromImageDialog open={importHelpOpen} onClose={() => setImportHelpOpen(false)} />
      {confirmRestore && (
        <ConfirmDialog T={themeTokens(store.tweaks?.theme)}
          title="Restore backup?"
          body="Restoring replaces ALL current notes, folders, and links with the backup file's contents. This cannot be undone with Ctrl+Z."
          confirmLabel="Restore"
          onCancel={()=>setConfirmRestore(false)}
          onConfirm={()=>{ setConfirmRestore(false); importNow(); }}
        />
      )}
    </div>
  );
}

function AppInner({ store, setKey, exportNow, importNow, takeSnapshot, undo, redo, onImportFromImage }) {
  const tweaks   = store.tweaks;
  const folders  = store.folders;
  const notes    = store.notes;
  const links    = store.links;
  const currentFolder = store.cwd;

  const setTweaks  = (v) => setKey('tweaks',  v);
  const setFolders = (v) => setKey('folders', v);
  const setNotes   = (v) => setKey('notes',   v);
  const setLinks   = (v) => setKey('links',   v);
  const setCurrentFolder = (v) => setKey('cwd', v);

  const [tweakActive, updateTweak] = useTweakMode(setTweaks);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  // Transient banner shown when Ctrl+V is pressed but the clipboard text
  // doesn't parse as a sticky-notes payload. Auto-cleared by the effect
  // below 5 seconds after it's set; manually cleared by the toast's × button.
  const [pasteError, setPasteError] = useState(null);
  useEffect(() => {
    if (!pasteError) return;
    const t = setTimeout(() => setPasteError(null), 10000);
    return () => clearTimeout(t);
  }, [pasteError]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const zRef = useRef(10);

  // Ctrl/Cmd+, toggles the preferences (tweaks) panel. In Electron, the
  // accelerator is registered on the File → Preferences… menu item, which
  // handles the keystroke before it reaches the window — the menu bar is
  // hidden (#42) but the menu itself is still set, so the accelerator lives.
  // This window-level handler is a fallback for the browser case (no
  // stickyAPI).
  useEffect(() => {
    if (window.stickyAPI) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setPrefsOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Menu → Preferences… (the app menu's accelerator, or Alt to summon the
  // hidden bar and click it) toggles the panel.
  useEffect(() => {
    if (!window.stickyAPI?.onMenuPreferences) return;
    const off = window.stickyAPI.onMenuPreferences(() => setPrefsOpen(o => !o));
    return () => off && off();
  }, []);

  // Suppress the host browser's Ctrl/Cmd+wheel page zoom across the whole
  // app. We only preventDefault when a modifier is held so plain wheel
  // events on text bodies / drawer scroll still work naturally; the canvas
  // itself handles plain wheel = zoom in Desktop's onWheel.
  useEffect(() => {
    const guard = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener('wheel', guard, { passive: false });
    return () => window.removeEventListener('wheel', guard);
  }, []);

  // Keep the window's menu bar in step with the preference (#42): hidden and
  // Alt-summoned by default, pinned open when the user asks for it.
  useEffect(() => {
    window.stickyAPI?.setMenuBarVisible?.(!!tweaks.showMenuBar);
  }, [tweaks.showMenuBar]);

  const T = themeTokens(tweaks.theme);

  // The global stylesheet is built once at load, long before a theme exists,
  // so the one theme-derived value it needs — the accent for the keyboard
  // focus ring — is published as a CSS variable here (issue #49).
  useEffect(() => {
    document.documentElement.style.setProperty('--sticky-accent', T.accent);
  }, [T.accent]);

  /* ----- derived ----- */
  const isAll = currentFolder==='root';

  // Notes visible on the canvas. A folder view rolls up its whole subtree —
  // the folder's own notes plus everything in nested subfolders — and also
  // surfaces any pinned note from elsewhere ("follow me across folders").
  const visibleFolderIds = useMemo(() =>
    isAll ? null : folderSubtreeIds(folders, currentFolder),
    [folders, currentFolder, isAll]);
  const folderNotes = useMemo(() =>
    isAll ? notes : notes.filter(n => visibleFolderIds.has(n.folder) || n.pinned),
    [notes, visibleFolderIds, isAll]);

  const filteredNotes = useMemo(() => {
    if (!query.trim()) return folderNotes;
    const q = query.toLowerCase();
    return folderNotes.filter(n => (n.title+' '+n.body).toLowerCase().includes(q));
  }, [folderNotes, query]);

  /* ----- actions ----- */
  // Always derive the new z from the actual current max(notes.z) instead of
  // trusting zRef alone — zRef can drift if any other code path mutates a
  // note's z directly (e.g., group-drag promotion). Take the max of zRef+1
  // and observed-max+1 so we're guaranteed to land above everything visible.
  const bringToFront = (id) => {
    setNotes(ns => {
      const observedMax = ns.reduce((m, n) => Math.max(m, n.z || 0), 0);
      const newZ = Math.max(zRef.current + 1, observedMax + 1);
      zRef.current = newZ;
      return ns.map(n => n.id === id ? {...n, z: newZ} : n);
    });
  };
  // Bring an entire group to the top, preserving the relative ordering
  // among its members (oldest stays under newest within the group). Used
  // by the multi-note drag path so no group member ends up beneath an
  // unselected note. Single bringToFront has the same out-of-sync guard
  // built in, so this also stays correct under any z mutation.
  const bringGroupToFront = (ids) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setNotes(ns => {
      const inGroup = ns.filter(x => idSet.has(x.id))
        .sort((a, b) => (a.z || 0) - (b.z || 0));
      if (inGroup.length === 0) return ns;
      const observedMax = ns.reduce((m, x) => Math.max(m, x.z || 0), 0);
      const baseZ = Math.max(zRef.current, observedMax);
      const newZ = new Map();
      inGroup.forEach((x, i) => newZ.set(x.id, baseZ + 1 + i));
      zRef.current = baseZ + inGroup.length;
      return ns.map(x => newZ.has(x.id) ? {...x, z: newZ.get(x.id)} : x);
    });
  };
  const focusNote = (id) => { bringToFront(id); setSelectedIds(new Set([id])); };
  const updateNote = (id, patch) => setNotes(ns => ns.map(n => n.id===id ? {...n, ...patch} : n));
  const deleteNote = (id) => { takeSnapshot(); setNotes(ns => ns.filter(n => n.id!==id)); setConfirmDel(null); };
  const updateFolder = (id, patch) => setFolders(fs => ({...fs, [id]: {...fs[id], ...patch}}));

  const createNote = (x, y) => {
    const id = uid('n');
    const colors = NOTE_COLORS.filter(c=>c.id!=='white');
    const color = colors[Math.floor(Math.random()*colors.length)].id;
    const targetFolder = isAll
      ? (Object.keys(folders).find(k => k!=='root') || 'root')
      : currentFolder;
    // Only use x/y if they're real numbers (buttons pass event objects)
    const nx = typeof x === 'number' ? x : (120 + Math.random()*240);
    const ny = typeof y === 'number' ? y : (100 + Math.random()*180);
    const n = { id, folder: targetFolder, title:'New note', body:'', color,
      x: nx, y: ny, w:260, h:180, pinned:false };
    takeSnapshot();
    setNotes(ns => [...ns, n]);
    setTimeout(()=>focusNote(id), 0);
  };

  const folderOrder = store.folderOrder;
  const setFolderOrder = (v) => setKey('folderOrder', v);

  // With no argument (toolbar/drawer "+" buttons) the folder lands at the
  // top level; the drawer's "New subfolder" context-menu item passes the
  // parent folder's id. The guard also swallows the event objects that
  // onClick handlers pass when called directly.
  const createFolder = (parentId) => {
    const parent = (typeof parentId === 'string' && parentId !== 'root' && folders[parentId])
      ? parentId : 'root';
    const id = uid('f');
    const hue = FOLDER_HUES[Object.keys(folders).length % FOLDER_HUES.length];
    setFolders(fs => ({...fs, [id]: { id, name: parent==='root' ? 'New folder' : 'New subfolder', parent, hue }}));
    setFolderOrder(order => [...(order || []), id]);
    setCurrentFolder(id);
    setRenamingFolder(id);
  };

  const deleteFolder = (id) => {
    // Deleting a folder removes its whole subtree: nested subfolders, every
    // note inside any of them, and their folderOrder entries. One snapshot
    // covers it all so a single Ctrl+Z restores everything together.
    const doomed = folderSubtreeIds(folders, id);
    takeSnapshot();
    setFolders(fs => {
      const next = {...fs};
      for (const fid of doomed) delete next[fid];
      return next;
    });
    setNotes(ns => ns.filter(n => !doomed.has(n.folder)));
    setFolderOrder(order => (order || []).filter(fid => !doomed.has(fid)));
    if (doomed.has(currentFolder)) setCurrentFolder('root');
    setConfirmDel(null);
  };

  // Re-parent a folder (drag into another folder's row, drop on "All notes",
  // or the context menu's "Move to…"). canMoveFolder refuses moves into the
  // folder's own subtree, so the tree can never acquire a cycle.
  const moveFolderToParent = (id, parentId) => {
    if (!canMoveFolder(folders, id, parentId)) return;
    if (folders[id].parent === parentId) return;
    takeSnapshot();
    updateFolder(id, { parent: parentId });
  };

  const moveNoteToFolder = (noteId, folderId) => {
    // Only snapshot if the folder is actually changing — drag-to-same-folder
    // (e.g. a header drag that hovers a drop zone briefly) shouldn't log an
    // undoable step. This mirrors the "pin-drop across folders WITHOUT a
    // folder change" exclusion in the task spec.
    const current = notes.find(n => n.id === noteId);
    if (!current || current.folder === folderId) return;
    takeSnapshot();
    setNotes(ns => ns.map(n => n.id===noteId ? {...n, folder: folderId, x: 80+Math.random()*100, y: 80+Math.random()*80} : n));
  };

  // Batch move for multi-selection drag. Preserves relative positions of
  // the moved cluster so dropping N notes on a folder lands them in the
  // same arrangement near the target folder's top-left.
  const moveNotesToFolder = (noteIds, folderId) => {
    if (!noteIds || !noteIds.length) return;
    const idSet = new Set(noteIds);
    // Skip if NO selected note would actually change folder — mirrors the
    // single-move guard above. If even one crosses folders, we snapshot once
    // for the whole batch so Ctrl+Z reverts the entire cluster move.
    const anyCrossing = notes.some(n => idSet.has(n.id) && n.folder !== folderId);
    if (!anyCrossing) return;
    takeSnapshot();
    setNotes(ns => {
      const targets = ns.filter(n => idSet.has(n.id));
      if (!targets.length) return ns;
      const minX = Math.min(...targets.map(n => n.x));
      const minY = Math.min(...targets.map(n => n.y));
      const baseX = 80 + Math.random() * 100;
      const baseY = 80 + Math.random() * 80;
      return ns.map(n => idSet.has(n.id)
        ? { ...n, folder: folderId, x: n.x - minX + baseX, y: n.y - minY + baseY }
        : n);
    });
    setSelectedIds(new Set());
  };

  /* ----- copy / paste ----- */
  // Resolve which notes a copy action should target. If a specific noteId is
  // passed (from a context-menu Copy) and that note is part of the current
  // multi-selection, copy the whole selection. Otherwise copy just that note.
  // With no noteId, copy whatever is selected.
  const resolveCopyIds = (noteId) => {
    if (noteId) {
      if (selectedIds.has(noteId) && selectedIds.size > 1) return [...selectedIds];
      return [noteId];
    }
    return selectedIds.size ? [...selectedIds] : [];
  };

  // Returns true on success, false if the clipboard write failed (no user
  // gesture, denied permission, etc.) or if there was nothing to copy. Cut
  // depends on this so it can refuse to delete the originals when the copy
  // half didn't actually land in the clipboard.
  const copySelected = async (noteId) => {
    const ids = resolveCopyIds(noteId);
    if (!ids.length) return false;
    const idSet = new Set(ids);
    // Preserve canvas (z-order) order so the human-readable text reads
    // top-to-bottom roughly as the user sees the cluster.
    const ordered = notes.filter(n => idSet.has(n.id));
    // Bundle the pictures these notes reference so they survive the paste
    // (#38). Best effort on top of the copy that already worked: if the
    // bytes can't be read, or the set is over the clipboard budget, the
    // notes still copy with their references alone, exactly as before.
    let images = null;
    try {
      const names = imageRefsInNotes(ordered);
      if (names.length && window.stickyAPI?.readImages) {
        const res = await window.stickyAPI.readImages(names);
        if (res?.ok) images = res.images;
      }
    } catch (e) { console.warn('[copy] images', e); }
    try {
      await navigator.clipboard.writeText(notesToClipboardText(ordered, links, images));
      return true;
    } catch (e) {
      return false;
    }
  };

  const pasteFromClipboard = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text) return;  // empty clipboard — silent (no intent)
    // Plain text with no sticky-notes marker anywhere is not a failed
    // import — it's text. Make a note out of it where the user is looking
    // (#29). A marker that IS present but unusable still falls through to
    // the error toasts below.
    if (canvasPasteAction(text) === 'note') {
      const v = store.view || { x: 0, y: 0, z: 1 };
      const palette = NOTE_COLORS.filter(c => c.id !== 'white');
      zRef.current += 1;
      const note = {
        id: uid('n'),
        folder: isAll ? (Object.keys(folders).find(k => k!=='root') || 'root') : currentFolder,
        title: '',  // body only — mirrors the download format, so the round trip is exact
        body: text.replace(/\r\n?/g, '\n'),
        color: palette[Math.floor(Math.random() * palette.length)].id,
        w: 260, h: 180,
        x: (80 + Math.random() * 100 - v.x) / v.z,
        y: (80 + Math.random() * 80  - v.y) / v.z,
        pinned: false, z: zRef.current,
      };
      takeSnapshot();
      setNotes(ns => [...ns, note]);
      setSelectedIds(new Set([note.id]));
      return;
    }
    const payload = clipboardTextToNotes(text);
    if (!payload) {
      // Clipboard had text, but no sticky-notes marker / invalid JSON.
      // Most common case for this branch is an LLM that produced output in
      // the wrong format (trailing comma, single quotes, code fences).
      setPasteError("Couldn't import — what's on your clipboard isn't in a format this app can read.");
      return;
    }
    if (!payload.notes.length) {
      setPasteError("Nothing to import — the clipboard contained an empty notes set.");
      return;
    }

    // Pictures the payload carried (#38): store them under their content-hash
    // names before the notes render, so the <img> resolves on first paint.
    // Fails soft — main re-hashes every one and refuses the rest, and a
    // picture that doesn't make it just leaves its note without the image.
    if (Object.keys(payload.images || {}).length && window.stickyAPI?.writeImages) {
      try { await window.stickyAPI.writeImages(payload.images); }
      catch (err) { console.warn('[paste] images', err); }
    }

    // Anchor near the visible viewport's top-left (in screen pixels, then
    // converted to world coords via the current pan/zoom) so pasted notes
    // land where the user is looking instead of at world origin — which
    // would silently appear off-screen if they've panned/zoomed away.
    const v = store.view || { x: 0, y: 0, z: 1 };
    const baseX = (80 + Math.random() * 100 - v.x) / v.z;
    const baseY = (80 + Math.random() * 80  - v.y) / v.z;
    const STEP = 24 / v.z;

    const targetFolder = isAll
      ? (Object.keys(folders).find(k => k!=='root') || 'root')
      : currentFolder;

    // Map original-ids → freshly-minted ids so any links carried in the
    // payload can be re-attached to the new notes.
    const idMap = new Map();
    const newIds = [];
    // Excludes white; used when payload color is missing/invalid (e.g. LLM-pasted batches).
    const palette = NOTE_COLORS.filter(c => c.id !== 'white');
    const fresh = payload.notes.map((p, idx) => {
      const id = uid('n');
      newIds.push(id);
      if (p.id) idMap.set(p.id, id);
      zRef.current += 1;
      const validColor = NOTE_COLORS.some(c => c.id === p.color);
      return {
        id,
        folder: targetFolder,
        title: typeof p.title === 'string' ? p.title : '',
        body:  typeof p.body  === 'string' ? p.body  : '',
        color: validColor ? p.color : palette[Math.floor(Math.random() * palette.length)].id,
        w: typeof p.w === 'number' ? p.w : 260,
        h: typeof p.h === 'number' ? p.h : 180,
        x: baseX + STEP * idx,
        y: baseY + STEP * idx,
        pinned: !!p.pinned,
        z: zRef.current,
      };
    });
    // Single snapshot covers both the notes push and the follow-up links push
    // below, so one Ctrl+Z reverts the whole paste (notes + restored links).
    takeSnapshot();
    setNotes(ns => [...ns, ...fresh]);

    // Internal links (both endpoints in the payload) remap via idMap.
    // Cross-boundary links keep the outside endpoint's ORIGINAL id and
    // re-attach if that note still exists in the current store; if the
    // outside note has been deleted between cut and paste, drop the link.
    const existingIds = new Set(notes.map(n => n.id));
    const freshLinks = (payload.links || []).map(l => {
      const fromIn = idMap.has(l.from), toIn = idMap.has(l.to);
      if (fromIn && toIn) return { id: uid('l'), from: idMap.get(l.from), to: idMap.get(l.to) };
      if (fromIn && existingIds.has(l.to)) return { id: uid('l'), from: idMap.get(l.from), to: l.to };
      if (toIn && existingIds.has(l.from)) return { id: uid('l'), from: l.from, to: idMap.get(l.to) };
      return null;
    }).filter(Boolean);
    if (freshLinks.length) {
      setLinks(ls => [...ls, ...freshLinks]);
    }

    setSelectedIds(new Set(newIds));
  };

  /* ----- import markdown files as notes (issue #44) -----
   * The inverse of a note's context-menu "Download": one note per file, the
   * file's contents its body and the filename its title — which is exactly
   * where Download put the title, so the round trip is lossless.
   */

  // Everything after the picker: files whose contents have already been read
  // ({ name, content }, or { name, error } for one main couldn't read) turn
  // into notes. Split out from the picker half because a native file dialog
  // is the one thing no test can drive, so this is where the coverage lives.
  const importMarkdownFiles = (files) => {
    const results = (Array.isArray(files) ? files : []).map(markdownFileToNote);
    const usable = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    if (usable.length) {
      // Placement, colour and size follow the canvas paste exactly: anchored
      // near the visible viewport (converted to world coords through the
      // current pan/zoom) so the notes land where the user is looking, and
      // cascaded so a multi-file import doesn't stack into one pile.
      const v = store.view || { x: 0, y: 0, z: 1 };
      const baseX = (80 + Math.random() * 100 - v.x) / v.z;
      const baseY = (80 + Math.random() * 80  - v.y) / v.z;
      const STEP = 24 / v.z;
      const targetFolder = isAll
        ? (Object.keys(folders).find(k => k!=='root') || 'root')
        : currentFolder;
      const palette = NOTE_COLORS.filter(c => c.id !== 'white');
      const fresh = usable.map((r, idx) => {
        zRef.current += 1;
        return {
          id: uid('n'),
          folder: targetFolder,
          title: r.title,
          body:  r.body,
          color: palette[Math.floor(Math.random() * palette.length)].id,
          w: 260, h: 180,
          x: baseX + STEP * idx,
          y: baseY + STEP * idx,
          pinned: false, z: zRef.current,
        };
      });
      // One snapshot for the whole import, however many files were picked:
      // a single Ctrl+Z takes all of them back out again.
      takeSnapshot();
      setNotes(ns => [...ns, ...fresh]);
      setSelectedIds(new Set(fresh.map(n => n.id)));
    }
    // Unreadable / oversized / non-text files surface in the same toast the
    // paste failures use instead of vanishing. The rest of the batch is
    // still imported above.
    if (failed.length) {
      setPasteError(`Couldn't import ${failed.length} file${failed.length > 1 ? 's' : ''}:\n`
        + failed.map(r => `${r.name} — ${r.error}`).join('\n'));
    }
  };

  // Desk context-menu "Import markdown file…". Called with no argument — as
  // the menu does — it opens the picker: the native dialog under Electron,
  // which main also reads the chosen files through (inside the flatpak
  // sandbox the app has no filesystem permission of its own; the
  // file-chooser portal grants the file to the main process), or a hidden
  // file input in the web demo. A caller that already holds the files
  // passes them in and skips the dialog — that is the e2e suite's way in.
  const importMarkdown = async (files) => {
    if (Array.isArray(files)) { importMarkdownFiles(files); return; }
    const api = window.stickyAPI;
    try {
      if (api && api.importMarkdown) {
        const res = await api.importMarkdown();
        if (!res || res.canceled) return;
        if (!res.ok) {
          setPasteError(`Couldn't import — ${res.error || 'the file could not be read'}.`);
          return;
        }
        importMarkdownFiles(res.files);
      } else {
        importMarkdownFiles(await pickMarkdownFiles());
      }
    } catch (err) {
      setPasteError(`Couldn't import — ${(err && err.message) || 'the file could not be read'}.`);
    }
  };

  /* ----- link operations ----- */
  const addLink = (fromId, toId) => {
    if (!fromId || !toId || fromId===toId) return;
    setLinks(ls => {
      // dedupe in either direction
      if (ls.some(l => (l.from===fromId && l.to===toId) || (l.from===toId && l.to===fromId))) return ls;
      return [...ls, { id: uid('l'), from: fromId, to: toId }];
    });
  };
  const removeLink = (id) => setLinks(ls => ls.filter(l => l.id!==id));
  const linksFor = (noteId) => links.filter(l => l.from===noteId || l.to===noteId);

  const jumpToNote = (id) => {
    const n = notes.find(x => x.id===id); if (!n) return;
    // Only switch folders when the target is genuinely out of view — a note
    // in a nested subfolder is already visible in an ancestor's rolled-up
    // canvas, so jumping to it shouldn't yank the user into the subfolder.
    if (!isAll && !visibleFolderIds.has(n.folder) && !n.pinned) setCurrentFolder(n.folder);
    setTimeout(()=>focusNote(id), 50);
  };

  /* ----- link lines (computed in WORLD space from note positions) ----- */
  const noteRefs = useRef({});
  const linkLines = useMemo(() => {
    if (!tweaks.showLinks) return [];
    const byId = Object.fromEntries(notes.map(n => [n.id, n]));
    const visible = new Set(filteredNotes.map(n => n.id));
    // clip a line (from cx,cy to tx,ty) to the edge of the rect around (cx,cy)
    const clipToRect = (cx, cy, w, h, tx, ty) => {
      const dx = tx - cx, dy = ty - cy;
      if (dx === 0 && dy === 0) return { x: cx, y: cy };
      const hw = w/2, hh = h/2;
      const tX = dx === 0 ? Infinity : hw / Math.abs(dx);
      const tY = dy === 0 ? Infinity : hh / Math.abs(dy);
      const t = Math.min(tX, tY);
      return { x: cx + dx*t, y: cy + dy*t };
    };
    return links.map(l => {
      const a = byId[l.from], b = byId[l.to];
      if (!a || !b) return null;
      if (!visible.has(l.from) || !visible.has(l.to)) return null;
      const acx = a.x + a.w/2, acy = a.y + a.h/2;
      const bcx = b.x + b.w/2, bcy = b.y + b.h/2;
      const p1 = clipToRect(acx, acy, a.w, a.h, bcx, bcy);
      const p2 = clipToRect(bcx, bcy, b.w, b.h, acx, acy);
      return { id: l.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, fromId: l.from, toId: l.to };
    }).filter(Boolean);
  }, [links, notes, filteredNotes, tweaks.showLinks]);

  // Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z → redo. CRITICAL: when the keyboard
  // event target is a text field (input, textarea, contentEditable), we must
  // NOT preventDefault and NOT fire our undo/redo — the browser's native text
  // undo needs to win for edits-in-progress on a note body/title. We gate on
  // document.activeElement so a focused textarea swallows these chords even
  // if the event was dispatched on document.body.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      const ae = document.activeElement;
      if (ae) {
        const tag = ae.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable) return;
      }
      e.preventDefault();
      if (e.shiftKey) { redo && redo(); }
      else            { undo && undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* ----- keyboard ----- */
  useEffect(() => {
    const h = (e) => {
      if (e.target.matches('input, textarea, [contenteditable], [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase()==='c') {
        // Text highlighted in a note's preview body (#30): the native copy
        // must win. preventDefault + copySelected here would clobber the
        // clipboard with whole-note payloads instead of the selected text.
        if (hasTextSelection(window.getSelection())) return;
        if (selectedIds.size === 0) return;
        e.preventDefault();
        copySelected();
        return;
      }
      if (mod && e.key.toLowerCase()==='v') {
        e.preventDefault();
        pasteFromClipboard();
        return;
      }
      if (mod && e.key.toLowerCase()==='x') {
        // Same guard as Ctrl+C: while text is highlighted, Ctrl+X must not
        // cut (delete!) the selected notes out from under the user.
        if (hasTextSelection(window.getSelection())) return;
        if (selectedIds.size === 0) return;
        e.preventDefault();
        const ids = selectedIds;
        // Only delete the originals if the clipboard write succeeded —
        // otherwise the user would be left with neither a paste-able copy
        // nor the original notes. Single snapshot covers the deletion of
        // notes + orphan-link cleanup so Ctrl+Z reverts the whole cut.
        (async () => {
          const ok = await copySelected();
          if (!ok) return;
          takeSnapshot();
          setNotes(ns => ns.filter(n => !ids.has(n.id)));
          setLinks(ls => ls.filter(l => !ids.has(l.from) && !ids.has(l.to)));
          setSelectedIds(new Set());
        })();
        return;
      }
      if (e.key.toLowerCase()==='n') { e.preventDefault(); createNote(); }
      if (e.key.toLowerCase()==='f' && (e.metaKey||e.ctrlKey)) { e.preventDefault(); document.getElementById('qs')?.focus(); }
      if (e.key==='Escape') { setSelectedIds(new Set()); }
      if ((e.key==='Delete' || e.key==='Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        const ids = selectedIds;
        // Batch multi-delete: one snapshot covers the notes + link cleanup so
        // a single Ctrl+Z reverts the whole delete, not just the links.
        takeSnapshot();
        setNotes(ns => ns.filter(n => !ids.has(n.id)));
        setLinks(ls => ls.filter(l => !ids.has(l.from) && !ids.has(l.to)));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // Breadcrumb path for nested folders: "Work / Sprints" instead of just
  // "Sprints", shown in the top chrome and the status bar.
  const currentFolderName = isAll ? 'All notes' : (folderPath(folders, currentFolder).join(' / ') || '');

  return (
    <div style={{height:'100%', background:T.wallpaper, color:T.panelText, position:'relative',
      fontFamily: '"'+tweaks.font+'", system-ui, sans-serif'}}>

      <PasteErrorToast message={pasteError} onClose={() => setPasteError(null)} />

      <TopChrome T={T} tweaks={tweaks}
        currentFolderName={currentFolderName}
        query={query} setQuery={setQuery}
        onNewNote={createNote}
        onNewFolder={createFolder}
        onExport={exportNow}
        onImport={importNow}
      />

      <FoldersDrawer T={T} tweaks={tweaks}
        folders={folders} notes={notes}
        currentFolder={currentFolder} setCurrentFolder={setCurrentFolder}
        onCreateFolder={createFolder}
        onRenameFolder={(id, name)=>updateFolder(id,{name})}
        renamingFolder={renamingFolder} setRenamingFolder={setRenamingFolder}
        onDeleteFolder={(id)=>setConfirmDel({kind:'folder', id})}
        onMoveFolderToParent={moveFolderToParent}
        onDropNoteOnFolder={moveNoteToFolder}
        onDropNotesOnFolder={moveNotesToFolder}
        onCreateNote={createNote}
        open={store.drawer}
        setOpen={(v) => setKey('drawer', v)}
        folderOrder={folderOrder}
        setFolderOrder={setFolderOrder}
      />

      <Desktop T={T} tweaks={tweaks}
        currentFolder={currentFolder}
        folders={folders}
        folderOrder={folderOrder}
        notes={filteredNotes}
        allNotes={notes}
        noteRefs={noteRefs} linkLines={linkLines}
        links={links} addLink={addLink} removeLink={removeLink} linksFor={linksFor}
        updateNote={updateNote} bringToFront={bringToFront} bringGroupToFront={bringGroupToFront} focusNote={focusNote}
        onDeleteNote={(id)=>setConfirmDel({kind:'note', id})}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        setNotes={setNotes}
        jumpToNote={jumpToNote}
        moveNoteToFolder={moveNoteToFolder}
        moveNotesToFolder={moveNotesToFolder}
        onCreateNote={createNote}
        onImportMarkdown={importMarkdown}
        onCopyNotes={copySelected}
        view={store.view}
        setView={(v) => setKey('view', v)}
        drawerOpen={store.drawer}
        takeSnapshot={takeSnapshot}
      />

      {confirmDel && (
        <ConfirmDialog T={T}
          title={confirmDel.kind==='folder'
            ? `Delete "${folders[confirmDel.id]?.name}"?`
            : `Delete "${notes.find(n=>n.id===confirmDel.id)?.title || 'note'}"?`}
          body={confirmDel.kind==='folder'
            ? (folderSubtreeIds(folders, confirmDel.id).size > 1
                ? 'All subfolders and notes inside this folder will also be deleted.'
                : 'All notes inside this folder will also be deleted.')
            : 'This note will be permanently removed.'}
          onCancel={()=>setConfirmDel(null)}
          onConfirm={()=>{
            if (confirmDel.kind==='note') deleteNote(confirmDel.id);
            else deleteFolder(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}

      {(tweakActive || prefsOpen) && <TweakPanel T={T} tweaks={tweaks} update={updateTweak} onClose={()=>setPrefsOpen(false)} onImportFromImage={onImportFromImage}/>}

      <StatusBar T={T} tweaks={tweaks}
        folderName={currentFolderName}
        noteCount={folderNotes.length}
        folderCount={Object.keys(folders).length-1}
        onOpenPrefs={()=>setPrefsOpen(o=>!o)}
      />
    </div>
  );
}
/* ==================================================================== */
/* GLOBAL CSS                                                            */
/* ==================================================================== */
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  /* Preview <-> edit parity (issue #26): outside edit mode the rendered body
     must occupy the same lines as the raw text in the editing textarea.
     pre-wrap stops HTML from collapsing space runs / leading spaces;
     overflow-wrap matches the textarea's UA break-word; zeroed block margins
     make consecutive lines stack purely at line-height, so all vertical
     rhythm comes from the text itself (blank lines arrive from mdToHtml as
     explicit empty paragraphs). Every block element markdown-it can emit
     keeps that flat rhythm: margin 0, no vertical padding surprises. */
  .md-body { white-space: pre-wrap; overflow-wrap: break-word; }
  .md-body h3 { font-size: 1.05em; margin: 0; font-weight: 700; }
  .md-body h4 { font-size: 1em; margin: 0; font-weight: 700; opacity: .85; }
  .md-body h5 { font-size: .92em; margin: 0; font-weight: 700; opacity: .75; letter-spacing: .02em; }
  .md-body h6 { font-size: .85em; margin: 0; font-weight: 700; opacity: .6; text-transform: uppercase; letter-spacing: .05em; }
  .md-body p { margin: 0; }
  .md-body ul { margin: 0; padding-left: 18px; }
  .md-body ol { margin: 0; padding-left: 18px; }
  .md-body ol ol { list-style: lower-alpha; }
  .md-body ol ol ol { list-style: lower-roman; }
  .md-body li { margin: 0; }
  .md-body blockquote { margin: 0; padding: 0 0 0 10px; border-left: 3px solid rgba(0,0,0,.25); opacity: .85; }
  .md-body pre { margin: 0; padding: 6px 8px; background: rgba(0,0,0,.06); border-radius: 4px; overflow-x: auto; }
  .md-body pre code { display: block; background: transparent; padding: 0; }
  .md-body table { border-collapse: collapse; margin: 0; font-size: .95em; }
  .md-body th, .md-body td { border: 1px solid rgba(0,0,0,.2); padding: 2px 6px; }
  .md-body img { max-width: 100%; }
  .md-body hr { border: none; border-top: 1px solid rgba(0,0,0,.2); margin: 0; }
  .md-body .mermaid-diagram { margin: 0; }
  .md-body .mermaid-diagram svg { max-width: 100%; height: auto; }
  .md-body code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .88em; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 3px; }
  .md-body a.note-link { color: inherit; text-decoration: underline dotted; cursor: pointer; background: rgba(0,0,0,.05); padding: 0 3px; border-radius: 2px; }
  /* Note paper is light in every theme, so a black overlay is the right
     direction here — it just has to be a step you can actually see next to
     the resting .05 (issue #49), and the underline goes solid to back it up. */
  .md-body a.note-link:hover { background: rgba(0,0,0,.18); text-decoration: underline solid; }
  /* Keyboard focus is never less visible than hover: an accent ring on top
     of whatever hover paint the control already carries. Controls that set
     their own inline outline (the selected note) keep it — inline wins. */
  :focus-visible { outline: 2px solid var(--sticky-accent, #3584e4); outline-offset: 1px; }
  kbd { font-family: ui-monospace, monospace; }
  /* While a text selection drags inside one note body, nothing else on the
     page is selectable — the browser then clamps the selection to that note
     natively. Poor man's user-select: contain, which Chromium lacks. (#30) */
  body.sel-lock * { user-select: none !important; }
  body.sel-lock .sel-src, body.sel-lock .sel-src * { user-select: text !important; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
`;
document.head.appendChild(globalStyle);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);