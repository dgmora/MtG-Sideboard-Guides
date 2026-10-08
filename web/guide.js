// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse sideboard data into an array of records. Accepts two tab-separated layouts:
 *   long:   deck · opponent · card · maindeck (1/0) · delta, one row per change
 *   matrix: md · sb · <deck name> · opponent columns, as kept in a spreadsheet.
 */
function parseData(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length && lines[0].split('\t')[0].trim().toLowerCase() === 'md') {
    return parseMatrix(lines);
  }
  return parseLong(lines);
}

function parseLong(lines) {
  const records = [];
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    if (parts[0].trim().toLowerCase() === 'deck') continue; // header row
    const card = parts[2].trim();
    records.push({
      deck:     parts[0].trim(),
      opponent: parts[1].trim(),
      card,
      name:     card,
      maindeck: parseInt(parts[3].trim(), 10) || 0,
      delta:    parts[4].trim(),
    });
  }
  return records;
}

/**
 * A blank header column splits the matchups onto separate cards, named
 * "<deck> (1/2)", "<deck> (2/2)". A card in both main and sideboard gets a row
 * in each section: cuts come from the main copies, additions from the sideboard.
 * A '*' or '?' on a value marks an optional change.
 */
function parseMatrix(lines) {
  const header = lines[0].split('\t').map(s => s.trim());
  const title  = header[2];

  const groups = [[]];
  for (let i = 3; i < header.length; i++) {
    if (header[i]) groups[groups.length - 1].push(i);
    else if (groups[groups.length - 1].length) groups.push([]);
  }
  const usedGroups = groups.filter(g => g.length);
  const columnDeck = {};
  usedGroups.forEach((cols, gi) => {
    const deck = usedGroups.length > 1 ? `${title} (${gi + 1}/${usedGroups.length})` : title;
    for (const i of cols) columnDeck[i] = deck;
  });

  // Card-less records keep every opponent column, in header order, even without changes
  const records = Object.keys(columnDeck).map(i => ({ deck: columnDeck[i], opponent: header[i], card: null }));
  for (const line of lines.slice(1)) {
    const cells = line.split('\t').map(s => s.trim());
    const md   = parseInt(cells[0], 10) || 0;
    const sb   = parseInt(cells[1], 10) || 0;
    const name = cells[2];
    if (!name || name.toLowerCase() === 'total') continue;

    cells.forEach((value, i) => {
      if (!columnDeck[i]) return;
      const n = parseInt(value.replace(/[^0-9-]/g, ''), 10);
      if (!n) return;
      const fromSideboard = sb > 0 && (n > 0 || md === 0);
      records.push({
        deck:     columnDeck[i],
        opponent: header[i],
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
 *   firstSideboard – index of the first sideboard row, -1 if none
 */
function buildPivot(records, deckName) {
  const allDeckRecords = records.filter(r => r.deck === deckName);

  // Unique opponents in appearance order
  const seenOpp = new Set();
  const decks = [];
  for (const r of allDeckRecords) {
    if (!seenOpp.has(r.opponent)) { seenOpp.add(r.opponent); decks.push(r.opponent); }
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

  return { cards, decks, data, firstSideboard };
}

/**
 * Matchups whose changes don't add up to zero, as "opponent ±n".
 */
function unbalanced(records, deckName) {
  const totals = {};
  for (const r of records.filter(r => r.deck === deckName)) {
    totals[r.opponent] = (totals[r.opponent] || 0) + (parseInt(r.delta, 10) || 0);
  }
  return Object.entries(totals)
    .filter(([, n]) => n !== 0)
    .map(([opp, n]) => `${opp} ${n > 0 ? '+' : ''}${n}`);
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

      // Red for cuts (negative), green for additions (positive); optional ones faded
      const color    = value.includes('-') ? '#6C1600' : '#166C00';
      const optional = value.includes('*') ? 'font-style:italic;fill-opacity:0.45;' : '';
      lines.push(`    <text x="${cellX}" y="${cellY}" ` +
        `style="font-size:32px;font-family:sans-serif;text-anchor:middle;${optional}fill:${color}">` +
        `${escapeXml(value.replace('*', ''))}</text>`);
    }
  }

  lines.push(`  </g>`);
  lines.push(`</svg>`);

  return lines.join('\n');
}

if (typeof module === 'object') {
  module.exports = { parseData, getDecks, buildPivot, unbalanced, generateSVG };
}
