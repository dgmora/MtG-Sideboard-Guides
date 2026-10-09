// ─── UI ───────────────────────────────────────────────────────────────────────

const textarea    = document.getElementById('data-input');
const sheetLinks  = document.getElementById('sheet-links');
const sheetStatus = document.getElementById('sheet-status');
const sheetsSection = document.getElementById('sheets-section');
const pasteSection  = document.getElementById('paste-section');
const deckSelect  = document.getElementById('deck-select');
const namesOutside = document.getElementById('names-outside');
const svgContainer = document.getElementById('svg-container');
const downloadBtn = document.getElementById('download-btn');
const shareBtn    = document.getElementById('share-btn');
const shareMenu   = document.getElementById('share-menu');
const shareLive   = document.getElementById('share-live');
const shareSnapshot = document.getElementById('share-snapshot');
const previewLabel = document.getElementById('preview-label');
const convertPrompt = document.getElementById('convert-prompt');
const copyPromptBtn = document.getElementById('copy-prompt');

let records    = [];
let guides     = [];
let currentSVG = '';
let currentDeck = '';

const shared = new URLSearchParams(location.search);
const sharedGuide = shared.has('sheet') && { id: shared.get('sheet'), gid: shared.get('tab') ?? '0' };
const pastedGuide = shared.get('paste');
const pastedName  = shared.get('name') ?? '';

const usingSheets = () => document.querySelector('input[name="source"]:checked').value === 'sheets';
const guideKey = guide => `${guide.id}:${guide.gid}`;
const selectedGuide = () => guides.find(g => guideKey(g) === deckSelect.value);

function load(key) {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

function save(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function showExample() {
  const example = document.getElementById('example-template').content.cloneNode(true);
  example.querySelector('.example-card').innerHTML =
    generateCardSVG('', buildPivot(parseData(EXAMPLE_SHEET), ''), namesOutside.checked);
  svgContainer.replaceChildren(example);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderPreview() {
  const deck  = usingSheets() ? selectedGuide()?.name : deckSelect.value;
  const pivot = getDecks(records).includes(deck) && buildPivot(records, deck);

  if (!pivot || pivot.cards.length === 0) {
    currentSVG = '';
    downloadBtn.disabled = true;
    shareBtn.disabled = true;
    namesOutside.disabled = false;
    if ((usingSheets() ? sheetLinks : textarea).value.trim()) {
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

  currentSVG  = generateCardSVG(deck, pivot, namesOutside.checked);
  namesOutside.disabled = pivot.faces.length < 2;
  currentDeck = deck;
  svgContainer.innerHTML = currentSVG;
  downloadBtn.disabled = false;
  shareBtn.disabled = false;
  const offBalance = unbalanced(pivot);
  const warning = offBalance.length ? `Too many cards in: ${offBalance.join(', ')}` : '';
  previewLabel.textContent = [deck, warning].filter(Boolean).join(' — ') || 'Preview';
}

function fillDeckSelect(options) {
  const prev = deckSelect.value || (sharedGuide && guideKey(sharedGuide)) || load('deck');
  deckSelect.parentElement.hidden = options.length < 2;
  deckSelect.replaceChildren(...options.map(({ value, label }) => new Option(label, value)));
  if (options.some(o => o.value === prev)) deckSelect.value = prev;
}

function refreshDeckList() {
  records = parseData(textarea.value).map(r => ({ ...r, deck: r.deck || pastedName }));
  fillDeckSelect(getDecks(records).map(d => ({ value: d, label: d })));
  renderPreview();
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchTabs(link) {
  const id = sheetId(link);
  if (!id) throw new Error(`Not a Google Sheets link: ${link}`);
  const tabs = parseTabs(await fetchText(`https://docs.google.com/spreadsheets/d/${id}/htmlview`));
  const linkedTab = { name: 'Sheet', gid: link.match(/[#&?]gid=(\d+)/)?.[1] ?? '0' };
  return (tabs.length ? tabs : [linkedTab]).map(tab => ({ id, ...tab }));
}

// Fetches finish in any order, so each load bumps this and drops its result once a newer one started
let latestLoad = 0;
let linksStatus = '';

async function loadGuides() {
  const run = ++latestLoad;
  const links = sheetLinks.value.split('\n').map(l => l.trim()).filter(Boolean);
  const failed = [];
  const lists = await Promise.all(links.map(link => fetchTabs(link).catch(() => { failed.push(link); return []; })));
  if (run !== latestLoad) return;
  guides = lists.flat();
  linksStatus = failed.length
    ? `Can't read ${failed.join(', ')}. Share it as "Anyone with the link can view".`
    : '';
  sheetStatus.textContent = linksStatus;
  fillDeckSelect(guides.map(g => ({ value: guideKey(g), label: g.name })));
  await loadGuide();
}

async function loadGuide() {
  const run = ++latestLoad;
  const guide = selectedGuide();
  if (!guide) return renderPreview();
  let csv = null;
  try {
    csv = await fetchText(`https://docs.google.com/spreadsheets/d/${guide.id}/export?format=csv&gid=${guide.gid}`);
  } catch {}
  if (run !== latestLoad) return;
  records = csv === null ? [] : parseData(csv).map(r => ({ ...r, deck: guide.name }));
  sheetStatus.textContent = [linksStatus, csv === null && `Can't read the "${guide.name}" tab.`].filter(Boolean).join(' ');
  renderPreview();
}

function applySource() {
  const sheets = usingSheets();
  sheetsSection.hidden = !sheets;
  shareLive.hidden = !sheets;
  pasteSection.hidden = sheets;
  records = [];
  latestLoad++;
  if (sheets) loadGuides();
  else refreshDeckList();
}

// ── Events ────────────────────────────────────────────────────────────────────

// Debounce typing so we don't regenerate or refetch on every keystroke
function debounce(fn) {
  let timer;
  return () => { clearTimeout(timer); timer = setTimeout(fn, 280); };
}

textarea.addEventListener('input', debounce(refreshDeckList));

sheetLinks.addEventListener('input', debounce(() => {
  save('links', sheetLinks.value);
  loadGuides();
}));

for (const radio of document.querySelectorAll('input[name="source"]')) {
  radio.addEventListener('change', () => {
    save('source', radio.value);
    applySource();
  });
}

// Google can't push sheet edits to this page, so refetch when the user comes back to it
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && usingSheets()) loadGuides();
});

deckSelect.addEventListener('change', () => {
  save('deck', deckSelect.value);
  if (usingSheets()) loadGuide();
  else renderPreview();
});
namesOutside.addEventListener('change', renderPreview);

// Download current SVG
downloadBtn.addEventListener('click', () => {
  if (!currentSVG) return;
  triggerDownload(
    new Blob([currentSVG], { type: 'image/svg+xml' }),
    `${currentDeck || 'sideboard'}_guide.svg`
  );
});

function pageLink(params) {
  const url = new URL(location.pathname, location.origin);
  url.search = new URLSearchParams(params).toString().replaceAll('%2C', ',');
  return url.href;
}

shareLive.addEventListener('click', () => {
  const guide = selectedGuide();
  if (!guide) return;
  shareLink(shareLive, pageLink({ sheet: guide.id, tab: guide.gid }));
});

shareSnapshot.addEventListener('click', () => {
  const name = currentDeck ? { name: currentDeck } : {};
  shareLink(shareSnapshot, pageLink({ paste: toMatrixCsv(records, currentDeck), ...name }));
});

function shareLink(option, link) {
  copyText(option.querySelector('.share-option-name'), link, 'Link copied ✓')
    .then(() => setTimeout(() => shareMenu.hidePopover(), 900));
}

copyPromptBtn.addEventListener('click', () => copyText(copyPromptBtn, convertPrompt.textContent, 'Prompt copied'));

function copyText(label, text, doneLabel) {
  label.dataset.label ??= label.textContent;
  return navigator.clipboard.writeText(text).then(
    () => {
      label.textContent = doneLabel;
      setTimeout(() => { label.textContent = label.dataset.label; }, 1500);
    },
    () => prompt('Copy this:', text)
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

sheetLinks.value = sharedGuide
  ? `https://docs.google.com/spreadsheets/d/${sharedGuide.id}/edit#gid=${sharedGuide.gid}`
  : load('links');
if (pastedGuide !== null) {
  try {
    textarea.value = decodePaste(pastedGuide);
  } catch {
    textarea.placeholder = "Couldn't read the guide in this link. Paste your sheet here";
  }
}
convertPrompt.querySelector('.page-url').textContent = location.origin + location.pathname;
const source = pastedGuide !== null || (!sharedGuide && load('source') === 'paste') ? 'paste' : 'sheets';
document.querySelector(`input[name="source"][value="${source}"]`).checked = true;
applySource();
