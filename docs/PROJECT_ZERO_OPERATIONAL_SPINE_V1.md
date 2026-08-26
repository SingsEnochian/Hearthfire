# Project Zero Operational Spine v1

## Canonical Home

The shared operational spine lives in `SingsEnochian/Hearthfire` and is consumed by Project Zero and Flameclyffe through explicit contracts and adapters.

## Contracts

- `hearthfire.operational-event/v1` — structured runtime diagnostics.
- Owner readiness registry — fail-closed initialization and read-time contract validation for state owners.
- `hearthfire.proving-receipt/v1` — sealed scenario result with before/after protected-state digests and non-mutation proof.
- `hearthfire.project-zero-diagnostics/v1` — Project Zero diagnostic surface data contract.
- `hearthfire.release-evidence/v1` — canonical release evidence manifest.

## Proving Chamber Rules

Scenarios must be deliberate, isolated, observable, reversible, and non-destructive to canonical state. Rejected operations are not considered safe merely because they returned an error. Protected state must be captured before and after the exercise and compared through a deterministic digest.

The first regression seeds represent failures already encountered in the wider system:

1. refresh recursion / repeated refresh ownership
2. malformed Observer state
3. failed Commons persistence
4. runtime-offline routing
5. replay mismatch

The foundational seeds define scenario identity and expected behaviour. Product adapters provide real protected-state capture, failure injection, and result evaluation. The shared package must not mutate application-owned state itself.

## Owner Readiness

Every state-bearing adapter should define:

- the owner name
- subsystem name
- dependencies
- a contract validator
- explicit state assignment
- readiness status

Reads fail closed when the owner is unknown, unready, dependency-blocked, or invalid at read time.

## Project Zero Diagnostic Surface

Project Zero should render, but not own, these facts:

- subsystem/owner readiness
- last operational failure
- Proving Chamber scenario results
- provenance

UI code must not invent readiness, scenario outcomes, or provenance.

## Release Evidence

A release evidence manifest binds a release identity to:

- exact commit
- schemas/contracts
- migrations
- fixtures/scenarios
- validation receipts
- deployment identity
- provenance

Compilation/build success is evidence of compilation only. Runtime, persistence, replay, routing, and UI behaviour require their own receipts.

## Integration Order

1. Consume the event contract in existing Hearthfire bridge/server services.
2. Add owner readiness adapters around current state-bearing services.
3. Replace seed-only Proving Chamber hooks with subsystem-specific adapters.
4. Expose the diagnostic snapshot to Project Zero.
5. Bind CI/runtime validation outputs into the release evidence manifest.
6. Add Flameclyffe adapters without moving canonical ownership out of Hearthfire.
