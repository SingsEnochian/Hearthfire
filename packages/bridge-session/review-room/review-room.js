const layerGrid = document.getElementById('layer-grid');
const layerTemplate = document.getElementById('layer-template');
const reviewForm = document.getElementById('review-form');
const emptyState = document.getElementById('empty-state');
const statusLine = document.getElementById('status-line');
const healthState = document.getElementById('health-state');
const worldTitle = document.getElementById('world-title');
const crossingNote = document.getElementById('crossing-note');
const sessionId = document.getElementById('session-id');
const returnState = document.getElementById('return-state');
const createdAt = document.getElementById('created-at');
const itemCount = document.getElementById('item-count');
const reviewer = document.getElementById('reviewer');
const notes = document.getElementById('review-notes');
const reloadButton = document.getElementById('reload-button');
const layButton = document.getElementById('lay-button');
const reviewSummary = document.getElementById('review-summary');

const layerConfig = [
  { key: 'changed', number: 'Layer I', title: 'What changed?', question: 'Name what is genuinely different after the crossing.' },
  { key: 'remained_true', number: 'Layer II', title: 'What remained true?', question: 'Keep the anchors, boundaries, and relationships that held.' },
  { key: 'became_clearer', number: 'Layer III', title: 'What became clearer?', question: 'Record what sharpened without pretending uncertainty vanished.' },
  { key: 'gained', number: 'Layer IV', title: 'What was gained?', question: 'Carry forward new language, canon, insight, or capability.' },
];

const statusLabels = {
  candidate: 'Candidate',
  accepted: 'Accept',
  held: 'Hold',
  rejected: 'Reject',
};

const additionRegisters = [
  ['creative-insight', 'Creative insight'],
  ['relationship-state', 'Relationship state'],
  ['target-world-narrative', 'Target-world narrative'],
  ['interpretation', 'Interpretation'],
  ['system-state', 'System state'],
];

let lamination = null;

function setStatus(message, kind = '') {
  statusLine.textContent = message;
  statusLine.className = `status-line ${kind}`.trim();
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(date);
}

function makeChip(text) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = text;
  return chip;
}

function makeStatusGroup(itemNode, initialStatus) {
  const group = document.createElement('div');
  group.className = 'status-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Review status');

  for (const [status, label] of Object.entries(statusLabels)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.status = status;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(status === initialStatus));
    button.addEventListener('click', () => {
      itemNode.dataset.status = status;
      group.querySelectorAll('button').forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      updateSummary();
    });
    group.append(button);
  }

  itemNode.dataset.status = initialStatus;
  return group;
}

function makeReviewItem(item, { layer, isNew = false } = {}) {
  const article = document.createElement('article');
  article.className = 'review-item';
  article.dataset.new = String(isNew);
  article.dataset.layer = layer;
  if (item.item_id) article.dataset.itemId = item.item_id;

  const textarea = document.createElement('textarea');
  textarea.value = item.text ?? '';
  textarea.setAttribute('aria-label', isNew ? `New ${layer} item` : `${layer} item text`);
  textarea.required = true;
  textarea.addEventListener('input', updateSummary);
  article.append(textarea);

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  if (isNew) {
    meta.append(makeChip('new review-room item'));
  } else {
    meta.append(makeChip(item.epistemic_register ?? 'unlabelled'));
    const sources = item.source_packet_ids ?? [];
    meta.append(makeChip(sources.length ? `${sources.length} source packet${sources.length === 1 ? '' : 's'}` : 'no packet source'));
  }
  article.append(meta);

  if (isNew) {
    const controls = document.createElement('div');
    controls.className = 'addition-controls';

    const select = document.createElement('select');
    select.className = 'addition-register';
    select.setAttribute('aria-label', 'Epistemic register for new item');
    for (const [value, label] of additionRegisters) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === (item.epistemic_register ?? 'creative-insight')) option.selected = true;
      select.append(option);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      article.remove();
      updateSummary();
    });

    controls.append(select, remove);
    article.append(controls);
  }

  article.append(makeStatusGroup(article, item.status ?? 'candidate'));
  return article;
}

function renderLayers() {
  layerGrid.replaceChildren();

  layerConfig.forEach((config) => {
    const fragment = layerTemplate.content.cloneNode(true);
    const panel = fragment.querySelector('.layer-panel');
    panel.dataset.layer = config.key;
    fragment.querySelector('.layer-number').textContent = config.number;
    fragment.querySelector('.layer-title').textContent = config.title;
    fragment.querySelector('.layer-question').textContent = config.question;

    const list = fragment.querySelector('.item-list');
    const items = Array.isArray(lamination.layers?.[config.key]) ? lamination.layers[config.key] : [];
    items.forEach((item) => list.append(makeReviewItem(item, { layer: config.key })));

    fragment.querySelector('.add-item-button').addEventListener('click', () => {
      const addition = makeReviewItem({ text: '', status: 'candidate', epistemic_register: 'creative-insight' }, {
        layer: config.key,
        isNew: true,
      });
      list.append(addition);
      addition.querySelector('textarea').focus();
      updateSummary();
    });

    layerGrid.append(fragment);
  });

  updateSummary();
}

function updateSummary() {
  const nodes = [...layerGrid.querySelectorAll('.review-item')];
  const counts = { candidate: 0, accepted: 0, held: 0, rejected: 0 };
  for (const node of nodes) counts[node.dataset.status] += 1;
  reviewSummary.textContent = `${nodes.length} item${nodes.length === 1 ? '' : 's'} · ${counts.accepted} accepted · ${counts.held} held · ${counts.rejected} rejected · ${counts.candidate} candidate`;
}

function showLamination(value) {
  lamination = value;
  worldTitle.textContent = String(value.world_slug ?? 'Unnamed world').replaceAll('-', ' ');
  crossingNote.textContent = 'The clean-return receipt is present. Review changes deliberately before carrying them forward.';
  sessionId.textContent = value.session_id ?? '—';
  returnState.textContent = value.crossing?.return_receipt ?? '—';
  createdAt.textContent = formatDate(value.created_at);
  itemCount.textContent = String(value.summary?.item_count ?? Object.values(value.layers ?? {}).flat().length);
  reviewForm.hidden = false;
  emptyState.hidden = true;
  notes.value = '';
  renderLayers();
}

function showEmpty() {
  lamination = null;
  reviewForm.hidden = true;
  emptyState.hidden = false;
  worldTitle.textContent = 'No laminate loaded';
  crossingNote.textContent = 'Use this room with the same data directory as a completed clean crossing.';
  sessionId.textContent = '—';
  returnState.textContent = '—';
  createdAt.textContent = '—';
  itemCount.textContent = '—';
}

async function loadRoom() {
  setStatus('Reading the latest durable receipt…');
  healthState.textContent = 'Listening…';
  healthState.className = 'health';

  try {
    const healthResponse = await fetch('/health', { headers: { Accept: 'application/json' } });
    const health = await healthResponse.json();
    healthState.textContent = health.lamination_available
      ? `${health.review_count} review${health.review_count === 1 ? '' : 's'} held locally`
      : 'No laminate in this directory';
    healthState.className = `health ${health.lamination_available ? 'ready' : 'attention'}`;
  } catch {
    healthState.textContent = 'Local service unavailable';
    healthState.className = 'health attention';
  }

  try {
    const response = await fetch('/api/lamination/latest', { headers: { Accept: 'application/json' } });
    if (response.status === 404) {
      showEmpty();
      setStatus('No durable laminate was found.', 'error');
      return;
    }
    if (!response.ok) throw new Error('latest-lamination-unavailable');
    showLamination(await response.json());
    setStatus('Original laminate loaded. Nothing has been changed yet.');
  } catch (error) {
    showEmpty();
    setStatus(`The room could not read the laminate: ${error.message}`, 'error');
  }
}

function collectReview() {
  const decisions = [];
  const additions = [];

  for (const node of layerGrid.querySelectorAll('.review-item')) {
    const text = node.querySelector('textarea').value.trim();
    if (!text) throw new Error('Every visible item needs text, or remove the empty addition.');

    if (node.dataset.new === 'true') {
      additions.push({
        layer: node.dataset.layer,
        text,
        status: node.dataset.status,
        epistemic_register: node.querySelector('.addition-register').value,
      });
    } else {
      decisions.push({
        item_id: node.dataset.itemId,
        text,
        status: node.dataset.status,
      });
    }
  }

  return {
    lamination_id: lamination.lamination_id,
    reviewer: reviewer.value.trim(),
    decisions,
    additions,
    notes: notes.value.trim() || null,
  };
}

reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!lamination) return;

  try {
    const body = collectReview();
    if (!body.reviewer) throw new Error('Name the reviewer before laying the layer.');

    layButton.disabled = true;
    setStatus('Writing the review ledger and reviewed-latest layer…');

    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? result.error ?? 'review-save-failed');

    const summary = result.reviewed_lamination.summary;
    setStatus(
      `Layer laid. ${summary.accepted_count} accepted, ${summary.held_count} held, ${summary.rejected_count} rejected, ${summary.candidate_count} still candidate.`,
      'success',
    );
    healthState.textContent = 'Reviewed layer persisted';
    healthState.className = 'health ready';
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    layButton.disabled = false;
  }
});

reloadButton.addEventListener('click', loadRoom);
loadRoom();
