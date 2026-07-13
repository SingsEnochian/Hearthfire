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

const LAST_ROOM_KEY = 'hearthfire:starwell:last-room:v1';
const VISITS_KEY = 'hearthfire:starwell:visits:v1';

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
    arrivalState.textContent = 'The fire remembers you.';
    arrivalNote.textContent = 'The observatory is above. The worlds are through the doors.';
    return;
  }

  continueThreshold.hidden = false;
  continueThreshold.dataset.room = lastRoom;
  continueLabel.textContent = room.label;
  arrivalState.textContent = room.note;
  arrivalNote.textContent = 'Come back to the fire whenever the work needs somewhere to rest.';
}

function showInstrument(kicker, title, html) {
  readingKicker.textContent = kicker;
  readingTitle.textContent = title;
  readingBody.innerHTML = html;
  reading.hidden = false;
}

function closeInstrument() {
  reading.hidden = true;
}

async function showHealth() {
  showInstrument('Steward instrument', 'Listening for Hearthfire', '<p>The instrument is checking the local route.</p>');
  try {
    const response = await fetch('/health', { headers: { Accept: 'application/json' } });
    const health = await response.json();
    showInstrument(
      'Steward instrument',
      health.ok ? 'Hearthfire is answering' : 'The route needs attention',
      `<dl>
        <div><dt>Place</dt><dd>${health.place || 'STARWELL'}</dd></div>
        <div><dt>State</dt><dd>${health.ok ? 'ready' : 'attention'}</dd></div>
        <div><dt>Runtime</dt><dd>${health.runtime || 'unknown'}</dd></div>
        <div><dt>Uptime</dt><dd>${Math.floor((health.uptimeSeconds || 0) / 60)}m</dd></div>
      </dl>`,
    );
  } catch {
    showInstrument('Steward instrument', 'Static threshold', '<p>The place is open, but no local Hearthfire server answered this deployment. Nothing has been disguised as healthy.</p>');
  }
}

function roomAction(action) {
  const visits = readJson(VISITS_KEY, {});
  const activeRoom = place.dataset.room;
  const visitCount = visits[activeRoom]?.count || 1;

  const actions = {
    observe: () => showInstrument('Night instrument', 'The sky holds steady', '<p>No interpretation has been forced onto the observation. The instrument is ready for a consented signal source.</p>'),
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

returnHearth.addEventListener('click', goHearth);
closeReading.addEventListener('click', closeInstrument);
continueThreshold.addEventListener('click', () => openRoom(continueThreshold.dataset.room));

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!reading.hidden) closeInstrument();
    else goHearth();
  }
});

window.addEventListener('popstate', () => {
  const roomKey = window.location.hash.slice(1);
  if (rooms[roomKey]) openRoom(roomKey, { remember: false });
  else goHearth();
});

updateClock();
window.setInterval(updateClock, 30_000);
hydrateContinue();

const initialRoom = window.location.hash.slice(1);
if (rooms[initialRoom]) openRoom(initialRoom, { remember: false });
