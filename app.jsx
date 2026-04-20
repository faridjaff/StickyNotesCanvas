const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ==================================================================== */
/* APP                                                                  */
/* ==================================================================== */
function App() {
  const { store, setKey, exportNow, importNow, takeSnapshot, undo, redo } = useStickyStore();
  const update = useUpdateCheck();
  // Help → "Import notes from image using your AI…". Simple modal that surfaces a
  // copyable prompt template the user hands to an LLM along with an image;
  // the LLM's reply is pasted here (Ctrl+V) and hits the existing paste
  // handler. No network calls from the app itself — bring your own LLM.
  const [importHelpOpen, setImportHelpOpen] = useState(false);
  useEffect(() => {
    if (!window.stickyAPI?.onMenuImportHelp) return;
    const off = window.stickyAPI.onMenuImportHelp(() => setImportHelpOpen(true));
    return () => off && off();
  }, []);
  if (!store) return <Loading/>;
  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
      <MobileDemoBanner />
      <div style={{flex:'1 1 auto', minHeight:0, position:'relative'}}>
        {update.available && <UpdateBanner info={update.available} onDismiss={update.dismiss}/>}
        <AppInner store={store} setKey={setKey} exportNow={exportNow} importNow={importNow}
          takeSnapshot={takeSnapshot} undo={undo} redo={redo} />
      </div>
      <InfoDialog info={update.info} onClose={update.closeInfo} />
      <ImportFromImageDialog open={importHelpOpen} onClose={() => setImportHelpOpen(false)} />
    </div>
  );
}

function AppInner({ store, setKey, exportNow, importNow, takeSnapshot, undo, redo }) {
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
  // handles the keystroke before it reaches the window. This window-level
  // handler is a fallback for the browser case (no stickyAPI).
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

  // Menu → Preferences… (from the native menu bar) toggles the panel.
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

  const T = themeTokens(tweaks.theme);

  /* ----- derived ----- */
  const isAll = currentFolder==='root';

  // Notes visible on the canvas. In a specific folder, also surface any pinned
  // note from elsewhere — pinning means "follow me across folders".
  const folderNotes = useMemo(() =>
    isAll ? notes : notes.filter(n => n.folder === currentFolder || n.pinned),
    [notes, currentFolder, isAll]);

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

  const createFolder = () => {
    const id = uid('f');
    const hue = FOLDER_HUES[Object.keys(folders).length % FOLDER_HUES.length];
    setFolders(fs => ({...fs, [id]: { id, name:'New folder', parent: 'root', hue }}));
    setFolderOrder(order => [...(order || []), id]);
    setCurrentFolder(id);
    setRenamingFolder(id);
  };

  const deleteFolder = (id) => {
    // One snapshot for the folder + its notes + folderOrder removal; Ctrl+Z
    // restores all three together.
    takeSnapshot();
    setFolders(fs => { const next = {...fs}; delete next[id]; return next; });
    setNotes(ns => ns.filter(n => n.folder !== id));
    setFolderOrder(order => (order || []).filter(fid => fid !== id));
    if (currentFolder===id) setCurrentFolder('root');
    setConfirmDel(null);
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
    try {
      await navigator.clipboard.writeText(notesToClipboardText(ordered, links));
      return true;
    } catch (e) {
      return false;
    }
  };

  const pasteFromClipboard = async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text) return;  // empty clipboard — silent (no intent)
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

    // Random anchor near the visible canvas top-left (same strategy as
    // moveNotesToFolder). The serialised payload doesn't carry x/y, so we
    // just offset each pasted note by a small per-index step to avoid a
    // perfect overlapping stack.
    const baseX = 80 + Math.random() * 100;
    const baseY = 80 + Math.random() * 80;
    const STEP = 24;

    const targetFolder = isAll
      ? (Object.keys(folders).find(k => k!=='root') || 'root')
      : currentFolder;

    // Map original-ids → freshly-minted ids so any links carried in the
    // payload can be re-attached to the new notes.
    const idMap = new Map();
    const newIds = [];
    const fresh = payload.notes.map((p, idx) => {
      const id = uid('n');
      newIds.push(id);
      if (p.id) idMap.set(p.id, id);
      zRef.current += 1;
      return {
        id,
        folder: targetFolder,
        title: typeof p.title === 'string' ? p.title : '',
        body:  typeof p.body  === 'string' ? p.body  : '',
        color: p.color || 'yellow',
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
    if (currentFolder !== 'root' && n.folder !== currentFolder) setCurrentFolder(n.folder);
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

  const currentFolderName = isAll ? 'All notes' : (folders[currentFolder]?.name || '');

  return (
    <div style={{height:'100%', background:T.wallpaper, color:T.panelText, position:'relative',
      fontFamily: tweaks.font+', system-ui, sans-serif'}}>

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
            ? 'All notes inside this folder will also be deleted.'
            : 'This note will be permanently removed.'}
          onCancel={()=>setConfirmDel(null)}
          onConfirm={()=>{
            if (confirmDel.kind==='note') deleteNote(confirmDel.id);
            else deleteFolder(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}

      {(tweakActive || prefsOpen) && <TweakPanel T={T} tweaks={tweaks} update={updateTweak} onClose={()=>setPrefsOpen(false)}/>}

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
  .md-body h3 { font-size: 1.05em; margin: 0 0 4px; font-weight: 700; }
  .md-body h4 { font-size: 1em; margin: 8px 0 2px; font-weight: 700; opacity: .85; }
  .md-body p { margin: 0 0 6px; }
  .md-body ul { margin: 0 0 6px; padding-left: 18px; }
  .md-body li { margin: 1px 0; }
  .md-body code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .88em; background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 3px; }
  .md-body a.note-link { color: inherit; text-decoration: underline dotted; cursor: pointer; background: rgba(0,0,0,.05); padding: 0 3px; border-radius: 2px; }
  .md-body a.note-link:hover { background: rgba(0,0,0,.12); }
  kbd { font-family: ui-monospace, monospace; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
`;
document.head.appendChild(globalStyle);

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);