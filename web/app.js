// ─── UI ───────────────────────────────────────────────────────────────────────

const textarea    = document.getElementById('data-input');
const deckSelect  = document.getElementById('deck-select');
const namesOutside = document.getElementById('names-outside');
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

  const { cards, decks, faces, data, firstSideboard } = buildPivot(records, deck);

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

  currentSVG  = faces.length > 1
    ? generateFoldSVG(deck, cards, faces, data, firstSideboard, namesOutside.checked)
    : generateSVG(deck, cards, decks, data, firstSideboard);
  currentDeck = deck;
  svgContainer.innerHTML = currentSVG;
  downloadBtn.disabled = false;
  const offBalance = unbalanced(records, deck);
  previewLabel.textContent = offBalance.length ? `${deck} — too many cards in: ${offBalance.join(', ')}` : deck;
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
namesOutside.addEventListener('change', renderPreview);

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
