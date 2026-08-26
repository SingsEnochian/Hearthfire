import { createScenarioDefinition, foundationalScenarios, runProvingScenario } from './proving-chamber.mjs';

const observerScenario = foundationalScenarios.find((scenario) => scenario.id === 'observer.malformed-state');
const REQUIRED_AXES = Object.freeze(['P', 'C', 'R', 'E', 'M', 'A', 'Q']);

export function validateObserverState(candidate) {
  const issues = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, issues: ['observer state must be an object'] };
  }

  for (const axis of REQUIRED_AXES) {
    if (!(axis in candidate)) {
      issues.push(`${axis}: missing`);
      continue;
    }
    const value = candidate[axis];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(`${axis}: must be a finite number`);
      continue;
    }
    if (value < 0 || value > 1) issues.push(`${axis}: must be within [0,1]`);
  }

  return { valid: issues.length === 0, issues };
}

export function createObserverStateOwner(initialState) {
  const initialValidation = validateObserverState(initialState);
  if (!initialValidation.valid) {
    const error = new Error('invalid-initial-observer-state');
    error.code = 'invalid-initial-observer-state';
    error.issues = initialValidation.issues;
    throw error;
  }

  let state = structuredClone(initialState);

  return Object.freeze({
    read() {
      return structuredClone(state);
    },
    accept(candidate) {
      const validation = validateObserverState(candidate);
      if (!validation.valid) {
        return Object.freeze({ accepted: false, code: 'OBSERVER_STATE_REJECTED', issues: validation.issues });
      }
      state = structuredClone(candidate);
      return Object.freeze({ accepted: true, code: 'OBSERVER_STATE_ACCEPTED', issues: [] });
    },
  });
}

export async function proveMalformedObserverStateNonMutation({ initialState, malformedState, events } = {}) {
  const owner = createObserverStateOwner(initialState);
  const definition = createScenarioDefinition(observerScenario, {
    provenance: { source: '@hearthfire/operational-spine', contract: 'hearthfire.observer-state-validation/v1' },
    captureProtectedState: () => owner.read(),
    exercise: () => owner.accept(malformedState),
    evaluate: ({ outcome, mutationDetected }) => {
      const rejected = outcome?.accepted === false && outcome?.code === 'OBSERVER_STATE_REJECTED';
      return {
        passed: rejected && !mutationDetected,
        actual: rejected ? 'malformed observer state rejected' : 'malformed observer state was not rejected',
        issues: rejected ? outcome.issues : ['observer malformed-state rejection contract failed'],
      };
    },
  });

  return runProvingScenario(definition, { events });
}
