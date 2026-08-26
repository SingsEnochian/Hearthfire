import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function stateDigest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export async function runProvingScenario(definition, { events } = {}) {
  const before = structuredClone(await definition.captureProtectedState());
  const beforeDigest = stateDigest(before);
  let outcome;
  let thrown = null;
  try { outcome = await definition.exercise(); } catch (error) { thrown = error; }
  const after = structuredClone(await definition.captureProtectedState());
  const afterDigest = stateDigest(after);
  const mutationDetected = beforeDigest !== afterDigest;
  const actual = await definition.evaluate({ outcome, error: thrown, mutationDetected, before, after });
  const passed = Boolean(actual.passed) && !mutationDetected;
  const receipt = {
    schema: 'hearthfire.proving-receipt/v1',
    scenarioId: definition.id,
    subsystem: definition.subsystem,
    expected: definition.expected,
    passed,
    mutationDetected,
    beforeDigest,
    afterDigest,
    actual: actual.actual ?? null,
    issues: actual.issues ?? [],
    provenance: definition.provenance ?? null,
    completedAt: new Date().toISOString(),
  };
  events?.emit({ level: passed ? 'info' : 'error', subsystem: definition.subsystem, event: passed ? 'PROVING_SCENARIO_PASS' : 'PROVING_SCENARIO_FAIL', message: `${definition.id} ${passed ? 'passed' : 'failed'}`, context: receipt, provenance: definition.provenance ?? null });
  return Object.freeze(receipt);
}

export const foundationalScenarios = Object.freeze([
  { id: 'refresh.recursion', subsystem: 'arcsweep.refresh', expected: 'refresh remains single-owner and bounded' },
  { id: 'observer.malformed-state', subsystem: 'observer', expected: 'malformed observer state is rejected without mutation' },
  { id: 'commons.persistence-failure', subsystem: 'commons', expected: 'failed persistence preserves prior committed state' },
  { id: 'runtime.offline-routing', subsystem: 'runtime.router', expected: 'offline routing fails or falls back explicitly without state corruption' },
  { id: 'replay.mismatch', subsystem: 'replay', expected: 'mismatch is surfaced and canonical history is not mutated' },
]);

export function createScenarioDefinition(seed, hooks) {
  return { ...seed, provenance: hooks.provenance ?? null, captureProtectedState: hooks.captureProtectedState, exercise: hooks.exercise, evaluate: hooks.evaluate };
}
