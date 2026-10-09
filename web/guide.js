// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse sideboard data into an array of records. Accepts two layouts, as CSV or TSV:
 *   long:   deck · opponent · card · maindeck (1/0) · delta, one row per change
 *   matrix: md · sb · <deck name> · opponent columns, as kept in a spreadsheet.
 * Anything else, like a spreadsheet tab that isn't a guide, gives no records.
 */
function parseData(text) {
  const rows = toRows(text);
  while (rows.length && !rows[0].some(c => c)) rows.shift();
  const layout = rows[0]?.[0].toLowerCase();
  if (layout === 'md') return parseMatrix(rows);
  if (layout === 'deck') return parseLong(rows.slice(1));
  return [];
}

/**
 * Split text into trimmed cells: tab-separated if the first line has a tab,
 * comma-separated otherwise. Quoted cells may hold delimiters, newlines and "".
 */
function toRows(text) {
  const delimiter = text.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    }
    else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map(r => r.map(c => c.trim()));
}

/**
 * A change as '+2', '-1' or '+1*' (optional), or '' when the value isn't one.
 * Typographic minus signs count as cuts.
 */
function parseDelta(value) {
  const n = parseInt(value.replace(/[−–—]/g, '-').replace(/[^0-9-]/g, ''), 10);
  if (!n) return '';
  return (n > 0 ? '+' : '') + n + (/[*?]/.test(value) ? '*' : '');
}

function parseLong(rows) {
  const records = [];
  for (const cells of rows) {
    if (cells.length < 5 || !cells[0]) continue;
    records.push({
      deck:     cells[0],
      opponent: cells[1],
      card:     cells[2],
      name:     cells[2],
      maindeck: parseInt(cells[3], 10) || 0,
      delta:    parseDelta(cells[4]),
    });
  }
  return records;
}

/**
 * A blank header column splits the matchups onto the two faces of a folded card.
 * Cards below the first blank row are sideboard cards, counted from md or sb.
 * Above it, a card in both main and sideboard gets a row in each section: cuts
 * come from the main copies, additions from the sideboard.
 * A '*' or '?' on a value marks an optional change.
 */
function parseMatrix(rows) {
  const header = rows[0];

  const columns = [];
  let face = 0;
  for (let i = 3; i < header.length; i++) {
    if (header[i]) columns.push({ column: i, opponent: header[i], face });
    else if (columns.at(-1)?.face === face) face++;
  }
  const columnAt = new Map(columns.map(c => [c.column, c]));

  // Card-less records keep every opponent column, in header order, even without changes
  const records = columns.map(c => ({ deck: '', ...c, card: null }));
  let pastBlankRow = false;
  rows.slice(1).forEach((cells, row) => {
    if (!cells.some(c => c)) { pastBlankRow = true; return; }
    const md   = parseInt(cells[0], 10) || 0;
    const sb   = parseInt(cells[1], 10) || 0;
    const name = cells[2];
    if (!name || name.toLowerCase() === 'total') return;

    cells.forEach((value, i) => {
      const column = columnAt.get(i);
      const delta = column && parseDelta(value);
      if (!delta) return;
      const fromSideboard = pastBlankRow || (sb > 0 && (delta[0] === '+' || md === 0));
      const count = fromSideboard ? sb || md : md;
      records.push({
        deck:     '',
        ...column,
        row,
        card:     count ? `${count} ${name}` : name,
        name,
        maindeck: fromSideboard ? 0 : 1,
        delta,
      });
    });
  });
  return records;
}

/**
 * Return unique deck names in order of first appearance.
 */
function getDecks(records) {
  const seen = new Set();
  const decks = [];
  for (const r of records) {
    if (!seen.has(r.deck)) { seen.add(r.deck); decks.push(r.deck); }
  }
  return decks;
}

// ponytail: fixed count, derive from the rendered text size if labels get too small
const MAX_FACE_MATCHUPS = 10;

/**
 * Build the card table for one deck:
 *   cards          – rows as { label, name, maindeck, values }, maindeck first, then
 *                    alphabetical; values maps an opponent key to its change
 *   faces          – opponents as { key, name }, split per card face
 *   firstSideboard – index of the first sideboard row, -1 if none
 * Opponents are keyed by sheet column, so two columns with the same name stay apart.
 */
function buildPivot(records, deckName) {
  const deckRecords = records.filter(r => r.deck === deckName);
  const opponentKey = r => r.column ?? r.opponent;

  const opponents = new Map();
  const faces = [];
  for (const r of deckRecords) {
    if (opponents.has(opponentKey(r))) continue;
    const opponent = { key: opponentKey(r), name: r.opponent };
    opponents.set(opponent.key, opponent);
    (faces[r.face || 0] ||= []).push(opponent);
  }
  if (faces.length === 1 && opponents.size > MAX_FACE_MATCHUPS) {
    const half = Math.ceil(opponents.size / 2);
    faces.splice(0, 1, faces[0].slice(0, half), faces[0].slice(half));
  }

  const rows = new Map();
  for (const r of deckRecords.filter(r => r.card)) {
    const key = `${r.row ?? r.card}|${r.maindeck}`;
    if (!rows.has(key)) rows.set(key, { label: r.card, name: r.name, maindeck: r.maindeck, values: new Map() });
    rows.get(key).values.set(opponentKey(r), r.delta);
  }
  const cards = [...rows.values()].sort((a, b) => b.maindeck - a.maindeck || a.name.localeCompare(b.name));
  const firstSideboard = cards.findIndex(c => !c.maindeck);

  return { cards, faces, firstSideboard };
}

function matchupTotal(cards, opponent) {
  return cards.reduce((sum, card) => sum + (parseInt(card.values.get(opponent.key), 10) || 0), 0);
}

/**
 * Matchups that bring in more cards than they take out, as "opponent +n".
 */
function unbalanced({ cards, faces }) {
  return faces.flat()
    .map(opponent => [opponent.name, matchupTotal(cards, opponent)])
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `${name} +${n}`);
}

// ─── SVG Generation ───────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Red for cuts, green for additions; optional ones faded
function valueStyle(value) {
  const color = value.includes('-') ? '#6C1600' : '#166C00';
  return (value.includes('*') ? 'font-style:italic;fill-opacity:0.45;' : '') + `fill:${color}`;
}

// ─── Card Sheet ───────────────────────────────────────────────────────────────

const FOLD = { font: 34, valueFont: 30, row: 46, col: 50, pad: 24, title: 64 };

// ponytail: estimated sans-serif width, measure with getBBox if labels get clipped
const textWidth = (s, size) => s.length * size * 0.56;

const EXAMPLE_SHEET = [
  ['md', 'sb', 'Card', 'Delver', 'Burn', 'Reanimator', 'Storm', '', 'Elves', 'Lands', 'Show and Tell', 'Eldrazi'],
  ['4', '', 'Swords to Plowshares', '', '', '', '-2', '', '', '-2', '-2'],
  ['4', '', 'Thalia, Guardian of Thraben', '', '', '', '', '', '-1', '', '', '-2'],
  ['3', '', 'Flickerwisp', '-1', '-2', '-1'],
  ['2', '', 'Mirran Crusader', '', '', '-1', '-2', '', '', '', '-2'],
  [],
  ['', '2', 'Path to Exile', '+1', '', '', '', '', '+1*', '', '', '+2'],
  ['', '2', 'Kor Firewalker', '', '+2'],
  ['', '2', 'Rest in Peace', '', '', '+2'],
  ['', '2', 'Ethersworn Canonist', '', '', '', '+2'],
  ['', '2', 'Surgical Extraction', '', '', '', '+2'],
  ['', '2', "Council's Judgment", '', '', '', '', '', '', '+2', '+2'],
  ['', '2', 'Containment Priest', '', '', '', '', '', '', '', '+2'],
].map(row => row.join('\t')).join('\n');

/**
 * One 63 × 88 mm card face, or two side by side on a 126 × 88 mm sheet to fold
 * in the middle. Both faces share the same rows. With namesOutside, the right
 * face puts card names on its right edge. An empty title leaves no title row.
 */
function generateCardSVG(title, { cards, faces, firstSideboard }, namesOutside = false) {
  const { font, row, col, pad } = FOLD;
  const rowLabels = [...cards.map(c => c.label), 'Total'];
  const nameW   = Math.max(...rowLabels.map(l => textWidth(l, font))) + 16;
  const headerH = Math.max(...faces.flat().map(o => textWidth(o.name, font))) + 16;
  const faceW   = pad * 2 + nameW + Math.max(...faces.map(f => f.length)) * col;
  const tableY  = pad + (title ? FOLD.title : 0) + headerH;
  const faceH   = tableY + (cards.length + 1) * row + pad;

  // 10 units per mm
  const halfW = 630, sheetH = 880, sheetW = halfW * faces.length;
  const scale = Math.min(halfW / faceW, sheetH / faceH);

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${63 * faces.length}mm" height="88mm" viewBox="0 0 ${sheetW} ${sheetH}">`,
    `  <rect width="${sheetW}" height="${sheetH}" fill="#ffffff" stroke="#bbbbbb" stroke-width="2"/>`,
  ];
  if (faces.length > 1) {
    lines.push(`  <line x1="${halfW}" y1="0" x2="${halfW}" y2="${sheetH}" stroke="#bbbbbb" stroke-width="2" stroke-dasharray="12,10"/>`);
  }

  faces.forEach((opponents, fi) => {
    const namesRight = namesOutside && fi === 1;
    const x0 = fi * halfW + (halfW - faceW * scale) / 2;
    const y0 = (sheetH - faceH * scale) / 2;
    const tableW = nameW + opponents.length * col;
    const left   = (faceW - tableW) / 2;
    const colsX  = namesRight ? left : left + nameW;
    const nameX  = namesRight ? colsX + opponents.length * col + 12 : colsX - 12;
    const anchor = namesRight ? 'start' : 'end';
    const bottom = tableY + (cards.length + 1) * row;

    lines.push(`  <g transform="translate(${x0.toFixed(1)},${y0.toFixed(1)}) scale(${scale.toFixed(4)})" font-family="sans-serif">`);
    if (title) lines.push(`    <text x="${faceW / 2}" y="${pad + FOLD.title * 0.8}" font-size="52" text-anchor="middle">${escapeXml(title)}</text>`);

    opponents.forEach((opp, i) => {
      const x = colsX + i * col;
      if (i % 2 === 0) lines.push(`    <rect x="${x + 2}" y="${tableY - headerH}" width="${col - 4}" height="${bottom - tableY + headerH}" fill="#ececec"/>`);
      const tx = x + col / 2 + font * 0.35;
      lines.push(`    <text x="${tx}" y="${tableY - 8}" transform="rotate(-90,${tx},${tableY - 8})" font-size="${font}">${escapeXml(opp.name)}</text>`);
    });

    rowLabels.forEach((label, ri) => {
      const y = tableY + ri * row;
      const thick = (ri === firstSideboard && ri > 0) || ri === cards.length;
      lines.push(`    <line x1="${left}" y1="${y}" x2="${left + tableW}" y2="${y}" stroke="rgb(40,40,40)" ` +
        `stroke-width="${thick ? 4 : 2}" stroke-opacity="${thick ? 0.8 : 0.2}"/>`);
      lines.push(`    <text x="${nameX}" y="${y + row * 0.72}" font-size="${font}" text-anchor="${anchor}">${escapeXml(label)}</text>`);
    });

    opponents.forEach((opp, i) => {
      const cx = colsX + i * col + col / 2;
      cards.forEach((card, ri) => {
        const value = card.values.get(opp.key);
        if (!value) return;
        lines.push(`    <text x="${cx}" y="${tableY + ri * row + row * 0.7}" font-size="${FOLD.valueFont}" text-anchor="middle" ` +
          `style="${valueStyle(value)}">${escapeXml(value.replace('*', ''))}</text>`);
      });
      const total = matchupTotal(cards, opp);
      const style = total > 0 ? 'font-weight:bold;fill:#C00000' : 'fill:#888888';
      lines.push(`    <text x="${cx}" y="${tableY + cards.length * row + row * 0.7}" font-size="${FOLD.valueFont}" text-anchor="middle" ` +
        `style="${style}">${total > 0 ? '+' : ''}${total}</text>`);
    });

    lines.push(`  </g>`);
  });

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

function sheetId(link) {
  return link.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ?? null;
}

/**
 * Tabs listed in a spreadsheet's htmlview page, as [{ name, gid }].
 * ponytail: scrapes Google's undocumented htmlview page; switch to the Sheets API (needs a key) if it breaks.
 */
function parseTabs(html) {
  const tabs = [];
  for (const [, name, gid] of html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)",.*?gid: "(\d+)"/g)) {
    tabs.push({ name: unescapeJs(name), gid });
  }
  return tabs;
}

function unescapeJs(str) {
  try {
    return JSON.parse(`"${str.replace(/\\x([0-9a-f]{2})/gi, '\\u00$1')}"`);
  } catch {
    return str;
  }
}

// ─── Shared links ─────────────────────────────────────────────────────────────

/**
 * One deck's guide as matrix CSV, leaving out anything else in its sheet.
 */
function toMatrixCsv(records, deckName) {
  const { cards, faces, firstSideboard } = buildPivot(records, deckName);
  const opponents = faces.flatMap((face, i) => (i ? [null, ...face] : face));
  const line = cells => cells.map(csvCell).join(',');

  const lines = [line(['md', 'sb', 'Card', ...opponents.map(o => o?.name ?? '')])];
  cards.forEach((card, i) => {
    if (i === firstSideboard) lines.push('');
    const count = card.label.slice(0, card.label.length - card.name.length).trim();
    const deltas = opponents.map(o => (o && card.values.get(o.key)) || '');
    lines.push(line([card.maindeck ? count : '', card.maindeck ? '' : count, card.name, ...deltas]));
  });
  return lines.join('\n');
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * UTF-8 text from base64 or base64url. Accepts spaces for '+', which a query
 * string decodes an unescaped '+' into.
 */
function decodeBase64(text) {
  const base64 = text.replace(/[ -]/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

// Base64 never contains commas, tabs or line breaks, so a guide with any of them came in as plain text
function decodePaste(text) {
  return /[,\t\n]/.test(text) ? text : decodeBase64(text);
}

if (typeof module === 'object') {
  module.exports = { EXAMPLE_SHEET, parseData, getDecks, buildPivot, unbalanced, generateCardSVG, sheetId, parseTabs, toMatrixCsv, decodeBase64, decodePaste };
}
