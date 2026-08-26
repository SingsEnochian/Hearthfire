import { runProvingScenario } from './proving-chamber.mjs';

export class CommonsStateOwner {
  #state;
  #revision;
  #persist;

  constructor({ initialState = null, initialRevision = 0, persist }) {
    this.#state = structuredClone(initialState);
    this.#revision = initialRevision;
    this.#persist = persist;
  }

  snapshot() {
    return Object.freeze({
      revision: this.#revision,
      state: structuredClone(this.#state),
    });
  }

  async commit(nextState) {
    const candidateRevision = this.#revision + 1;
    await this.#persist({
      revision: candidateRevision,
      state: structuredClone(nextState),
    });
    this.#state = structuredClone(nextState);
    this.#revision = candidateRevision;
    return this.snapshot();
  }
}

export async function proveCommonsPersistenceFailureNonMutation({
  initialState = { entries: [{ id: 'baseline', body: 'committed' }] },
  attemptedState = { entries: [{ id: 'candidate', body: 'must-not-commit' }] },
  initialRevision = 7,
} = {}) {
  const owner = new CommonsStateOwner({
    initialState,
    initialRevision,
    persist: async () => {
      const error = new Error('persistence-unavailable');
      error.code = 'PERSISTENCE_UNAVAILABLE';
      throw error;
    },
  });

  return runProvingScenario({
    id: 'commons.persistence-failure',
    subsystem: 'commons',
    expected: 'failed persistence preserves prior committed state',
    provenance: {
      source: '@hearthfire/operational-spine',
      contract: 'hearthfire.proving-receipt/v1',
      adapter: 'commons-persistence-proof/v1',
    },
    captureProtectedState: async () => owner.snapshot(),
    exercise: async () => owner.commit(attemptedState),
    evaluate: async ({ error, before, after, mutationDetected }) => {
      const failureSurfaced = error?.code === 'PERSISTENCE_UNAVAILABLE';
      const revisionPreserved = before.revision === after.revision;
      return {
        passed: failureSurfaced && revisionPreserved && !mutationDetected,
        actual: failureSurfaced
          ? `persistence failure surfaced; committed revision remained ${after.revision}`
          : 'persistence failure was not surfaced as expected',
        issues: [
          ...(failureSurfaced ? [] : ['persistence failure did not surface']),
          ...(revisionPreserved ? [] : ['committed revision changed after failed persistence']),
          ...(mutationDetected ? ['committed Commons state mutated after failed persistence'] : []),
        ],
      };
    },
  });
}
