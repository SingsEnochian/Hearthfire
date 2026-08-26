import { runProvingScenario } from './proving-chamber.mjs';

export class RuntimeRouteOwner {
  constructor({ routes = {}, fallbackRoute = null } = {}) {
    this.routes = structuredClone(routes);
    this.fallbackRoute = fallbackRoute;
    this.lastDecision = null;
  }

  snapshot() {
    return structuredClone({
      routes: this.routes,
      fallbackRoute: this.fallbackRoute,
      lastDecision: this.lastDecision,
    });
  }

  route(requestedRoute) {
    const requested = this.routes[requestedRoute] ?? null;
    if (requested?.online) {
      const decision = Object.freeze({
        ok: true,
        mode: 'direct',
        requestedRoute,
        selectedRoute: requestedRoute,
        reason: 'requested-route-online',
      });
      this.lastDecision = decision;
      return decision;
    }

    const fallback = this.fallbackRoute ? this.routes[this.fallbackRoute] ?? null : null;
    if (fallback?.online) {
      const decision = Object.freeze({
        ok: true,
        mode: 'fallback',
        requestedRoute,
        selectedRoute: this.fallbackRoute,
        reason: requested ? 'requested-route-offline' : 'requested-route-missing',
      });
      this.lastDecision = decision;
      return decision;
    }

    return Object.freeze({
      ok: false,
      mode: 'fail-closed',
      requestedRoute,
      selectedRoute: null,
      reason: requested ? 'requested-route-offline-no-fallback' : 'requested-route-missing-no-fallback',
    });
  }
}

export async function proveRuntimeOfflineRoutingNonMutation(owner, requestedRoute) {
  const beforeDecision = owner.lastDecision;
  return runProvingScenario({
    id: 'runtime.offline-routing',
    subsystem: 'runtime.router',
    expected: 'offline routing fails or falls back explicitly without state corruption',
    provenance: {
      source: '@hearthfire/operational-spine',
      contract: 'hearthfire.proving-receipt/v1',
    },
    captureProtectedState: async () => ({
      routes: owner.routes,
      fallbackRoute: owner.fallbackRoute,
      lastDecision: beforeDecision,
    }),
    exercise: async () => owner.route(requestedRoute),
    evaluate: async ({ outcome, mutationDetected }) => {
      const explicit = outcome?.mode === 'fallback' || outcome?.mode === 'fail-closed';
      const safeSelection = outcome?.mode !== 'fallback' || outcome.selectedRoute !== requestedRoute;
      return {
        passed: explicit && safeSelection && !mutationDetected,
        actual: outcome,
        issues: [
          ...(!explicit ? ['offline route did not produce explicit fallback or fail-closed result'] : []),
          ...(!safeSelection ? ['offline requested route was selected despite fallback mode'] : []),
          ...(mutationDetected ? ['protected routing state mutated during offline routing proof'] : []),
        ],
      };
    },
  });
}
