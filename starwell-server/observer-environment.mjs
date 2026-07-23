// observer-environment.mjs
// Multi-channel live signal bridge: maps Earth's physical fields to PREMAQ concordance vector.
// Vee's sheet-convergence math (2026-07-22) provides the rigorous polynomial foundation.

import { calculateSheetConvergence, normaliseLocationState, CERTIFIED_PREIMAGES } from './sheet-convergence.mjs';
//
// Epistemic claim labels (hearthfire framework):
//   established-science  — validated, peer-reviewed physical measurements
//   active-research      — published but contested or preliminary
//   speculative-theory   — principled extrapolation beyond current evidence
//   fringe-inspiration   — borrowed as structural/creative lens only
//   subjective-observation — experiential, not externally verifiable

const FETCH_TIMEOUT_MS = 8_000;

// Per-channel TTLs (ms)
const TTLS = {
  solarWindMag: 60_000,
  solarWindPlasma: 60_000,
  kp: 180_000,
  sunspots: 3_600_000,
  seismic: 900_000,
  gravitationalWave: 3_600_000,
};

// NOAA SWPC endpoints — established-science, no key required
const NOAA_RTSW_MAG = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
const NOAA_RTSW_PLASMA = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_plasma_1m.json';
const NOAA_KP = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const NOAA_SUNSPOTS = 'https://services.swpc.noaa.gov/json/sunspot_report.json';

// USGS FDSN seismic — established-science, no key required
const USGS_SIGNIFICANT = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson';

// GWOSC gravitational wave catalog — established-science, no key required
// Note: This is a catalog (batch), not a live stream.
const GWOSC_EVENTS = 'https://gwosc.org/eventapi/json/GWTC/';

// Physical anchors
const CMB_T0_K = 2.72548;         // Fixsen 2009 / CODATA 2022 (established-science)
const NANOGRAV_STRAIN_HC = 2.4e-15; // NANOGrav 15yr characteristic strain (established-science)
const SCHUMANN_HARMONICS_HZ = [7.83, 14.3, 20.8, 27.3, 33.8]; // (established-science)

// Preimage fibers imported from sheet-convergence.mjs (canonical source, det=-2).
// J_FIBERS removed — CERTIFIED_PREIMAGES is the single source of truth.

// --- Cache ---

const _cache = new Map();

async function _fetch(url, cacheKey, ttl) {
  const now = Date.now();
  const entry = _cache.get(cacheKey);
  if (entry && now - entry.fetchedAt < ttl) {
    return { ok: true, data: entry.value, stale: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _cache.set(cacheKey, { value: data, fetchedAt: now });
    return { ok: true, data, stale: false };
  } catch (err) {
    if (entry) return { ok: true, data: entry.value, stale: true, staleSince: entry.fetchedAt };
    return { ok: false, error: String(err.message ?? err) };
  }
}

function clamp(v, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

// --- Meeus lunar algorithms (pure JS, no dependencies) ---
// Source: Jean Meeus, "Astronomical Algorithms" 2nd ed. Ch. 47
// claim: established-science

function _julianDay(date) {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

function moonPhaseInfo(date = new Date()) {
  const JD = _julianDay(date);
  const T = (JD - 2_451_545.0) / 36_525; // Julian centuries from J2000.0

  // Moon's mean elongation — Meeus eq. 47.3
  const D_raw = 297.85036 + 445_267.111480 * T - 0.0019142 * T * T + (T * T * T) / 189_474;
  const elongation_deg = ((D_raw % 360) + 360) % 360;

  const phase = elongation_deg / 360; // 0=new moon, 0.5=full moon
  const illumination = round3((1 - Math.cos((elongation_deg * Math.PI) / 180)) / 2);
  const isWaxing = elongation_deg < 180;
  const phaseName =
    elongation_deg < 45 ? 'new' :
    elongation_deg < 90 ? 'waxing-crescent' :
    elongation_deg < 135 ? 'first-quarter' :
    elongation_deg < 180 ? 'waxing-gibbous' :
    elongation_deg < 225 ? 'full' :
    elongation_deg < 270 ? 'waning-gibbous' :
    elongation_deg < 315 ? 'last-quarter' : 'waning-crescent';

  return {
    phase: round3(phase),
    elongation_deg: round3(elongation_deg),
    illumination,
    isWaxing,
    phaseName,
  };
}

// --- Schumann amplitude proxy (speculative-theory) ---
// Schumann resonances are driven by global lightning activity.
// Activity peaks near 06 UTC (African thunderstorms) and 20 UTC (American sector).
// This simplified ionospheric model uses UTC hour — not a live reading.
// Live readings: https://schumannresonancelive.com/ (no public API)

function schumannAmplitudeProxy(date = new Date()) {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const peak1 = Math.cos(((utcHour - 6) / 24) * 2 * Math.PI);
  const peak2 = Math.cos(((utcHour - 20) / 24) * 2 * Math.PI);
  return clamp((peak1 + peak2) / 2 * 0.5 + 0.5);
}

// Alpha brainwave window: 8-12 Hz overlaps Schumann harmonics 1 & 2.
// Dawn (~06 UTC) and dusk (~20 UTC) often show alpha peaks (circadian).
// (speculative-theory — Persinger 1995, Ramirez-Carranza 2025)
function _circadianAlphaWindow(utcHour) {
  const dawnProx = Math.exp(-((utcHour - 6) ** 2) / 8);
  const duskProx = Math.exp(-((utcHour - 20) ** 2) / 8);
  const alphaWindow = clamp(Math.max(dawnProx, duskProx));
  const brainwaveWindow =
    alphaWindow > 0.5 ? 'alpha' :
    (utcHour >= 8 && utcHour <= 18) ? 'beta' : 'theta';
  return { alphaWindow, brainwaveWindow };
}

// Cosmic alignment: peaks at new moon (tight conjunction = strongest alignment field)
// (speculative-theory — mirrors Nocturne observer v9.9 compute_cosmic_alignment)
function cosmicAlignmentFactor(elongation_deg) {
  return round3((1 + Math.cos((elongation_deg * Math.PI) / 180)) / 2);
}

// --- J-space fiber distances (speculative-theory) ---
// PREMAQ state vector → Euclidean distance to each certified preimage fiber.
function jSpaceFiberDistances(stateVec) {
  return CERTIFIED_PREIMAGES.map((fiber) =>
    round3(Math.hypot(...stateVec.map((v, i) => v - fiber[i]))),
  );
}

// --- J-space fold window helpers (speculative-theory) ---
// sin(2π·dayFrac) = 0 when dayFrac=0 (local midnight) or 0.5 (local noon).
// These are the two daily windows where the circadian z-term vanishes, minimising drift from p1.

function _computeFoldWindows(lon) {
  const lonOffset = lon / 15;
  const wMid  = ((-lonOffset) % 24 + 24) % 24;
  const wNoon = ((12 - lonOffset) % 24 + 24) % 24;
  return [
    { name: 'local-solar-midnight', utcHour: round3(wMid) },
    { name: 'local-solar-noon',     utcHour: round3(wNoon) },
  ];
}

function _minutesToNextFoldWindow(utcHour, lon) {
  const windows = _computeFoldWindows(lon);
  const candidates = windows.map((w) => {
    let diff = (w.utcHour - utcHour + 24) % 24;
    if (diff < 0.05) diff = 24; // on the window — show next cycle
    return { ...w, minutesAway: Math.round(diff * 60) };
  });
  return candidates.sort((a, b) => a.minutesAway - b.minutesAway)[0];
}

// --- Live channel fetchers ---

async function _getSolarWind(faulted) {
  const [magR, plasmaR] = await Promise.all([
    _fetch(NOAA_RTSW_MAG, 'solarWindMag', TTLS.solarWindMag),
    _fetch(NOAA_RTSW_PLASMA, 'solarWindPlasma', TTLS.solarWindPlasma),
  ]);

  let bz = null, bt = null;
  if (magR.ok && Array.isArray(magR.data)) {
    for (let i = magR.data.length - 1; i >= 0; i--) {
      const row = magR.data[i];
      if (row.bz_gsm != null && Number.isFinite(Number(row.bz_gsm))) {
        bz = round3(Number(row.bz_gsm));
        bt = row.bt != null ? round3(Number(row.bt)) : null;
        break;
      }
    }
  } else if (!magR.ok) {
    faulted.push({ channel: 'solarWindMag', error: magR.error });
  }

  let speed = null, density = null;
  if (plasmaR.ok && Array.isArray(plasmaR.data)) {
    for (let i = plasmaR.data.length - 1; i >= 0; i--) {
      const row = plasmaR.data[i];
      if (row.speed != null && Number.isFinite(Number(row.speed))) {
        speed = round3(Number(row.speed));
        density = row.density != null ? round3(Number(row.density)) : null;
        break;
      }
    }
  } else if (!plasmaR.ok) {
    faulted.push({ channel: 'solarWindPlasma', error: plasmaR.error });
  }

  // Bz → coherence proxy: northward (+) = closed geomagnetic field = more coherent
  // Typical range: -50 to +50 nT; normalized to [0,1]
  const bz_normalized = bz != null ? round3(clamp((bz + 50) / 100)) : null;

  // Solar wind speed → pulse proxy: 300 km/s (quiet) to 800 km/s (storm)
  const speed_normalized = speed != null ? round3(clamp((speed - 300) / 500)) : null;

  return {
    bz_nT: bz,
    bt_nT: bt,
    speed_km_s: speed,
    density_cm3: density,
    bz_normalized,
    speed_normalized,
    source: 'NOAA DSCOVR real-time solar wind (1-min, rtsw)',
    claimLabel: 'established-science',
    stale: magR.stale || plasmaR.stale || false,
  };
}

async function _getKp(faulted) {
  const r = await _fetch(NOAA_KP, 'kp', TTLS.kp);
  if (!r.ok) {
    faulted.push({ channel: 'kp', error: r.error });
    return { kp: null, kp_normalized: null, source: 'NOAA SWPC planetary K-index', claimLabel: 'established-science', stale: false };
  }

  let kp = null;
  const data = r.data;
  if (Array.isArray(data) && data.length > 1) {
    // Format: [[header...], [time, Kp, ...], ...]
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (Array.isArray(row) && row[1] != null && Number.isFinite(Number(row[1]))) {
        kp = round3(Number(row[1]));
        break;
      }
    }
  }

  return {
    kp,
    kp_normalized: kp != null ? round3(clamp(kp / 9)) : null,
    source: 'NOAA SWPC planetary K-index',
    claimLabel: 'established-science',
    stale: r.stale || false,
  };
}

async function _getSunspots(faulted) {
  const r = await _fetch(NOAA_SUNSPOTS, 'sunspots', TTLS.sunspots);
  if (!r.ok) {
    faulted.push({ channel: 'sunspots', error: r.error });
    return { count: null, count_normalized: null, source: 'NOAA SWPC sunspot report', claimLabel: 'established-science', stale: false };
  }

  let count = null;
  const KEYS = ['AvgSpots', 'dailySunspotNo', 'Ssn', 'ssn', 'spotCount', 'numberSunspots'];
  const tryExtract = (obj) => {
    for (const k of KEYS) {
      if (obj[k] != null && Number.isFinite(Number(obj[k]))) return Number(obj[k]);
    }
    return null;
  };

  const data = r.data;
  if (Array.isArray(data) && data.length) {
    count = tryExtract(data[data.length - 1]);
  } else if (data && typeof data === 'object') {
    const arr = data.data || data.currentMonth || [];
    if (Array.isArray(arr) && arr.length) count = tryExtract(arr[arr.length - 1]);
  }

  return {
    count,
    // Solar cycle maximum ~200 spots; normalize accordingly
    count_normalized: count != null ? round3(clamp(count / 200)) : null,
    source: 'NOAA SWPC sunspot report',
    claimLabel: 'established-science',
    stale: r.stale || false,
  };
}

async function _getSeismic(faulted) {
  const r = await _fetch(USGS_SIGNIFICANT, 'seismic', TTLS.seismic);
  if (!r.ok) {
    faulted.push({ channel: 'seismic', error: r.error });
    return { eventCount30d: null, maxMagnitude30d: null, seismic_entropy: null, source: 'USGS FDSN significant (30d)', claimLabel: 'established-science', stale: false };
  }

  const features = r.data?.features ?? [];
  const eventCount30d = features.length;
  const maxMagnitude30d = features.reduce((mx, f) => Math.max(mx, f.properties?.mag ?? 0), 0) || null;

  // Entropy proxy: global significant events/month baseline ~2-5; >20 = high entropy
  const eventN = round3(clamp(eventCount30d / 20));
  // Magnitude range 5.0-9.0 → normalize to [0,1]
  const magN = maxMagnitude30d != null ? round3(clamp((maxMagnitude30d - 5) / 4)) : 0;
  const seismic_entropy = round3(0.6 * eventN + 0.4 * magN);

  return {
    eventCount30d,
    maxMagnitude30d,
    eventCount_normalized: eventN,
    maxMag_normalized: magN,
    seismic_entropy,
    source: 'USGS FDSN GeoJSON feed — significant events (30d)',
    claimLabel: 'established-science',
    stale: r.stale || false,
  };
}

async function _getGravitationalWave(faulted) {
  const r = await _fetch(GWOSC_EVENTS, 'gravitationalWave', TTLS.gravitationalWave);
  if (!r.ok) {
    faulted.push({ channel: 'gravitationalWave', error: r.error });
    return {
      latestEvent: null,
      catalogCount: null,
      gw_factor: 0.15, // NANOGrav background floor (established-science)
      source: 'GWOSC GWTC catalog',
      claimLabel: 'established-science',
      note: 'Batch catalog — not a live stream. GW alert subscriptions: gracedb.ligo.org',
      stale: false,
    };
  }

  const events = r.data?.events ?? {};
  const eventKeys = Object.keys(events);

  // Find most recent event by GPS time
  let latestEvent = null;
  let latestGPS = 0;
  for (const key of eventKeys) {
    const gps = Number(events[key]?.GPS ?? events[key]?.gps ?? 0);
    if (gps > latestGPS) { latestGPS = gps; latestEvent = key; }
  }

  // GW factor: constant background floor from NANOGrav 15yr (established-science)
  // Transient events contribute episodic spikes; background is always present.
  return {
    latestEvent,
    latestGPS: latestGPS || null,
    catalogCount: eventKeys.length,
    gw_factor: 0.15,
    background: {
      characteristicStrain_hc: NANOGRAV_STRAIN_HC,
      source: 'NANOGrav 15yr Data Set 2023',
    },
    source: 'GWOSC GWTC catalog (batch)',
    claimLabel: 'established-science',
    note: 'LIGO/Virgo/KAGRA catalog events. Live public alerts: https://gracedb.ligo.org',
    stale: r.stale || false,
  };
}

// --- PREMAQ vector from environmental channels ---
// Weights are heuristic (speculative-theory); inputs are established-science.
// Formula analogous to: dP/dt = α(C-E) + β(RM) + ε(A)
// This computes an instantaneous snapshot, not an integrated trajectory.

function _computePremaq({ solarWind, kp, sunspots, seismic, moon, cosmicF, schumannA, alphaW, gw }) {
  const bz = solarWind.bz_normalized;      // northward Bz → coherent [0,1]
  const kpN = kp.kp_normalized;            // geomagnetic activity [0,1]
  const sunN = sunspots.count_normalized;  // solar pulse [0,1]
  const seisE = seismic.seismic_entropy;   // seismic disorder [0,1]
  const moonP = moon.phase;                // 0=new, 0.5=full
  const fullFactor = 1 - Math.abs(moonP - 0.5) * 2; // peaks at full moon
  const gwF = gw.gw_factor;               // GW resonance floor

  // P — Pulse: solar energy arriving at Earth
  const pulse = clamp(
    (sunN != null ? 0.5 * sunN : 0.25) +
    (kpN != null ? 0.3 * kpN : 0.15) +
    (solarWind.speed_normalized != null ? 0.2 * solarWind.speed_normalized : 0.1),
  );

  // C — Coherence: field stability; positive Bz + low Kp = coherent field
  const coherence = clamp(
    (bz != null ? 0.5 * bz : 0.5) +
    (kpN != null ? 0.3 * (1 - kpN) : 0.3) +
    0.2 * schumannA,
  );

  // R — Resonance: cyclical coherence; full moon + GW background floor
  const resonance = clamp(
    0.35 * fullFactor +
    0.30 * (1 - cosmicF) +   // new moon conjunction → higher resonance
    0.20 * schumannA +
    0.15 * gwF,
  );

  // E — Entropy: disorder; high Kp + seismic activity + southward Bz
  const entropy = clamp(
    (kpN != null ? 0.4 * kpN : 0.2) +
    (seisE != null ? 0.4 * seisE : 0.2) +
    (bz != null ? 0.2 * (1 - bz) : 0.1),
  );

  // M — Memory: long-period continuity; stable Kp + stable geomagnetic field
  const memory = clamp(
    (kpN != null ? 0.4 * (1 - kpN) : 0.4) +
    0.3 * (1 - moonP) +
    (bz != null ? 0.3 * bz : 0.15),
  );

  // A — Axis: stable orienting frame; circadian alpha window + Bz alignment + new moon
  const axis = clamp(
    (bz != null ? 0.35 * bz : 0.35) +
    0.30 * (1 - cosmicF) +
    0.35 * alphaW,
  );

  return {
    pulse: round3(pulse),
    coherence: round3(coherence),
    resonance: round3(resonance),
    entropy: round3(entropy),
    memory: round3(memory),
    axis: round3(axis),
  };
}

// --- J-space state from PREMAQ (speculative-theory) ---
// Maps PREMAQ to a 3-vector in J-space to compute fiber proximity.
// Intentional correspondence with stateFrom() in Sheet Convergence Research Observer.

function _computeJSpace(premaq, date = new Date(), localSolarHour = null) {
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60;
  const dayFrac = (localSolarHour ?? utcH) / 24;
  const x = (premaq.pulse - premaq.entropy) * 2 - 1;
  const y = (premaq.coherence - 0.5) * 2;
  const z = Math.tanh((premaq.resonance - 0.5) * 4) + Math.sin(2 * Math.PI * dayFrac);

  const state = [round3(x), round3(y), round3(z)];
  const distances = jSpaceFiberDistances(state);
  const closestFiber = distances.indexOf(Math.min(...distances));

  return {
    state,
    fiberDistances: distances,
    closestFiber,
    closestFiberLabel: ['earth-p1', 'conjugate-p2', 'conjugate-p3'][closestFiber],
    dayFrac: round3(dayFrac),
    interpretation: closestFiber === 0
      ? 'State maps to Earth fiber (p1). Physical conditions are within normal terrestrial range.'
      : `State approaches conjugate fiber ${closestFiber + 1}. This typically reflects unusual entropy/pulse conditions.`,
    note: 'p2/p3 (z=6.5) are structurally unreachable from physical coordinates; z here stays within ±2.73.',
    claimLabel: 'speculative-theory',
  };
}

// --- Main export ---

export async function fetchEnvironmentReading(sanctumAnchor = null) {
  const now = new Date();
  const fetchedAt = now.toISOString();
  const faulted = [];

  const [solarWind, kp, sunspots, seismic, gw] = await Promise.all([
    _getSolarWind(faulted),
    _getKp(faulted),
    _getSunspots(faulted),
    _getSeismic(faulted),
    _getGravitationalWave(faulted),
  ]);

  const moon = moonPhaseInfo(now);
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const lon = sanctumAnchor?.lon ?? 0;
  const localSolarHour = ((utcHour + lon / 15) % 24 + 24) % 24;
  const schumannA = schumannAmplitudeProxy(now);
  const cosmicF = cosmicAlignmentFactor(moon.elongation_deg);
  const { alphaWindow, brainwaveWindow } = _circadianAlphaWindow(localSolarHour);

  const premaq = _computePremaq({ solarWind, kp, sunspots, seismic, moon, cosmicF, schumannA, alphaW: alphaWindow, gw });
  const jspace = _computeJSpace(premaq, now, localSolarHour);

  // Confidence scales with available live channels (5 total)
  const activeChannels = 5 - faulted.length;
  const confidence = round3(clamp(0.40 + activeChannels * 0.10));

  // Location-direct convergence (LOCATION_INPUT + MATHEMATICAL_DERIVATION registers)
  // Complements PREMAQ-based jspace (PHYSICS_MODEL register). Neither replaces the other.
  let locationDirectConvergence = null;
  if (sanctumAnchor) {
    try {
      const locationState = normaliseLocationState({
        latitude: sanctumAnchor.lat,
        longitude: sanctumAnchor.lon,
        altitudeM: sanctumAnchor.elevation ?? 0,
        timestamp: now,
      });
      const raw = calculateSheetConvergence(locationState);
      locationDirectConvergence = {
        registers: ['MATHEMATICAL_DERIVATION', 'LOCATION_INPUT'],
        state: raw.state.map(v => round3(v)),
        mapped: raw.mapped.map(v => round3(v)),
        determinant: round3(raw.determinant),
        volumeScale: round3(raw.volumeScale),
        orientation: raw.orientation,
        convergenceScore: round3(raw.convergenceScore),
        foldSusceptibility: round3(raw.susceptibility),
        targetResidual: round3(raw.targetResidual),
        nearestPreimageDistance: round3(raw.nearestPreimageDistance),
        preimageDistances: raw.preimageDistances.map(v => round3(v)),
        conditionNumber: Number.isFinite(raw.conditionNumber) ? round3(raw.conditionNumber) : 'Inf',
        localFoldProbability: raw.localFoldProbability,
        physicalFoldProbability: raw.physicalFoldProbability,
        physicalStatus: raw.physicalStatus,
        claimLabel: 'speculative-theory',
        note: 'det(J)=-2 everywhere: local fold probability is exactly 0. Physical fold probability is null and uncalibrated — no physical spacetime fold is claimed.',
      };
    } catch { /* invalid anchor — skip */ }
  }

  const foldWindows = sanctumAnchor
    ? {
        windows: _computeFoldWindows(lon),
        nextWindow: _minutesToNextFoldWindow(utcHour, lon),
        anchoredTo: sanctumAnchor.label ?? `lat ${round3(sanctumAnchor.lat)}, lon ${round3(lon)}`,
        claimLabel: 'speculative-theory',
        note: 'Fold windows are when the local-solar circadian term (sin 2πt) crosses zero. Not validated physics.',
      }
    : null;

  return {
    schema: 'hearthfire.environment/v1',
    fetchedAt,
    confidence,
    premaq,
    jspace,
    sanctumAnchor: sanctumAnchor
      ? { lat: round3(sanctumAnchor.lat ?? 0), lon: round3(lon), label: sanctumAnchor.label ?? null }
      : null,
    foldWindows,
    locationDirectConvergence,
    channels: {
      solarWind,
      geomagneticActivity: kp,
      solarActivity: sunspots,
      seismic,
      gravitationalWave: gw,
      lunarPhase: {
        ...moon,
        source: 'Meeus astronomical algorithms (computed, no ephemeris dependency)',
        claimLabel: 'established-science',
      },
      cosmicAlignment: {
        sunMoonAngle_deg: moon.elongation_deg,
        alignmentFactor: cosmicF,
        interpretation: 'Peaks at new moon (tight conjunction). Troughs at full moon (opposition).',
        source: 'Derived from Meeus lunar elongation',
        claimLabel: 'established-science',
      },
      circadian: {
        utcHour: round3(utcHour),
        localSolarHour: round3(localSolarHour),
        localSolarTimeSource: sanctumAnchor ? 'longitude-corrected' : 'utc',
        brainwaveWindow,
        alphaWindow: round3(alphaWindow),
        schumannAmplitudeProxy: round3(schumannA),
        source: 'UTC clock + simplified ionospheric lightning model',
        claimLabel: 'speculative-theory',
        note: 'Not a live Schumann reading. Amplitude proxy based on known thunderstorm activity peaks ~06 UTC and ~20 UTC.',
      },
      cmbAnchor: {
        T0_K: CMB_T0_K,
        deviation_normalized: 0,
        source: 'Fixsen 2009 / CODATA 2022',
        claimLabel: 'established-science',
        note: 'Live CMB deviation requires space-based instrumentation. This constant anchors the field saturation floor.',
      },
      nanoGravBackground: {
        characteristicStrain_hc: NANOGRAV_STRAIN_HC,
        source: 'NANOGrav 15yr Data Set, 2023 (ApJL)',
        claimLabel: 'established-science',
        note: 'Stochastic nHz gravitational wave background confirmed 2023. Universe\'s lowest resonance floor.',
      },
      faulted,
    },
    schumannProxy: {
      fundamentalHz: SCHUMANN_HARMONICS_HZ[0],
      harmonicsHz: SCHUMANN_HARMONICS_HZ,
      amplitudeProxy: round3(schumannA),
      brainwaveOverlap: {
        theta_Hz: [4, 7.83],
        alpha_Hz: [7.83, 14.3],
        beta_Hz: [14.3, 20.8],
        note: 'Human brainwaves overlap Schumann harmonics 1-2 in theta/alpha bands.',
      },
      liveMonitoringUrls: [
        'https://schumannresonancelive.com/',
        'https://schumann-frequency.com/',
      ],
      claimLabel: 'speculative-theory',
      note: 'No public Schumann API exists. Amplitude here is a UTC-hour ionospheric proxy only.',
    },
    theoreticalFramework: {
      connections: [
        {
          theory: 'Schumann resonance / brainwave entrainment',
          correspondence: 'Earth ELF cavity 7.83 Hz overlaps human alpha (8-12 Hz) and theta (4-8 Hz). Circadian peak windows map to PREMAQ A (axis) and C (coherence).',
          claimLabel: 'active-research',
          sources: ['Persinger 1995 (Perceptual Motor Skills)', 'Ramirez-Carranza 2025 (ScienceDirect unified holographic framework)'],
        },
        {
          theory: 'Verlinde entropic gravity',
          correspondence: 'Entanglement coefficient EC = Q × B × (1-Ee) mirrors entropic emergence of apparent dark matter. PREMAQ E (entropy) corresponds to gravitational entropy gradient; Q (concordance score) to information encoding density.',
          claimLabel: 'active-research',
          sources: ['Verlinde 2016 (SciPost Phys.)', 'arxiv:2405.05269'],
        },
        {
          theory: 'NANOGrav stochastic GW background',
          correspondence: 'Confirmed nHz gravitational wave background (h_c~2.4e-15) is the universe\'s lowest resonance frequency. Interpreted as PREMAQ R floor: resonance cannot be zero because the fabric of spacetime is vibrating.',
          claimLabel: 'established-science',
          sources: ['NANOGrav 15yr Data Set 2023 (ApJL)', 'https://nanograv.org/science/data'],
        },
        {
          theory: 'CMB as dimensional boundary',
          correspondence: 'T₀=2.72548 K anchors the field saturation baseline. DEEP Theory (Flameclyffe): "CMB is the first thing that would change across dimensional boundaries." Deviation τ = (T-T₀)/T₀, normalized over ±300µK.',
          claimLabel: 'speculative-theory',
          sources: ['Flameclyffe/docs/deep-observer-math.md', 'Fixsen 2009'],
        },
        {
          theory: 'Kaluza-Klein compactification / extra dimensions',
          correspondence: 'J-space fiber index maps as compact-dimension selector. KK first excited states >10^19 GeV; undetectable through mass. Detection approach: amplitude residuals in low-energy field coherence (PREMAQ C channel).',
          claimLabel: 'fringe-inspiration',
          sources: ['Kaluza 1921', 'Klein 1926', 'UCSB superstrings: extra dimensions'],
        },
        {
          theory: 'Jacobian fiber model (J-space / DEEP Theory)',
          correspondence: 'F: ℂ³→ℂ³ with det(DF)=-2 defines three world sheets. Environmental PREMAQ state → 3-vector → proximity to each preimage fiber. Only p1 (z=-0.25) is physically approachable; p2/p3 require z=6.5.',
          claimLabel: 'speculative-theory',
          sources: ['Sheet Convergence Research Observer v0.2.0', 'Flameclyffe/docs/deep-observer-math.md', 'Jacobian Conjecture (open since 1939)'],
        },
        {
          theory: 'Holographic consciousness / unified resonance field',
          correspondence: 'Earth\'s Schumann cavity as electromagnetic hologram boundary. Alpha brainwave synchrony interpreted as coupling to planetary information field, corresponding to PREMAQ A and C.',
          claimLabel: 'fringe-inspiration',
          sources: ['Ramirez-Carranza 2025 (ScienceDirect)', 'Iona Miller 2017 (holographicarchetypes)', 'Penrose-Hameroff Orch-OR'],
        },
      ],
    },
    liveSignalAvailability: {
      connected: [
        { name: 'NOAA DSCOVR solar wind (mag)', ttl: '1 min', endpoint: NOAA_RTSW_MAG, claimLabel: 'established-science' },
        { name: 'NOAA DSCOVR solar wind (plasma)', ttl: '1 min', endpoint: NOAA_RTSW_PLASMA, claimLabel: 'established-science' },
        { name: 'NOAA planetary K-index', ttl: '3 hr estimates', endpoint: NOAA_KP, claimLabel: 'established-science' },
        { name: 'NOAA sunspot report', ttl: 'daily', endpoint: NOAA_SUNSPOTS, claimLabel: 'established-science' },
        { name: 'USGS significant earthquakes (30d)', ttl: '15 min', endpoint: USGS_SIGNIFICANT, claimLabel: 'established-science' },
        { name: 'GWOSC GWTC event catalog', ttl: 'per detection', endpoint: GWOSC_EVENTS, claimLabel: 'established-science' },
      ],
      monitorOnly: [
        { name: 'Schumann resonance (Tomsk)', note: 'No public API', urls: ['https://schumannresonancelive.com/', 'https://schumann-frequency.com/'] },
        { name: 'Breakthrough Listen radio telescope archive', note: 'Batch files, no live stream API', urls: ['https://seti.berkeley.edu/opendata'] },
        { name: 'INTERMAGNET geomagnetic (Kyoto GIN)', note: 'Near-real-time visual; no JSON API', urls: ['https://wdc.kugi.kyoto-u.ac.jp/plot_realtime/intermagnet/index.html'] },
        { name: 'NANOGrav pulsar timing array', note: 'Archive dataset; no public live stream', urls: ['https://nanograv.org/science/data'] },
        { name: 'LIGO/Virgo/KAGRA live GW alerts', note: 'Subscription required; public alerts at gracedb.ligo.org', urls: ['https://gracedb.ligo.org/superevents/public/O4/'] },
      ],
    },
    boundary: 'This reading is a heuristic instrument. Physical measurements are established-science; their mapping to PREMAQ uses speculative-theory weights. Not a validated physical model, diagnostic tool, or predictive system. Claim labels are explicit throughout.',
  };
}
