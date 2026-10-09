// ─── UI ───────────────────────────────────────────────────────────────────────

const textarea    = document.getElementById('data-input');
const deckSelect  = document.getElementById('deck-select');
const namesOutside = document.getElementById('names-outside');
const svgContainer = document.getElementById('svg-container');
const downloadBtn = document.getElementById('download-btn');
const previewLabel = document.getElementById('preview-label');

let records    = [];
let currentSVG = '';
let currentDeck = '';

// ── Render ────────────────────────────────────────────────────────────────────

function renderPreview() {
  const deck = deckSelect.value;

  if (!getDecks(records).includes(deck)) {
    svgContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⬡</div>
        <p>Paste your sideboard guide on the left to see the card.</p>
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

  currentSVG  = generateCardSVG(deck, cards, faces, data, firstSideboard, namesOutside.checked);
  namesOutside.disabled = faces.length < 2;
  currentDeck = deck;
  svgContainer.innerHTML = currentSVG;
  downloadBtn.disabled = false;
  const offBalance = unbalanced(records, deck);
  const warning = offBalance.length ? `Too many cards in: ${offBalance.join(', ')}` : '';
  previewLabel.textContent = [deck, warning].filter(Boolean).join(' — ') || 'Preview';
}

function refreshDeckList() {
  const text  = textarea.value;
  records     = parseData(text);
  const decks = getDecks(records);
  const prev  = deckSelect.value;
  deckSelect.parentElement.hidden = decks.length < 2;

  deckSelect.innerHTML = '';

  for (const d of decks) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    if (d === prev) opt.selected = true;
    deckSelect.appendChild(opt);
  }
  // If previous selection disappeared, fall back to first deck
  if (decks.length && !decks.includes(prev)) deckSelect.value = decks[0];

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

// Download current SVG
downloadBtn.addEventListener('click', () => {
  if (!currentSVG) return;
  triggerDownload(
    new Blob([currentSVG], { type: 'image/svg+xml' }),
    `${currentDeck || 'sideboard'}_guide.svg`
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
