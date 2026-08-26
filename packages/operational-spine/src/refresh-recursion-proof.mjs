import { runProvingScenario } from './proving-chamber.mjs';

export function createSingleOwnerRefreshController({ onRefresh } = {}) {
  let ownerActive = false;
  let completed = 0;
  let rejected = 0;

  return {
    state() {
      return { ownerActive, completed, rejected };
    },
    async requestRefresh() {
      if (ownerActive) {
        rejected += 1;
        return { accepted: false, reason: 'refresh-owner-active' };
      }
      ownerActive = true;
      try {
        completed += 1;
        await onRefresh?.(() => this.requestRefresh());
        return { accepted: true, completed };
      } finally {
        ownerActive = false;
      }
    },
  };
}

export async function proveRefreshRecursionBoundedNonMutation() {
  const protectedState = { canonicalVersion: 1, payload: { stable: true } };
  let controller;
  controller = createSingleOwnerRefreshController({
    async onRefresh(reenter) {
      await reenter();
    },
  });

  return runProvingScenario({
    id: 'refresh.recursion',
    subsystem: 'arcsweep.refresh',
    expected: 'refresh remains single-owner, bounded to one accepted refresh, and recursion rejection does not mutate canonical state',
    provenance: { source: '@hearthfire/operational-spine', contract: 'hearthfire.proving-receipt/v1' },
    captureProtectedState: async () => protectedState,
    exercise: async () => controller.requestRefresh(),
    evaluate: async ({ outcome, mutationDetected }) => {
      const state = controller.state();
      const passed = outcome?.accepted === true
        && state.completed === 1
        && state.rejected === 1
        && state.ownerActive === false
        && mutationDetected === false;
      return {
        passed,
        actual: {
          outerAccepted: outcome?.accepted ?? false,
          completedRefreshes: state.completed,
          rejectedRecursiveRefreshes: state.rejected,
          ownerReleased: state.ownerActive === false,
        },
        issues: passed ? [] : ['refresh was not single-owner, bounded, or non-mutating'],
      };
    },
  });
}
