import { concordanceSchema, evaluateConcordance } from './concordance-engine.js';

const place = document.getElementById('place');
const roomWorld = document.getElementById('room-world');
const returnHearth = document.getElementById('return-hearth');
const continueThreshold = document.getElementById('continue-threshold');
const continueLabel = document.getElementById('continue-label');
const placeTime = document.getElementById('place-time');
const arrivalState = document.getElementById('arrival-state');
const arrivalNote = document.getElementById('arrival-note');
const reading = document.getElementById('instrument-reading');
const readingKicker = document.getElementById('reading-kicker');
const readingTitle = document.getElementById('reading-title');
const readingBody = document.getElementById('reading-body');
const closeReading = document.getElementById('close-reading');
const portalButton = document.getElementById('starwell-portal');
const portalLabel = document.getElementById('portal-label');
const portalNote = document.getElementById('portal-note');
const portalStatus = document.getElementById('portal-status');
const skinState = document.getElementById('skin-state');
const placeIdentity = document.querySelector('.threshold-mark strong');

const LAST_ROOM_KEY = 'hearthfire:starwell:last-room:v1';
const VISITS_KEY = 'hearthfire:starwell:visits:v1';
const SKIN_KEY = 'hearthfire:starwell:room-skin:v1';
const CONCORDANCE_KEY = 'hearthfire:starwell:concordance-vector:v1';

const defaultVector = {
  pulse: 0.68,
  coherence: 0.89,
  resonance: 0.92,
  entropy: 0.34,
  memory: 0.76,
  axis: 0.81,
};

const rooms = {
  observatory: { label: 'Observatory', note: 'The dome is still turning.' },
  library: { label: 'Grand Library', note: 'The book remains open where you left it.' },
  grove: { label: 'Dreaming Grove', note: 'The leaves kept the path.' },
  workshop: { label: 'Workshop', note: 'The lantern is still warm.' },
  atlas: { label: 'Atlas Hall', note: 'The world waits at the same meridian.' },
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The place remains usable when storage is unavailable.
  }
}

function updateClock() {
  const now = new Date();
  placeTime.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now).replace('24:', '00:');
}

function recordVisit(roomKey) {
  const visits = readJson(VISITS_KEY, {});
  const previous = visits[roomKey] || { count: 0 };
  visits[roomKey] = {
    count: previous.count + 1,
    lastVisitedAt: new Date().toISOString(),
  };
  writeJson(VISITS_KEY, visits);
}

function openRoom(roomKey, { remember = true } = {}) {
  if (!rooms[roomKey]) return;
  closeInstrument();
  place.dataset.room = roomKey;
  roomWorld.setAttribute('aria-hidden', 'false');
  if (remember) {
    writeJson(LAST_ROOM_KEY, roomKey);
    recordVisit(roomKey);
    hydrateContinue();
  }
  window.history.replaceState(null, '', `#${roomKey}`);
}

function goHearth() {
  closeInstrument();
  place.dataset.room = 'hearth';
  roomWorld.setAttribute('aria-hidden', 'true');
  window.history.replaceState(null, '', window.location.pathname);
}

function hydrateContinue() {
  const lastRoom = readJson(LAST_ROOM_KEY, null);
  const room = rooms[lastRoom];
  if (!room) {
    continueThreshold.hidden = true;
    arrivalState.textContent = place.dataset.skin === 'starwell'
      ? 'The dome remembers you.'
      : 'The fire remembers you.';
    arrivalNote.textContent = place.dataset.skin === 'starwell'
      ? 'The same room now carries STARWELL light.'
      : 'Open the threshold when the room is ready to become STARWELL.';
    return;
  }

  continueThreshold.hidden = false;
  continueThreshold.dataset.room = lastRoom;
  continueLabel.textContent = room.label;
  arrivalState.textContent = room.note;
  arrivalNote.textContent = 'Come back to the fire whenever the work needs somewhere to rest.';
}

function setSkin(nextSkin, { remember = true, announce = true } = {}) {
  const skin = nextSkin === 'starwell' ? 'starwell' : 'hearthfire';
  const isStarwell = skin === 'starwell';

  place.dataset.skin = skin;
  place.dataset.portal = isStarwell ? 'open' : 'closed';
  portalButton.setAttribute('aria-pressed', String(isStarwell));
  portalLabel.textContent = isStarwell ? 'Return to Hearthfire' : 'Open STARWELL';
  portalNote.textContent = isStarwell
    ? 'Restore the room. Keep its state.'
    : 'Reskin this room. Keep its state.';
  skinState.textContent = isStarwell
    ? 'REI Mythience observatory skin'
    : 'the room before the threshold';
  placeIdentity.textContent = isStarwell ? 'STARWELL' : 'HEARTHFIRE';
  document.title = isStarwell ? 'STARWELL · Hearthfire' : 'Hearthfire · STARWELL threshold';

  if (remember) writeJson(SKIN_KEY, skin);
  hydrateContinue();

  if (announce) {
    portalStatus.textContent = isStarwell
      ? 'The portal opened. This room is now wearing STARWELL while preserving its place state.'
      : 'The portal closed. Hearthfire materials are restored and the room state remains.';
  }
}

function togglePortal() {
  setSkin(place.dataset.skin === 'starwell' ? 'hearthfire' : 'starwell');
}

function showInstrument(kicker, title, html, mode = 'reading') {
  reading.dataset.mode = mode;
  readingKicker.textContent = kicker;
  readingTitle.textContent = title;
  readingBody.innerHTML = html;
  reading.hidden = false;
}

function closeInstrument() {
  reading.hidden = true;
  reading.dataset.mode = '';
}

async function showHealth() {
  showInstrument('Steward instrument', 'Listening for Hearthfire', '<p>The instrument is checking the local route.</p>');
  try {
    const response = await fetch('/health', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('health-route-not-ready');
    const health = await response.json();
    showInstrument(
      'Steward instrument',
      health.ok ? 'Hearthfire is answering' : 'The route needs attention',
      `<dl>
        <div><dt>Place</dt><dd>${health.place || 'STARWELL'}</dd></div>
        <div><dt>State</dt><dd>${health.ok ? 'ready' : 'attention'}</dd></div>
        <div><dt>Runtime</dt><dd>${health.runtime || 'unknown'}</dd></div>
        <div><dt>Engine</dt><dd>${health.concordanceEngine || 'unknown'}</dd></div>
        <div><dt>Portal</dt><dd>${health.portal || 'unknown'}</dd></div>
        <div><dt>Uptime</dt><dd>${Math.floor((health.uptimeSeconds || 0) / 60)}m</dd></div>
      </dl>`,
    );
  } catch {
    showInstrument('Steward instrument', 'Static threshold', '<p>The place is open, but no local Hearthfire server answered this deployment. Nothing has been disguised as healthy.</p>');
  }
}

function concordanceForm(vector) {
  const schema = concordanceSchema();
  const controls = schema.metrics.map((metric) => {
    const value = Number(vector[metric.key] ?? 0.5).toFixed(2);
    return `<label class="concordance-control">
      <span><b>${metric.symbol}</b>${metric.label}</span>
      <input type="range" min="0" max="1" step="0.01" name="${metric.key}" value="${value}" />
      <output data-output-for="${metric.key}">${value}</output>
    </label>`;
  }).join('');

  return `<form class="concordance-lens" id="concordance-form">
    <p class="lens-boundary">Transparent heuristic · ${schema.formula}</p>
    <div class="concordance-controls">${controls}</div>
    <div class="lens-actions">
      <button type="submit">Take reading</button>
      <button type="button" data-reset-concordance>Reset vector</button>
    </div>
    <p class="lens-note">No body or environmental sensing occurs. The six values are supplied deliberately and remain on this device.</p>
    <div class="concordance-result" id="concordance-result" aria-live="polite"></div>
  </form>`;
}

function readVectorFromForm(form) {
  return Object.fromEntries(
    concordanceSchema().metrics.map((metric) => [metric.key, Number(form.elements[metric.key].value)]),
  );
}

function readingMarkup(result, source) {
  return `<section class="concordance-reading-view" data-phase="${result.phase.id}">
    <div class="quotient-orb">
      <span>Q</span>
      <strong>${result.quotient.toFixed(3)}</strong>
    </div>
    <div class="reading-summary">
      <p>${result.phase.label}</p>
      <h4>${result.strongest.label} carries the clearest signal.</h4>
      <span>${result.tension.label}: ${result.tension.magnitude.toFixed(3)}</span>
    </div>
    <dl>
      <div><dt>Signal</dt><dd>${result.signal.toFixed(3)}</dd></div>
      <div><dt>Stability</dt><dd>${result.stability.toFixed(3)}</dd></div>
      <div><dt>Confidence</dt><dd>${result.confidence.toFixed(2)}</dd></div>
      <div><dt>Source</dt><dd>${source}</dd></div>
    </dl>
    <details>
      <summary>Trace and boundary</summary>
      <p>${result.trace.formula}</p>
      <p>${result.boundary}</p>
    </details>
  </section>`;
}

async function evaluateFromForm(form) {
  const vector = readVectorFromForm(form);
  const resultNode = form.querySelector('#concordance-result');
  writeJson(CONCORDANCE_KEY, vector);
  resultNode.innerHTML = '<p class="lens-listening">The Lens is comparing the six terms.</p>';

  try {
    const response = await fetch('/api/concordance/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        vector,
        provenance: {
          mode: 'manual-observation',
          sources: ['concordance-lens'],
          note: 'Entered by the person at the threshold.',
        },
      }),
    });
    if (!response.ok) throw new Error('concordance-route-not-ready');
    const result = await response.json();
    resultNode.innerHTML = readingMarkup(result, 'Hearthfire server');
  } catch {
    const result = evaluateConcordance(vector, {
      mode: 'manual-observation',
      sources: ['device-local-lens'],
      note: 'Calculated locally because the server route was unavailable.',
    });
    resultNode.innerHTML = readingMarkup(result, 'device-local fallback');
  }
}

function bindConcordanceForm() {
  const form = document.getElementById('concordance-form');
  if (!form) return;

  form.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'range') return;
    const output = form.querySelector(`[data-output-for="${event.target.name}"]`);
    if (output) output.textContent = Number(event.target.value).toFixed(2);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    evaluateFromForm(form);
  });

  form.querySelector('[data-reset-concordance]')?.addEventListener('click', () => {
    for (const [key, value] of Object.entries(defaultVector)) {
      form.elements[key].value = value;
      const output = form.querySelector(`[data-output-for="${key}"]`);
      if (output) output.textContent = value.toFixed(2);
    }
    form.querySelector('#concordance-result').innerHTML = '';
    writeJson(CONCORDANCE_KEY, defaultVector);
  });
}

function showConcordance() {
  const vector = readJson(CONCORDANCE_KEY, defaultVector);
  showInstrument(
    'REI Mythience instrument',
    'Concordance Lens',
    concordanceForm(vector),
    'concordance',
  );
  bindConcordanceForm();
}

function roomAction(action) {
  const visits = readJson(VISITS_KEY, {});
  const activeRoom = place.dataset.room;
  const visitCount = visits[activeRoom]?.count || 1;

  const actions = {
    concordance: showConcordance,
    read: () => showInstrument('Reading table', 'Today’s book', '<p>The manuscript shelf is present. A live source adapter will be mounted here rather than inventing a document.</p>'),
    listen: () => showInstrument('Water threshold', 'The Grove is quiet', '<p>The place is listening. No voice has been fabricated to fill the silence.</p>'),
    health: showHealth,
    map: () => showInstrument('Atlas instrument', 'World held at the meridian', `<p>This room has been entered ${visitCount} ${visitCount === 1 ? 'time' : 'times'} on this device. World registries will open here without flattening worlds into project cards.</p>`),
  };

  actions[action]?.();
}

document.querySelectorAll('[data-open-room]').forEach((door) => {
  door.addEventListener('click', () => openRoom(door.dataset.openRoom));
});

document.querySelectorAll('[data-room-action]').forEach((button) => {
  button.addEventListener('click', () => roomAction(button.dataset.roomAction));
});

portalButton.addEventListener('click', togglePortal);
returnHearth.addEventListener('click', goHearth);
closeReading.addEventListener('click', closeInstrument);
continueThreshold.addEventListener('click', () => openRoom(continueThreshold.dataset.room));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!reading.hidden) closeInstrument();
    else if (place.dataset.room !== 'hearth') goHearth();
  }
});

window.addEventListener('popstate', () => {
  const roomKey = window.location.hash.slice(1);
  if (rooms[roomKey]) openRoom(roomKey, { remember: false });
  else goHearth();
});

updateClock();
window.setInterval(updateClock, 30_000);
setSkin(readJson(SKIN_KEY, 'hearthfire'), { remember: false, announce: false });
hydrateContinue();

const initialRoom = window.location.hash.slice(1);
if (rooms[initialRoom]) openRoom(initialRoom, { remember: false });
