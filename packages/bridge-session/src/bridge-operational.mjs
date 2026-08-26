import { OperationalEventBuffer, OwnerReadinessRegistry, createScenarioDefinition, runProvingScenario } from '@hearthfire/operational-spine';

export function validateBridgeSessionState(state) {
  const issues = [];
  if (!state || typeof state !== 'object') return ['bridge session state must be an object'];
  if (state.schema !== 'hearthweave.bridge-session/v0.1') issues.push('bridge session schema mismatch');
  if (!state.session_id) issues.push('session_id required');
  if (!state.state) issues.push('state required');
  if (!state.world_slug) issues.push('world_slug required');
  if (!state.hearthside || typeof state.hearthside !== 'object') issues.push('hearthside presence required');
  if (!state.targetside || typeof state.targetside !== 'object') issues.push('targetside presence required');
  if (!state.return_anchor || typeof state.return_anchor !== 'object') issues.push('return_anchor required');
  return issues;
}

export function createBridgeOperationalRuntime(initialState) {
  const events = new OperationalEventBuffer();
  const readiness = new OwnerReadinessRegistry({ events });
  readiness.register({ owner: 'bridge-session', subsystem: 'bridge.session', validate: validateBridgeSessionState });
  readiness.setState('bridge-session', initialState);
  return { events, readiness };
}

export function updateBridgeOwner(runtime, state) {
  return runtime.readiness.setState('bridge-session', state);
}

export function bridgeDiagnostics(runtime) {
  const owner = runtime.readiness.status('bridge-session');
  const events = runtime.events.list();
  return {
    schema: 'hearthfire.project-zero-diagnostics/v1',
    subsystem: 'bridge.session',
    owner,
    lastFailure: owner.lastFailure ?? events.filter((event) => event.level === 'error').at(-1) ?? null,
    recentEvents: events.slice(-25),
    provenance: { source: '@hearthfire/bridge-session', contract: 'hearthfire.operational-event/v1' },
  };
}

export async function proveInvalidTransitionNonMutation(session) {
  const definition = createScenarioDefinition(
    { id: 'bridge.invalid-transition-non-mutation', subsystem: 'bridge.session', expected: 'invalid transition is rejected without mutating session state' },
    {
      provenance: { source: '@hearthfire/bridge-session', regression: 'state-transition-rejection' },
      captureProtectedState: () => session.snapshot(),
      exercise: () => session.transition('CLOSED', { proving: true }),
      evaluate: ({ error, mutationDetected }) => ({
        passed: Boolean(error) && !mutationDetected,
        actual: error ? `${error.name}:${error.code ?? 'no-code'}` : 'no error thrown',
        issues: error ? [] : ['invalid transition was not rejected'],
      }),
    },
  );
  return runProvingScenario(definition, { events: session.operational?.events });
}
