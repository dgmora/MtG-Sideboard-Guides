// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse sideboard data into an array of records. Accepts two layouts, as CSV or TSV:
 *   long:   deck · opponent · card · maindeck (1/0) · delta, one row per change
 *   matrix: md · sb · <deck name> · opponent columns, as kept in a spreadsheet.
 */
function parseData(text) {
  const rows = toRows(text);
  while (rows.length && !rows[0].some(c => c)) rows.shift();
  if (rows.length && rows[0][0].toLowerCase() === 'md') {
    return parseMatrix(rows);
  }
  return parseLong(rows);
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

function parseLong(rows) {
  const records = [];
  for (const cells of rows) {
    if (cells.length < 5 || !cells[0] || cells[0].toLowerCase() === 'deck') continue;
    records.push({
      deck:     cells[0],
      opponent: cells[1],
      card:     cells[2],
      name:     cells[2],
      maindeck: parseInt(cells[3], 10) || 0,
      delta:    cells[4],
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

  const columnFace = {};
  let face = 0;
  for (let i = 3; i < header.length; i++) {
    if (header[i]) columnFace[i] = face;
    else if (Object.values(columnFace).includes(face)) face++;
  }

  // Card-less records keep every opponent column, in header order, even without changes
  const records = Object.keys(columnFace).map(i => ({ deck: '', opponent: header[i], face: columnFace[i], card: null }));
  let pastBlankRow = false;
  for (const cells of rows.slice(1)) {
    if (!cells.some(c => c)) { pastBlankRow = true; continue; }
    const md   = parseInt(cells[0], 10) || 0;
    const sb   = parseInt(cells[1], 10) || 0;
    const name = cells[2];
    if (!name || name.toLowerCase() === 'total') continue;

    cells.forEach((value, i) => {
      if (!(i in columnFace)) return;
      const n = parseInt(value.replace(/[^0-9-]/g, ''), 10);
      if (!n) return;
      const fromSideboard = pastBlankRow || (sb > 0 && (n > 0 || md === 0));
      const count = fromSideboard ? sb || md : md;
      records.push({
        deck:     '',
        opponent: header[i],
        face:     columnFace[i],
        card:     count ? `${count} ${name}` : name,
        name,
        maindeck: fromSideboard ? 0 : 1,
        delta:    (n > 0 ? '+' : '') + n + (/[*?]/.test(value) ? '*' : ''),
      });
    });
  }
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
 * Build a pivot table for one deck:
 *   cards          – rows, sorted maindeck-first then alphabetically
 *   decks          – opponent column headers, in order of first appearance
 *   data           – data[opponent][card] = delta string
 *   faces          – opponents split per card face
 *   firstSideboard – index of the first sideboard row, -1 if none
 */
function buildPivot(records, deckName) {
  const allDeckRecords = records.filter(r => r.deck === deckName);

  // Unique opponents in appearance order
  const seenOpp = new Set();
  const decks = [];
  const faces = [];
  for (const r of allDeckRecords) {
    if (seenOpp.has(r.opponent)) continue;
    seenOpp.add(r.opponent);
    decks.push(r.opponent);
    (faces[r.face || 0] ||= []).push(r.opponent);
  }
  if (faces.length === 1 && decks.length > MAX_FACE_MATCHUPS) {
    const half = Math.ceil(decks.length / 2);
    faces.splice(0, 1, decks.slice(0, half), decks.slice(half));
  }

  const deckRecords = allDeckRecords.filter(r => r.card);
  const cardInfo = {};
  for (const r of deckRecords) {
    if (!(r.card in cardInfo)) cardInfo[r.card] = r;
  }

  // Sort: maindeck cards first, then sideboard-only; alphabetical within each group
  const cards = Object.keys(cardInfo).sort((a, b) => {
    if (cardInfo[b].maindeck !== cardInfo[a].maindeck) return cardInfo[b].maindeck - cardInfo[a].maindeck;
    return cardInfo[a].name.localeCompare(cardInfo[b].name);
  });

  // Build lookup: data[opponent][card] = delta
  const data = {};
  for (const d of decks) data[d] = {};
  for (const r of deckRecords) data[r.opponent][r.card] = r.delta;

  const firstSideboard = cards.findIndex(c => !cardInfo[c].maindeck);

  return { cards, decks, faces, data, firstSideboard };
}

/**
 * Matchups that bring in more cards than they take out, as "opponent +n".
 */
function unbalanced(records, deckName) {
  const totals = {};
  for (const r of records.filter(r => r.deck === deckName)) {
    totals[r.opponent] = (totals[r.opponent] || 0) + (parseInt(r.delta, 10) || 0);
  }
  return Object.entries(totals)
    .filter(([, n]) => n > 0)
    .map(([opp, n]) => `${opp} +${n}`);
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

/**
 * One 63 × 88 mm card face, or two side by side on a 126 × 88 mm sheet to fold
 * in the middle. Both faces share the same rows. With namesOutside, the right
 * face puts card names on its right edge. An empty title leaves no title row.
 */
function generateCardSVG(title, cards, faces, data, firstSideboard, namesOutside = false) {
  const { font, row, col, pad } = FOLD;
  const nameW   = Math.max(...[...cards, 'Total'].map(c => textWidth(c, font))) + 16;
  const headerH = Math.max(...faces.flat().map(o => textWidth(o, font))) + 16;
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
      lines.push(`    <text x="${tx}" y="${tableY - 8}" transform="rotate(-90,${tx},${tableY - 8})" font-size="${font}">${escapeXml(opp)}</text>`);
    });

    const rowLabels = [...cards, 'Total'];
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
        const value = data[opp][card];
        if (!value) return;
        lines.push(`    <text x="${cx}" y="${tableY + ri * row + row * 0.7}" font-size="${FOLD.valueFont}" text-anchor="middle" ` +
          `style="${valueStyle(value)}">${escapeXml(value.replace('*', ''))}</text>`);
      });
      const total = cards.reduce((sum, card) => sum + (parseInt(data[opp][card], 10) || 0), 0);
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
  const { cards, faces, data, firstSideboard } = buildPivot(records, deckName);
  const info = Object.fromEntries(records.filter(r => r.deck === deckName && r.card).map(r => [r.card, r]));
  const opponents = faces.flatMap((face, i) => (i ? ['', ...face] : face));
  const line = cells => cells.map(csvCell).join(',');

  const lines = [line(['md', 'sb', 'Card', ...opponents])];
  cards.forEach((card, i) => {
    if (i === firstSideboard) lines.push('');
    const { name, maindeck } = info[card];
    const count = card.slice(0, card.length - name.length).trim();
    const deltas = opponents.map(opp => (opp && data[opp][card]) || '');
    lines.push(line([maindeck ? count : '', maindeck ? '' : count, name, ...deltas]));
  });
  return lines.join('\n');
}

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function encodeBase64Url(text) {
  const binary = Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * UTF-8 text from base64 or base64url. Accepts spaces for '+', which a query
 * string decodes an unescaped '+' into.
 */
function decodeBase64(text) {
  const base64 = text.replace(/[ -]/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

if (typeof module === 'object') {
  module.exports = { parseData, getDecks, buildPivot, unbalanced, generateCardSVG, sheetId, parseTabs, toMatrixCsv, encodeBase64Url, decodeBase64 };
}
