import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { bridgeDiagnostics, createBridgeOperationalRuntime, updateBridgeOwner } from './bridge-operational.mjs';

export const BRIDGE_SCHEMA = 'hearthweave.bridge-session/v0.1';
export const PACKET_SCHEMA = 'hearthweave.bridge-packet/v0.1';

export const STATES = Object.freeze([
  'OPEN',
  'LOAD',
  'ORIENT',
  'ARRIVE',
  'EXCHANGE',
  'PAUSED',
  'RETURN',
  'CLOSED',
  'ERROR',
]);

const TRANSITIONS = Object.freeze({
  OPEN: new Set(['LOAD', 'PAUSED', 'RETURN', 'ERROR']),
  LOAD: new Set(['ORIENT', 'PAUSED', 'RETURN', 'ERROR']),
  ORIENT: new Set(['ARRIVE', 'PAUSED', 'RETURN', 'ERROR']),
  ARRIVE: new Set(['EXCHANGE', 'PAUSED', 'RETURN', 'ERROR']),
  EXCHANGE: new Set(['EXCHANGE', 'PAUSED', 'RETURN', 'ERROR']),
  PAUSED: new Set(['EXCHANGE', 'RETURN', 'ERROR']),
  RETURN: new Set(['CLOSED', 'ERROR']),
  CLOSED: new Set(),
  ERROR: new Set(['RETURN', 'CLOSED']),
});

const PAUSE_CUES = new Set(['Feather', 'Icarus']);
const RETURN_CUE = 'Notch';

function nowIso(clock) {
  return clock().toISOString();
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function makePresence({ id, shore, status, canonAuthority = null, realityAnchor = null, arrivalContext = null }) {
  return {
    id,
    shore,
    status,
    canon_authority: canonAuthority,
    reality_anchor: realityAnchor,
    arrival_context: arrivalContext,
  };
}

export class BridgePolicyError extends Error {
  constructor(message, code = 'bridge-policy-violation') {
    super(message);
    this.name = 'BridgePolicyError';
    this.code = code;
  }
}

export class BridgeStateError extends Error {
  constructor(message, code = 'bridge-state-error') {
    super(message);
    this.name = 'BridgeStateError';
    this.code = code;
  }
}

export class BridgeSession {
  constructor({
    worldSlug,
    canonAuthority,
    realityAnchor,
    arrivalContext = null,
    dataDirectory = './data',
    clock = () => new Date(),
    sessionId = randomUUID(),
  }) {
    assertNonEmptyString(worldSlug, 'worldSlug');
    assertNonEmptyString(canonAuthority, 'canonAuthority');
    assertNonEmptyString(realityAnchor, 'realityAnchor');

    this.clock = clock;
    this.dataDirectory = resolve(dataDirectory);
    this.ledgerPath = resolve(this.dataDirectory, 'bridge-session-ledger.jsonl');
    this.packetSequence = 0;
    const timestamp = nowIso(this.clock);

    this.session = {
      schema: BRIDGE_SCHEMA,
      session_id: sessionId,
      state: 'OPEN',
      world_slug: worldSlug,
      consent_state: 'open',
      presentation_mode: 'mythic',
      hearthside: makePresence({
        id: 'vee-hearthside',
        shore: 'hearthside',
        status: 'present',
        realityAnchor,
      }),
      targetside: makePresence({
        id: 'vee-targetside',
        shore: 'targetside',
        status: 'inactive',
        canonAuthority,
        arrivalContext,
      }),
      return_anchor: {
        active: true,
        cue: RETURN_CUE,
      },
      created_at: timestamp,
      updated_at: timestamp,
      last_packet_id: null,
    };
    this.operational = createBridgeOperationalRuntime(this.snapshot());
    this.operational.events.emit({
      subsystem: 'bridge.session',
      event: 'BRIDGE_SESSION_CREATED',
      message: 'Bridge session owner created and validated',
      owner: 'bridge-session',
      provenance: { source: '@hearthfire/bridge-session' },
      context: { sessionId, worldSlug },
    });
  }

  snapshot() {
    return clone(this.session);
  }

  diagnostics() {
    return bridgeDiagnostics(this.operational);
  }

  #refreshReadiness() {
    return updateBridgeOwner(this.operational, this.snapshot());
  }

  async open() {
    this.#refreshReadiness();
    await this.#record('session.opened', { session: this.snapshot() });
    return this.snapshot();
  }

  async transition(nextState, details = {}) {
    this.#refreshReadiness();
    if (!STATES.includes(nextState)) {
      const error = new BridgeStateError(`Unknown bridge state: ${nextState}`, 'unknown-bridge-state');
      this.operational.events.emit({ level: 'error', subsystem: 'bridge.session', event: 'BRIDGE_TRANSITION_REJECTED', message: error.message, owner: 'bridge-session', error, context: { from: this.session.state, to: nextState } });
      throw error;
    }

    const current = this.session.state;
    if (!TRANSITIONS[current].has(nextState)) {
      const error = new BridgeStateError(
        `Invalid bridge transition: ${current} → ${nextState}`,
        'invalid-bridge-transition',
      );
      this.operational.events.emit({ level: 'error', subsystem: 'bridge.session', event: 'BRIDGE_TRANSITION_REJECTED', message: error.message, owner: 'bridge-session', error, context: { from: current, to: nextState } });
      throw error;
    }

    if (nextState === 'LOAD') {
      this.session.targetside.status = 'loading';
    } else if (nextState === 'ARRIVE') {
      this.session.targetside.status = 'present';
    } else if (nextState === 'PAUSED') {
      this.session.consent_state = 'paused';
      this.session.hearthside.status = 'paused';
      this.session.targetside.status = 'paused';
    } else if (nextState === 'EXCHANGE' && current === 'PAUSED') {
      this.session.consent_state = 'open';
      this.session.hearthside.status = 'present';
      this.session.targetside.status = 'present';
    } else if (nextState === 'RETURN') {
      this.session.targetside.status = 'returned';
      this.session.hearthside.status = 'present';
    } else if (nextState === 'CLOSED') {
      this.session.consent_state = 'closed';
      this.session.hearthside.status = 'returned';
      this.session.targetside.status = 'returned';
      this.session.return_anchor.active = false;
    } else if (nextState === 'ERROR') {
      this.session.hearthside.status = 'error';
      this.session.targetside.status = 'error';
    }

    this.session.state = nextState;
    this.session.updated_at = nowIso(this.clock);
    this.#refreshReadiness();
    this.operational.events.emit({ subsystem: 'bridge.session', event: 'BRIDGE_TRANSITION_ACCEPTED', message: `Bridge transitioned ${current} to ${nextState}`, owner: 'bridge-session', context: { from: current, to: nextState, details } });
    await this.#record('session.transitioned', {
      from: current,
      to: nextState,
      details,
      session: this.snapshot(),
    });
    return this.snapshot();
  }

  async load(details = {}) {
    return this.transition('LOAD', details);
  }

  async orient(details = {}) {
    return this.transition('ORIENT', details);
  }

  async arrive(details = {}) {
    return this.transition('ARRIVE', details);
  }

  async beginExchange(details = {}) {
    return this.transition('EXCHANGE', details);
  }

  async pause(cue = 'Feather') {
    if (!PAUSE_CUES.has(cue)) {
      throw new BridgePolicyError('Pause cue must be Feather or Icarus', 'invalid-pause-cue');
    }
    return this.transition('PAUSED', { cue });
  }

  async resume() {
    if (this.session.state !== 'PAUSED') {
      throw new BridgeStateError('Bridge can only resume from PAUSED', 'bridge-not-paused');
    }
    return this.transition('EXCHANGE', { cue: 'consent-restored' });
  }

  async plainPass() {
    this.#refreshReadiness();
    if (this.session.state === 'CLOSED') {
      throw new BridgeStateError('Closed bridge cannot change presentation mode', 'bridge-closed');
    }
    this.session.presentation_mode = 'plain';
    this.session.updated_at = nowIso(this.clock);
    this.#refreshReadiness();
    await this.#record('session.presentation-changed', {
      presentation_mode: 'plain',
      session: this.snapshot(),
    });
    return this.snapshot();
  }

  async returnHome(cue = RETURN_CUE) {
    if (cue !== RETURN_CUE) {
      throw new BridgePolicyError('Return cue must be Notch', 'invalid-return-cue');
    }
    return this.transition('RETURN', { cue });
  }

  async close() {
    return this.transition('CLOSED', { receipt: 'clean-return' });
  }

  async send({
    direction,
    channel,
    payload,
    epistemicRegister,
    provenance = {},
  }) {
    this.#refreshReadiness();
    if (this.session.state !== 'EXCHANGE') {
      throw new BridgeStateError('Packets may cross only while the bridge is in EXCHANGE', 'bridge-not-exchanging');
    }
    if (this.session.consent_state !== 'open') {
      throw new BridgePolicyError('Packets may not cross while consent is paused or closed', 'consent-not-open');
    }
    if (!['hearthside-to-targetside', 'targetside-to-hearthside'].includes(direction)) {
      throw new BridgePolicyError('Invalid packet direction', 'invalid-packet-direction');
    }
    assertNonEmptyString(channel, 'channel');
    assertNonEmptyString(epistemicRegister, 'epistemicRegister');

    const sourceShore = direction.startsWith('hearthside') ? 'hearthside' : 'targetside';
    const targetShore = sourceShore === 'hearthside' ? 'targetside' : 'hearthside';

    if (sourceShore === 'targetside' && epistemicRegister === 'external-observation') {
      throw new BridgePolicyError(
        'Target-world narrative state cannot originate an external-evidence claim',
        'targetside-external-evidence-claim',
      );
    }

    const packetId = `${this.session.session_id}:${String(++this.packetSequence).padStart(4, '0')}`;
    const packet = {
      schema: PACKET_SCHEMA,
      packet_id: packetId,
      session_id: this.session.session_id,
      direction,
      source_presence: this.session[sourceShore].id,
      target_presence: this.session[targetShore].id,
      world_slug: this.session.world_slug,
      sent_at: nowIso(this.clock),
      consent_state: this.session.consent_state,
      return_anchor: clone(this.session.return_anchor),
      presentation_mode: this.session.presentation_mode,
      channel,
      epistemic_register: epistemicRegister,
      payload: clone(payload),
      provenance: {
        canon_authority: this.session.targetside.canon_authority,
        reality_anchor: this.session.hearthside.reality_anchor,
        ...clone(provenance),
      },
    };

    this.session.last_packet_id = packetId;
    this.session.updated_at = packet.sent_at;
    this.#refreshReadiness();
    this.operational.events.emit({ subsystem: 'bridge.session', event: 'BRIDGE_PACKET_CROSSED', message: 'Bridge packet crossed', owner: 'bridge-session', correlationId: packetId, provenance: packet.provenance, context: { direction, channel, epistemicRegister } });
    await this.#record('packet.crossed', { packet });
    return clone(packet);
  }

  async replay() {
    this.#refreshReadiness();
    try {
      const contents = await readFile(this.ledgerPath, 'utf8');
      const ledger = contents
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      this.operational.events.emit({ subsystem: 'bridge.session', event: 'BRIDGE_REPLAY_READ', message: 'Bridge ledger replay loaded', owner: 'bridge-session', context: { records: ledger.length, ledgerPath: this.ledgerPath } });
      return ledger;
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      this.operational.events.emit({ level: 'error', subsystem: 'bridge.session', event: 'BRIDGE_REPLAY_FAILURE', message: 'Bridge ledger replay failed', owner: 'bridge-session', error, context: { ledgerPath: this.ledgerPath } });
      throw error;
    }
  }

  async health() {
    const readiness = this.#refreshReadiness();
    return {
      ok: this.session.state !== 'ERROR' && readiness.ready,
      module: 'arkfire.bridge-session',
      version: '0.1.0',
      standalone: true,
      state: this.session.state,
      consent_state: this.session.consent_state,
      world_slug: this.session.world_slug,
      return_anchor_active: this.session.return_anchor.active,
      ledger_path: this.ledgerPath,
      operational: this.diagnostics(),
    };
  }

  async #record(event, data) {
    await mkdir(dirname(this.ledgerPath), { recursive: true });
    const record = {
      schema: 'hearthweave.bridge-ledger/v0.1',
      record_id: randomUUID(),
      session_id: this.session.session_id,
      event,
      recorded_at: nowIso(this.clock),
      module_id: 'arkfire.bridge-session',
      source_provenance: 'bridge-session-runtime',
      consent_scope: this.session.consent_state,
      authority: 'session-runtime',
      continuity_refs: [],
      export_state: 'local-jsonl',
      data,
    };
    await appendFile(this.ledgerPath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }
}

export async function runVerticalSlice(options) {
  const session = new BridgeSession(options);
  await session.open();
  await session.load({ loader: options.loader ?? 'manual' });
  await session.orient({ arrival_context: options.arrivalContext ?? null });
  await session.arrive({ receipt: 'targetside-present' });
  await session.beginExchange();

  const outbound = await session.send({
    direction: 'hearthside-to-targetside',
    channel: 'arrival',
    epistemicRegister: 'system-state',
    payload: {
      request: 'load-world-and-orient',
      arrival_context: options.arrivalContext ?? null,
    },
    provenance: { loader: options.loader ?? 'manual' },
  });

  const inbound = await session.send({
    direction: 'targetside-to-hearthside',
    channel: 'arrival-receipt',
    epistemicRegister: 'target-world-narrative',
    payload: {
      world_loaded: true,
      canon_authority_resolved: true,
      arrival_context_status: options.arrivalContext ? 'RESOLVED' : 'UNRESOLVED',
      return_anchor_active: true,
      targetside_present: true,
    },
    provenance: { response_to: outbound.packet_id },
  });

  await session.returnHome();
  await session.close();

  return {
    session: session.snapshot(),
    outbound,
    inbound,
    ledger: await session.replay(),
    diagnostics: session.diagnostics(),
  };
}
