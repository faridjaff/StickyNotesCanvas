const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

/* ---------- HOOKS ---------- */
function usePersistedState(key, initial) {
  const [s, setS] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(s)); } catch {} }, [key, s]);
  return [s, setS];
}
function useStickyStore() {
  const [store, setStore] = useState(null);
  const saveRef = useRef(null);
  const storeRef = useRef(null);
  // In-memory undo/redo stacks. We only retain snapshots of user-content
  // slices ({notes, folders, folderOrder, pins, links}) — not UI state like
  // tweaks/cwd/drawer — and cap the history at UNDO_LIMIT entries.
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  useEffect(() => { storeRef.current = store; }, [store]);

  const scheduleSave = useCallback((next) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      if (window.stickyAPI) {
        window.stickyAPI.save(next).catch(err => console.warn('[save]', err));
      } else {
        try { localStorage.setItem('stickies.all', JSON.stringify(next)); } catch {}
      }
    }, 500);
  }, []);

  // Initial load + hydrate. Always save once after hydrate so fresh installs
  // and corrupt-file fallbacks both end up with a valid notes.json on disk.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loaded = {};
      try {
        if (window.stickyAPI) {
          loaded = await window.stickyAPI.load();
        } else {
          loaded = JSON.parse(localStorage.getItem('stickies.all') ?? '{}');
        }
      } catch (err) {
        console.warn('[useStickyStore] load failed:', err);
        loaded = {};
      }
      if (cancelled) return;
      const next = withDefaults(loaded);
      setStore(next);
      scheduleSave(next);
    })();
    return () => { cancelled = true; };
  }, [scheduleSave]);

  // Menu bar integration (Electron only): File → Export / Import.
  useEffect(() => {
    if (!window.stickyAPI) return;
    const onExport = () => {
      const current = storeRef.current;
      if (current) window.stickyAPI.exportFile(current).catch(err => console.warn('[export]', err));
    };
    const onImport = async () => {
      try {
        const res = await window.stickyAPI.importFile();
        if (res?.ok && res.data) {
          const next = withDefaults(res.data);
          setStore(next);
          scheduleSave(next);
        }
      } catch (err) { console.warn('[import]', err); }
    };
    const off1 = window.stickyAPI.onMenuExport(onExport);
    const off2 = window.stickyAPI.onMenuImport(onImport);
    return () => { off1 && off1(); off2 && off2(); };
  }, [scheduleSave]);

  const setKey = useCallback((key, value) => {
    setStore(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        [key]: typeof value === 'function' ? value(prev[key]) : value,
      };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // Imperative export / import surface used by Preferences buttons.
  // Same JSON shape as the Electron menu-bar flow, so files round-trip.
  const exportNow = useCallback(() => {
    const current = storeRef.current;
    if (!current) return;
    if (window.stickyAPI) {
      window.stickyAPI.exportFile(current).catch(err => console.warn('[export]', err));
    } else {
      downloadJSON('sticky-notes-export.json', current);
    }
  }, []);

  const importNow = useCallback(async () => {
    try {
      if (window.stickyAPI) {
        const res = await window.stickyAPI.importFile();
        if (res?.ok && res.data) {
          const next = withDefaults(res.data);
          setStore(next);
          scheduleSave(next);
        }
      } else {
        const data = await pickJSONFile();
        if (data) {
          const next = withDefaults(data);
          setStore(next);
          scheduleSave(next);
        }
      }
    } catch (err) { console.warn('[import]', err); }
  }, [scheduleSave]);

  /* ---------- In-memory undo/redo ---------- */
  // Snapshots capture only the user-content slices of the store. UI state
  // (tweaks, cwd, view, drawer, renamingFolder, etc.) is intentionally left
  // out so Ctrl+Z doesn't flip the theme or close the drawer.
  const UNDO_LIMIT = 20;
  const UNDO_KEYS = ['notes', 'folders', 'folderOrder', 'pins', 'links'];

  const pickSnapshot = (src) => {
    const out = {};
    for (const k of UNDO_KEYS) if (k in src) out[k] = src[k];
    return JSON.stringify(out);
  };

  // Record the CURRENT store onto the undo stack and clear the redo stack.
  // Call this BEFORE mutating state for a tracked user action (create note,
  // delete note, move to folder, delete folder, pin toggle). Exactly once
  // per user gesture — a batch op (e.g. multi-delete) is one snapshot.
  const takeSnapshot = useCallback(() => {
    const current = storeRef.current;
    if (!current) return;
    undoStackRef.current.push(pickSnapshot(current));
    if (undoStackRef.current.length > UNDO_LIMIT) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    const current = storeRef.current;
    if (!current) return;
    // Save current state onto the redo stack so redo can restore it.
    redoStackRef.current.push(pickSnapshot(current));
    if (redoStackRef.current.length > UNDO_LIMIT) {
      redoStackRef.current.shift();
    }
    const raw = undoStackRef.current.pop();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    setStore(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...parsed };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    const current = storeRef.current;
    if (!current) return;
    undoStackRef.current.push(pickSnapshot(current));
    if (undoStackRef.current.length > UNDO_LIMIT) {
      undoStackRef.current.shift();
    }
    const raw = redoStackRef.current.pop();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    setStore(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...parsed };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  return { store, setKey, exportNow, importNow, takeSnapshot, undo, redo };
}
function useTweakMode(setState) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    function onMsg(e) {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode') setActive(true);
      if (e.data.type === '__deactivate_edit_mode') setActive(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const update = (patch) => {
    setState(s => ({ ...s, ...patch }));
    window.parent.postMessage({type:'__edit_mode_set_keys', edits: patch}, '*');
  };
  return [active, update];
}
/* ---------- Update checker (Electron only) ----------
 * Once per day on launch, fetches the latest GitHub release tag and
 * compares to the running app's version. If newer (and the user hasn't
 * dismissed it), surfaces an UpdateBanner with a one-click download
 * link. Browser context is skipped — the hosted version always serves
 * the current code. */
function useUpdateCheck() {
  const [available, setAvailable] = useState(null);
  // In-app modal state replaces the previous native-dialog round-trip to
  // main. The native path renders as garbled glyphs inside snap confinement
  // (font/sandbox issue); an HTML modal sidesteps that and looks the same
  // everywhere.
  const [info, setInfo] = useState(null);   // { title, message, detail? }
  const isSnap = !!window.stickyAPI?.isSnap;
  const isFlatpak = !!window.stickyAPI?.isFlatpak;

  const runCheck = useCallback(async (force) => {
    if (!window.stickyAPI) return;
    const current = window.stickyAPI.appVersion || '0.0.0';
    const dismissed = (() => { try { return localStorage.getItem('stickies.dismissedUpdate') || ''; } catch { return ''; } })();
    if (!force) {
      const lastCheckRaw = (() => { try { return localStorage.getItem('stickies.lastUpdateCheck'); } catch { return null; } })();
      const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - lastCheck < ONE_DAY) return;
    }
    try {
      const res = await fetch('https://api.github.com/repos/faridjaff/StickyNotesCanvas/releases/latest', {
        headers: { 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) {
        if (force) setInfo({title:'Check for Updates', message:"Couldn't check for updates", detail:"Network error — make sure you're online."});
        return;
      }
      const json = await res.json();
      try { localStorage.setItem('stickies.lastUpdateCheck', String(Date.now())); } catch {}
      const tag = (json.tag_name || '').replace(/^v/, '');
      if (!tag) {
        if (force) setInfo({title:'Check for Updates', message:"Couldn't check for updates", detail:"The release feed didn't return a version tag."});
        return;
      }
      if (cmpSemver(tag, current) <= 0) {
        if (force) setInfo({title:'Check for Updates', message:"You're on the latest version", detail:`Version ${current}`});
        return;
      }
      // Snap users get auto-refresh handled by snapd. Don't bug them with
      // the download-link banner — that path 404s for them anyway. On
      // explicit force-check, surface a snap-friendly hint instead.
      if (isSnap) {
        if (force) setInfo({
          title: 'Update Available',
          message: `Version ${tag} is available`,
          detail: `Snap will auto-refresh within 24 hours, or run:\n\nsudo snap refresh sticky-notes-canvas`,
        });
        return;
      }
      // Flatpak users get updates via the software center. The .deb banner
      // doesn't apply. On explicit force-check, surface a flatpak-friendly
      // hint instead.
      if (isFlatpak) {
        if (force) setInfo({
          title: 'Update Available',
          message: `Version ${tag} is available`,
          detail: `Flatpak will auto-update via your software center, or run:\n\nflatpak update io.github.faridjaff.StickyNotesCanvas`,
        });
        return;
      }
      // On an explicit manual check, ignore a prior dismissal — the user
      // just asked, so give them the banner even if they said no to this
      // version last time.
      if (!force && tag === dismissed) return;
      setAvailable({ version: tag, url: downloadUrlForPlatform(tag) });
    } catch {
      if (force) setInfo({title:'Check for Updates', message:"Couldn't check for updates", detail:"Network error — make sure you're online."});
    }
  }, [isSnap, isFlatpak]);

  // Scheduled daily check skips entirely on snap (snapd handles refresh) or
  // flatpak (software center handles updates).
  useEffect(() => { if (!isSnap && !isFlatpak) runCheck(false); }, [runCheck, isSnap, isFlatpak]);

  // Help → Check for Updates… — fires regardless of channel.
  useEffect(() => {
    if (!window.stickyAPI?.onMenuCheckUpdates) return;
    return window.stickyAPI.onMenuCheckUpdates(() => runCheck(true));
  }, [runCheck]);

  // Help → About — show app info in the same in-app modal.
  useEffect(() => {
    if (!window.stickyAPI?.onMenuAbout) return;
    return window.stickyAPI.onMenuAbout(() => setInfo({
      title: 'About',
      message: `Sticky Notes ${window.stickyAPI.appVersion || ''}`.trim(),
      detail: `Source: https://github.com/faridjaff/StickyNotesCanvas`,
    }));
  }, []);

  const dismiss = useCallback(() => {
    if (available) {
      try { localStorage.setItem('stickies.dismissedUpdate', available.version); } catch {}
    }
    setAvailable(null);
  }, [available]);

  const closeInfo = useCallback(() => setInfo(null), []);

  return { available, dismiss, info, closeInfo };
}

Object.assign(window, { usePersistedState, useStickyStore, useTweakMode, useUpdateCheck });
