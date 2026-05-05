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
};

// ════════════════════════════════════════════════════════════
//  Drag state
// ════════════════════════════════════════════════════════════
let dragProc = null;   // "P1" … "P5"
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

    // 1 · I/O Queue (shared across all I/O devices)
    section(
        Array.from({ length: cfg.ioq }, (_, i) => ({
            label:  `I/O Queue ${i + 1}`,
            type:   'ioq',
            colId:  `ioq-${i + 1}`,
        }))
    );

    // 2 · I/O Devices
    section(
        Array.from({ length: cfg.io }, (_, i) => ({
            label:  `I/O Device ${i + 1}`,
            type:   'io',
            colId:  `io-${i + 1}`,
        }))
    );

    // 3 · Ready Queue
    section(
        Array.from({ length: cfg.rq }, (_, i) => ({
            label:  `Ready Queue ${i + 1}`,
            type:   'rq',
            colId:  `rq-${i + 1}`,
        }))
    );

    // 4 · CPU(s)
    section(
        Array.from({ length: cfg.cpus }, (_, i) => ({
            label:  cfg.cpus > 1 ? `CPU ${i + 1}` : 'CPU',
            type:   'cpu',
            colId:  `cpu-${i + 1}`,
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

    // Time axis — sticky bottom
    grid.appendChild(makeTimeRow());

    updateMeta();
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
    corner.textContent = 't';
    row.appendChild(corner);

    for (let t = 0; t < cfg.len; t++) {
        const tc = mkDiv(`time-cell${t > 0 && t % 5 === 0 ? ' tick' : ''}`);
        tc.textContent = t;
        row.appendChild(tc);
    }

    return row;
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
}

// ════════════════════════════════════════════════════════════
//  Placed block factory
// ════════════════════════════════════════════════════════════
function makePlaced(name) {
    const div = mkDiv(`placed ${name.toLowerCase()}`);
    div.textContent = name;
    div.dataset.process = name;
    div.draggable = true;
    div.title = 'Click to remove  ·  drag to move';

    div.addEventListener('dragstart', onPlacedDragStart);
    div.addEventListener('dragend',   onPlacedDragEnd);
    div.addEventListener('click', e => {
        e.stopPropagation();
        div.parentElement.innerHTML = '';
    });

    return div;
}

// ════════════════════════════════════════════════════════════
//  Controls
// ════════════════════════════════════════════════════════════
function applyConfig() {
    const clamp = (id, lo, hi) => {
        const v = parseInt(document.getElementById(id).value, 10);
        return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
    };

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

    buildGrid();
}

function resetGrid() {
    document.querySelectorAll('.cell').forEach(c => (c.innerHTML = ''));
}

function updateMeta() {
    const el = document.querySelector('.site-tagline');
    if (!el) return;
    el.textContent =
        `t = 0 … ${cfg.len - 1}` +
        `  ·  ${cfg.cpus} CPU` +
        `  ·  ${cfg.io} I/O device${cfg.io > 1 ? 's' : ''}` +
        `  ·  ${cfg.rq} RQ rows  ·  ${cfg.ioq} IOQ rows`;
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
//  Bootstrap
// ════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    setupSpinners();

    // Wire palette drag events
    document.querySelectorAll('#palette .proc').forEach(b => {
        b.addEventListener('dragstart', onPalDragStart);
        b.addEventListener('dragend',   onPlacedDragEnd);
    });

    document.getElementById('apply-btn').addEventListener('click', applyConfig);
    document.getElementById('reset-btn').addEventListener('click', resetGrid);

    buildGrid();
});
