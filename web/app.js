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

function showExample() {
  const { cards, faces, data, firstSideboard } = buildPivot(parseData(EXAMPLE_SHEET), '');
  const example = document.getElementById('example-template').content.cloneNode(true);
  example.querySelector('.example-card').innerHTML =
    generateCardSVG('', cards, faces, data, firstSideboard, namesOutside.checked);
  svgContainer.replaceChildren(example);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPreview() {
  const deck  = deckSelect.value;
  const pivot = getDecks(records).includes(deck) && buildPivot(records, deck);

  if (!pivot || pivot.cards.length === 0) {
    currentSVG = '';
    downloadBtn.disabled = true;
    namesOutside.disabled = false;
    if (textarea.value.trim()) {
      previewLabel.textContent = 'Preview';
      svgContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <p>No cards found. Check the layout guide on the left.</p>
        </div>`;
    } else {
      previewLabel.textContent = 'Example';
      showExample();
    }
    return;
  }

  const { cards, faces, data, firstSideboard } = pivot;

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

refreshDeckList();
