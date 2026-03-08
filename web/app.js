// ─── Data Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse tab-separated sideboard data into an array of records.
 * Skips blank lines and the header row.
 */
function parseData(text) {
  const records = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    if (parts[0].trim().toLowerCase() === 'deck') continue; // header row
    records.push({
      deck:     parts[0].trim(),
      opponent: parts[1].trim(),
      card:     parts[2].trim(),
      maindeck: parseInt(parts[3].trim(), 10) || 0,
      delta:    parts[4].trim(),
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
 *   cards   – rows, sorted maindeck-first then alphabetically
 *   decks   – opponent column headers, in order of first appearance
 *   data    – data[opponent][card] = delta string
 */
function buildPivot(records, deckName) {
  const deckRecords = records.filter(r => r.deck === deckName);

  // Unique opponents in appearance order
  const seenOpp = new Set();
  const decks = [];
  for (const r of deckRecords) {
    if (!seenOpp.has(r.opponent)) { seenOpp.add(r.opponent); decks.push(r.opponent); }
  }

  // Track each card's maindeck status (1 = in maindeck, 0 = sideboard only)
  const cardMaindeck = {};
  for (const r of deckRecords) {
    if (!(r.card in cardMaindeck)) cardMaindeck[r.card] = r.maindeck;
  }

  // Sort: maindeck cards first, then sideboard-only; alphabetical within each group
  const cards = Object.keys(cardMaindeck).sort((a, b) => {
    if (cardMaindeck[b] !== cardMaindeck[a]) return cardMaindeck[b] - cardMaindeck[a];
    return a.localeCompare(b);
  });

  // Build lookup: data[opponent][card] = delta
  const data = {};
  for (const d of decks) data[d] = {};
  for (const r of deckRecords) data[r.opponent][r.card] = r.delta;

  return { cards, decks, data };
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
function generateSVG(deckName, cards, decks, data) {
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

    lines.push(`    <line x1="480" y1="${lineY}" x2="${lineX2}" y2="${lineY}" ` +
      `stroke="rgb(40,40,40)" stroke-width="2" stroke-opacity="0.2"/>`);

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

      // Red for cuts (negative), green for additions (positive)
      const color = value.includes('-') ? '#6C1600' : '#166C00';
      lines.push(`    <text x="${cellX}" y="${cellY}" ` +
        `style="font-size:32px;font-family:sans-serif;text-anchor:middle;fill:${color}">` +
        `${escapeXml(value)}</text>`);
    }
  }

  lines.push(`  </g>`);
  lines.push(`</svg>`);

  return lines.join('\n');
}

// ─── UI ───────────────────────────────────────────────────────────────────────

const textarea    = document.getElementById('data-input');
const deckSelect  = document.getElementById('deck-select');
const svgContainer = document.getElementById('svg-container');
const downloadBtn = document.getElementById('download-btn');
const loadBtn     = document.getElementById('load-btn');
const saveBtn     = document.getElementById('save-btn');
const fileInput   = document.getElementById('file-input');
const previewLabel = document.getElementById('preview-label');

let records    = [];
let currentSVG = '';
let currentDeck = '';

// ── Render ────────────────────────────────────────────────────────────────────

function renderPreview() {
  const deck = deckSelect.value;

  if (!deck) {
    svgContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <p>Select a deck to preview.</p>
      </div>`;
    downloadBtn.disabled = true;
    currentSVG = '';
    previewLabel.textContent = 'Preview';
    return;
  }

  const { cards, decks, data } = buildPivot(records, deck);

  if (cards.length === 0 || decks.length === 0) {
    svgContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <p>No data found for "${deck}".</p>
      </div>`;
    downloadBtn.disabled = true;
    currentSVG = '';
    return;
  }

  currentSVG  = generateSVG(deck, cards, decks, data);
  currentDeck = deck;
  svgContainer.innerHTML = currentSVG;
  downloadBtn.disabled = false;
  previewLabel.textContent = deck;
}

function refreshDeckList() {
  const text  = textarea.value;
  records     = parseData(text);
  const decks = getDecks(records);
  const prev  = deckSelect.value;

  deckSelect.innerHTML = '';

  if (decks.length === 0) {
    deckSelect.innerHTML = '<option value="">— paste data to begin —</option>';
  } else {
    for (const d of decks) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === prev) opt.selected = true;
      deckSelect.appendChild(opt);
    }
    // If previous selection disappeared, fall back to first deck
    if (!decks.includes(prev)) deckSelect.value = decks[0];
  }

  renderPreview();
}

// ── Events ────────────────────────────────────────────────────────────────────

// Debounce textarea input so we don't regenerate on every keystroke
let debounceTimer;
textarea.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshDeckList, 280);
});

deckSelect.addEventListener('change', renderPreview);

// Load from file
loadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    textarea.value = ev.target.result;
    refreshDeckList();
  };
  reader.readAsText(file);
  fileInput.value = ''; // reset so same file can be re-loaded
});

// Save data to .txt file
saveBtn.addEventListener('click', () => {
  const text = textarea.value.trim();
  if (!text) return;
  triggerDownload(new Blob([text], { type: 'text/plain' }), 'sideboards.txt');
});

// Download current SVG
downloadBtn.addEventListener('click', () => {
  if (!currentSVG) return;
  triggerDownload(
    new Blob([currentSVG], { type: 'image/svg+xml' }),
    `${currentDeck}_guide.svg`
  );
});

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Pre-load example data ─────────────────────────────────────────────────────
// Attempts to fetch ../sideboards.txt (works when served from a local server).
// Fails silently when opened directly via file://.
fetch('../sideboards.txt')
  .then((r) => {
    if (!r.ok) throw new Error('not found');
    return r.text();
  })
  .then((text) => {
    textarea.value = text;
    refreshDeckList();
  })
  .catch(() => {
    // No pre-loaded data — user will paste or load a file
  });
