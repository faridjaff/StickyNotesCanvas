const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

function Loading() {
  return (
    <div style={{
      position:'fixed', inset:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'#14181d', color:'#8a9198',
      fontFamily:'Inter, system-ui, sans-serif', fontSize:14, letterSpacing:'.02em',
    }}>Loading…</div>
  );
}
function UpdateBanner({ info, onDismiss }) {
  const open = () => {
    if (window.stickyAPI && window.stickyAPI.openExternal) {
      window.stickyAPI.openExternal(info.url);
    } else {
      window.open(info.url, '_blank', 'noopener');
    }
  };
  return (
    <div style={{
      position:'fixed', top:8, left:'50%', transform:'translateX(-50%)',
      background:'#1f2937', color:'#fff', padding:'8px 12px 8px 14px',
      borderRadius:8, fontSize:13, zIndex:30000,
      display:'flex', gap:10, alignItems:'center',
      boxShadow:'0 6px 20px rgba(0,0,0,.25)',
      fontFamily:'Inter, system-ui, sans-serif',
    }}>
      <span>New version <b>v{info.version}</b> available</span>
      <button onClick={open} style={{
        background:'#3b82f6', color:'#fff', border:'none', padding:'5px 12px',
        borderRadius:4, cursor:'pointer', fontWeight:600, fontSize:12,
      }}>Download</button>
      <button onClick={onDismiss} aria-label="Dismiss" style={{
        background:'transparent', border:'none', color:'#cbd5e1', cursor:'pointer',
        fontSize:18, lineHeight:1, padding:'0 2px',
      }}>×</button>
    </div>
  );
}
/* ==================================================================== */
/* INFO DIALOG                                                           */
/* ==================================================================== */
// In-app modal for short informational popups (Help → About, Help → Check
// for Updates result). Replaces the previous native dialog.showMessageBox
// path because native dialogs render as garbled glyphs inside snap
// confinement (font/sandbox issue). HTML modal works the same in every
// build channel and matches the app's aesthetic.
function InfoDialog({ info, onClose }) {
  useEffect(() => {
    if (!info) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [info, onClose]);

  if (!info) return null;
  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(20,20,18,.5)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:30000,
    }}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        background:'#fbf7ef', color:'#2a241a',
        border:'1px solid #d8cfbc', borderRadius:8,
        boxShadow:'0 10px 40px rgba(0,0,0,.25)',
        padding:'20px 24px', minWidth:320, maxWidth:480,
        fontFamily:'Inter, system-ui, sans-serif',
      }}>
        {info.title && (
          <div style={{
            fontSize:11, fontWeight:600, color:'#7a6f5b',
            marginBottom:8, textTransform:'uppercase', letterSpacing:.5,
          }}>{info.title}</div>
        )}
        <div style={{fontSize:15, fontWeight:600, marginBottom:info.detail?12:18}}>
          {info.message}
        </div>
        {info.detail && (
          <div style={{
            fontSize:13, color:'#5a4a3a', whiteSpace:'pre-wrap',
            marginBottom:18, lineHeight:1.5,
          }}>{info.detail}</div>
        )}
        <div style={{display:'flex', justifyContent:'flex-end'}}>
          <button onClick={onClose} autoFocus style={{
            background:'#d97757', color:'#fff', border:'none', borderRadius:6,
            padding:'8px 18px', fontSize:13, fontWeight:600, cursor:'pointer',
          }}>OK</button>
        </div>
      </div>
    </div>
  );
}
/* ==================================================================== */
/* MOBILE DEMO BANNER                                                    */
/* ==================================================================== */
// A thin "web demo — download the native app" strip that only shows on
// narrow viewports (phones). Hidden entirely in the Electron desktop build
// (stickyAPI is the bridge exposed by preload.js), and dismissible per
// session with the close state persisted to localStorage so it stays
// dismissed across reloads.
const MOBILE_BANNER_DISMISSED_KEY = 'stickies.mobileBannerDismissed';
const MOBILE_BANNER_MAX_WIDTH = 640;

function MobileDemoBanner() {
  // Electron build: never show. The preload script exposes window.stickyAPI,
  // which is the same signal the rest of the app uses to gate desktop-only
  // behavior (see the browser/Electron branching in useStickyStore).
  if (typeof window !== 'undefined' && window.stickyAPI) return null;

  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BANNER_MAX_WIDTH
  );
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(MOBILE_BANNER_DISMISSED_KEY) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= MOBILE_BANNER_MAX_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!narrow || dismissed) return null;

  const onDismiss = () => {
    try { localStorage.setItem(MOBILE_BANNER_DISMISSED_KEY, '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div style={{
      flex:'0 0 auto', height:38, width:'100%',
      display:'flex', alignItems:'center', gap:10,
      padding:'0 12px',
      // Warm, slightly darker than the paper wallpaper so it reads as a
      // system notice without fighting the app's aesthetic.
      background:'#ede4d1', color:'#3a2f1a',
      borderBottom:'1px solid #d8cfbc',
      fontFamily:'Inter, system-ui, sans-serif', fontSize:12,
      zIndex:20001,
    }}>
      <span style={{flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
        Web demo — full app runs natively on Linux &amp; Mac
      </span>
      <a
        href="https://github.com/faridjaff/StickyNotesCanvas/releases"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color:'#d97757', fontWeight:600, textDecoration:'none',
          whiteSpace:'nowrap',
        }}
      >
        Download →
      </a>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background:'transparent', border:'none', color:'#7a6f5b',
          cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 4px',
        }}
      >×</button>
    </div>
  );
}
/* ==================================================================== */
/* TOP CHROME                                                            */
/* ==================================================================== */
function TopChrome({T, tweaks, currentFolderName, query, setQuery, onNewNote, onNewFolder, onExport, onImport}) {
  const isTerm = tweaks.theme==='terminal';
  const [backupOpen, setBackupOpen] = useState(false);

  // Narrow-viewport detection, used to hide the "Sticky Notes" wordmark on
  // phones where vertical room is scarce. Tracks resizes so rotating the
  // device (or opening devtools on desktop) toggles the wordmark back.
  // Follows the same pattern and threshold as MobileDemoBanner.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && !window.stickyAPI
      && window.innerWidth <= MOBILE_BANNER_MAX_WIDTH
  );
  useEffect(() => {
    if (typeof window === 'undefined' || window.stickyAPI) return;
    const onResize = () => setNarrow(window.innerWidth <= MOBILE_BANNER_MAX_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!backupOpen) return;
    const close = (e) => {
      if (e.target.closest('[data-backup-menu]')) return;
      setBackupOpen(false);
    };
    const id = setTimeout(() => window.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(id); window.removeEventListener('mousedown', close); };
  }, [backupOpen]);

  return (
    <div style={{
      height:54, background:T.panelBg, borderBottom:`1px solid ${T.panelBorder}`,
      display:'flex', alignItems:'center', gap:12, padding:'0 14px', position:'relative', zIndex:20000,
      color:T.panelText,
    }}>
      <AppGlyph T={T} isTerm={isTerm}/>
      <div style={{fontWeight:600, fontSize:14, letterSpacing:isTerm?0.5:0, display: narrow?'none':undefined}}>
        {isTerm ? 'stickies' : 'Sticky Notes'}
      </div>

      <div style={{width:1, height:22, background:T.panelBorder, margin:'0 8px', display: narrow?'none':undefined}}/>

      <div style={{fontSize:13, color:T.panelText, opacity:.85, fontWeight:500}}>
        {currentFolderName}
      </div>

      <div style={{flex:1}}/>

      <div style={{position:'relative'}}>
        <input id="qs"
          value={query} onChange={e=>setQuery(e.target.value)}
          placeholder={isTerm?'grep…':'Search notes'}
          style={{
            width:220, height:30, borderRadius: isTerm?2:8, border:`1px solid ${T.panelBorder}`,
            background: isTerm?'#0e1319':'rgba(0,0,0,.03)', color:T.panelText,
            padding:'0 12px 0 30px', fontSize:13, outline:'none',
            fontFamily: isTerm?T.bodyFont:'inherit',
          }}/>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{position:'absolute', left:10, top:8, opacity:.5}}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      <div data-backup-menu style={{position:'relative', display: narrow?'none':undefined}}>
        <button onClick={()=>setBackupOpen(o=>!o)} title="Export or import notes" style={{
          height:30, padding:'0 12px', borderRadius: isTerm?2:8,
          background:'#000', color:'#fff', border:`1px solid ${T.panelBorder}`,
          fontWeight:500, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6,
        }}>
          {isTerm?'backup':'Backup'} <span style={{fontSize:9, opacity:.7, marginTop:1}}>▾</span>
        </button>
        {backupOpen && (
          <div data-backup-menu style={{
            position:'absolute', top:36, right:0, minWidth:160, zIndex:30000,
            background:T.panelBg, border:`1px solid ${T.panelBorder}`,
            borderRadius: isTerm?2:8, boxShadow:'0 8px 22px rgba(0,0,0,.15)',
            padding:4, fontFamily:'inherit',
          }}>
            <button onClick={()=>{setBackupOpen(false); onExport && onExport();}} style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'8px 10px', background:'transparent', border:'none',
              color:T.panelText, fontSize:13, cursor:'pointer', borderRadius: isTerm?2:6,
            }} onMouseEnter={e=>e.currentTarget.style.background=`${withA(T.panelText,.06)}`}
               onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              Export Notes…
            </button>
            <button onClick={()=>{setBackupOpen(false); onImport && onImport();}} style={{
              display:'block', width:'100%', textAlign:'left',
              padding:'8px 10px', background:'transparent', border:'none',
              color:T.panelText, fontSize:13, cursor:'pointer', borderRadius: isTerm?2:6,
            }} onMouseEnter={e=>e.currentTarget.style.background=`${withA(T.panelText,.06)}`}
               onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              Import Notes…
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
function AppGlyph({T, isTerm}) {
  if (isTerm) return <div style={{width:22,height:22, background:'#0e1319', color:T.accent, border:`1px solid ${T.panelBorder}`,
    display:'grid', placeItems:'center', fontFamily:T.bodyFont, fontSize:12, fontWeight:700, marginLeft:4}}>_</div>;
  return <div style={{position:'relative', width:22, height:22, marginLeft:4}}>
    <div style={{position:'absolute', inset:0, background:'#fde8a1', borderRadius:4, transform:'rotate(-6deg)', boxShadow:'0 2px 4px rgba(0,0,0,.1)'}}/>
    <div style={{position:'absolute', inset:0, background:'#b6dbf5', borderRadius:4, transform:'rotate(5deg) translate(4px,1px)', boxShadow:'0 2px 4px rgba(0,0,0,.1)'}}/>
  </div>;
}

function FolderIcon({size=14, color="#000", open=false, fill=null}) {
  if (open) return (
    <svg width={size*1.2} height={size} viewBox="0 0 24 20" fill="none">
      <path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v2H2V5z" fill={fill||color} opacity={fill?1:.2} stroke={color} strokeWidth="1.5"/>
      <path d="M2 9h20l-2 9a2 2 0 0 1-2 1.5H4a2 2 0 0 1-2-1.5L2 9z" fill={fill||color} opacity={fill?.85:.35} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
  return (
    <svg width={size*1.2} height={size} viewBox="0 0 24 20" fill="none">
      <path d="M2 5a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" fill={fill||color} opacity={fill?1:.2} stroke={color} strokeWidth="1.5"/>
    </svg>
  );
}

function HomeIcon({size=14, color="#000"}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M3 11l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V11z"/>
  </svg>;
}
/* ==================================================================== */
/* FOLDER TREE (sidebar)                                                 */
/* ==================================================================== */
function FolderTree({T, folders, notes, currentFolder, setCurrentFolder,
  onCreateFolder, onRename, onDelete, renamingFolder, setRenamingFolder, onDropNoteOnFolder}) {

  // Flat list: root first (as "All notes"), then all real folders alpha
  const flatList = useMemo(() => {
    const real = Object.values(folders).filter(f => f.id !== 'root').sort((a,b)=>a.name.localeCompare(b.name));
    return real;
  }, [folders]);

  const Row = ({f, isAll}) => {
    const isActive = currentFolder===f.id;
    const [over, setOver] = useState(false);
    const count = isAll ? notes.length : notes.filter(n=>n.folder===f.id).length;

    return (
      <div
        onDragOver={e=>{e.preventDefault(); setOver(true);}}
        onDragLeave={()=>setOver(false)}
        onDrop={(e)=>{
          setOver(false);
          const nid = e.dataTransfer.getData('note-id');
          if (nid && !isAll) onDropNoteOnFolder(nid, f.id);
        }}
        onClick={()=>setCurrentFolder(f.id)}
        onDoubleClick={()=>!isAll && setRenamingFolder(f.id)}
        style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'7px 10px',
          borderRadius:6,
          background: isActive ? withA(isAll?T.accent:f.hue, .18) : over ? withA(T.accent, .18) : 'transparent',
          color: T.panelText, fontSize:13, cursor:'pointer', marginBottom:2,
          outline: over ? `1px dashed ${T.accent}` : 'none',
        }}>
        {isAll
          ? <HomeIcon size={14} color={T.panelText}/>
          : <FolderIcon size={14} color={f.hue} fill={f.hue} open={isActive}/>}
        {(!isAll && renamingFolder===f.id) ? (
          <input autoFocus defaultValue={f.name}
            onClick={e=>e.stopPropagation()}
            onBlur={e=>{ onRename(f.id, e.target.value||f.name); setRenamingFolder(null); }}
            onKeyDown={e=>{ if(e.key==='Enter'){onRename(f.id, e.target.value||f.name); setRenamingFolder(null);} if(e.key==='Escape'){setRenamingFolder(null);}}}
            style={{flex:1, background:'transparent', border:'none', outline:'none', color:T.panelText, fontSize:13, font:'inherit', fontWeight: isActive?600:500}}
          />
        ) : (
          <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive?600:500}}>
            {isAll ? 'All notes' : f.name}
          </span>
        )}
        <span style={{fontSize:11, color:T.muted, fontVariantNumeric:'tabular-nums'}}>
          {count}
        </span>
      </div>
    );
  };

  return (
    <div style={{
      position:'absolute', left:0, top:54, bottom:28, width:220,
      background:T.panelBg, borderRight:`1px solid ${T.panelBorder}`,
      padding:'12px 10px', zIndex:15000, overflow:'auto', color:T.panelText,
    }}>
      <Row f={{id:'root', name:'All notes'}} isAll/>

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'16px 10px 8px', display:'flex', alignItems:'center'}}>
        Folders <div style={{flex:1}}/>
        <button onClick={()=>onCreateFolder()} title="New folder" style={{
          background:'transparent', border:'none', cursor:'pointer', color:T.panelText, opacity:.6,
          fontSize:16, padding:0, lineHeight:1,
        }}>＋</button>
      </div>
      {flatList.map(f => <Row key={f.id} f={f}/>)}

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'18px 10px 8px'}}>Shortcuts</div>
      <KeyHint T={T} keys={['N']} label="New note"/>
      <KeyHint T={T} keys={['⌘','F']} label="Search"/>
      <KeyHint T={T} keys={['Esc']} label="Deselect"/>
      <KeyHint T={T} keys={['Drag']} label="Move note to folder"/>

      <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.5, padding:'18px 10px 8px'}}>Stats</div>
      <div style={{padding:'0 10px', fontSize:12, color:T.muted, lineHeight:1.7}}>
        <div>{notes.length} notes · {flatList.length} folders</div>
        <div>{notes.filter(n=>n.pinned).length} pinned</div>
      </div>
    </div>
  );
}

function KeyHint({T, keys, label}) {
  return <div style={{display:'flex', alignItems:'center', gap:8, padding:'5px 10px', fontSize:12, color:T.muted}}>
    <div style={{display:'flex', gap:3}}>
      {keys.map(k => <kbd key={k} style={{
        fontFamily:'ui-monospace, monospace', fontSize:10, padding:'2px 5px',
        background:'rgba(0,0,0,.05)', border:`1px solid ${T.panelBorder}`, borderRadius:3, color:T.panelText,
      }}>{k}</kbd>)}
    </div>
    <span>{label}</span>
  </div>;
}
/* ==================================================================== */
/* DESKTOP (canvas with folder tiles + sticky notes)                     */
/* ==================================================================== */
function Desktop({T, tweaks, currentFolder, folders, notes, allNotes, noteRefs, linkLines,
  links, addLink, removeLink, linksFor,
  updateNote, bringToFront, bringGroupToFront, focusNote, onDeleteNote, selectedIds, setSelectedIds, setNotes,
  jumpToNote, moveNoteToFolder, moveNotesToFolder, onCreateNote, onCopyNotes,
  view, setView, drawerOpen, takeSnapshot}) {

  const [deskMenu, setDeskMenu] = useState(null);
  const [linkMenu, setLinkMenu] = useState(null);
  const [linkingFrom, setLinkingFrom] = useState(null); // note id when drawing a new link
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [pinching, setPinching] = useState(false);
  const [marquee, setMarquee] = useState(null); // {startX, startY, curX, curY, shift} in world coords
  const panRef = useRef(null);
  const pinchRef = useRef(null);
  const deskRef = useRef(null);

  // Narrow-viewport detection for touch-pan on the canvas. Matches the
  // threshold used by MobileDemoBanner and the other mobile gates so that
  // Electron and desktop browsers are never affected.
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && !window.stickyAPI
      && window.innerWidth <= MOBILE_BANNER_MAX_WIDTH
  );
  useEffect(() => {
    if (typeof window === 'undefined' || window.stickyAPI) return;
    const onResize = () => setNarrow(window.innerWidth <= MOBILE_BANNER_MAX_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // space bar toggles pan mode
  useEffect(() => {
    const down = (e) => {
      if (e.code==='Space' && !e.repeat && !e.target.matches('input, textarea, [contenteditable]')) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e) => { if (e.code==='Space') setSpaceHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // convert screen coords (relative to desk) → world coords
  const toWorld = (sx, sy) => ({
    x: (sx - view.x) / view.z,
    y: (sy - view.y) / view.z,
  });

  const onWheel = (e) => {
    // Zoom is gated on Ctrl/Cmd+wheel only. Plain wheel passes through so
    // long note bodies (with overflow scroll) and the folders drawer can
    // scroll naturally instead of unexpectedly zooming the canvas. The
    // global wheel guard at the top of AppInner already preventDefaults
    // Ctrl/Cmd+wheel so the host browser's page-zoom doesn't fire.
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.target.matches('textarea, input, [contenteditable="true"]')) return;
    e.preventDefault();
    const rect = deskRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Halved rate compared to the previous default (was 0.01) — single
    // mouse-wheel notches felt too aggressive, jumping multiple zoom levels.
    // Trackpad pinch (Ctrl+wheel synthesised) still feels responsive; mouse
    // wheels now step by a more controllable amount per notch.
    const factor = Math.exp(-e.deltaY * 0.005);
    setView(v => {
      const nz = Math.max(0.25, Math.min(3, v.z * factor));
      const ratio = nz / v.z;
      return { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, z: nz };
    });
  };

  const onMouseDown = (e) => {
    // Space+drag OR middle mouse = pan
    if (spaceHeld || e.button===1) {
      e.preventDefault();
      setPanning(true);
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return;
    }
    // Plain left-drag on empty canvas = marquee selection
    if (e.button === 0 && (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid')) {
      e.preventDefault();
      const rect = deskRef.current.getBoundingClientRect();
      const wx = (e.clientX - rect.left - view.x) / view.z;
      const wy = (e.clientY - rect.top  - view.y) / view.z;
      setMarquee({ startX: wx, startY: wy, curX: wx, curY: wy, additive: e.ctrlKey || e.metaKey });
    }
  };

  // Mobile-only: single-finger drag on the canvas background pans the view.
  // Gated on narrow viewport (MOBILE_BANNER_MAX_WIDTH) so desktop browsers
  // and Electron are entirely unaffected. Mirrors the "empty-canvas" target
  // filter used by the mouse marquee branch so a touch that lands on a
  // sticky note is passed through untouched (the note's own drag logic
  // owns that gesture). Strictly additive to onMouseDown.
  //
  // Two-finger pinch is handled in a parallel branch below. Pan and pinch
  // are mutually exclusive: pan only starts on exactly 1 finger, pinch only
  // starts on exactly 2. When pinch is active, the pan-touchmove effect
  // short-circuits (panning is false), and vice versa.
  const onTouchStart = (e) => {
    if (!narrow) return;
    if (!(e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid')) return;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      setPanning(true);
      panRef.current = { sx: t.clientX, sy: t.clientY, vx: view.x, vy: view.y };
      return;
    }
    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      const d0 = Math.hypot(dx, dy);
      if (d0 === 0) return;
      const rect = deskRef.current.getBoundingClientRect();
      // midpoint in screen (desk-relative) coords at pinch start
      const mx0 = ((t0.clientX + t1.clientX) / 2) - rect.left;
      const my0 = ((t0.clientY + t1.clientY) / 2) - rect.top;
      pinchRef.current = { d0, z0: view.z, vx0: view.x, vy0: view.y, mx0, my0 };
      setPinching(true);
      // If a 1-finger pan was in progress (user dropped a second finger
      // mid-drag), cancel it so the pan touchmove handler doesn't fight
      // the pinch handler. The user can start a fresh pan after lifting
      // both fingers.
      if (panning) {
        setPanning(false);
        panRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!panning) return;
    const move = (e) => {
      const p = panRef.current; if (!p) return;
      setView(v => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }));
    };
    const up = () => { setPanning(false); panRef.current = null; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [panning]);

  // Touch equivalent of the mouse pan effect above. Registered with
  // {passive: false} so preventDefault in touchmove reliably suppresses
  // the browser's default scroll/zoom gesture while the user is panning.
  // Both this and the mouse effect attach while `panning` is true; they
  // listen for disjoint event types (touchmove/end vs mousemove/up) so
  // they don't fight each other regardless of which input started the pan.
  useEffect(() => {
    if (!panning) return;
    const move = (e) => {
      const p = panRef.current; if (!p) return;
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();
      const t = e.touches[0];
      setView(v => ({ ...v, x: p.vx + (t.clientX - p.sx), y: p.vy + (t.clientY - p.sy) }));
    };
    const end = () => { setPanning(false); panRef.current = null; };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchmove', move, { passive: false });
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [panning]);

  // Mobile-only: two-finger pinch-to-zoom on the canvas. Mirrors the pan
  // effect's structure (window-scoped {passive:false} listeners for the
  // duration of the gesture) but operates on pinchRef instead of panRef.
  // Zoom is anchored at the pinch midpoint so the world point beneath the
  // midpoint stays put, matching the wheel-zoom feel. When the finger count
  // drops below 2 the gesture ends; we do not transition into a pan — a
  // fresh touchstart is required for that.
  useEffect(() => {
    if (!pinching) return;
    const move = (e) => {
      const p = pinchRef.current; if (!p) return;
      if (!e.touches || e.touches.length < 2) return;
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dx = t1.clientX - t0.clientX;
      const dy = t1.clientY - t0.clientY;
      const d = Math.hypot(dx, dy);
      if (d === 0) return;
      // Same clamp range as onWheel (0.25 .. 3).
      const nz = Math.max(0.25, Math.min(3, p.z0 * (d / p.d0)));
      const ratio = nz / p.z0;
      // Midpoint-preserving pan: algebraically identical to the wheel-zoom
      // formula x' = mx - (mx - v.x) * ratio, but anchored at the pinch-start
      // midpoint (mx0, my0) and applied against the pinch-start view offset
      // (vx0, vy0) so the midpoint's world coordinate stays fixed under the
      // midpoint's screen coordinate for the whole gesture.
      setView(() => ({
        x: p.mx0 - (p.mx0 - p.vx0) * ratio,
        y: p.my0 - (p.my0 - p.vy0) * ratio,
        z: nz,
      }));
    };
    const end = (e) => {
      // End as soon as fewer than 2 fingers remain. Do NOT promote the
      // remaining finger into a pan — a new touchstart is required.
      if (e.touches && e.touches.length >= 2) return;
      setPinching(false);
      pinchRef.current = null;
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchmove', move, { passive: false });
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [pinching]);

  // Marquee drag: while active, track pointer in world coords; on release, resolve selection.
  useEffect(() => {
    if (!marquee) return;
    const rect = deskRef.current.getBoundingClientRect();
    const move = (e) => {
      const wx = (e.clientX - rect.left - view.x) / view.z;
      const wy = (e.clientY - rect.top  - view.y) / view.z;
      setMarquee(m => m ? { ...m, curX: wx, curY: wy } : m);
    };
    const up = () => {
      setMarquee(m => {
        if (!m) return null;
        const dragged = Math.hypot(m.curX - m.startX, m.curY - m.startY) > 3;
        if (!dragged) {
          // Treat as plain click on empty canvas: clear selection (unless Ctrl/Cmd).
          if (!m.additive) setSelectedIds(new Set());
          return null;
        }
        const x1 = Math.min(m.startX, m.curX);
        const y1 = Math.min(m.startY, m.curY);
        const x2 = Math.max(m.startX, m.curX);
        const y2 = Math.max(m.startY, m.curY);
        const base = m.additive ? new Set(selectedIds) : new Set();
        notes.forEach(n => {
          if (n.x < x2 && n.x + n.w > x1 && n.y < y2 && n.y + n.h > y1) {
            if (m.additive && base.has(n.id)) base.delete(n.id); else base.add(n.id);
          }
        });
        setSelectedIds(base);
        return null;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [marquee, view.x, view.y, view.z, notes, selectedIds, setSelectedIds]);

  const resetView = () => setView({x:0, y:0, z:1});
  const zoomTo = (factor) => {
    const rect = deskRef.current.getBoundingClientRect();
    const mx = rect.width/2, my = rect.height/2;
    setView(v => {
      const nz = Math.max(0.25, Math.min(3, v.z * factor));
      const ratio = nz / v.z;
      return { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, z: nz };
    });
  };
  const fitToNotes = () => {
    if (!notes.length) { resetView(); return; }
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    notes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    const rect = deskRef.current.getBoundingClientRect();
    // Reserve space for the folders drawer (if open) so notes don't end up under it
    // Reserve space for the folders drawer (if open) so notes don't end up
    // under it. drawerOpen comes from the hoisted store state in the parent.
    const rightReserve = drawerOpen ? 320 : 0; // 300 width + 10 margin + gap
    const pad = 80;
    const availW = rect.width - rightReserve - pad*2;
    const availH = rect.height - pad*2;
    const bw = maxX - minX, bh = maxY - minY;
    const sx = availW / bw;
    const sy = availH / bh;
    const nz = Math.max(0.25, Math.min(1.5, Math.min(sx, sy)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Center within the available (non-drawer) area
    const availCenterX = (rect.width - rightReserve) / 2;
    const availCenterY = rect.height / 2;
    setView({
      x: availCenterX - cx*nz,
      y: availCenterY - cy*nz,
      z: nz,
    });
  };

  // Escape cancels link-drawing. Kept in its own effect so the listener
  // isn't torn down on every mousemove (which replaces linkingFrom).
  useEffect(() => {
    if (!linkingFrom) return;
    const onKey = (e) => { if (e.key === 'Escape') setLinkingFrom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!linkingFrom]);

  // While in "linking" mode, track cursor and click-to-connect.
  useEffect(() => {
    if (!linkingFrom) return;
    // Ignore clicks that happen within the same tick as starting the mode
    // (so the button-click that initiated linking doesn't immediately cancel it)
    let armed = false;
    const armTimer = setTimeout(() => { armed = true; }, 50);
    const onMove = (e) => {
      const rect = deskRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const world = { x:(sx-view.x)/view.z, y:(sy-view.y)/view.z };
      setLinkingFrom(lf => lf ? { ...lf, x:world.x, y:world.y } : lf);
    };
    const onClick = (e) => {
      if (!armed) return;
      const noteEl = e.target.closest('[data-note-id]');
      if (noteEl) {
        const toId = noteEl.getAttribute('data-note-id');
        if (toId && toId !== linkingFrom.id) { addLink(linkingFrom.id, toId); }
      }
      setLinkingFrom(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick, true);
    return () => {
      clearTimeout(armTimer);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick, true);
    };
  }, [linkingFrom, view.x, view.y, view.z, addLink]);

  const cursor = panning ? 'grabbing' : (spaceHeld ? 'grab' : (linkingFrom ? 'crosshair' : 'default'));

  return (
    <>
    {linkingFrom && (
      <div style={{
        position:'absolute', top:64, left:'50%', transform:'translateX(-50%)',
        background:T.panelBg, color:T.panelText, padding:'8px 16px',
        borderRadius:8, border:`1px solid ${T.panelBorder}`,
        fontSize:12, fontWeight:500, zIndex:25000,
        boxShadow:'0 4px 16px rgba(0,0,0,.18)',
        userSelect:'none', pointerEvents:'none',
        display:'flex', alignItems:'center', gap:10,
      }}>
        <span>Click another note to link</span>
        <span style={{opacity:.5}}>·</span>
        <kbd style={{
          fontFamily:'ui-monospace, monospace', fontSize:11, padding:'2px 6px',
          background:'rgba(0,0,0,.06)', border:`1px solid ${T.panelBorder}`, borderRadius:4,
        }}>Esc</kbd>
        <span>to cancel</span>
      </div>
    )}
    <div id="desk" ref={deskRef}
      onContextMenu={(e)=>{ if (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid') { e.preventDefault(); setDeskMenu({x:e.clientX, y:e.clientY}); }}}
      onClick={(e)=>{ if (e.target.id==='desk' || e.target.id==='desk-inner' || e.target.id==='desk-grid') setDeskMenu(null); }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{position:'absolute', left:0, right:0, top:54, bottom:28, overflow:'hidden', cursor, userSelect: panning?'none':'auto', touchAction: narrow?'none':undefined}}>

      {/* faint grid — lives in screen space, scales with zoom */}
      <div id="desk-grid" style={{
        position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:`radial-gradient(${withA(T.panelText,.07)} 1px, transparent 1px)`,
        backgroundSize:`${24*view.z}px ${24*view.z}px`,
        backgroundPosition:`${view.x}px ${view.y}px`,
        opacity: tweaks.theme==='terminal'?.3:.5,
      }}/>

      <div id="desk-inner" style={{
        position:'absolute', inset:0,
        transform:`translate(${view.x}px, ${view.y}px) scale(${view.z})`,
        transformOrigin:'0 0',
        pointerEvents: panning ? 'none' : 'auto',
      }}>

          {/* Link layer */}
          {tweaks.showLinks && (
            <svg style={{position:'absolute', left:0, top:0, pointerEvents:'none', width:4000, height:4000, overflow:'visible', zIndex:1}}>
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={T.accent}/>
                </marker>
              </defs>
              {linkLines.map(l => {
                const x1 = l.x1, y1 = l.y1, x2 = l.x2, y2 = l.y2;
                const mx = (x1+x2)/2, my = (y1+y2)/2;
                return (
                  <g key={l.id} style={{pointerEvents:'auto', cursor:'pointer'}}
                    onClick={(e)=>{ e.stopPropagation(); setLinkMenu({id:l.id, fromId:l.fromId, toId:l.toId, sx:e.clientX, sy:e.clientY}); }}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"/>
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={T.accent} strokeOpacity=".65" strokeWidth="1.75" strokeDasharray="5 4" markerEnd="url(#arr)"/>
                    <circle cx={mx} cy={my} r="5" fill={T.panelBg} stroke={T.accent} strokeWidth="1.5"/>
                  </g>
                );
              })}
              {linkingFrom && (() => {
                const src = allNotes.find(n => n.id===linkingFrom.id);
                if (!src) return null;
                return (
                  <line x1={src.x+src.w/2} y1={src.y+src.h/2}
                    x2={linkingFrom.x} y2={linkingFrom.y}
                    stroke={T.accent} strokeOpacity=".8" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#arr)"/>
                );
              })()}
            </svg>
          )}

        {/* Marquee selection rectangle (world coords) */}
        {marquee && Math.hypot(marquee.curX - marquee.startX, marquee.curY - marquee.startY) > 3 && (
          <div style={{
            position:'absolute', pointerEvents:'none', zIndex:5000,
            left:   Math.min(marquee.startX, marquee.curX),
            top:    Math.min(marquee.startY, marquee.curY),
            width:  Math.abs(marquee.curX - marquee.startX),
            height: Math.abs(marquee.curY - marquee.startY),
            background: withA(T.accent, 0.10),
            border: `1px solid ${T.accent}`,
            borderRadius: 2,
          }}/>
        )}

        {/* Sticky notes */}
        {notes.map(n => (
          <StickyNote key={n.id} note={n} T={T} tweaks={tweaks} folder={folders[n.folder]}
            refCb={(el)=>{ noteRefs.current[n.id] = el; }}
            selected={selectedIds.has(n.id)}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            setNotes={setNotes}
            bringGroupToFront={bringGroupToFront}
            onFocus={(e)=>{
              if (e && (e.ctrlKey || e.metaKey)) {
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id); else next.add(n.id);
                  return next;
                });
                bringToFront(n.id);
              } else if (!selectedIds.has(n.id)) {
                focusNote(n.id);
              } else {
                bringToFront(n.id); // already part of selection — don't collapse it
              }
            }}
            onChange={(patch)=>updateNote(n.id, patch)}
            onTogglePin={()=>{ takeSnapshot && takeSnapshot(); updateNote(n.id, {pinned: !n.pinned}); }}
            onDelete={()=>onDeleteNote(n.id)}
            onLinkClick={jumpToNote}
            childFolders={Object.values(folders).filter(f=>f.id!==n.folder && f.id!=='root')}
            onMoveToFolder={(fid)=>moveNoteToFolder(n.id, fid)}
            zoom={view.z}
            allNotes={allNotes}
            linksFor={linksFor}
            onMoveNotesToFolder={moveNotesToFolder}
            onCopy={()=>onCopyNotes && onCopyNotes(n.id)}
            onAddLink={(toId)=>addLink(n.id, toId)}
            onStartLink={()=>setLinkingFrom({id:n.id, x:n.x+n.w/2, y:n.y+n.h/2})}
            onJumpToNote={jumpToNote}
          />
        ))}
      </div>

      {/* Empty state — in screen space, not transformed */}
      {notes.length===0 && (
        <EmptyState T={T} folderName={folders[currentFolder]?.name || 'All notes'} isRoot={currentFolder==='root'}/>
      )}

      {/* zoom controls */}
      <div style={{
        position:'absolute', left:16, bottom:16, display:'flex', alignItems:'center', gap:2,
        background:T.panelBg, border:`1px solid ${T.panelBorder}`,
        borderRadius: tweaks.theme==='terminal'?2:8, padding:3,
        boxShadow:'0 2px 8px rgba(0,0,0,.08)', zIndex:500,
        fontFamily: tweaks.font+', system-ui, sans-serif',
      }}>
        <button onClick={()=>zoomTo(1/1.2)} title="Zoom out" style={zBtn(T)}>−</button>
        <button onClick={resetView} title="Reset view (press 0)" style={{
          ...zBtn(T), width:'auto', padding:'0 10px', fontSize:11, fontVariantNumeric:'tabular-nums', fontWeight:600,
        }}>{Math.round(view.z*100)}%</button>
        <button onClick={()=>zoomTo(1.2)} title="Zoom in" style={zBtn(T)}>+</button>
        <div style={{width:1, height:20, background:T.hairline, margin:'0 3px'}}/>
        <button onClick={fitToNotes} title="Fit all notes to view" style={{...zBtn(T), width:'auto', padding:'0 8px', fontSize:11}}>fit</button>
      </div>

      {/* space-held indicator */}
      {spaceHeld && !panning && (
        <div style={{
          position:'absolute', left:'50%', bottom:16, transform:'translateX(-50%)',
          background:T.panelText, color:T.panelBg, padding:'6px 14px',
          borderRadius: tweaks.theme==='terminal'?2:999, fontSize:12, fontWeight:600, letterSpacing:.3,
          boxShadow:'0 4px 12px rgba(0,0,0,.2)', pointerEvents:'none', zIndex:500,
          fontFamily: tweaks.font+', system-ui, sans-serif',
        }}>✋ drag to pan</div>
      )}

      {deskMenu && (() => {
        const rect = deskRef.current.getBoundingClientRect();
        const sx = deskMenu.x - rect.left;
        const sy = deskMenu.y - rect.top;
        const world = toWorld(sx, sy);
        return (
          <ContextMenu T={T} x={sx} y={sy} onClose={()=>setDeskMenu(null)}
            items={[
              {label:'New note here', onClick:()=>{ onCreateNote(world.x, world.y); setDeskMenu(null); }},
              {label:'Reset view', onClick:()=>{ resetView(); setDeskMenu(null); }},
            ]}/>
        );
      })()}

      {linkMenu && (() => {
        const rect = deskRef.current.getBoundingClientRect();
        const from = allNotes.find(n=>n.id===linkMenu.fromId);
        const to = allNotes.find(n=>n.id===linkMenu.toId);
        return (
          <ContextMenu T={T} x={linkMenu.sx-rect.left} y={linkMenu.sy-rect.top}
            onClose={()=>setLinkMenu(null)}
            items={[
              {label: `→ Jump to "${to?.title || 'target'}"`, onClick:()=>{ jumpToNote(linkMenu.toId); setLinkMenu(null); }},
              {label: `← Jump to "${from?.title || 'source'}"`, onClick:()=>{ jumpToNote(linkMenu.fromId); setLinkMenu(null); }},
              {separator:true, divider:true},
              {label: 'Delete link', destructive:true, onClick:()=>{ removeLink(linkMenu.id); setLinkMenu(null); }},
            ]}/>
        );
      })()}

      {/* linking banner */}
      {linkingFrom && (
        <div style={{
          position:'absolute', left:'50%', top:16, transform:'translateX(-50%)',
          background:T.accent, color: tweaks.theme==='terminal'?'#0a0c10':'#fff', padding:'7px 14px',
          borderRadius: tweaks.theme==='terminal'?2:999, fontSize:12, fontWeight:700, letterSpacing:.3,
          boxShadow:'0 4px 12px rgba(0,0,0,.2)', pointerEvents:'none', zIndex:500,
          fontFamily: tweaks.font+', system-ui, sans-serif',
        }}>🔗 click a note to link · esc to cancel</div>
      )}
    </div>
    </>
  );
}
const zBtn = (T) => ({
  width:28, height:28, display:'grid', placeItems:'center',
  background:'transparent', color:T.panelText, border:'none', cursor:'pointer',
  fontSize:16, lineHeight:1, padding:0, borderRadius:4,
});
function EmptyState({T, folderName, isRoot}) {
  return (
    <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center', pointerEvents:'none'}}>
      <div style={{textAlign:'center', color:T.muted, maxWidth:340}}>
        <div style={{fontSize:48, marginBottom:12, opacity:.6}}>
          {isRoot ? '🏠' : '📂'}
        </div>
        <div style={{fontSize:15, fontWeight:600, color:T.panelText, marginBottom:6}}>
          {isRoot ? 'Your desktop is empty' : `"${folderName}" is empty`}
        </div>
        <div style={{fontSize:13, lineHeight:1.55}}>
          Press <kbd style={kbdS(T)}>N</kbd> to add a sticky note, or use <b>New folder</b> to organize by topic.
        </div>
      </div>
    </div>
  );
}
function kbdS(T) { return {fontFamily:'ui-monospace, monospace', fontSize:11, padding:'2px 6px', background:'rgba(0,0,0,.06)', border:`1px solid ${T.panelBorder}`, borderRadius:3}; }
/* ==================================================================== */
/* FOLDER TILE (draggable on desktop)                                    */
/* ==================================================================== */
/* STICKY NOTE                                                           */
/* ==================================================================== */
function StickyNote({note, T, tweaks, folder, refCb, selected, selectedIds, setSelectedIds, setNotes,
  bringGroupToFront,
  onFocus, onChange, onTogglePin, onDelete, onLinkClick, childFolders, onMoveToFolder, onMoveNotesToFolder, zoom=1,
  allNotes=[], linksFor, onAddLink, onStartLink, onJumpToNote, onCopy}) {
  const zRef = useRef(zoom); zRef.current = zoom;
  const [editing, setEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [menu, setMenu] = useState(null);
  const el = useRef(null);

  // Snapshot the title/body at the moment the user enters edit mode so that
  // pressing Escape reverts to what it was. The input stays controlled (live
  // onChange) — Escape just calls onChange with the snapshot and exits.
  const origTitleRef = useRef('');
  const origBodyRef  = useRef('');
  useEffect(() => { if (editingTitle) origTitleRef.current = note.title; }, [editingTitle]);
  useEffect(() => { if (editing)      origBodyRef.current  = note.body;  }, [editing]);

  // When the user clicks outside the note while editing, exit edit mode so
  // the cursor visibly goes away and further typing doesn't keep landing in
  // the note. The native blur event doesn't fire here because the desk's
  // own pointerdown handler calls preventDefault (to suppress text selection
  // during marquee/pan), which also suppresses the browser's default
  // "move focus away from the current input" behavior. This document-level
  // listener bypasses that by explicitly exiting edit mode when the click
  // lands outside the note's DOM.
  useEffect(() => {
    if (!editing && !editingTitle) return;
    const onOutsideDown = (e) => {
      if (el.current && !el.current.contains(e.target)) {
        if (editingTitle) setEditingTitle(false);
        if (editing)      setEditing(false);
      }
    };
    document.addEventListener('pointerdown', onOutsideDown);
    return () => document.removeEventListener('pointerdown', onOutsideDown);
  }, [editing, editingTitle]);

  useEffect(() => { refCb(el.current); return ()=>refCb(null); }, [refCb]);

  const col = NOTE_COLORS.find(c => c.id===note.color) || NOTE_COLORS[0];
  const bg = tweaks.theme==='paper' ? col.paper : tweaks.theme==='flat' ? col.flat : col.term;
  const ink = col.ink;

  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  // Remembers pointer-down coords on any header button (pin, link, ×) so we
  // can suppress its click if the user actually dragged the note by it. The
  // whole header is a drag handle, so every button inside needs this guard.
  const btnDownRef = useRef(null);

  const onHeaderDown = (e) => {
    if (editingTitle || e.button!==0) return;
    e.stopPropagation();
    e.preventDefault();
    onFocus(e);
    draggingRef.current = true;
    setDragging(true);
    const sX = e.clientX, sY = e.clientY;
    const z = zRef.current;

    // Returns a folder id (≠ 'root') if the pointer is currently over a folder
    // row, else null. Lets header pointer-drag also act as drag-to-folder.
    const folderIdUnder = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el && el.closest && el.closest('[data-folder-id]');
      const fid = row && row.getAttribute('data-folder-id');
      return (fid && fid !== 'root') ? fid : null;
    };

    // Group drag: if this note was already part of a multi-selection, move all selected notes together.
    const isGroupDrag = !(e.ctrlKey || e.metaKey) && selected && selectedIds && selectedIds.size > 1 && typeof setNotes === 'function';
    if (isGroupDrag) {
      // Promote the entire selection to top z so no group member slides
      // UNDER an unselected note during the drag. Centralized at App level
      // (bringGroupToFront) so the App's zRef counter stays in sync — if
      // we mutated z directly here, future single bringToFront calls would
      // assign colliding z values and notes would render in undefined order.
      bringGroupToFront && bringGroupToFront([...selectedIds]);
      const starts = new Map();
      allNotes.forEach(n => { if (selectedIds.has(n.id)) starts.set(n.id, { x: n.x, y: n.y }); });
      const move = (ev) => {
        const dx = (ev.clientX - sX) / z;
        const dy = (ev.clientY - sY) / z;
        setNotes(ns => ns.map(n => {
          const s = starts.get(n.id);
          return s ? { ...n, x: s.x + dx, y: s.y + dy } : n;
        }));
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        draggingRef.current = false;
        setDragging(false);
        const targetFolder = folderIdUnder(ev);
        if (targetFolder && onMoveNotesToFolder) {
          onMoveNotesToFolder([...selectedIds], targetFolder);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return;
    }

    // Single drag.
    const { x:nx, y:ny } = note;
    const move = (ev) => onChange({ x: nx+(ev.clientX-sX)/z, y: ny+(ev.clientY-sY)/z });
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      draggingRef.current = false;
      setDragging(false);
      const targetFolder = folderIdUnder(ev);
      if (targetFolder && targetFolder !== note.folder && onMoveToFolder) {
        onMoveToFolder(targetFolder);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const sX = e.clientX, sY = e.clientY;
    const { w, h } = note;
    const move = (ev) => onChange({ w: Math.max(180, w+(ev.clientX-sX)/zRef.current), h: Math.max(120, h+(ev.clientY-sY)/zRef.current) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const rot = tweaks.theme==='paper' && tweaks.tilt !== false ? hashRot(note.id) : 0;

  return (
    <div ref={el} data-note="1" data-note-id={note.id}
      draggable={!dragging && !editingTitle && !editing}
      onDragStart={e=>{
        if (draggingRef.current) { e.preventDefault(); return; }
        // If this note is part of a multi-selection, carry every selected
        // id so a drop on a folder moves the whole group at once.
        const ids = (selected && selectedIds && selectedIds.size > 1)
          ? [...selectedIds].join(',')
          : note.id;
        e.dataTransfer.setData('note-ids', ids);
        e.dataTransfer.effectAllowed='move';
      }}
      onMouseDown={onFocus}
      onContextMenu={e=>{e.preventDefault(); e.stopPropagation(); setMenu({x:e.clientX, y:e.clientY});}}
      style={{
        position:'absolute', left:note.x, top:note.y, width:note.w, height:note.h,
        background: bg, color: ink, zIndex: 10 + (note.z||0),
        borderRadius:T.noteRadius, boxShadow:T.noteShadow, transform:`rotate(${rot}deg)`,
        outline: selected ? `2px solid ${T.accent}` : 'none', outlineOffset:1,
        display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
      <div onPointerDown={onHeaderDown} onDoubleClick={()=>setEditingTitle(true)}
        style={{
          display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
          background: tweaks.theme==='terminal' ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.05)',
          borderBottom: tweaks.theme==='terminal' ? `1px solid ${T.panelBorder}` : '1px solid rgba(0,0,0,.04)',
          cursor:'grab', userSelect:'none', flex:'none',
          fontFamily: tweaks.theme==='terminal' ? T.bodyFont : tweaks.font+', system-ui, sans-serif',
        }}>
        <button
          onPointerDown={e=>{ btnDownRef.current = {x:e.clientX, y:e.clientY}; }}
          onClick={e=>{
            e.stopPropagation();
            const d = btnDownRef.current;
            btnDownRef.current = null;
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) {
              e.preventDefault();
              return;
            }
            if (onTogglePin) onTogglePin(); else onChange({pinned:!note.pinned});
          }}
          title={note.pinned ? 'Pinned (visible in every folder) · click to unpin' : 'Pin to keep visible in every folder'}
          style={{...btnS(ink), padding:2}}>
          {note.pinned ? (
            <img src="./assets/pin-filled.png" width="16" height="16" alt="Pinned"
                 style={{display:'block'}} draggable={false}/>
          ) : (
            <svg width="16" height="16" viewBox="0 0 100 100" fill="none" stroke={ink} strokeWidth="4" strokeLinejoin="round">
              <g transform="translate(50 50) rotate(-25)">
                <polygon points="-5,0 5,0 1.4,42 -1.4,42"/>
                <polygon points="-10,-6 10,-6 7,2 -7,2"/>
                <circle cx="0" cy="-22" r="22"/>
              </g>
            </svg>
          )}
        </button>
        {folder && <span title={folder.name} style={{width:6, height:6, background:folder.hue, borderRadius:'50%', flex:'none'}}/>}
        {editingTitle ? (
          <input autoFocus value={note.title}
            onChange={e=>onChange({title:e.target.value})}
            onBlur={()=>setEditingTitle(false)}
            onKeyDown={e=>{
              if (e.key==='Enter')  { setEditingTitle(false); }
              if (e.key==='Escape') { onChange({title:origTitleRef.current}); setEditingTitle(false); }
            }}
            style={{flex:1, background:'transparent', border:'none', outline:'none', font:'inherit', color:'inherit', fontWeight:600, fontSize:12}}
          />
        ) : (
          <div style={{flex:1, fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {note.title || <span style={{opacity:.4}}>Untitled</span>}
          </div>
        )}
        {(() => {
          // Badge count reflects all links on this note, including ones whose
          // other endpoint lives in another folder (pinned notes follow the
          // user across folders, so cross-folder links are worth surfacing).
          const myLinks = linksFor ? linksFor(note.id) : [];
          return (
            <button
              onPointerDown={e=>{ btnDownRef.current = {x:e.clientX, y:e.clientY}; }}
              onClick={e=>{
                e.stopPropagation();
                const d = btnDownRef.current;
                btnDownRef.current = null;
                if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) {
                  e.preventDefault();
                  return;
                }
                onStartLink && onStartLink();
              }}
              title={myLinks.length ? `${myLinks.length} link${myLinks.length>1?'s':''} · click to add another` : 'Link to another note'}
              style={{...btnS(ink), opacity: myLinks.length ? 0.95 : 0.65, position:'relative'}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round">
                <path d="M10 13a5 5 0 007 0l3-3a5 5 0 10-7-7l-1 1"/>
                <path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 107 7l1-1"/>
              </svg>
              {myLinks.length > 0 && (
                <span style={{
                  position:'absolute', top:-2, right:-2, background:T.accent, color:'#fff',
                  fontSize:8, minWidth:12, height:12, borderRadius:6, padding:'0 3px',
                  display:'grid', placeItems:'center', fontWeight:700, lineHeight:1,
                }}>{myLinks.length}</span>
              )}
            </button>
          );
        })()}
        <button
          onPointerDown={e=>{ btnDownRef.current = {x:e.clientX, y:e.clientY}; }}
          onClick={e=>{
            e.stopPropagation();
            const d = btnDownRef.current;
            btnDownRef.current = null;
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) {
              e.preventDefault();
              return;
            }
            onDelete();
          }}
          title="Delete" style={btnS(ink)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button>
      </div>

      <div onDoubleClick={()=>setEditing(true)}
        style={{
          flex:1, padding:'10px 14px', overflow:'auto',
          fontFamily: tweaks.theme==='terminal' ? T.bodyFont : tweaks.font+', system-ui, sans-serif',
          fontSize: tweaks.theme==='paper' ? 18 : 13.5,
          lineHeight: tweaks.theme==='paper' ? 1.35 : 1.5,
          color:ink,
        }}>
        {editing ? (
          <textarea autoFocus value={note.body}
            onChange={e=>onChange({body:e.target.value})}
            onBlur={()=>setEditing(false)}
            onKeyDown={e=>{
              if (e.key==='Escape') { onChange({body:origBodyRef.current}); setEditing(false); }
            }}
            style={{width:'100%', height:'100%', resize:'none', border:'none', outline:'none',
              background:'transparent', color:'inherit', font:'inherit', lineHeight:'inherit'}}
          />
        ) : (
          <div className="md-body" dangerouslySetInnerHTML={{__html: mdToHtml(note.body)}}
            onClick={(e)=>{
              const a = e.target.closest('[data-link]');
              if (a) { e.preventDefault(); onLinkClick(a.dataset.link); }
            }}
          />
        )}
      </div>

      <div style={{
        padding:'5px 10px', display:'flex', alignItems:'center', gap:6, flex:'none',
        borderTop: tweaks.theme==='terminal' ? `1px solid ${T.panelBorder}` : '1px solid rgba(0,0,0,.05)',
        background: tweaks.theme==='terminal' ? 'rgba(0,0,0,.2)' : 'transparent',
        fontSize:10, color:ink, opacity:.75,
      }}>
        <div style={{flex:1}}/>
        <ColorDots current={note.color} onPick={c=>onChange({color:c})} ink={ink}/>
      </div>

      <div onPointerDown={onResize}
        style={{position:'absolute', right:0, bottom:0, width:14, height:14, cursor:'nwse-resize',
          background: `linear-gradient(135deg, transparent 40%, ${withA(ink,0.25)} 40%, ${withA(ink,0.25)} 50%, transparent 50%, transparent 60%, ${withA(ink,0.25)} 60%, ${withA(ink,0.25)} 70%, transparent 70%)`,
        }}/>

      {menu && (() => {
        const myLinks = linksFor ? linksFor(note.id) : [];
        const notesById = Object.fromEntries(allNotes.map(x=>[x.id,x]));
        const linkSubmenu = myLinks.length ? myLinks.map(l => {
          const otherId = l.from===note.id ? l.to : l.from;
          const other = notesById[otherId];
          const arrow = l.from===note.id ? '→' : '←';
          return { label: `${arrow} ${other?.title || '(missing)'}`, onClick: () => onJumpToNote && onJumpToNote(otherId) };
        }) : [{label:'(no links yet)', onClick:()=>{}}];
        const candidates = allNotes.filter(n => n.id !== note.id).slice(0, 20);
        return (
          <ContextMenu T={T} x={menu.x-note.x} y={menu.y-note.y} onClose={()=>setMenu(null)} items={[
            {label: (selected && selectedIds && selectedIds.size > 1)
              ? 'Copy ' + selectedIds.size + ' notes'
              : 'Copy', onClick: () => onCopy && onCopy()},
            {divider:true},
            {label:'Edit title', onClick:()=>setEditingTitle(true)},
            {label:'Edit body', onClick:()=>setEditing(true)},
            {label: note.pinned?'Unpin':'Pin to top', onClick:()=>{ if (onTogglePin) onTogglePin(); else onChange({pinned:!note.pinned}); }},
            {divider:true},
            {label:'Link to note ▶', submenu: candidates.map(n => ({
              label: n.title || 'Untitled', dot: (NOTE_COLORS.find(c=>c.id===n.color)||{}).paper,
              onClick: () => onAddLink && onAddLink(n.id),
            }))},
            {label:'Draw link…', onClick: () => onStartLink && onStartLink()},
            myLinks.length ? {label:`Linked notes (${myLinks.length}) ▶`, submenu: linkSubmenu} : null,
            {divider:true},
            {label:'Change color ▶', submenu: NOTE_COLORS.map(c=>({label:c.name, dot:c.paper, onClick:()=>onChange({color:c.id})}))},
            childFolders.length ? {label:'Move to folder ▶', submenu: childFolders.map(f=>({label:f.name, dot:f.hue, onClick:()=>onMoveToFolder(f.id)}))} : null,
            {divider:true},
            {label:'Delete…', destructive:true, onClick:onDelete},
          ].filter(Boolean)}/>
        );
      })()}
    </div>
  );
}
function btnS(ink) { return {background:'transparent', border:'none', cursor:'pointer', padding:4, borderRadius:4, display:'grid', placeItems:'center', color:ink, opacity:.65}; }
function ColorDots({current, onPick, ink}) {
  return <div style={{display:'flex', gap:4}}>
    {NOTE_COLORS.slice(0,6).map(c => (
      <button key={c.id} onClick={()=>onPick(c.id)} title={c.name} style={{
        width:10, height:10, borderRadius:'50%',
        border: current===c.id ? `1.5px solid ${ink}` : '1px solid rgba(0,0,0,.15)',
        background:c.paper, cursor:'pointer', padding:0,
      }}/>
    ))}
  </div>;
}
/* ==================================================================== */
/* CONTEXT MENU                                                          */
/* ==================================================================== */
function ContextMenu({T, x, y, items, onClose}) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (!ref.current || !ref.current.contains(e.target)) onClose(); };
    setTimeout(()=>window.addEventListener('mousedown', h), 0);
    return () => window.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{
      position:'absolute', left:x, top:y, minWidth:180, zIndex:99999,
      background:T.panelBg, border:`1px solid ${T.panelBorder}`, borderRadius:8,
      boxShadow:'0 8px 32px rgba(0,0,0,.15)', padding:4, color:T.panelText,
    }}>
      {items.map((it,i) => it.divider ? <div key={i} style={{height:1, background:T.hairline, margin:'4px 0'}}/> :
        <div key={i} style={{position:'relative'}} className="ctx-row"
          onMouseEnter={e=>e.currentTarget.classList.add('hover')}
          onMouseLeave={e=>e.currentTarget.classList.remove('hover')}>
          <button onClick={()=>{ it.onClick?.(); if(!it.submenu) onClose(); }} style={{
            width:'100%', textAlign:'left', background:'transparent', border:'none',
            padding:'7px 10px', borderRadius:4, cursor:'pointer', fontSize:13,
            color: it.destructive ? '#c33' : T.panelText,
          }}>{it.label}</button>
          {it.submenu && <div className="ctx-sub" style={{
            position:'absolute', left:'100%', top:-4, minWidth:160,
            background:T.panelBg, border:`1px solid ${T.panelBorder}`, borderRadius:8, padding:4,
            boxShadow:'0 8px 32px rgba(0,0,0,.15)', display:'none',
          }}>
            {it.submenu.map((s,j)=>
              <button key={j} onClick={()=>{s.onClick?.(); onClose();}} style={{
                width:'100%', display:'flex', alignItems:'center', gap:8, textAlign:'left',
                background:'transparent', border:'none', padding:'6px 10px', borderRadius:4, cursor:'pointer',
                fontSize:13, color:T.panelText,
              }}>
                {s.dot && <span style={{width:10, height:10, borderRadius:3, background:s.dot, border:'1px solid rgba(0,0,0,.1)'}}/>}
                {s.label}
              </button>
            )}
          </div>}
        </div>
      )}
      <style>{`.ctx-row.hover > button { background: rgba(0,0,0,.05); } .ctx-row.hover .ctx-sub { display: block; }`}</style>
    </div>
  );
}
/* ==================================================================== */
/* CONFIRM                                                               */
/* ==================================================================== */
function ConfirmDialog({T, title, body, onCancel, onConfirm}) {
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(10,14,20,.35)', zIndex:100000, display:'grid', placeItems:'center'}}>
      <div style={{background:T.panelBg, color:T.panelText, borderRadius:12, border:`1px solid ${T.panelBorder}`, width:400, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <div style={{fontWeight:700, fontSize:16, marginBottom:6}}>{title}</div>
        <div style={{fontSize:13, color:T.muted, lineHeight:1.5}}>{body}</div>
        <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:18}}>
          <button onClick={onCancel} style={{padding:'8px 14px', background:'transparent', border:`1px solid ${T.panelBorder}`, borderRadius:8, fontSize:13, cursor:'pointer', color:T.panelText}}>Cancel</button>
          <button onClick={onConfirm} style={{padding:'8px 14px', background:'#c33b3b', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer'}}>Delete</button>
        </div>
      </div>
    </div>
  );
}
/* ==================================================================== */
/* FOLDERS DRAWER (right side — list of folders)                         */
/* ==================================================================== */
function FoldersDrawer({T, tweaks, folders, notes, currentFolder, setCurrentFolder,
  onCreateFolder, onRenameFolder, renamingFolder, setRenamingFolder, onDeleteFolder,
  onDropNoteOnFolder, onDropNotesOnFolder, onCreateNote,
  open, setOpen,
  folderOrder, setFolderOrder}) {

  const isTerm = tweaks.theme==='terminal';
  const isPaper = tweaks.theme==='paper';
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  // Right-click context menu on a folder row. Shape: {x, y, folderId} | null.
  const [folderMenu, setFolderMenu] = useState(null);

  // Washi-tape colors for paper variant (slightly lighter/warmer than folder hues)
  const WASHI = {
    '#d97757': '#e9a27a',
    '#5a82c9': '#8cb3d8',
    '#8a6fbf': '#b89ed6',
    '#4c9e6b': '#9dc98a',
    '#c4843a': '#e0c477',
    '#b84a6b': '#d89aaa',
    '#3fa89a': '#8ccec4',
    '#8a8f3d': '#c7cc82',
  };

  // Close the folder context menu on Escape (outside-click is handled by
  // the shared ContextMenu component itself).
  useEffect(() => {
    if (!folderMenu) return;
    const onKey = (e) => { if (e.key === 'Escape') setFolderMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [folderMenu]);

  // Ordered folders = user-defined order first (if saved), then any brand-new
  // folders not yet in the order appended alphabetically. Stale IDs are dropped.
  const realFolders = useMemo(() => {
    const allIds = Object.values(folders).filter(f => f.id !== 'root').map(f => f.id);
    const fromOrder = (folderOrder || []).filter(id => folders[id] && id !== 'root');
    const missing = allIds.filter(id => !fromOrder.includes(id))
      .sort((a,b) => folders[a].name.localeCompare(folders[b].name));
    return [...fromOrder, ...missing].map(id => folders[id]);
  }, [folders, folderOrder]);

  const moveFolder = (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const currentOrder = realFolders.map(f => f.id);
    const sourceIdx = currentOrder.indexOf(draggedId);
    const targetIdxOrig = currentOrder.indexOf(targetId);
    if (sourceIdx < 0 || targetIdxOrig < 0) return;
    const without = currentOrder.filter(id => id !== draggedId);
    const targetIdx = without.indexOf(targetId);
    // Dragging downward: insert AFTER the target row so a one-row drop
    // actually moves by one. Dragging upward: insert BEFORE the target.
    const insertAt = sourceIdx < targetIdxOrig ? targetIdx + 1 : targetIdx;
    without.splice(insertAt, 0, draggedId);
    setFolderOrder(without);
  };

  const renderRow = (f, isAll) => {
    const isActive = currentFolder===f.id;
    const count = isAll ? notes.length : notes.filter(n=>n.folder===f.id).length;
    const swatch = isAll ? T.accent : f.hue;
    const idleBg = isTerm ? '#0e1319' : 'rgba(0,0,0,.02)';
    const hoverBg = isTerm ? '#131a23' : 'rgba(0,0,0,.05)';

    const isDropTarget = dragOverFolderId === f.id;

    // Context-menu handler shared across variants (skips the All-notes root row).
    const onRowContextMenu = (e) => {
      if (isAll) return;
      e.preventDefault();
      e.stopPropagation();
      let host = e.currentTarget.parentElement;
      while (host && getComputedStyle(host).position === 'static') host = host.parentElement;
      const rect = host ? host.getBoundingClientRect() : {left:0, top:0};
      setFolderMenu({x: e.clientX - rect.left, y: e.clientY - rect.top, folderId: f.id});
    };

    // ─── Paper variant: washi-tape row, no chip icon (real folders only) ───
    if (isPaper && !isAll) {
      const washiColor = WASHI[f.hue] || f.hue;
      const paperIdleBg = 'transparent';
      const paperActiveBg = withA(swatch, .14);
      const paperHoverBg = 'rgba(120,80,40,.06)';
      return (
        <div key={f.id}
          data-folder-id={f.id}
          draggable={renamingFolder !== f.id}
          onDragStart={e => {
            e.dataTransfer.setData('folder-id', f.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={e => {
            const hasNotes = e.dataTransfer.types.includes('note-ids');
            const hasFolder = e.dataTransfer.types.includes('folder-id');
            if (!hasNotes && !hasFolder) return;
            e.preventDefault();
            if (hasFolder) {
              setDragOverFolderId(f.id);
            } else {
              e.currentTarget.style.outline = `1px dashed ${T.accent}`;
              e.currentTarget.style.background = withA(T.accent, .12);
            }
          }}
          onDragLeave={e => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.background = isActive ? paperActiveBg : paperIdleBg;
            if (dragOverFolderId === f.id) setDragOverFolderId(null);
          }}
          onDrop={e => {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.background = isActive ? paperActiveBg : paperIdleBg;
            setDragOverFolderId(null);
            const folderId = e.dataTransfer.getData('folder-id');
            if (folderId) { moveFolder(folderId, f.id); return; }
            const raw = e.dataTransfer.getData('note-ids');
            if (raw) {
              const ids = raw.split(',').filter(Boolean);
              if (ids.length > 1 && onDropNotesOnFolder) onDropNotesOnFolder(ids, f.id);
              else if (ids.length === 1) onDropNoteOnFolder(ids[0], f.id);
            }
          }}
          onClick={() => setCurrentFolder(f.id)}
          onDoubleClick={() => setRenamingFolder(f.id)}
          onContextMenu={onRowContextMenu}
          style={{
            position:'relative', display:'flex', alignItems:'center', gap:10,
            padding:'9px 12px 9px 18px', marginBottom:3,
            cursor: renamingFolder === f.id ? 'text' : 'grab',
            background: isDropTarget ? withA(T.accent, .18)
                      : isActive ? paperActiveBg : paperIdleBg,
            borderRadius:3,
            transition:'background .1s',
          }}
          onMouseEnter={e=>{ if(!isActive && !isDropTarget) e.currentTarget.style.background = paperHoverBg; }}
          onMouseLeave={e=>{ if(!isActive && !isDropTarget) e.currentTarget.style.background = paperIdleBg; }}
        >
          {/* Washi tape stripe */}
          <div style={{
            position:'absolute', left:4, top:7, bottom:7, width:6,
            background: washiColor,
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.22) 3px 4px)',
            boxShadow: `inset 0 0 0 0.5px ${washiColor}, 0 1px 2px rgba(0,0,0,.1)`,
            opacity: .85,
          }}/>
          <div style={{flex:1, minWidth:0, paddingLeft:8}}>
            {renamingFolder===f.id ? (
              <input autoFocus defaultValue={f.name}
                onClick={e=>e.stopPropagation()}
                onBlur={e=>{ onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null); }}
                onKeyDown={e=>{ if(e.key==='Enter'){onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null);} if(e.key==='Escape'){setRenamingFolder(null);}}}
                style={{width:'100%', background:'transparent', border:'none', outline:'none',
                  color:T.panelText, fontSize:14, fontWeight:600, font:'inherit'}}
              />
            ) : (
              <div style={{fontSize:13, fontWeight:600, color:T.panelText,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                {f.name}
              </div>
            )}
            <div style={{fontSize:11, color:T.muted, marginTop:2, fontStyle:'italic'}}>
              {count} {count===1?'note':'notes'}
            </div>
          </div>
          {isActive && (
            <button onClick={(e)=>{e.stopPropagation(); onDeleteFolder(f.id);}} title="Delete folder"
              style={{width:20, height:20, display:'grid', placeItems:'center',
                background:'transparent', border:'none', cursor:'pointer', color:T.muted,
                borderRadius:4, fontSize:14, lineHeight:1, padding:0,
              }}>×</button>
          )}
        </div>
      );
    }

    // ─── Flat / terminal row, and the "All notes" row in ALL variants ───
    return (
      <div key={f.id}
        data-folder-id={f.id}
        draggable={!isAll && renamingFolder !== f.id}
        onDragStart={e => {
          if (isAll) return;
          e.dataTransfer.setData('folder-id', f.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={e=>{
          if (isAll) return;
          const hasNotes = e.dataTransfer.types.includes('note-ids');
          const hasFolder = e.dataTransfer.types.includes('folder-id');
          if (!hasNotes && !hasFolder) return;
          e.preventDefault();
          if (hasFolder) {
            setDragOverFolderId(f.id);
          } else {
            e.currentTarget.style.outline = `1px dashed ${T.accent}`;
            e.currentTarget.style.background = withA(T.accent, .2);
          }
        }}
        onDragLeave={e=>{
          e.currentTarget.style.outline='none';
          e.currentTarget.style.background = isActive ? withA(swatch,.16) : idleBg;
          if (dragOverFolderId === f.id) setDragOverFolderId(null);
        }}
        onDrop={(e)=>{
          e.currentTarget.style.outline='none';
          e.currentTarget.style.background = isActive ? withA(swatch,.16) : idleBg;
          setDragOverFolderId(null);
          const folderId = e.dataTransfer.getData('folder-id');
          if (folderId && !isAll) { moveFolder(folderId, f.id); return; }
          const raw = e.dataTransfer.getData('note-ids');
          if (raw && !isAll) {
            const ids = raw.split(',').filter(Boolean);
            if (ids.length > 1 && onDropNotesOnFolder) onDropNotesOnFolder(ids, f.id);
            else if (ids.length === 1) onDropNoteOnFolder(ids[0], f.id);
          }
        }}
        onClick={()=>setCurrentFolder(f.id)}
        onDoubleClick={()=>!isAll && setRenamingFolder(f.id)}
        onContextMenu={onRowContextMenu}
        style={{
          position:'relative', display:'flex', gap:10, padding:'11px 12px', marginBottom:6,
          borderRadius: isTerm?2:8,
          background: isDropTarget ? withA(T.accent, .22) : (isActive ? withA(swatch,.16) : idleBg),
          cursor: isAll ? 'pointer' : 'grab',
          transition:'background .1s',
        }}
        onMouseEnter={e=>{ if(!isActive && !isDropTarget) e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={e=>{ if(!isActive && !isDropTarget) e.currentTarget.style.background = idleBg; }}
      >
        <div style={{width:4, borderRadius:2, background:swatch, flex:'none'}}/>
        <div style={{flex:1, minWidth:0, display:'flex', alignItems:'center', gap:10}}>
          {isAll
            ? <HomeIcon size={16} color={T.panelText}/>
            : <FolderIcon size={16} color={f.hue} fill={f.hue} open={isActive}/>}
          <div style={{flex:1, minWidth:0}}>
            {(!isAll && renamingFolder===f.id) ? (
              <input autoFocus defaultValue={f.name}
                onClick={e=>e.stopPropagation()}
                onBlur={e=>{ onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null); }}
                onKeyDown={e=>{ if(e.key==='Enter'){onRenameFolder(f.id, e.target.value||f.name); setRenamingFolder(null);} if(e.key==='Escape'){setRenamingFolder(null);}}}
                style={{width:'100%', background:'transparent', border:'none', outline:'none', color:T.panelText, fontSize:13, fontWeight:700, font:'inherit'}}
              />
            ) : (
              <div style={{fontSize:13, fontWeight:700, color:T.panelText,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                fontFamily: isTerm?T.bodyFont:'inherit'}}>
                {isAll ? 'All notes' : f.name}
              </div>
            )}
            <div style={{fontSize:11, color:T.muted, marginTop:2, fontFamily: isTerm?T.bodyFont:'inherit'}}>
              {count} {count===1?'note':'notes'}
            </div>
          </div>
          {!isAll && isActive && (
            <button onClick={(e)=>{e.stopPropagation(); onDeleteFolder(f.id);}} title="Delete folder"
              style={{width:22, height:22, display:'grid', placeItems:'center',
                background:'transparent', border:'none', cursor:'pointer', color:T.muted,
                borderRadius:4, fontSize:14, lineHeight:1, padding:0,
              }}>×</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {!open && (
        <button onClick={()=>setOpen(true)} style={{
          position:'absolute', right:0, top:72, zIndex:19000,
          width:32, height:96, background:T.panelBg, color:T.panelText,
          border:`1px solid ${T.panelBorder}`, borderRight:'none',
          borderRadius: isTerm ? 2 : '10px 0 0 10px', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, fontWeight:700, letterSpacing:1.5, boxShadow:'0 4px 14px rgba(0,0,0,.08)',
        }}>
          <span style={{writingMode:'vertical-rl', transform:'rotate(180deg)'}}>FOLDERS · {realFolders.length}</span>
        </button>
      )}

      {open && (
        <div style={{
          position:'absolute', right:0, top:62, bottom:36, width:300,
          background: isPaper ? '#f6ecd8' : T.panelBg,
          border:`1px solid ${isPaper ? 'rgba(120,80,40,.18)' : T.panelBorder}`,
          borderRadius: isTerm ? 2 : (isPaper ? 4 : 10),
          margin:'0 10px 0 0',
          display:'flex', flexDirection:'column', overflow:'hidden', zIndex:18000,
          boxShadow: isPaper
            ? 'inset 0 0 0 1px rgba(120,80,40,.12), 0 2px 0 rgba(60,40,20,.05), 0 10px 28px rgba(60,40,20,.16)'
            : '0 10px 30px rgba(0,0,0,.12)',
          fontFamily: tweaks.font+', system-ui, sans-serif',
          // SVG-noise paper grain for the paper variant
          backgroundImage: isPaper
            ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"
            : undefined,
        }}>
          {/* Header */}
          {isPaper ? (
            <div style={{
              fontSize:14, fontWeight:700,
              color:'#6a5a44', padding:'12px 12px 10px',
              display:'flex', alignItems:'center', gap:8,
              borderBottom:'1px solid rgba(120,80,40,.14)',
            }}>
              <span style={{flex:1}}>Folders</span>
              <button onClick={onCreateFolder} title="New folder" style={{
                width:24, height:24, background:'transparent', border:'none', cursor:'pointer',
                color:T.muted, fontSize:18, lineHeight:1, padding:0, borderRadius:4,
              }}>+</button>
              <button onClick={()=>setOpen(false)} title="Hide" style={{
                width:24, height:24, background:'transparent', border:'none', cursor:'pointer',
                color:T.muted, fontSize:16, lineHeight:1, padding:0, borderRadius:4,
              }}>›</button>
            </div>
          ) : (
            <div style={{padding:'10px 12px', display:'flex', alignItems:'center', gap:8,
              borderBottom:`1px solid ${T.hairline}`}}>
              <div style={{fontSize:14, fontWeight:700, color:T.panelText, flex:1, letterSpacing:isTerm?0.5:0}}>
                {isTerm ? '// folders' : 'Folders'}
              </div>
              <button onClick={onCreateFolder} title="New folder" style={{
                width:24, height:24, background:'transparent', border:'none', cursor:'pointer',
                color:T.muted, fontSize:18, lineHeight:1, padding:0, borderRadius:4,
              }}>+</button>
              <button onClick={()=>setOpen(false)} title="Hide" style={{
                width:24, height:24, background:'transparent', border:'none', cursor:'pointer',
                color:T.muted, fontSize:16, lineHeight:1, padding:0, borderRadius:4,
              }}>›</button>
            </div>
          )}

          <div style={{
            flex:1, overflow:'auto',
            padding: isPaper ? '2px 10px 10px' : '8px',
          }}>
            {renderRow({id:'root', name:'All notes'}, true)}
            {!isPaper && realFolders.length>0 && (
              <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:1.5, opacity:.5,
                padding:'12px 12px 6px', color:T.panelText}}>
                Your folders
              </div>
            )}
            {realFolders.map(f => renderRow(f, false))}
            {/* Faint full-width affordance to create a folder, sitting in the
                empty space below the last folder row. The original "+ folder"
                button in the header still works. */}
            <button onClick={()=>onCreateFolder()} title="Create folder" style={{
              width:'100%', height:30, marginTop: realFolders.length>0 ? 4 : 12,
              padding:'0 10px', borderRadius: isTerm ? 2 : (isPaper ? 3 : 6),
              background:'transparent', color:T.muted,
              border: `1px dashed ${isPaper ? 'rgba(120,80,40,.28)' : T.panelBorder}`,
              fontSize:12, fontWeight:600, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              transition:'background .12s, color .12s, transform .12s',
              fontFamily: isTerm?T.bodyFont:'inherit',
            }}
              onMouseEnter={e=>{
                e.currentTarget.style.background = isTerm ? '#131a23'
                  : (isPaper ? 'rgba(120,80,40,.06)' : 'rgba(0,0,0,.04)');
                e.currentTarget.style.color = T.panelText;
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = T.muted;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span> Create folder
            </button>
          </div>

          {folderMenu && (
            <ContextMenu T={T} x={folderMenu.x} y={folderMenu.y}
              onClose={()=>setFolderMenu(null)}
              items={[
                {label:'Rename', onClick:()=>setRenamingFolder(folderMenu.folderId)},
                {label:'Delete folder', destructive:true, onClick:()=>onDeleteFolder(folderMenu.folderId)},
              ]}
            />
          )}

          {/* Footer: + new sticky */}
          <div style={{
            padding: isPaper ? '10px 14px 14px' : '8px 12px',
            borderTop: isPaper ? '1px dashed rgba(120,80,40,.28)' : `1px solid ${T.hairline}`,
            background: isTerm ? '#0a0c10' : (isPaper ? 'transparent' : 'rgba(0,0,0,.02)'),
            fontSize:11, color:T.muted, display:'flex', alignItems:'center', gap:8,
          }}>
            {isPaper ? (
              <button onClick={onCreateNote} style={{
                flex:1, height:30, background:'#fdf4c5', color:'#4a3a12',
                border:'1px solid rgba(120,80,40,.28)', borderRadius:6,
                padding:'0 12px', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                boxShadow:'0 1px 0 #fff inset, 0 2px 0 rgba(60,40,20,.06), 0 6px 14px rgba(60,40,20,.08)',
              }}>
                <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span>
                new sticky
                <kbd style={{fontFamily:'ui-monospace, monospace', fontSize:9, background:'rgba(60,40,20,.18)', color:'#4a3a12', padding:'1px 4px', borderRadius:3, marginLeft:2}}>N</kbd>
              </button>
            ) : (
              <button onClick={onCreateNote} style={{
                flex:1, height:28, padding:'0 10px', borderRadius: isTerm?2:6,
                background:T.accent, color: isTerm?'#0a0c10':'#fff', border:'none',
                fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              }}>
                <span style={{fontSize:14, lineHeight:1, marginTop:-1}}>+</span>
                new sticky
                <kbd style={{fontFamily:'ui-monospace, monospace', fontSize:9, background:'rgba(0,0,0,.18)', padding:'1px 4px', borderRadius:3, marginLeft:2}}>N</kbd>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
/* ==================================================================== */
/* TWEAK PANEL                                                           */
/* ==================================================================== */
function TweakPanel({T, tweaks, update, onClose}) {
  return (
    <div style={{
      position:'fixed', right:16, bottom:44, width:280, zIndex:90000,
      background:T.panelBg, color:T.panelText, borderRadius:12,
      border:`1px solid ${T.panelBorder}`, boxShadow:'0 20px 60px rgba(0,0,0,.25)',
      padding:14, fontFamily:'Inter, system-ui, sans-serif',
    }}>
      <div style={{fontWeight:700, fontSize:13, marginBottom:12, display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:8, height:8, borderRadius:'50%', background:T.accent}}/>Preferences
        {onClose && (
          <button onClick={onClose} aria-label="Close preferences" style={{
            marginLeft:'auto', background:'none', border:'none', cursor:'pointer',
            fontSize:16, lineHeight:1, color:T.panelText, opacity:.6, padding:2,
          }}>×</button>
        )}
      </div>
      <Label>Visual style</Label>
      <Segmented T={T} value={tweaks.theme} onChange={v=>update({theme:v})} options={[
        {id:'paper',label:'Paper'},{id:'flat',label:'Flat'},{id:'terminal',label:'Terminal'}
      ]}/>
      <Label>Font</Label>
      <Segmented T={T} value={tweaks.font} onChange={v=>update({font:v})} options={[
        {id:'Inter',label:'Inter'},{id:'Source Serif 4',label:'Serif'},{id:'IBM Plex Mono',label:'Mono'},{id:'Caveat',label:'Handwritten'}
      ]}/>
      <Label>Density</Label>
      <Segmented T={T} value={tweaks.density} onChange={v=>update({density:v})} options={[
        {id:'compact',label:'Compact'},{id:'cozy',label:'Cozy'},{id:'spacious',label:'Spacious'}
      ]}/>
      <Label>Link overlay</Label>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <input type="checkbox" checked={tweaks.showLinks} onChange={e=>update({showLinks:e.target.checked})}/>
        <span style={{fontSize:12}}>Show link arrows between notes</span>
      </div>
      <Label>Note rotation (paper theme)</Label>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <input type="checkbox" checked={tweaks.tilt !== false} onChange={e=>update({tilt:e.target.checked})}/>
        <span style={{fontSize:12}}>Tilt notes at a slight angle</span>
      </div>
    </div>
  );
}
function Label({children}) {
  return <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:1, opacity:.6, margin:'12px 0 6px'}}>{children}</div>;
}
function Segmented({T, value, onChange, options}) {
  return (
    <div style={{display:'flex', background:'rgba(0,0,0,.04)', padding:2, borderRadius:8, border:`1px solid ${T.panelBorder}`, gap:2}}>
      {options.map(o => (
        <button key={o.id} onClick={()=>onChange(o.id)} style={{
          flex:1, border:'none', padding:'6px 8px', fontSize:12, borderRadius:6,
          background: value===o.id ? T.panelBg : 'transparent',
          boxShadow: value===o.id ? `0 1px 2px rgba(0,0,0,.08), 0 0 0 1px ${T.panelBorder}` : 'none',
          color:T.panelText, fontWeight: value===o.id?600:500, cursor:'pointer',
        }}>{o.label}</button>
      ))}
    </div>
  );
}
/* ==================================================================== */
/* STATUS BAR                                                            */
/* ==================================================================== */
function StatusBar({T, tweaks, folderName, noteCount, folderCount, onOpenPrefs}) {
  return (
    <div style={{
      position:'absolute', left:0, right:0, bottom:0, height:28,
      background:T.panelBg, borderTop:`1px solid ${T.panelBorder}`,
      display:'flex', alignItems:'center', padding:'0 14px', gap:16,
      fontSize:11, color:T.muted, zIndex:20000,
      fontFamily: tweaks.theme==='terminal' ? T.bodyFont : 'inherit',
    }}>
      <span>in: {folderName}</span>
      <span style={{opacity:.4}}>·</span>
      <span>{noteCount} note{noteCount===1?'':'s'}</span>
      <span style={{opacity:.4}}>·</span>
      <span>{folderCount} subfolder{folderCount===1?'':'s'}</span>
      <div style={{flex:1}}/>
      <button
        onClick={onOpenPrefs}
        title="Preferences (Ctrl+,)"
        style={{
          background:'transparent', border:'none', padding:0, margin:0,
          font:'inherit', color:T.muted, cursor:'pointer',
        }}
        onMouseEnter={(e)=>{ e.currentTarget.style.textDecoration='underline'; e.currentTarget.style.color=T.panelText; }}
        onMouseLeave={(e)=>{ e.currentTarget.style.textDecoration='none'; e.currentTarget.style.color=T.muted; }}
      >preferences</button>
      <span style={{opacity:.4}}>·</span>
      <a
        href="https://github.com/faridjaff/StickyNotesCanvas"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color:T.muted, textDecoration:'none', cursor:'pointer',
          display:'inline-flex', alignItems:'center', gap:4,
        }}
        onMouseEnter={(e)=>{ e.currentTarget.style.textDecoration='underline'; e.currentTarget.style.color=T.panelText; }}
        onMouseLeave={(e)=>{ e.currentTarget.style.textDecoration='none'; e.currentTarget.style.color=T.muted; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        github
      </a>
      <span style={{opacity:.4}}>·</span>
      <span>auto-saved</span>
      <span style={{opacity:.4}}>·</span>
      <span title="This app only stores your notes locally on your device — no cloud sync, no account.">local only</span>
    </div>
  );
}

Object.assign(window, { AppGlyph, ColorDots, ConfirmDialog, ContextMenu, Desktop, EmptyState, FolderIcon, FolderTree, FoldersDrawer, HomeIcon, InfoDialog, KeyHint, Label, Loading, MOBILE_BANNER_DISMISSED_KEY, MOBILE_BANNER_MAX_WIDTH, MobileDemoBanner, Segmented, StatusBar, StickyNote, TopChrome, TweakPanel, UpdateBanner, btnS, kbdS, zBtn });
