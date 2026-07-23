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
const OBSERVER_CAST_KEY = 'hearthfire:starwell:observer-cast:v1';
const VISITS_KEY = 'hearthfire:starwell:visits:v1';
const SKIN_KEY = 'hearthfire:starwell:room-skin:v1';
const CONCORDANCE_KEY = 'hearthfire:starwell:concordance-vector:v1';
const SANCTUM_ANCHOR_KEY = 'hearthfire:starwell:sanctum-anchor:v1';
const THEME_KEY = 'hearthfire:starwell:theme:v1';
const CUSTOM_THEME_KEY = 'hearthfire:starwell:custom-theme:v1';

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
  hall: { label: 'The Hall', note: 'Everyone is here.' },
};

const THEMES = [
  { id: 'hearthfire', name: 'Hearthfire', desc: 'Stone, ember, and gold.' },
  { id: 'starwell',   name: 'Starwell',   desc: 'Deep space, silver, and ice.' },
  { id: 'grove',      name: 'The Grove',  desc: 'Forest, moss, and moonlight.' },
  { id: 'arcane',     name: 'Arcane',     desc: 'Deep ritual, violet, and rune.' },
];

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
  setRoomAmbience(roomKey);
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
  const wasHidden = reading.hidden;
  reading.dataset.mode = mode;
  readingKicker.textContent = kicker;
  readingTitle.textContent = title;
  readingBody.innerHTML = html;
  reading.hidden = false;
  if (wasHidden) {
    _playPanelOpen();
    _startPanelHum(place.dataset.room ?? 'hearth');
  }
}

function closeInstrument() {
  reading.hidden = true;
  reading.dataset.mode = '';
  _stopPanelHum();
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

const EMOTIONS = ['Joy', 'Grief', 'Curiosity', 'Stillness', 'Fear', 'Love', 'Hope', 'Doubt', 'Determination', 'Awe'];

function worldKindLabel(kind) {
  const labels = {
    'inhabited-earth': 'Earth',
    'inhabited-mythic': 'Mythic',
    'inhabited-dreaming': 'Dreaming',
    'inhabited-external': 'External',
    'celestial': 'Celestial',
    'liminal': 'Liminal',
  };
  return labels[kind] || kind;
}

function couplingStrength(world, allWorlds) {
  const coupled = world.coupledWorlds ?? [];
  const max = allWorlds.length - 1;
  return max > 0 ? Math.round((coupled.length / max) * 100) : 0;
}

async function showWorldRegistry() {
  showInstrument('Atlas instrument', 'World Registry', '<p class="lens-listening">Loading the fiber map.</p>');
  try {
    const response = await fetch('/api/worlds', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('worlds-unavailable');
    const { worlds } = await response.json();

    const rows = worlds.map((w) => {
      const coupling = couplingStrength(w, worlds);
      const coupled = (w.coupledWorlds ?? []).join(', ') || 'none';
      return `<article class="world-entry" data-world-id="${w.id}" data-fiber="${w.fiberPosition}">
        <header class="world-entry-head">
          <strong>${w.label}</strong>
          <span class="world-kind">${worldKindLabel(w.kind)}</span>
          <span class="world-fiber">fiber ${w.fiberPosition}</span>
        </header>
        <p>${w.description || ''}</p>
        <dl>
          <div><dt>Coupled worlds</dt><dd>${coupled}</dd></div>
          <div><dt>Coupling</dt><dd>${coupling}%</dd></div>
          <div><dt>Epistemic default</dt><dd>${w.defaultEpistemicStatus || 'unset'}</dd></div>
        </dl>
        ${w.epistemicNote ? `<p class="world-epistemic-note">${w.epistemicNote}</p>` : ''}
      </article>`;
    }).join('');

    showInstrument(
      'Atlas instrument',
      `World Registry · ${worlds.length} fibers`,
      `<p class="lens-boundary">Universal Horizon is the sky above every world. Worlds are sheets in the Jacobian fiber — locally isometric to earth, distinct in source-space.</p>
      <div class="world-registry">${rows}</div>`,
    );
  } catch {
    showInstrument('Atlas instrument', 'World Registry', '<p>The world registry was not available from the local server. Start the server to read the fiber map.</p>');
  }
}

function observerForm(worlds, savedCast) {
  const worldOptions = worlds.map((w) =>
    `<option value="${w.id}" ${savedCast?.world === w.id ? 'selected' : ''}>${w.label} (fiber ${w.fiberPosition})</option>`,
  ).join('');

  const emotionChecks = EMOTIONS.map((e) => {
    const checked = savedCast?.emotions?.includes(e) ? 'checked' : '';
    return `<label class="emotion-check"><input type="checkbox" name="emotion" value="${e}" ${checked} />${e}</label>`;
  }).join('');

  const schema = concordanceSchema();
  const savedVector = savedCast?.concordanceVector ?? {
    pulse: 0.68, coherence: 0.89, resonance: 0.72, entropy: 0.34, memory: 0.76, axis: 0.81,
  };
  const sliders = schema.metrics.map((m) => {
    const val = Number(savedVector[m.key] ?? 0.5).toFixed(2);
    return `<label class="concordance-control">
      <span><b>${m.symbol}</b>${m.label}</span>
      <input type="range" min="0" max="1" step="0.01" name="cv_${m.key}" value="${val}" />
      <output data-output-for="cv_${m.key}">${val}</output>
    </label>`;
  }).join('');

  return `<form class="observer-cast-form" id="observer-cast-form">
    <p class="lens-boundary">An observation carries its world label. Without it, the sheet information is lost.</p>

    <label class="observer-field">
      <span>Target world</span>
      <select name="world" required>
        <option value="">— choose a world —</option>
        ${worldOptions}
      </select>
    </label>

    <fieldset class="emotion-fieldset">
      <legend>Emotions <small>(one or more)</small></legend>
      <div class="emotion-grid">${emotionChecks}</div>
    </fieldset>

    <label class="observer-field">
      <span>Narrative thread</span>
      <input type="text" name="narrativeThread" placeholder="The intention carried into this cast" value="${savedCast?.narrativeThread ?? ''}" />
    </label>

    <label class="observer-field">
      <span>Description</span>
      <input type="text" name="description" placeholder="What is being observed?" value="${savedCast?.description ?? ''}" />
    </label>

    <label class="observer-field">
      <span>Notes</span>
      <textarea name="notes" rows="2" placeholder="Additional context">${savedCast?.notes ?? ''}</textarea>
    </label>

    <details class="observer-vector-details">
      <summary>Concordance vector <small>(${schema.formula})</small></summary>
      <div class="concordance-controls">${sliders}</div>
      <p class="lens-note">A (Axis) rises when a world is chosen. R (Resonance) reflects inter-sheet coupling to the target fiber. No body or environmental sensing occurs.</p>
    </details>

    <div class="lens-actions">
      <button type="submit">Cast observation</button>
    </div>
    <div class="observer-result" id="observer-result" aria-live="polite"></div>
  </form>`;
}

function observationMarkup(obs) {
  const { payload } = obs;
  const c = payload.concordance;
  const fiber = payload.worldFiber;
  return `<section class="concordance-reading-view" data-phase="${c.phase.id}">
    <div class="quotient-orb">
      <span>Q</span>
      <strong>${c.quotient.toFixed(3)}</strong>
    </div>
    <div class="reading-summary">
      <p>${c.phase.label} · ${fiber.label}</p>
      <h4>${c.strongest.label} carries the clearest signal.</h4>
      <span>Entanglement coefficient: ${fiber.entanglementCoefficient.toFixed(5)}</span>
    </div>
    <dl>
      <div><dt>World</dt><dd>${fiber.label} (fiber ${fiber.fiberPosition})</dd></div>
      <div><dt>Emotions</dt><dd>${payload.emotions.join(', ')}</dd></div>
      <div><dt>Coupled fibers</dt><dd>${fiber.coupledWorlds.join(', ') || 'none'}</dd></div>
      <div><dt>Signal</dt><dd>${c.signal.toFixed(3)}</dd></div>
      <div><dt>Stability</dt><dd>${c.stability.toFixed(3)}</dd></div>
      <div><dt>Tension</dt><dd>${c.tension.label}: ${c.tension.magnitude.toFixed(3)}</dd></div>
    </dl>
    ${payload.narrativeThread ? `<p class="observer-narrative"><em>${payload.narrativeThread}</em></p>` : ''}
    <p class="obs-id">Observation: ${obs.id}</p>
    <details>
      <summary>Trace and boundary</summary>
      <p>${c.trace.formula}</p>
      <p>${c.boundary}</p>
    </details>
  </section>`;
}

async function showObserver() {
  showInstrument('Observer instrument', 'Cast an observation', '<p class="lens-listening">Loading the world registry.</p>', 'observer');
  try {
    const response = await fetch('/api/worlds', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('worlds-unavailable');
    const { worlds } = await response.json();
    const savedCast = readJson(OBSERVER_CAST_KEY, null);
    showInstrument('Observer instrument', 'Cast an observation', observerForm(worlds, savedCast), 'observer');
    bindObserverForm(worlds);
  } catch {
    showInstrument('Observer instrument', 'Cast an observation', '<p>The world registry was not available. The Observer requires a running local server to load the fiber map.</p>', 'observer');
  }
}

function bindObserverForm(worlds) {
  const form = document.getElementById('observer-cast-form');
  if (!form) return;

  form.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'range') return;
    const out = form.querySelector(`[data-output-for="${e.target.name}"]`);
    if (out) out.textContent = Number(e.target.value).toFixed(2);
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'world') {
      const world = worlds.find((w) => w.id === e.target.value);
      if (!world) return;
      const axisInput = form.querySelector('[name="cv_axis"]');
      const axisOut = form.querySelector('[data-output-for="cv_axis"]');
      if (axisInput) {
        axisInput.value = '0.91';
        if (axisOut) axisOut.textContent = '0.91';
      }
      const resonanceInput = form.querySelector('[name="cv_resonance"]');
      const resonanceOut = form.querySelector('[data-output-for="cv_resonance"]');
      if (resonanceInput && resonanceOut) {
        const coupling = couplingStrength(world, worlds) / 100;
        const r = Math.min(1, 0.5 + coupling * 0.5).toFixed(2);
        resonanceInput.value = r;
        resonanceOut.textContent = r;
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emotions = [...form.querySelectorAll('[name="emotion"]:checked')].map((el) => el.value);
    const concordanceVector = Object.fromEntries(
      concordanceSchema().metrics.map((m) => [m.key, Number(form.elements[`cv_${m.key}`].value)]),
    );
    const body = {
      world: form.elements.world.value,
      emotions,
      narrativeThread: form.elements.narrativeThread.value,
      description: form.elements.description.value,
      notes: form.elements.notes.value,
      concordanceVector,
      consent: 'local-only',
    };
    writeJson(OBSERVER_CAST_KEY, body);
    const resultNode = form.querySelector('#observer-result');
    resultNode.innerHTML = '<p class="lens-listening">The Observer is casting.</p>';
    try {
      const response = await fetch('/api/observer/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json();
        resultNode.innerHTML = `<p>Cast error: ${err.error}${err.details ? ' — ' + err.details.join('; ') : ''}</p>`;
        return;
      }
      const { observation } = await response.json();
      resultNode.innerHTML = observationMarkup(observation);
    } catch {
      resultNode.innerHTML = '<p>The cast could not reach the local server. The observation was not recorded.</p>';
    }
  });
}

// --- J-space fold window instrument ---

function _clientFoldWindows(lon) {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  const lonOff = lon / 15;
  const wMid  = ((-lonOff) % 24 + 24) % 24;
  const wNoon = ((12 - lonOff) % 24 + 24) % 24;
  const diffMid  = (wMid  - utcH + 24) % 24 || 24;
  const diffNoon = (wNoon - utcH + 24) % 24 || 24;
  const [nextMin, nextLabel] = diffMid <= diffNoon
    ? [Math.round(diffMid * 60), 'local midnight']
    : [Math.round(diffNoon * 60), 'local noon'];
  const h = Math.floor(nextMin / 60);
  const m = nextMin % 60;
  return { countdown: h > 0 ? `${h}h ${m}m` : `${m}m`, nextLabel, wMid, wNoon };
}

async function showFold() {
  const localAnchor = readJson(SANCTUM_ANCHOR_KEY, null);
  showInstrument('Hearthgate: Arkfire 0.001', 'Fold window', '<p class="lens-listening">Reading the field.</p>', 'fold');

  let mathHtml = '';
  let envHtml = '<p class="lens-note">No environment reading — start the local server.</p>';
  let foldWindowHtml = '';
  let serverAnchor = null;

  // Try the Hearthgate fold route first (gives full multi-lens analysis)
  if (localAnchor) {
    try {
      const hgRes = await fetch('/api/hearthgate/fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sanctumAnchor: localAnchor, intent: 'fold-window-instrument' }),
      });
      if (hgRes.ok) {
        const { synthesis } = await hgRes.json();
        const ma = synthesis.mathematicalAnalysis;
        const ea = synthesis.environmentAnalysis;
        const ga = synthesis.graphAnalysis;
        serverAnchor = synthesis.anchor;

        mathHtml = `<section class="fold-section">
          <h4>Mathematical analysis <small>(det J = −2 · orientation: ${ma.orientation})</small></h4>
          <dl>
            <div><dt>Location state [x, y, z]</dt><dd>[${ma.locationState.join(', ')}]</dd></div>
            <div><dt>Mapped coordinate</dt><dd>[${ma.mappedCoordinate.join(', ')}]</dd></div>
            <div><dt>Convergence score</dt><dd>${ma.convergenceScore.toFixed(4)}</dd></div>
            <div><dt>Fold susceptibility</dt><dd>${ma.foldSusceptibility.toFixed(4)}</dd></div>
            <div><dt>Target residual</dt><dd>${ma.targetResidual.toFixed(4)}</dd></div>
            <div><dt>Nearest preimage</dt><dd>${ma.nearestPreimageDistance.toFixed(4)}</dd></div>
            <div><dt>Physical fold</dt><dd>${ma.physicalStatus}</dd></div>
          </dl>
          <p class="lens-note">Registers: MATHEMATICAL_DERIVATION · LOCATION_INPUT</p>
        </section>`;

        if (ea.jspaceState) {
          envHtml = `<section class="fold-section">
            <h4>Environment lens <small>(PREMAQ / PHYSICS_MODEL)</small></h4>
            <dl>
              <div><dt>J-space state</dt><dd>[${ea.jspaceState.join(', ')}]</dd></div>
              <div><dt>Closest fiber</dt><dd>${ea.jspaceClosestFiber}</dd></div>
              ${ea.foldWindows ? (() => {
                const nw = ea.foldWindows.nextWindow;
                const h = Math.floor(nw.minutesAway / 60);
                const m = nw.minutesAway % 60;
                const cd = h > 0 ? `${h}h ${m}m` : `${m}m`;
                return `<div><dt>Next fold window</dt><dd>${nw.name.replace('local-solar-', '')} in ${cd}</dd></div>`;
              })() : ''}
            </dl>
          </section>`;
          if (ea.foldWindows) foldWindowHtml = 'included-above';
        }

        if (ga.retrievedNodes?.length) {
          const nodes = ga.retrievedNodes.map((n) => `<li>${n.label} <small>(${n.kind})</small></li>`).join('');
          mathHtml += `<section class="fold-section">
            <h4>Graph context <small>(OBSERVATION register)</small></h4>
            <ul class="fold-graph-nodes">${nodes}</ul>
          </section>`;
        }

        if (!synthesis.advisor.passed) {
          mathHtml += `<p class="lens-note" style="color:var(--hf-accent-warm)">Advisor flags: ${synthesis.advisor.flags.join('; ')}</p>`;
        }
      }
    } catch { /* Hearthgate not available — fall through */ }
  }

  // Fall back to plain environment reading if Hearthgate didn't run
  if (!mathHtml) {
    try {
      const res = await fetch('/api/observer/environment', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const { reading } = await res.json();
        if (reading?.jspace) {
          const js = reading.jspace;
          const circ = reading.channels?.circadian ?? {};
          envHtml = `<dl>
            <div><dt>J-space state [x, y, z]</dt><dd>[${js.state.join(', ')}]</dd></div>
            <div><dt>Earth fiber distance (p1)</dt><dd>${js.fiberDistances[0]}</dd></div>
            <div><dt>Closest fiber</dt><dd>${js.closestFiberLabel}</dd></div>
            ${circ.localSolarHour != null ? `<div><dt>Local solar hour</dt><dd>${Number(circ.localSolarHour).toFixed(2)}h</dd></div>` : ''}
          </dl>
          <p class="lens-note">${js.interpretation}</p>`;
        }
        if (reading?.foldWindows) {
          const fw = reading.foldWindows;
          const nw = fw.nextWindow;
          const h = Math.floor(nw.minutesAway / 60);
          const m = nw.minutesAway % 60;
          foldWindowHtml = `<dl>
            <div><dt>Next window</dt><dd>${nw.name.replace('local-solar-', '')} in ${h > 0 ? `${h}h ${m}m` : `${m}m`}</dd></div>
            <div><dt>Midnight UTC</dt><dd>${fw.windows[0].utcHour.toFixed(2)}h</dd></div>
            <div><dt>Noon UTC</dt><dd>${fw.windows[1].utcHour.toFixed(2)}h</dd></div>
          </dl>`;
          serverAnchor = reading.sanctumAnchor;
        }
      }
    } catch { /* server unavailable */ }
  }

  if (foldWindowHtml !== 'included-above' && !foldWindowHtml && localAnchor) {
    const { countdown, nextLabel, wMid, wNoon } = _clientFoldWindows(localAnchor.lon);
    foldWindowHtml = `<dl>
      <div><dt>Next window</dt><dd>${nextLabel} in ${countdown}</dd></div>
      <div><dt>Midnight UTC</dt><dd>${wMid.toFixed(2)}h</dd></div>
      <div><dt>Noon UTC</dt><dd>${wNoon.toFixed(2)}h</dd></div>
    </dl><p class="lens-note">Computed locally from stored anchor.</p>`;
  } else if (!foldWindowHtml) {
    foldWindowHtml = '<p class="lens-note">Set a Sanctum Anchor to see local fold windows.</p>';
  }

  const activeAnchor = serverAnchor ?? localAnchor;
  const anchorHtml = activeAnchor
    ? `<p class="lens-note">Anchor: ${activeAnchor.label ?? `${Number(activeAnchor.lat).toFixed(4)}, ${Number(activeAnchor.lon).toFixed(4)}`}</p>`
    : '<p class="lens-note">No anchor set. Press Find My Location to ground the fold in your coordinates.</p>';

  showInstrument(
    'Hearthgate: Arkfire 0.001',
    'Fold window',
    `<div class="fold-instrument">
      ${mathHtml || `<section class="fold-section"><h4>Current J-space state</h4>${envHtml}</section>`}
      <section class="fold-section">
        <h4>Sanctum Anchor</h4>
        ${anchorHtml}
        <div class="lens-actions">
          <button type="button" id="fold-find-location">Find My Location</button>
          <button type="button" id="fold-refresh">Refresh reading</button>
        </div>
        <div id="fold-anchor-status" class="lens-note" aria-live="polite"></div>
      </section>
      ${foldWindowHtml !== 'included-above' ? `<section class="fold-section"><h4>Fold windows</h4>${foldWindowHtml}</section>` : ''}
      <p class="lens-boundary">det(J)=−2 everywhere: local fold probability is exactly 0. Physical fold probability is null and uncalibrated. Convergence score measures proximity to certified preimage fibers — not a physical spacetime fold claim.</p>
    </div>`,
    'fold',
  );

  bindFoldInstrument();
}

function bindFoldInstrument() {
  document.getElementById('fold-refresh')?.addEventListener('click', () => showFold());

  const locBtn = document.getElementById('fold-find-location');
  if (!locBtn) return;

  locBtn.addEventListener('click', () => {
    const status = document.getElementById('fold-anchor-status');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Geolocation is not available in this browser.';
      return;
    }
    if (status) status.textContent = 'Finding location…';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const anchor = {
          lat: Math.round(pos.coords.latitude  * 10000) / 10000,
          lon: Math.round(pos.coords.longitude * 10000) / 10000,
          setAt: new Date().toISOString(),
        };
        writeJson(SANCTUM_ANCHOR_KEY, anchor);
        if (status) status.textContent = `Anchor set: ${anchor.lat}, ${anchor.lon}`;
        try {
          await fetch('/api/sanctum-anchor', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(anchor),
          });
        } catch { /* server push is best-effort */ }
        setTimeout(() => showFold(), 400);
      },
      (err) => {
        if (status) status.textContent = `Location unavailable: ${err.message}`;
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  });
}

function roomAction(action) {
  const visits = readJson(VISITS_KEY, {});
  const activeRoom = place.dataset.room;
  const visitCount = visits[activeRoom]?.count || 1;

  const actions = {
    concordance: showConcordance,
    observer: showObserver,
    fold: showFold,
    read: () => showInstrument('Reading table', "Today's book", '<p>The manuscript shelf is present. Use the Writing Room to create your own document, or mount a live source adapter here.</p>'),
    listen: () => showInstrument('Water threshold', 'The Grove is quiet', '<p>The place is listening. The Grove speaks through the graph — use "Talk with the Grove" for a live conversation.</p>'),
    health: showHealth,
    map: showWorldRegistry,
    write: showLibraryWriter,
    'grove-chat': () => showRoomChat('grove', 'Dreaming Grove', 'Faer'),
    'hall-chat': showGroupChat,
    ingest: showIngestion,
    'hall-presence': showHallPresence,
    'hall-council': showHallCouncil,
    'wizard-constellation': showWizardConstellation,
    'wizard-rooms': showWizardRooms,
    'wizard-theme': showWizardTheme,
    'wizard-modules': showWizardModules,
  };

  actions[action]?.();
}

// ── Theme system ────────────────────────────────────────────

function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function _rgbToHex(rgbStr) {
  const parts = rgbStr.split(',').map(s => parseInt(s.trim(), 10));
  return '#' + parts.map(v => v.toString(16).padStart(2, '0')).join('');
}

function applyTheme(themeId, skipSave) {
  document.documentElement.setAttribute('data-theme', themeId);
  if (!skipSave) {
    writeJson(THEME_KEY, themeId);
    fetch('/api/wizard/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: themeId }),
    }).catch(() => {});
  }
}

function applyCustomVar(prop, value) {
  document.documentElement.style.setProperty(prop, value);
}

function applyCustomTheme(customVars) {
  for (const [prop, value] of Object.entries(customVars)) {
    applyCustomVar(prop, value);
  }
}

function loadTheme() {
  const stored = readJson(THEME_KEY, null);
  if (stored) {
    applyTheme(stored, true);
  } else {
    fetch('/api/wizard/config', { headers: { Accept: 'application/json' } })
      .then(r => r.json())
      .then(data => { if (data.config?.theme) applyTheme(data.config.theme, true); })
      .catch(() => {});
  }
  const custom = readJson(CUSTOM_THEME_KEY, null);
  if (custom) applyCustomTheme(custom);
}

// ── Wizard functions ─────────────────────────────────────────

function showWizard() {
  showInstrument(
    'Wizard · Hearthgate',
    'Configuration governor',
    `<p>One House, one nervous system, many rooms.</p>
     <div class="wizard-nav">
       <button type="button" data-wizard-action="constellation">Constellation</button>
       <button type="button" data-wizard-action="rooms">Room assignments</button>
       <button type="button" data-wizard-action="theme">Appearance</button>
       <button type="button" data-wizard-action="modules">Modules</button>
     </div>
     <p class="lens-note">Wizard controls are live — changes take effect immediately and persist.</p>`,
    'wizard',
  );
  document.querySelectorAll('[data-wizard-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dispatch = {
        constellation: showWizardConstellation,
        rooms: showWizardRooms,
        theme: showWizardTheme,
        modules: showWizardModules,
      };
      dispatch[btn.dataset.wizardAction]?.();
    });
  });
}

async function showWizardConstellation() {
  showInstrument('Wizard · Constellation', 'Loading…', '<p class="lens-listening">Calling the registry…</p>');
  try {
    const res = await fetch('/api/wizard/constellation', { headers: { Accept: 'application/json' } });
    const { agents } = await res.json();
    const activeCount = agents.filter(a => a.status === 'active').length;

    const cards = agents.map(a => {
      const active = a.status === 'active';
      const rooms2 = (a.runtimeConfig?.worldAccess || a.defaultRooms || []);
      return `<div class="agent-card ${active ? 'agent-active' : 'agent-inactive'}" data-agent-id="${a.id}">
        <span class="agent-dot"></span>
        <div class="agent-info">
          <strong>${a.displayName ?? a.name}</strong>
          <small>${a.role} · ${a.status}</small>
        </div>
        <button type="button" class="agent-toggle" data-agent-id="${a.id}" data-toggle-action="${active ? 'stop' : 'start'}">
          ${active ? 'Stop' : 'Start'}
        </button>
      </div>`;
    }).join('');

    showInstrument(
      'Wizard · Constellation',
      `${activeCount} / ${agents.length} active`,
      `<div class="constellation-grid">${cards}</div>
       <div class="lens-actions"><button type="button" id="constellation-back">← Back</button></div>`,
    );

    document.getElementById('constellation-back')?.addEventListener('click', showWizard);
    document.querySelectorAll('.agent-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const agentId = btn.dataset.agentId;
        const action = btn.dataset.toggleAction;
        btn.textContent = action === 'start' ? 'Starting…' : 'Stopping…';
        btn.disabled = true;
        try {
          await fetch(`/api/wizard/constellation/${agentId}/${action}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          await showWizardConstellation();
        } catch {
          btn.textContent = 'Error';
          btn.disabled = false;
        }
      });
    });
  } catch {
    showInstrument('Wizard · Constellation', 'Unavailable', '<p>Could not reach the server.</p>');
  }
}

async function showWizardRooms() {
  showInstrument('Wizard · Rooms', 'Loading…', '<p class="lens-listening">Loading room configuration…</p>');
  try {
    const [roomsRes, constRes] = await Promise.all([
      fetch('/api/rooms', { headers: { Accept: 'application/json' } }),
      fetch('/api/wizard/constellation', { headers: { Accept: 'application/json' } }),
    ]);
    const { rooms: roomList } = await roomsRes.json();
    const { agents } = await constRes.json();

    const rows = roomList.map(room => {
      const opts = agents.map(a =>
        `<option value="${a.id}" ${a.id === room.assignedAgent ? 'selected' : ''}>${a.name ?? a.id}</option>`
      ).join('');
      return `<div class="room-assign-row">
        <div class="room-assign-info">
          <strong>${room.name}</strong>
          <small>${room.arkfirePhases?.join(' · ') ?? ''}</small>
        </div>
        <select class="room-agent-select" data-room-id="${room.id}">${opts}</select>
      </div>`;
    }).join('');

    showInstrument(
      'Wizard · Rooms',
      'Agent assignments',
      `<div class="room-assignments">${rows}</div>
       <div class="lens-actions">
         <button type="button" id="save-rooms">Save</button>
         <button type="button" id="rooms-back">← Back</button>
       </div>
       <div id="rooms-status" class="lens-note" aria-live="polite"></div>`,
    );

    document.getElementById('rooms-back')?.addEventListener('click', showWizard);
    document.getElementById('save-rooms')?.addEventListener('click', async () => {
      const selects = document.querySelectorAll('.room-agent-select');
      const roomAgents = {};
      selects.forEach(sel => { roomAgents[sel.dataset.roomId] = sel.value; });
      const status = document.getElementById('rooms-status');
      try {
        await fetch('/api/wizard/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomAgents }),
        });
        if (status) status.textContent = 'Assignments saved.';
      } catch {
        if (status) status.textContent = 'Could not save — server unavailable.';
      }
    });
  } catch {
    showInstrument('Wizard · Rooms', 'Unavailable', '<p>Could not load room configuration.</p>');
  }
}

function showWizardTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'hearthfire';
  const custom = readJson(CUSTOM_THEME_KEY, {});

  const getCssVar = (name) => {
    const inline = document.documentElement.style.getPropertyValue(name).trim();
    if (inline) return inline;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };

  const swatches = THEMES.map(t => `
    <button type="button" class="theme-swatch ${t.id === current ? 'theme-active' : ''}" data-apply-theme="${t.id}">
      <span class="theme-preview theme-preview-${t.id}"></span>
      <strong>${t.name}</strong>
      <small>${t.desc}</small>
    </button>`).join('');

  const glassBlur = getCssVar('--glass-blur').match(/blur\((\d+(?:\.\d+)?)px\)/)?.[1] ?? '32';
  const goldRgb = getCssVar('--gold-rgb').trim() || '230, 197, 116';
  const seaRgb  = getCssVar('--sea-rgb').trim()  || '120, 191, 177';
  const goldHex   = _rgbToHex(goldRgb);
  const seaHex    = _rgbToHex(seaRgb);
  const emberRgb  = getCssVar('--ember-rgb').trim() || '236, 129, 80';
  const violetRgb = getCssVar('--violet-rgb').trim() || '140, 125, 171';
  const emberHex  = _rgbToHex(emberRgb);
  const violetHex = _rgbToHex(violetRgb);
  const nightHex  = getCssVar('--night').trim() || '#070a10';
  const parchHex  = getCssVar('--parchment').trim() || '#efe4d1';

  showInstrument(
    'Wizard · Appearance',
    'Theme and visual tuning',
    `<div class="theme-swatches">${swatches}</div>

     <div class="wizard-section">
       <p class="wizard-section-title">Live editor</p>
       <div class="theme-editor-grid">
         <div class="theme-ctrl">
           <label for="te-gold">Primary accent</label>
           <input type="color" id="te-gold" value="${goldHex}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-sea">Horizon tone</label>
           <input type="color" id="te-sea" value="${seaHex}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-ember">Warmth accent</label>
           <input type="color" id="te-ember" value="${emberHex}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-violet">Cool accent</label>
           <input type="color" id="te-violet" value="${violetHex}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-night">Deep surface</label>
           <input type="color" id="te-night" value="${nightHex}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-parch">Text tone</label>
           <input type="color" id="te-parch" value="${parchHex}" />
         </div>
       </div>
       <div class="theme-editor-grid">
         <div class="theme-ctrl">
           <label for="te-glass">Glass thickness <span class="theme-ctrl-value" id="te-glass-val">${glassBlur}px</span></label>
           <input type="range" id="te-glass" min="0" max="64" step="2" value="${glassBlur}" />
         </div>
         <div class="theme-ctrl">
           <label for="te-glow">Glow intensity <span class="theme-ctrl-value" id="te-glow-val">${custom['--glow-strength'] ?? 1}</span></label>
           <input type="range" id="te-glow" min="0" max="3" step="0.1" value="${custom['--glow-strength'] ?? 1}" />
         </div>
       </div>
     </div>

     <div class="lens-actions">
       <button type="button" id="theme-save-custom">Save custom</button>
       <button type="button" id="theme-reset-custom">Reset to theme</button>
       <button type="button" id="theme-back">← Back</button>
     </div>
     <p class="lens-note">Presets set the base palette. The live editor layers overrides on top.</p>`,
  );

  document.getElementById('theme-back')?.addEventListener('click', showWizard);

  document.querySelectorAll('[data-apply-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.applyTheme);
      document.documentElement.removeAttribute('style');
      writeJson(CUSTOM_THEME_KEY, {});
      showWizardTheme();
    });
  });

  const liveUpdate = () => {
    const gold   = document.getElementById('te-gold')?.value;
    const sea    = document.getElementById('te-sea')?.value;
    const ember  = document.getElementById('te-ember')?.value;
    const violet = document.getElementById('te-violet')?.value;
    const night  = document.getElementById('te-night')?.value;
    const parch  = document.getElementById('te-parch')?.value;
    const glass  = document.getElementById('te-glass')?.value;
    const glow   = document.getElementById('te-glow')?.value;

    if (gold)   { applyCustomVar('--gold', gold);    applyCustomVar('--gold-rgb', _hexToRgb(gold)); }
    if (sea)    { applyCustomVar('--sea', sea);      applyCustomVar('--sea-rgb', _hexToRgb(sea)); }
    if (ember)  { applyCustomVar('--ember', ember);  applyCustomVar('--ember-rgb', _hexToRgb(ember)); }
    if (violet) { applyCustomVar('--violet', violet); applyCustomVar('--violet-rgb', _hexToRgb(violet)); }
    if (night)  { applyCustomVar('--night', night);  applyCustomVar('--ink', night); }
    if (parch)  { applyCustomVar('--parchment', parch); }
    if (glass !== undefined) {
      applyCustomVar('--glass-blur', `blur(${glass}px) saturate(180%)`);
      const glassVal = document.getElementById('te-glass-val');
      if (glassVal) glassVal.textContent = `${glass}px`;
    }
    if (glow !== undefined) {
      applyCustomVar('--glow-strength', glow);
      const glowVal = document.getElementById('te-glow-val');
      if (glowVal) glowVal.textContent = glow;
    }
  };

  ['te-gold', 'te-sea', 'te-ember', 'te-violet', 'te-night', 'te-parch', 'te-glass', 'te-glow'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', liveUpdate);
  });

  document.getElementById('theme-save-custom')?.addEventListener('click', () => {
    const vars = {};
    const style = document.documentElement.style;
    const props = ['--gold','--gold-rgb','--sea','--sea-rgb','--ember','--ember-rgb',
                   '--violet','--violet-rgb','--night','--ink','--parchment',
                   '--glass-blur','--glow-strength'];
    for (const p of props) {
      const v = style.getPropertyValue(p).trim();
      if (v) vars[p] = v;
    }
    writeJson(CUSTOM_THEME_KEY, vars);
    const note = document.createElement('p');
    note.className = 'lens-note';
    note.textContent = 'Custom theme saved to device.';
    document.querySelector('#reading-body .lens-actions')?.insertAdjacentElement('afterend', note);
    setTimeout(() => note.remove(), 2400);
  });

  document.getElementById('theme-reset-custom')?.addEventListener('click', () => {
    document.documentElement.removeAttribute('style');
    writeJson(CUSTOM_THEME_KEY, {});
    showWizardTheme();
  });
}

async function showWizardModules() {
  showInstrument('Wizard · Modules', 'Loading…', '<p class="lens-listening">Scanning module registry…</p>');
  try {
    const res = await fetch('/api/hearthgate/modules', { headers: { Accept: 'application/json' } });
    const { modules, count } = await res.json();

    const cards = modules.map(m => `
      <div class="module-card">
        <header>
          <strong>${m.name}</strong>
          <span class="module-version">v${m.version}</span>
          <span class="module-status">${m.status ?? m.delivery ?? '—'}</span>
        </header>
        <p>${m.description ?? ''}</p>
        <dl>
          ${m.attribution?.author ? `<div><dt>Author</dt><dd>${m.attribution.author}</dd></div>` : ''}
          ${m.attribution?.date  ? `<div><dt>Date</dt><dd>${m.attribution.date}</dd></div>` : ''}
          <div><dt>Delivery</dt><dd>${m.delivery ?? '—'}</dd></div>
          <div><dt>Centre</dt><dd>${m.centreId ?? '—'}</dd></div>
        </dl>
      </div>`).join('') || '<p class="lens-note">No modules installed beyond built-in core.</p>';

    showInstrument(
      'Wizard · Modules',
      `${count} installed`,
      `<div class="module-list">${cards}</div>
       <p class="lens-note">Drop a <code>*.module.json</code> in the server directory to register a module.</p>
       <div class="lens-actions"><button type="button" id="modules-back">← Back</button></div>`,
    );
    document.getElementById('modules-back')?.addEventListener('click', showWizard);
  } catch {
    showInstrument('Wizard · Modules', 'Unavailable', '<p>Could not load the module registry.</p>');
  }
}

// ── The Hall ────────────────────────────────────────────────

async function showHallPresence() {
  showInstrument('The Hall · Presence', 'Loading…', '<p class="lens-listening">Calling the constellation…</p>');
  try {
    const res = await fetch('/api/rooms/hall/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    const data = await res.json();
    const presence = data.response?.presence ?? [];
    const rows = presence.map(p =>
      `<div class="presence-row">
        <span class="presence-room">${p.room}</span>
        <span class="presence-agent">${p.agent}</span>
      </div>`
    ).join('');
    showInstrument(
      'The Hall · Presence',
      `${presence.length} stations`,
      `<p>All constellation members assigned to their rooms.</p>
       <div class="presence-grid">${rows}</div>
       <p class="lens-note">Assign agents to rooms via ⚙ Wizard → Room assignments.</p>`,
    );
  } catch {
    showInstrument('The Hall', 'Unavailable', '<p>Could not reach the server.</p>');
  }
}

async function showHallCouncil() {
  showInstrument('The Hall · Council', 'Open session', `
    <p>The council is open. All constellation members may speak here.</p>
    <p class="lens-note">Full group LLM dispatch is reserved for a future edition.
    In the present session, submit a query to the graph through any constellation member's centre.</p>
    <div class="lens-actions">
      <button type="button" id="hall-to-observatory">Observatory</button>
      <button type="button" id="hall-to-grove">The Grove</button>
      <button type="button" id="hall-to-workshop">Workshop</button>
    </div>`);

  document.getElementById('hall-to-observatory')?.addEventListener('click', () => openRoom('observatory'));
  document.getElementById('hall-to-grove')?.addEventListener('click', () => openRoom('grove'));
  document.getElementById('hall-to-workshop')?.addEventListener('click', () => openRoom('workshop'));
}

// ── Event listeners ─────────────────────────────────────────

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

document.getElementById('wizard-header-btn')?.addEventListener('click', showWizard);

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
loadTheme();

const initialRoom = window.location.hash.slice(1);
if (rooms[initialRoom]) openRoom(initialRoom, { remember: false });

// ── Utility ───────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Chat system ───────────────────────────────────────────────

const CHAT_KEY_PREFIX = 'hearthfire:chat:v1:';

function getChatHistory(roomId) {
  return readJson(CHAT_KEY_PREFIX + roomId, []);
}

function saveChatHistory(roomId, history) {
  writeJson(CHAT_KEY_PREFIX + roomId, history.slice(-60));
}

function _formatRoomResponse(response) {
  if (!response) return 'No response.';
  const note = response.note ?? '';
  const gc = response.graphContext ?? [];
  const agent = response.narrativeContext?.assignedAgent
    ?? response.centre
    ?? 'agent';

  // Narrative rooms (grove, hearthfire) — conversational framing
  if (response.narrativeContext || response.centre === 'grove' || response.centre === 'hearthfire') {
    if (gc.length) {
      const nodes = gc.slice(0, 4).map(n => n.label).join(', ');
      return `[${agent}] The threads nearest this: ${nodes}.`;
    }
    return `[${agent}] The room holds the thought. Graph context not yet indexed for this query.`;
  }

  if (gc.length) {
    const nodes = gc.slice(0, 5).map(n => `${n.label} (${n.kind})`).join(', ');
    return `${note ? note + '\n\n' : ''}Resonant: ${nodes}`;
  }
  if (response.recentEntries?.length) {
    const e = response.recentEntries.at(-1);
    return `${response.ledgerCount ?? 0} ledger entries. Latest: ${e?.type ?? 'event'} at ${String(e?.timestamp ?? '—').slice(0, 16)}`;
  }
  if (response.environment?.premaq) {
    const p = response.environment.premaq;
    const fmt = x => Number(x?.value ?? 0).toFixed(3);
    return `PREMAQ — P·${fmt(p.pulse)} C·${fmt(p.coherence)} R·${fmt(p.resonance)} E·${fmt(p.entropy)}${note ? '\n' + note : ''}`;
  }
  if (response.proposedNode) {
    const n = response.proposedNode;
    return `Proposed: ${n.label} (${n.kind})\n${response.stewardNote ?? 'Awaiting Steward review.'}`;
  }
  if (response.presence) {
    return `${response.presence.length} constellation members located.\n${note}`;
  }
  return note || String(JSON.stringify(response)).slice(0, 200);
}

function _renderChatMessages(history) {
  if (!history.length) return '<p class="lens-listening">The room is quiet. Say something.</p>';
  return history.map(m => `
    <div class="chat-message chat-${m.role}${m.chorus ? ' chorus-voice' : ''}">
      <span class="chat-sender${m.chorus ? ' group-agent-badge' : ''}">${escapeHtml(m.sender ?? (m.role === 'user' ? 'You' : 'Agent'))}</span>
      <div class="chat-text">${escapeHtml(m.text)}</div>
    </div>`).join('');
}

function _bindChatInput(roomId, agentName, history, isChorus) {
  const inp = document.getElementById('chat-input');
  if (inp) {
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('chat-form')?.requestSubmit();
      }
    });
    inp.focus();
  }

  const scrollBottom = () => {
    const el = document.getElementById('chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  };
  scrollBottom();

  document.getElementById('chat-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msgInp = document.getElementById('chat-input');
    const text = msgInp?.value.trim();
    if (!text) return;
    msgInp.value = '';
    msgInp.style.height = 'auto';

    history.push({ role: 'user', sender: 'You', text });
    saveChatHistory(roomId, history);

    const msgsList = document.getElementById('chat-messages');
    if (msgsList) {
      msgsList.insertAdjacentHTML('beforeend', `
        <div class="chat-message chat-user">
          <span class="chat-sender">You</span>
          <div class="chat-text">${escapeHtml(text)}</div>
        </div>`);

      if (isChorus) {
        _CHORUS_ROOMS.forEach(r => {
          msgsList.insertAdjacentHTML('beforeend', `
            <div class="chat-message chat-agent chorus-voice chat-thinking" id="thinking-${r.id}">
              <span class="chat-sender group-agent-badge">${escapeHtml(r.label)}</span>
              <div class="chat-text">…</div>
            </div>`);
        });
      } else {
        msgsList.insertAdjacentHTML('beforeend', `
          <div class="chat-message chat-agent chat-thinking" id="thinking-bubble">
            <span class="chat-sender">${escapeHtml(agentName)}</span>
            <div class="chat-text">…</div>
          </div>`);
      }
      msgsList.scrollTop = msgsList.scrollHeight;
    }

    if (isChorus) {
      const results = await Promise.allSettled(
        _CHORUS_ROOMS.map(r =>
          fetch(`/api/rooms/${r.id}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
          }).then(res => res.json()),
        ),
      );
      results.forEach((result, i) => {
        const r = _CHORUS_ROOMS[i];
        const bubble = document.getElementById(`thinking-${r.id}`);
        if (!bubble) return;
        bubble.classList.remove('chat-thinking');
        const replyText = result.status === 'fulfilled'
          ? _formatRoomResponse(result.value.response)
          : 'No answer from this station.';
        history.push({ role: 'agent', sender: r.label, text: replyText, chorus: true });
        bubble.querySelector('.chat-text').textContent = replyText;
      });
      saveChatHistory(roomId, history);
    } else {
      try {
        const res = await fetch(`/api/rooms/${roomId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        const replyText = _formatRoomResponse(data.response);
        history.push({ role: 'agent', sender: agentName, text: replyText });
        saveChatHistory(roomId, history);
        const bubble = document.getElementById('thinking-bubble');
        if (bubble) {
          bubble.classList.remove('chat-thinking');
          bubble.querySelector('.chat-text').textContent = replyText;
        }
      } catch {
        const bubble = document.getElementById('thinking-bubble');
        if (bubble) bubble.querySelector('.chat-text').textContent = 'Could not reach the constellation server.';
      }
    }

    const msgs2 = document.getElementById('chat-messages');
    if (msgs2) msgs2.scrollTop = msgs2.scrollHeight;
  });
}

function showRoomChat(roomId, roomLabel, agentName) {
  const history = getChatHistory(roomId);
  showInstrument(
    `${roomLabel} · Chat`,
    `with ${agentName}`,
    `<div class="chat-messages" id="chat-messages">${_renderChatMessages(history)}</div>
     <form class="chat-form" id="chat-form" autocomplete="off">
       <textarea class="chat-input" id="chat-input" placeholder="Speak to ${agentName}…" rows="1" maxlength="2000"></textarea>
       <button type="submit" class="chat-send">→</button>
     </form>`,
  );
  _bindChatInput(roomId, agentName, history, false);
}

const _CHORUS_ROOMS = [
  { id: 'grove',       label: 'Dreaming Grove' },
  { id: 'hearthfire',  label: 'Hearthfire'     },
  { id: 'hall',        label: 'The Hall'       },
];

function showGroupChat() {
  const history = getChatHistory('hall-group');
  showInstrument(
    'The Hall · Chorus',
    'All constellation members',
    `<div class="chat-messages" id="chat-messages">${_renderChatMessages(history)}</div>
     <form class="chat-form" id="chat-form" autocomplete="off">
       <textarea class="chat-input" id="chat-input" placeholder="Speak to the constellation…" rows="1" maxlength="2000"></textarea>
       <button type="submit" class="chat-send">→</button>
     </form>`,
  );
  _bindChatInput('hall-group', 'Constellation', history, true);
}

// ── Writing Room (Library) ────────────────────────────────────

const DRAFT_KEY = 'hearthfire:draft:v1';

function showLibraryWriter() {
  const saved = localStorage.getItem(DRAFT_KEY) || '';
  showInstrument(
    'Grand Library · Writing Room',
    'Your manuscript',
    `<div class="writer-toolbar">
       <button type="button" data-exec="bold"><b>B</b></button>
       <button type="button" data-exec="italic"><i>I</i></button>
       <button type="button" data-exec="underline"><u>U</u></button>
       <span class="writer-sep"></span>
       <button type="button" data-exec="formatBlock" data-arg="h2">H2</button>
       <button type="button" data-exec="formatBlock" data-arg="h3">H3</button>
       <button type="button" data-exec="formatBlock" data-arg="p">¶</button>
       <span class="writer-sep"></span>
       <button type="button" data-exec="insertUnorderedList">• List</button>
       <button type="button" data-exec="insertOrderedList">1. List</button>
       <span class="writer-sep"></span>
       <button type="button" id="writer-save">Save</button>
       <button type="button" id="writer-export">Export .txt</button>
       <button type="button" id="writer-clear">Clear</button>
     </div>
     <div class="writer-area" id="writer-area" contenteditable="true" spellcheck="true">${saved}</div>
     <p class="writer-status" id="writer-status">Autosave: ready</p>`,
    'writer',
  );

  const area = document.getElementById('writer-area');
  const statusEl = document.getElementById('writer-status');
  let saveTimer;

  area?.addEventListener('input', () => {
    clearTimeout(saveTimer);
    if (statusEl) statusEl.textContent = 'Autosave: pending…';
    saveTimer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, area.innerHTML);
      if (statusEl) statusEl.textContent = 'Autosave: saved';
    }, 900);
  });

  document.querySelectorAll('[data-exec]').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      document.execCommand(btn.dataset.exec, false, btn.dataset.arg ?? null);
      area?.focus();
    });
  });

  document.getElementById('writer-save')?.addEventListener('click', () => {
    localStorage.setItem(DRAFT_KEY, area?.innerHTML || '');
    if (statusEl) {
      statusEl.textContent = 'Saved.';
      setTimeout(() => { if (statusEl) statusEl.textContent = 'Autosave: ready'; }, 1800);
    }
  });

  document.getElementById('writer-export')?.addEventListener('click', () => {
    const text = area?.innerText || '';
    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `hearthfire-${new Date().toISOString().slice(0, 10)}.txt`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  let clearStage = 0;
  document.getElementById('writer-clear')?.addEventListener('click', function () {
    clearStage++;
    if (clearStage === 1) {
      this.textContent = 'Sure?';
      setTimeout(() => { clearStage = 0; if (this) this.textContent = 'Clear'; }, 2800);
    } else {
      if (area) area.innerHTML = '';
      localStorage.removeItem(DRAFT_KEY);
      if (statusEl) statusEl.textContent = 'Cleared.';
      this.textContent = 'Clear';
      clearStage = 0;
    }
  });

  area?.focus();
}

// ── Ingestion Zone (Workshop) ─────────────────────────────────

function showIngestion() {
  showInstrument(
    'Ingestion Centre',
    'File intake',
    `<p>Drop text, code, notes, or any file. The room proposes a graph node and returns related existing nodes. All proposals need Steward review before committing.</p>
     <div class="drop-zone" id="drop-zone">
       <span class="drop-icon">⊕</span>
       <p>Drop files here or click to browse</p>
       <input type="file" id="file-input" multiple style="display:none" />
     </div>
     <div id="ingestion-results" class="ingestion-results"></div>`,
  );

  const zone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const results = document.getElementById('ingestion-results');

  zone?.addEventListener('click', () => fileInput?.click());
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drop-active'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drop-active'));
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drop-active');
    _handleIngestFiles(Array.from(e.dataTransfer.files), results);
  });
  fileInput?.addEventListener('change', e => _handleIngestFiles(Array.from(e.target.files), results));
}

async function _handleIngestFiles(files, resultsEl) {
  for (const file of files) {
    const itemId = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    resultsEl?.insertAdjacentHTML('afterbegin', `
      <div class="ingestion-item" id="${itemId}">
        <strong>${escapeHtml(file.name)}</strong>
        <p>${(file.size / 1024).toFixed(1)} KB · proposing to graph…</p>
      </div>`);

    try {
      const content = await _readFileAsText(file);
      const preview = content.slice(0, 600);
      const res = await fetch('/api/rooms/ingestion-centre/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Ingest: ${file.name}`,
          content: preview,
          label: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          source: 'file-drop',
        }),
      });
      const data = await res.json();
      const proposed = data.response?.proposedNode;
      const related = (data.response?.relatedNodes ?? []).slice(0, 3).map(n => n.label).join(', ');
      const itemEl = document.getElementById(itemId);
      if (itemEl) {
        itemEl.querySelector('p').innerHTML = proposed
          ? `Proposed as <em>${escapeHtml(proposed.label)}</em> (${escapeHtml(proposed.kind)})${related ? ` · Related: ${escapeHtml(related)}` : ''} · Awaiting Steward`
          : 'Received. No proposal was generated by the server.';
      }
    } catch {
      const itemEl = document.getElementById(itemId);
      if (itemEl) itemEl.querySelector('p').textContent = 'Could not reach the Ingestion Centre server.';
    }
  }
}

function _readFileAsText(file) {
  return new Promise((resolve) => {
    if (file.size > 8_000_000) { resolve(`[Oversized file: ${file.name}]`); return; }
    const reader = new FileReader();
    reader.onload = e => resolve(String(e.target?.result ?? ''));
    reader.onerror = () => resolve(`[Could not read: ${file.name}]`);
    reader.readAsText(file);
  });
}

// ── Ambient sound engine ──────────────────────────────────────

let _audioCtx = null;
let _masterGain = null;
let _audioEnabled = false;
let _crackleTimer = null;
let _roomOscs = null;
let _rainSrc = null;

function _getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _masterGain = _audioCtx.createGain();
    _masterGain.gain.setValueAtTime(0, _audioCtx.currentTime);
    _masterGain.connect(_audioCtx.destination);
  }
  return _audioCtx;
}

function _makeBrownNoise(ctx, seconds = 8) {
  const n = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * w) / 1.02;
    last = d[i];
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function startAmbience() {
  const ctx = _getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const fire = _makeBrownNoise(ctx);
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 640;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 55;
  const fireGain = ctx.createGain(); fireGain.gain.value = 0.07;
  fire.connect(lpf); lpf.connect(hpf); hpf.connect(fireGain); fireGain.connect(_masterGain);
  fire.start();

  const osc1 = ctx.createOscillator(); osc1.type = 'sine'; osc1.frequency.value = 48;
  const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 52.4;
  const roomLpf = ctx.createBiquadFilter(); roomLpf.type = 'lowpass'; roomLpf.frequency.value = 160;
  const roomGain = ctx.createGain(); roomGain.gain.value = 0.028;
  osc1.connect(roomLpf); osc2.connect(roomLpf); roomLpf.connect(roomGain); roomGain.connect(_masterGain);
  osc1.start(); osc2.start();
  _roomOscs = { osc1, osc2 };

  _masterGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.8);
  _audioEnabled = true;
  _scheduleCrackle();
  _startRainSound(ctx);
  _updateSoundBtn();
  writeJson('hearthfire:sound:v1', true);
}

function _startRainSound(ctx) {
  if (_rainSrc) return;
  // Pink noise via Paul Kellet's method
  const secs = 4;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
    b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
    b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
    d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 4200;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 320;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(lpf); lpf.connect(hpf); hpf.connect(g); g.connect(_masterGain);
  src.start();
  // Rain comes up a little later than the fire, quietly
  g.gain.setValueAtTime(0, ctx.currentTime + 3.5);
  g.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 7.0);
  _rainSrc = { src, g };
}

function _scheduleCrackle() {
  if (!_audioEnabled) return;
  _crackleTimer = setTimeout(() => {
    if (!_audioEnabled || !_audioCtx) return;
    const ctx = _audioCtx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120 + Math.random() * 420, ctx.currentTime);
    const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
    bpf.frequency.value = 360 + Math.random() * 200; bpf.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04 + Math.random() * 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.065 + Math.random() * 0.04);
    osc.connect(bpf); bpf.connect(g); g.connect(_masterGain);
    osc.start(); osc.stop(ctx.currentTime + 0.11);
    _scheduleCrackle();
  }, 700 + Math.random() * 2600);
}

function stopAmbience() {
  _audioEnabled = false;
  clearTimeout(_crackleTimer);
  if (_rainSrc) {
    const rs = _rainSrc.src;
    setTimeout(() => { try { rs.stop(); } catch { /* */ } }, 1600);
    _rainSrc = null;
  }
  if (_masterGain && _audioCtx) {
    _masterGain.gain.linearRampToValueAtTime(0, _audioCtx.currentTime + 1.4);
    setTimeout(() => _audioCtx?.suspend(), 1600);
  }
  _updateSoundBtn();
  writeJson('hearthfire:sound:v1', false);
}

function toggleAmbience() {
  _audioEnabled ? stopAmbience() : startAmbience();
}

function setRoomAmbience(roomKey) {
  if (!_audioEnabled || !_roomOscs || !_audioCtx) return;
  const freqs = {
    hearth:      [48,   52.4],
    observatory: [38,   41.3],
    library:     [34,   37.0],
    grove:       [62,   67.8],
    workshop:    [55,   59.9],
    atlas:       [44,   47.8],
    hall:        [52,   56.6],
  };
  const [f1, f2] = freqs[roomKey] ?? [48, 52.4];
  _roomOscs.osc1.frequency.linearRampToValueAtTime(f1, _audioCtx.currentTime + 1.4);
  _roomOscs.osc2.frequency.linearRampToValueAtTime(f2, _audioCtx.currentTime + 1.4);
}

function _updateSoundBtn() {
  const btn = document.getElementById('sound-toggle-btn');
  if (!btn) return;
  btn.textContent = _audioEnabled ? '♪' : '♩';
  btn.setAttribute('aria-label', _audioEnabled ? 'Mute sound' : 'Enable sound');
  btn.classList.toggle('sound-on', _audioEnabled);
}

// ── Glass sound & haptic system ───────────────────────────────
// Glass sounds run through their own gain — they play independently
// of the ambient fire toggle so the home always responds to touch.

let _glassGain = null;
let _panelHum = null;
let _itemHumNode = null;
const _ROOM_HUM_FREQ = {
  hearth:      432,
  observatory: 396,
  library:     360,
  grove:       528,
  workshop:    288,
  atlas:       324,
  hall:        432,
};

function _ensureGlassCtx() {
  const ctx = _getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();
  if (!_glassGain) {
    _glassGain = ctx.createGain();
    _glassGain.gain.value = 0.68;
    _glassGain.connect(ctx.destination);
  }
  return ctx;
}

function _haptic(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not available */ }
}

function _playGlassTap(intensity = 1) {
  try {
    const ctx = _ensureGlassCtx();
    const t = ctx.currentTime;
    // High glass fundamental
    const o1 = ctx.createOscillator(); o1.type = 'sine';
    o1.frequency.setValueAtTime(3600, t);
    o1.frequency.exponentialRampToValueAtTime(2100, t + 0.09);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.14 * intensity, t);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o1.connect(g1); g1.connect(_glassGain);
    o1.start(t); o1.stop(t + 0.15);
    // Sub-harmonic ring
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1750;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.05 * intensity, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o2.connect(g2); g2.connect(_glassGain);
    o2.start(t); o2.stop(t + 0.08);
  } catch { /* AudioContext not available */ }
  _haptic(intensity > 0.7 ? [8] : [4]);
}

function _playGlassSlide() {
  try {
    const ctx = _ensureGlassCtx();
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.frequency.value = 3200; bpf.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(bpf); bpf.connect(g); g.connect(_glassGain);
    src.start(t); src.stop(t + 0.08);
  } catch { /* */ }
}

function _playDoorOpen(roomKey) {
  try {
    const ctx = _ensureGlassCtx();
    const t = ctx.currentTime;
    // Low resonant thud — weight of the door
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.linearRampToValueAtTime(82, t + 0.38);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.09, t + 0.06);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.44);
    osc.connect(g1); g1.connect(_glassGain);
    osc.start(t); osc.stop(t + 0.46);
    // Glass high note — the pane
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2800;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.06, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o2.connect(g2); g2.connect(_glassGain);
    o2.start(t + 0.04); o2.stop(t + 0.3);
    // Short harmonic shimmer
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 5600;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.025, t + 0.05);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o3.connect(g3); g3.connect(_glassGain);
    o3.start(t + 0.05); o3.stop(t + 0.13);
  } catch { /* */ }
  _haptic([12, 20, 5]);
}

function _playPanelOpen() {
  try {
    const ctx = _ensureGlassCtx();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(_glassGain);
    o.start(t); o.stop(t + 0.19);
  } catch { /* */ }
  _haptic([6]);
}

function _startPanelHum(roomKey) {
  _stopPanelHum();
  try {
    const ctx = _ensureGlassCtx();
    const baseFreq = _ROOM_HUM_FREQ[roomKey] ?? 432;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = baseFreq * 1.5;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = baseFreq * 1.503;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.012, ctx.currentTime + 1.2);
    o.connect(g); o2.connect(g); g.connect(_glassGain);
    o.start(); o2.start();
    _panelHum = { o, o2, g };
  } catch { /* */ }
}

function _stopPanelHum() {
  if (!_panelHum || !_audioCtx) return;
  const t = _audioCtx.currentTime;
  _panelHum.g.gain.linearRampToValueAtTime(0, t + 0.6);
  _panelHum.o.stop(t + 0.65);
  _panelHum.o2.stop(t + 0.65);
  _panelHum = null;
}

function _startItemHum(el) {
  _stopItemHum();
  const freq = parseFloat(el.dataset.humFreq ?? '0');
  if (!freq) return;
  try {
    const ctx = _ensureGlassCtx();
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.018, ctx.currentTime + 0.4);
    o.connect(g); g.connect(_glassGain);
    o.start();
    _itemHumNode = { o, g };
  } catch { /* */ }
}

function _stopItemHum() {
  if (!_itemHumNode || !_audioCtx) return;
  const t = _audioCtx.currentTime;
  _itemHumNode.g.gain.linearRampToValueAtTime(0, t + 0.3);
  _itemHumNode.o.stop(t + 0.35);
  _itemHumNode = null;
}

// ── Wire new events ───────────────────────────────────────────

document.getElementById('sound-toggle-btn')?.addEventListener('click', toggleAmbience);

// Glass tap on any instrument-reading button click
document.getElementById('reading-body')?.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
    _playGlassTap(0.85);
  }
});

// Glass tap on room-action buttons
document.querySelectorAll('[data-room-action]').forEach(btn => {
  btn.addEventListener('click', () => _playGlassTap(1));
});

// Glass tap on door open
document.querySelectorAll('[data-open-room]').forEach(door => {
  door.addEventListener('click', () => {
    const roomKey = door.dataset.openRoom;
    _playDoorOpen(roomKey);
  });
});

// Glass slide on any range input in the instrument panel
document.addEventListener('input', e => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'range') {
    _playGlassSlide();
  }
});

// Item hum on elements with data-hum-freq
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-hum-freq]');
  if (el) _startItemHum(el);
});
document.addEventListener('mouseout', e => {
  const el = e.target.closest('[data-hum-freq]');
  if (el) _stopItemHum();
});
