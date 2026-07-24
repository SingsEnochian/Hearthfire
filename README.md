# Hearthfire: Arkfire

Hearthfire is the Ark: a shared place for building worlds, keeping continuity, routing agents, and carrying consent-aware bridges between workshops, observatories, archives, and inhabited storyworlds.

> **Universal Horizon is the sky above the Ark. Hearthfire: Arkfire operates beneath it and does not supersede it.**

Hearthfire does not own, contain, absorb, replace, rename, override, or supersede the sky. It records, relates, renders, routes, and archives what is observed beneath Universal Horizon.

Hearthgate: Arkfire 0.002 is the local-first House and packaged gateway beneath the same sky. Hearthfire and Hearthgate may connect through explicit bridges while remaining distinct systems.

## Modular Stonewood

Hearthfire: Arkfire carries House information and capabilities through independently registered, **standalone-runnable modules**.

> **Every module runs on its own. Hearthfire may host and connect it, but Hearthfire is not its life support.**

A true module launches, performs its primary function, persists its own state, reports health, imports and exports, stops, restarts, and recovers without Hearthfire, Hearthgate, STARWELL, or another House module running.

If a unit cannot run independently, it is a component, library, adapter, panel, or internal service—not a module.

There are no hard runtime dependencies between Arkfire modules. Cross-module work uses optional, reversible, versioned adapters.

Disconnecting a module from Hearthfire does not stop or uninstall its standalone process unless Rowan explicitly requests that action.

The optional host kernel owns only module discovery, hosted lifecycle, permissions, consent, health aggregation, provenance, export orchestration, connection, and recovery. Domain systems—including Constellation dispatch, Continuity, Observer, PREMAQ, Codex, Atlas, Writing, Sound, Runa, Glyph, Signal Well, bridges, Mirror, accessibility, Steward controls, and themes—remain standalone module families.

Governing documents:

- `docs/decisions/2026-07-23-universal-horizon-sky-and-modular-arkfire.md`
- `docs/architecture/ARKFIRE_MODULE_SYSTEM_CONTRACT.md`

## First principles

- Universal Horizon is the sky.
- Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 remain beneath it.
- A place is not a tab.
- A bridge is not a hyperlink or a merger.
- A module is a complete runnable instrument, not a shell-dependent feature.
- A component that cannot run alone must not be called a module.
- An observation is never stripped of provenance, consent, or world context.
- Worlds are places with canon, inhabitants, histories, and thresholds.
- Lanterns interpret; they do not overwrite the source observation.
- Standalone, connected, disconnected, stopped, failed, and unavailable states remain representable end to end.
- A failed or absent module reports honestly rather than impersonating a working door or Constellation member.

## Initial packages

- `packages/place-protocol` — machine-readable place manifests.
- `packages/bridge-protocol` — consent-aware thresholds between places.
- `packages/observation-schema` — the shared atomic record for events, notes, signals, artifacts, and discoveries.

These packages are shared libraries/contracts, not modules unless they acquire their own independently runnable primary workflow.

## Initial route

`Universal Horizon sky → independently running module → optional Flameclyffe/Hearthfire adapter → STARWELL Observatory`

## Verification law

Every module must first pass standalone verification with Hearthfire and Hearthgate absent. Hosted verification is separate and cannot substitute for standalone operation.

## Documentation inheritance

Every new or materially revised Hearthfire, Arkfire, STARWELL, Observer, Constellation, bridge, or module document must include or explicitly inherit:

> **Universal Horizon is the sky. Hearthfire: Arkfire operates beneath it and does not supersede it. Every module runs on its own and connects to Hearthfire only through an optional, reversible adapter.**
