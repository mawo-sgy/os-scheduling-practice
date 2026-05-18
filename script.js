'use strict';

// ════════════════════════════════════════════════════════════
//  Config
// ════════════════════════════════════════════════════════════
const cfg = {
    cpus: 1,   // 1–2
    io:   2,   // 1–3  (I/O devices)
    len:  30,  // 5–50 (timeline length)
    rq:   4,   // 4–8  (ready-queue rows)
    ioq:  4,   // 4–8  (I/O-queue rows, shared across all devices)
    names:           ['P1','P2','P3','P4','P5'],
    namingStyle:     'p-style',
    customNamesInput: '',
    timeIncrement:   1,   // 1 or 10 — multiplier for time-row labels
};

// Process colours — cycled by index so any number of names work
const PROC_COLORS = ['#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16'];
function procColor(idx) { return PROC_COLORS[idx % PROC_COLORS.length]; }

// ════════════════════════════════════════════════════════════
//  Drag state
// ════════════════════════════════════════════════════════════
let dragProc = null;
let dragSrc  = null;   // source .cell element, or null when from palette

// ════════════════════════════════════════════════════════════
//  Row definitions
//
//  Row order (top → bottom):
//    1. I/O Queue rows  (shared by all I/O devices)
//    2. I/O Device rows
//    3. Ready Queue rows
//    4. CPU rows
//    (Time axis row appended last — sticky bottom)
// ════════════════════════════════════════════════════════════
function buildRowDefs() {
    const rows = [];

    // Track whether to draw a separator before the first row of a section.
    // I/O Queue is the first section so no separator before it.
    let firstSection = true;

    const section = (defs) => {
        defs.forEach((d, i) => {
            rows.push({ ...d, secStart: i === 0 && !firstSection });
        });
        firstSection = false;
    };

    // 1 · I/O Queue — highest number at top (furthest from devices), 1 at bottom (next in line)
    section(
        Array.from({ length: cfg.ioq }, (_, i) => ({
            label:  `I/O Queue ${cfg.ioq - i}`,
            type:   'ioq',
            colId:  `ioq-${cfg.ioq - i}`,
        }))
    );

    // 2 · I/O Devices — highest number at top
    section(
        Array.from({ length: cfg.io }, (_, i) => ({
            label:  `I/O Device ${cfg.io - i}`,
            type:   'io',
            colId:  `io-${cfg.io - i}`,
        }))
    );

    // 3 · Ready Queue — highest number at top (furthest from CPU), 1 at bottom (next to run)
    section(
        Array.from({ length: cfg.rq }, (_, i) => ({
            label:  `Ready Queue ${cfg.rq - i}`,
            type:   'rq',
            colId:  `rq-${cfg.rq - i}`,
        }))
    );

    // 4 · CPU(s) — highest number at top, CPU 1 at bottom (closest to Ready Queue)
    section(
        Array.from({ length: cfg.cpus }, (_, i) => ({
            label:  cfg.cpus > 1 ? `CPU ${cfg.cpus - i}` : 'CPU',
            type:   'cpu',
            colId:  `cpu-${cfg.cpus - i}`,
        }))
    );

    return rows;
}

// ════════════════════════════════════════════════════════════
//  Build / rebuild the grid
// ════════════════════════════════════════════════════════════
function buildGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    const rows = buildRowDefs();

    rows.forEach((row, idx) => {
        const rowEl = makeRow(row, idx);
        grid.appendChild(rowEl);
    });

    // Tracking rows sit between content and the sticky time axis
    grid.appendChild(makeTrackRow('arrival',    'Arrivals →'));
    grid.appendChild(makeTrackRow('completion', 'Completions →'));

    // Time axis — sticky bottom (appended last)
    grid.appendChild(makeTimeRow());

    updateMeta();
    // Measure after paint so scrollWidth is accurate
    requestAnimationFrame(updateScrollHint);
}

// ── Single resource row ──────────────────────────────────────
function makeRow(row, idx) {
    const el = document.createElement('div');
    el.className = [
        'grid-row',
        `${row.type}-row`,
        row.secStart ? 'sec-start' : '',
        idx % 2 === 0 ? '' : 'alt-row',
    ].filter(Boolean).join(' ');

    // Label cell (sticky left)
    const lbl = mkDiv(`row-label ${row.type}-label`);
    lbl.textContent = row.label;
    el.appendChild(lbl);

    // Time-slot cells
    for (let t = 0; t < cfg.len; t++) {
        el.appendChild(makeCell(row.colId, t));
    }

    return el;
}

// ── One droppable cell ───────────────────────────────────────
function makeCell(colId, t) {
    const td = mkDiv(`cell${t > 0 && t % 5 === 0 ? ' tick' : ''}`);
    td.dataset.col = colId;
    td.dataset.t   = t;
    td.addEventListener('dragover',  onDragOver);
    td.addEventListener('dragenter', onDragEnter);
    td.addEventListener('dragleave', onDragLeave);
    td.addEventListener('drop',      onDrop);
    return td;
}

// ── Time axis row (appended last) ────────────────────────────
function makeTimeRow() {
    const row = mkDiv('grid-row time-row');

    // Corner label
    const corner = mkDiv('row-label time-corner');
    corner.textContent = 'Time →';
    row.appendChild(corner);

    for (let t = 0; t < cfg.len; t++) {
        const tc = mkDiv(`time-cell${t > 0 && t % 5 === 0 ? ' tick' : ''}`);
        tc.textContent = t * cfg.timeIncrement;
        row.appendChild(tc);
    }

    return row;
}

// ── Arrival / Completion tracking rows ──────────────────────
function makeTrackRow(type, label) {
    const row = mkDiv(`grid-row track-row track-${type}`);

    const lbl = mkDiv('row-label track-label');
    lbl.textContent = label;
    row.appendChild(lbl);

    for (let t = 0; t < cfg.len; t++) {
        const td = mkDiv(`track-cell${t > 0 && t % 5 === 0 ? ' tick' : ''}`);
        td.dataset.trackType = type;
        td.dataset.t = t;
        td.addEventListener('dragover',  onDragOver);
        td.addEventListener('dragenter', onDragEnter);
        td.addEventListener('dragleave', onDragLeave);
        td.addEventListener('drop', e => onTrackDrop(e, type));
        row.appendChild(td);
    }
    return row;
}

function makeMarker(name, type) {
    const idx = cfg.names.indexOf(name);
    const div = mkDiv('marker');
    div.style.background = procColor(idx >= 0 ? idx : 0);
    div.dataset.process    = name;
    div.dataset.markerType = type;
    div.title = 'Click to remove';
    const icon = type === 'arrival' ? '↓' : '✓';
    div.innerHTML = `<span class="mk-icon">${icon}</span><span class="mk-name">${name}</span>`;
    div.addEventListener('click', e => { e.stopPropagation(); div.remove(); saveState(); });
    return div;
}

function onTrackDrop(e, type) {
    e.preventDefault();
    const cell = e.currentTarget;
    cell.classList.remove('drag-over');
    if (!dragProc) return;
    // Always append — tracking rows allow multiple markers per cell
    // and never clear the source placed block
    cell.appendChild(makeMarker(dragProc, type));
    dragProc = null;
    dragSrc  = null;
    saveState();
}

// ════════════════════════════════════════════════════════════
//  Drag — palette blocks (clone-on-drag: source stays)
// ════════════════════════════════════════════════════════════
function onPalDragStart(e) {
    dragProc = e.currentTarget.dataset.process;
    dragSrc  = null;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', dragProc);
}

// ════════════════════════════════════════════════════════════
//  Drag — placed blocks (move-on-drag: source cleared)
// ════════════════════════════════════════════════════════════
function onPlacedDragStart(e) {
    e.stopPropagation();
    dragProc = e.currentTarget.dataset.process;
    dragSrc  = e.currentTarget.parentElement;   // the .cell
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragProc);
    const target = e.currentTarget;
    setTimeout(() => target.classList.add('dragging'), 0);
}

function onPlacedDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    dragProc = null;
    dragSrc  = null;
}

// ════════════════════════════════════════════════════════════
//  Drop zone events (on every .cell)
// ════════════════════════════════════════════════════════════
function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSrc ? 'move' : 'copy';
}

function onDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
    // Only clear highlight when the pointer truly leaves the cell
    // (not when moving over the child .placed element inside it)
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

function onDrop(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    cell.classList.remove('drag-over');

    if (!dragProc) return;

    // Same cell — no-op
    if (dragSrc === cell) { dragProc = null; dragSrc = null; return; }

    // Move: clear source cell
    if (dragSrc) { dragSrc.innerHTML = ''; dragSrc = null; }

    // Place in target cell (replaces any existing block)
    cell.innerHTML = '';
    cell.appendChild(makePlaced(dragProc));
    dragProc = null;

    saveState();
}

// ════════════════════════════════════════════════════════════
//  Placed block factory
// ════════════════════════════════════════════════════════════
function makePlaced(name) {
    const idx = cfg.names.indexOf(name);
    const div = mkDiv('placed');
    div.style.background = procColor(idx >= 0 ? idx : 0);
    div.textContent = name;
    div.dataset.process = name;
    div.draggable = true;
    div.title = 'Click to remove  ·  drag to move';

    div.addEventListener('dragstart', onPlacedDragStart);
    div.addEventListener('dragend',   onPlacedDragEnd);
    div.addEventListener('click', e => {
        e.stopPropagation();
        div.parentElement.innerHTML = '';
        saveState();
    });

    return div;
}

// ════════════════════════════════════════════════════════════
//  Palette (re)build
// ════════════════════════════════════════════════════════════
function rebuildPalette() {
    const palette = document.getElementById('palette');
    palette.innerHTML = '';
    cfg.names.forEach((name, idx) => {
        const d = mkDiv('proc');
        d.style.background = procColor(idx);
        d.textContent = name;
        d.draggable = true;
        d.dataset.process = name;
        d.addEventListener('dragstart', onPalDragStart);
        d.addEventListener('dragend',   onPlacedDragEnd);
        palette.appendChild(d);
    });
}

// ════════════════════════════════════════════════════════════
//  Controls
// ════════════════════════════════════════════════════════════
function readNamingConfig() {
    const style = document.querySelector('input[name="naming-style"]:checked').value;
    if (style === 'p-style') return { style, names: ['P1','P2','P3','P4','P5'], raw: '' };
    if (style === 'a-style') return { style, names: ['A','B','C','D','E'],       raw: '' };

    const raw = document.getElementById('custom-names').value;
    const names = raw.split(',')
        .map(s => s.trim())
        .filter(s => s.length >= 1 && s.length <= 4);

    if (names.length < 3 || names.length > 8) {
        showToast('Custom names: enter 3–8 names, each 1–4 characters.');
        return null;
    }
    if (new Set(names).size < names.length) {
        showToast('Custom names: no duplicates allowed.');
        return null;
    }
    return { style, names, raw };
}

function applyConfig() {
    const naming = readNamingConfig();
    if (!naming) return;   // validation failed — abort

    const clamp = (id, lo, hi) => {
        const v = parseInt(document.getElementById(id).value, 10);
        return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
    };

    // Snapshot placed blocks
    const snapshot = [];
    document.querySelectorAll('.cell').forEach(cell => {
        const placed = cell.querySelector('.placed');
        if (placed) snapshot.push({ col: cell.dataset.col, t: +cell.dataset.t, process: placed.dataset.process });
    });

    // Snapshot tracking markers
    const markerSnap = [];
    document.querySelectorAll('.track-cell').forEach(cell => {
        cell.querySelectorAll('.marker').forEach(m => {
            markerSnap.push({ trackType: cell.dataset.trackType, t: +cell.dataset.t, process: m.dataset.process });
        });
    });

    cfg.names            = naming.names;
    cfg.namingStyle      = naming.style;
    cfg.customNamesInput = naming.raw;
    cfg.timeIncrement    = parseInt(document.querySelector('input[name="time-increment"]:checked')?.value || '1', 10);

    cfg.cpus = clamp('cfg-cpus', 1, 2);
    cfg.io   = clamp('cfg-io',   1, 3);
    cfg.len  = clamp('cfg-len',  5, 50);
    cfg.rq   = clamp('cfg-rq',   4, 8);
    cfg.ioq  = clamp('cfg-ioq',  4, 8);

    // Reflect clamped values back into inputs
    document.getElementById('cfg-cpus').value = cfg.cpus;
    document.getElementById('cfg-io').value   = cfg.io;
    document.getElementById('cfg-len').value  = cfg.len;
    document.getElementById('cfg-rq').value   = cfg.rq;
    document.getElementById('cfg-ioq').value  = cfg.ioq;

    rebuildPalette();
    buildGrid();

    // Restore blocks and markers that still fit within new bounds
    let lost = 0;
    snapshot.forEach(({ col, t, process }) => {
        const cell = document.querySelector(`.cell[data-col="${col}"][data-t="${t}"]`);
        if (cell) { cell.innerHTML = ''; cell.appendChild(makePlaced(process)); }
        else lost++;
    });
    markerSnap.forEach(({ trackType, t, process }) => {
        const cell = document.querySelector(`.track-cell[data-track-type="${trackType}"][data-t="${t}"]`);
        if (cell) cell.appendChild(makeMarker(process, trackType));
        else lost++;
    });

    if (lost > 0) showToast(`${lost} block${lost > 1 ? 's' : ''} removed — outside new grid bounds.`);

    saveState();
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));
    setTimeout(() => {
        t.classList.remove('toast-show');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 3000);
}

function resetGrid() {
    document.querySelectorAll('.cell').forEach(c => (c.innerHTML = ''));
    document.querySelectorAll('.track-cell').forEach(c => (c.innerHTML = ''));
    localStorage.removeItem('osScheduleState');
}

function updateMeta() {
    const el = document.querySelector('.site-tagline');
    if (!el) return;
    const maxT = (cfg.len - 1) * (cfg.timeIncrement || 1);
    el.textContent =
        `t = 0 … ${maxT}${cfg.timeIncrement > 1 ? ` (×${cfg.timeIncrement})` : ''}` +
        `  ·  ${cfg.cpus} CPU` +
        `  ·  ${cfg.io} I/O device${cfg.io > 1 ? 's' : ''}` +
        `  ·  ${cfg.rq} RQ rows  ·  ${cfg.ioq} IOQ rows`;
}

function updateScrollHint() {
    const scroll = document.getElementById('grid-scroll');
    const hint   = document.getElementById('scroll-hint');
    if (!scroll || !hint) return;

    const atLeft  = scroll.scrollLeft < 2;
    const atRight = scroll.scrollLeft >= scroll.scrollWidth - scroll.clientWidth - 2;
    const canScroll = scroll.scrollWidth > scroll.clientWidth + 4;

    hint.classList.toggle('visible', canScroll && !atRight);
    document.getElementById('scroll-arr-left').style.visibility  = atLeft  ? 'hidden' : 'visible';
    document.getElementById('scroll-arr-right').style.visibility = atRight ? 'hidden' : 'visible';
}

// ── Spinbox steppers ─────────────────────────────────────────
function setupSpinners() {
    document.querySelectorAll('.spin').forEach(btn => {
        btn.addEventListener('click', () => {
            const inp = document.getElementById(btn.dataset.for);
            const val = parseInt(inp.value, 10) + parseInt(btn.dataset.d, 10);
            inp.value = Math.max(+inp.min, Math.min(+inp.max, val));
        });
    });
}

// ── Micro helper ─────────────────────────────────────────────
function mkDiv(cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    return d;
}

// ════════════════════════════════════════════════════════════
//  Session persistence (localStorage)
// ════════════════════════════════════════════════════════════
function saveState() {
    const blocks = [];
    document.querySelectorAll('.cell').forEach(cell => {
        const placed = cell.querySelector('.placed');
        if (placed) blocks.push({ col: cell.dataset.col, t: cell.dataset.t, process: placed.dataset.process });
    });
    const markers = [];
    document.querySelectorAll('.track-cell').forEach(cell => {
        cell.querySelectorAll('.marker').forEach(m => {
            markers.push({ trackType: cell.dataset.trackType, t: +cell.dataset.t, process: m.dataset.process });
        });
    });
    localStorage.setItem('osScheduleState', JSON.stringify({ cfg: { ...cfg }, blocks, markers }));
}

function restoreState(state) {
    Object.assign(cfg, state.cfg);
    document.getElementById('cfg-cpus').value = cfg.cpus;
    document.getElementById('cfg-io').value   = cfg.io;
    document.getElementById('cfg-len').value  = cfg.len;
    document.getElementById('cfg-rq').value   = cfg.rq;
    document.getElementById('cfg-ioq').value  = cfg.ioq;

    // Restore naming UI
    const radio = document.querySelector(`input[name="naming-style"][value="${cfg.namingStyle || 'p-style'}"]`);
    if (radio) radio.checked = true;

    // Restore time-increment radio
    const incrRadio = document.querySelector(`input[name="time-increment"][value="${cfg.timeIncrement || 1}"]`);
    if (incrRadio) incrRadio.checked = true;
    const customInp = document.getElementById('custom-names');
    customInp.value    = cfg.customNamesInput || '';
    customInp.disabled = cfg.namingStyle !== 'custom';

    rebuildPalette();
    buildGrid();
    state.blocks.forEach(({ col, t, process }) => {
        const cell = document.querySelector(`.cell[data-col="${col}"][data-t="${t}"]`);
        if (cell) { cell.innerHTML = ''; cell.appendChild(makePlaced(process)); }
    });
    (state.markers || []).forEach(({ trackType, t, process }) => {
        const cell = document.querySelector(`.track-cell[data-track-type="${trackType}"][data-t="${t}"]`);
        if (cell) cell.appendChild(makeMarker(process, trackType));
    });
}

// ════════════════════════════════════════════════════════════
//  PNG export  (requires html2canvas CDN)
// ════════════════════════════════════════════════════════════
async function exportPNG() {
    const scrollEl = document.getElementById('grid-scroll');
    const btn = document.getElementById('export-btn');

    // Full-screen loading overlay with spinner
    const overlay = mkDiv('export-overlay');
    overlay.innerHTML = '<div class="export-spinner"></div><p class="export-msg">Generating image…</p>';
    document.body.appendChild(overlay);
    btn.disabled = true;

    // Two frames: paint overlay, flush layout
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // ── Neutralise sticky positioning ────────────────────────
    // html2canvas renders sticky elements at their current stuck screen
    // position, not their flow position, causing the time row to overlap
    // the first content row.  Setting position:relative puts every element
    // back in normal flow for the capture, then we restore in finally.
    const stickyEls  = Array.from(scrollEl.querySelectorAll('.time-row, .row-label'));
    const savedPos   = stickyEls.map(el => { const v = el.style.position; el.style.position = 'relative'; return v; });

    // Read full dimensions after neutralising sticky (flow reflows)
    const fullW = scrollEl.scrollWidth;
    const fullH = scrollEl.scrollHeight;

    // Lift the CSS overflow clip
    const origOverflow = scrollEl.style.overflow;
    scrollEl.style.overflow = 'visible';

    try {
        const canvas = await html2canvas(scrollEl, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            width:        fullW,
            height:       fullH,
            windowWidth:  fullW,
            windowHeight: fullH,
        });

        await new Promise(resolve => {
            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                a.download = `OS_Schedule_${ts}.png`;
                a.href = url;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                resolve();
            }, 'image/png');
        });
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Export failed — try a shorter timeline or zoom out.');
    } finally {
        // Restore sticky positioning and overflow
        stickyEls.forEach((el, i) => { el.style.position = savedPos[i]; });
        scrollEl.style.overflow = origOverflow;
        document.body.removeChild(overlay);
        btn.disabled = false;
    }
}

// ════════════════════════════════════════════════════════════
//  Bootstrap
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    setupSpinners();

    // Naming style radio — enable/disable custom text input
    document.querySelectorAll('input[name="naming-style"]').forEach(r => {
        r.addEventListener('change', e => {
            const inp = document.getElementById('custom-names');
            inp.disabled = e.target.value !== 'custom';
            if (!inp.disabled) inp.focus();
        });
    });

    document.getElementById('apply-btn').addEventListener('click', applyConfig);
    document.getElementById('reset-btn').addEventListener('click', resetGrid);
    document.getElementById('export-btn').addEventListener('click', exportPNG);

    document.getElementById('grid-scroll').addEventListener('scroll', updateScrollHint, { passive: true });

    // Session restore prompt
    const saved = localStorage.getItem('osScheduleState');
    if (saved) {
        const banner = document.getElementById('restore-banner');
        banner.classList.remove('hidden');
        const parsed = JSON.parse(saved);
        banner.querySelector('.restore-yes').addEventListener('click', () => {
            restoreState(parsed);
            banner.classList.add('hidden');
        });
        banner.querySelector('.restore-no').addEventListener('click', () => {
            localStorage.removeItem('osScheduleState');
            banner.classList.add('hidden');
            buildGrid();
        });
    } else {
        rebuildPalette();
        buildGrid();
    }
});
