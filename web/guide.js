// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse sideboard data into an array of records. Accepts two layouts, as CSV or TSV:
 *   long:   deck · opponent · card · maindeck (1/0) · delta, one row per change
 *   matrix: md · sb · <deck name> · opponent columns, as kept in a spreadsheet.
 */
function parseData(text) {
  const rows = toRows(text);
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
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
}

function parseLong(rows) {
  const records = [];
  for (const cells of rows) {
    if (cells.length < 5 || cells[0].toLowerCase() === 'deck') continue;
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
 * A card in both main and sideboard gets a row in each section: cuts come from
 * the main copies, additions from the sideboard.
 * A '*' or '?' on a value marks an optional change.
 */
function parseMatrix(rows) {
  const header = rows[0];
  const title  = header[2];

  const columnFace = {};
  let face = 0;
  for (let i = 3; i < header.length; i++) {
    if (header[i]) columnFace[i] = face;
    else if (Object.values(columnFace).includes(face)) face++;
  }

  // Card-less records keep every opponent column, in header order, even without changes
  const records = Object.keys(columnFace).map(i => ({ deck: title, opponent: header[i], face: columnFace[i], card: null }));
  for (const cells of rows.slice(1)) {
    const md   = parseInt(cells[0], 10) || 0;
    const sb   = parseInt(cells[1], 10) || 0;
    const name = cells[2];
    if (!name || name.toLowerCase() === 'total') continue;

    cells.forEach((value, i) => {
      if (!(i in columnFace)) return;
      const n = parseInt(value.replace(/[^0-9-]/g, ''), 10);
      if (!n) return;
      const fromSideboard = sb > 0 && (n > 0 || md === 0);
      records.push({
        deck:     title,
        opponent: header[i],
        face:     columnFace[i],
        card:     `${fromSideboard ? sb : md} ${name}`,
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

/**
 * Generate an SVG string that faithfully reproduces the original Jinja2
 * template layout, but with dynamic dimensions to fit any data size.
 *
 * Original template coordinate system (inside transform="translate(81.6,111) scale(0.9)"):
 *   Title:            x=818.5,  y=191   (centered, 90px)
 *   Col bg rects:     x=476+100*i, y=315, w=96, h=500+60*nCards
 *   Col headers:      x=538+100*i, y=730, rotated -90°, 40px
 *   Horiz grid lines: y=713+60*i,  x1=480, x2=580+100*nDecks
 *   Card name text:   x=540, y=755+60*i,  text-anchor:end, 40px
 *   Delta value text: x=526+100*xi, y=755+60*yi, text-anchor:middle, 32px
 */
function generateSVG(deckName, cards, decks, data, firstSideboard = -1) {
  const nCards = cards.length;
  const nDecks = decks.length;

  // Compute SVG canvas dimensions so all content fits with comfortable margins.
  // Content right edge (in transform space): 538 + 100*nDecks (last header x)
  // Content bottom edge (in transform space): 755 + 60*(nCards+1) (last row + one grid line)
  const contentRight  = 538 + 100 * nDecks + 60;   // +60px breathing room
  const contentBottom = 755 + 60 * (nCards + 1);

  // Apply the scale(0.9) and translate(81.6, 111) from the original template
  const svgW = Math.ceil(81.6 + contentRight  * 0.9);
  const svgH = Math.ceil(111  + contentBottom * 0.9 + 30);

  // Title x centered within the SVG canvas, mapped back into transform space
  const titleX = Math.round((svgW / 2 - 81.6) / 0.9);

  const lines = [];

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`);

  // White background
  lines.push(`  <rect width="${svgW}" height="${svgH}" fill="#ffffff"/>`);

  // Content group — same transform as the original Inkscape template
  lines.push(`  <g transform="translate(81.6,111) scale(0.9)">`);

  // ── Title ──────────────────────────────────────────────────────────────────
  lines.push(`    <text x="${titleX}" y="191" ` +
    `style="font-size:90px;font-family:sans-serif;text-anchor:middle;fill:#000000">` +
    `${escapeXml(deckName)}</text>`);

  // ── Opponent columns: alternating backgrounds + rotated headers ────────────
  for (let i = 0; i < nDecks; i++) {
    const idx  = i + 1; // 1-based, matching Jinja loop.index
    const colX = 476 + 100 * idx;
    const txtX = 538 + 100 * idx;

    // Odd columns get a light grey background strip
    if (idx % 2 !== 0) {
      lines.push(`    <rect x="${colX}" y="315" width="96" height="${500 + 60 * nCards}" fill="#ececec"/>`);
    }

    // Deck name rotated -90° so it reads top-to-bottom
    lines.push(`    <text x="${txtX}" y="730" transform="rotate(-90,${txtX},730)" ` +
      `style="font-size:40px;font-family:sans-serif;fill:#000000">` +
      `${escapeXml(decks[i])}</text>`);
  }

  // ── Card rows: grid lines + card name labels ───────────────────────────────
  const lineX2 = 580 + 100 * nDecks;

  for (let i = 0; i < nCards; i++) {
    const idx   = i + 1;
    const lineY = 713 + 60 * idx;
    const textY = 755 + 60 * idx;
    const divider = i === firstSideboard && i > 0;

    lines.push(`    <line x1="${divider ? 0 : 480}" y1="${lineY}" x2="${lineX2}" y2="${lineY}" ` +
      `stroke="rgb(40,40,40)" stroke-width="${divider ? 5 : 2}" stroke-opacity="${divider ? 0.8 : 0.2}"/>`);

    lines.push(`    <text x="540" y="${textY}" ` +
      `style="font-size:40px;font-family:sans-serif;text-anchor:end;fill:#000000">` +
      `${escapeXml(cards[i])}</text>`);
  }

  // ── Delta values ───────────────────────────────────────────────────────────
  for (let xi = 0; xi < nDecks; xi++) {
    const cellX = 526 + 100 * (xi + 1);
    for (let yi = 0; yi < nCards; yi++) {
      const cellY = 755 + 60 * (yi + 1);
      const value = (data[decks[xi]] && data[decks[xi]][cards[yi]]) || '';
      if (!value) continue;

      lines.push(`    <text x="${cellX}" y="${cellY}" ` +
        `style="font-size:32px;font-family:sans-serif;text-anchor:middle;${valueStyle(value)}">` +
        `${escapeXml(value.replace('*', ''))}</text>`);
    }
  }

  lines.push(`  </g>`);
  lines.push(`</svg>`);

  return lines.join('\n');
}

// Red for cuts, green for additions; optional ones faded
function valueStyle(value) {
  const color = value.includes('-') ? '#6C1600' : '#166C00';
  return (value.includes('*') ? 'font-style:italic;fill-opacity:0.45;' : '') + `fill:${color}`;
}

// ─── Fold Sheet ───────────────────────────────────────────────────────────────

const FOLD = { font: 34, valueFont: 30, row: 46, col: 50, pad: 24, title: 64 };

// ponytail: estimated sans-serif width, measure with getBBox if labels get clipped
const textWidth = (s, size) => s.length * size * 0.56;

/**
 * Two 63 × 88 mm card faces side by side on one 126 × 88 mm sheet, to fold in
 * the middle. Both faces share the same rows. With namesOutside, the right
 * face puts card names on its right edge.
 */
function generateFoldSVG(title, cards, faces, data, firstSideboard, namesOutside = false) {
  const { font, row, col, pad } = FOLD;
  const nameW   = Math.max(...[...cards, 'Total'].map(c => textWidth(c, font))) + 16;
  const headerH = Math.max(...faces.flat().map(o => textWidth(o, font))) + 16;
  const faceW   = pad * 2 + nameW + Math.max(...faces.map(f => f.length)) * col;
  const tableY  = pad + FOLD.title + headerH;
  const faceH   = tableY + (cards.length + 1) * row + pad;

  // 10 units per mm
  const halfW = 630, sheetH = 880;
  const scale = Math.min(halfW / faceW, sheetH / faceH);

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="126mm" height="88mm" viewBox="0 0 ${halfW * 2} ${sheetH}">`,
    `  <rect width="${halfW * 2}" height="${sheetH}" fill="#ffffff" stroke="#bbbbbb" stroke-width="2"/>`,
    `  <line x1="${halfW}" y1="0" x2="${halfW}" y2="${sheetH}" stroke="#bbbbbb" stroke-width="2" stroke-dasharray="12,10"/>`,
  ];

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
    lines.push(`    <text x="${faceW / 2}" y="${pad + FOLD.title * 0.8}" font-size="52" text-anchor="middle">${escapeXml(title)}</text>`);

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

if (typeof module === 'object') {
  module.exports = { parseData, getDecks, buildPivot, unbalanced, generateSVG, generateFoldSVG };
}
