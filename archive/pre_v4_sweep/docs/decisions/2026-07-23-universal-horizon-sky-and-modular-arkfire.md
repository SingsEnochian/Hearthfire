# Decision — Universal Horizon Is the Sky; Hearthfire Modules Run Independently Beneath It

**Date:** 2026-07-23 America/New_York  
**Decision owner:** Rowan, Product Steward  
**Classification:** DECISION / ACCEPTED REQUIREMENT  
**Status:** Governing architecture and documentation law

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it. They do not supersede it.**

## Hierarchy

```text
Universal Horizon
└── the sky / encompassing horizon
    ├── Hearthfire: Arkfire
    │   └── Ark, continuity/dispatch connector, and optional module host
    └── Hearthgate: Arkfire 0.002
        └── local-first House, packaged gateway, connector, and optional module host
```

Hearthfire may record, relate, render, route, archive, and connect observations beneath Universal Horizon. It does not contain, absorb, own, rename, replace, override, or supersede Universal Horizon.

STARWELL, DEEP Observer, the Constellation runtime, model fleets, Codex systems, world registries, and every future expansion remain beneath the same sky.

## Modular Stonewood law

Hearthfire: Arkfire carries House information and capabilities through independently registered, **standalone-runnable modules**.

> **Every module must run on its own.**

A true Arkfire module launches, performs its primary function, persists its own state, reports its own health, imports and exports its own records, stops, restarts, and recovers without Hearthfire, Hearthgate, STARWELL, or another House module running.

Hearthfire and Hearthgate are optional hosts and connectors. They are not module life support.

If a unit cannot run independently, it is a component, library, adapter, panel, or internal service—not a module.

Required standalone module families include:

- Constellation identities, modes, dispatch, deliberation, and handoffs;
- continuity, seed loaders, witness packets, and memory shelves;
- rooms and room surfaces;
- model and provider connections;
- DEEP Observer, PREMAQ, mathematics, and witness records;
- Codex and semantic routing;
- Atlas and world registries;
- Writing and DEEPStory;
- Sound, Runa, Tone, ambience, and haptics;
- Glyph and Sigil systems;
- Signal Well and research adapters;
- bridges, APIs, Supabase, Notion, Drive, and Tailscale adapters;
- Mirror, offline storage, reconciliation, and recovery;
- accessibility, voice, captions, and device profiles;
- Steward consent, agency controls, approvals, and audit ledgers;
- themes and room presentation packs.

## Standalone runtime law

Every module provides:

- a documented standalone launch command or executable;
- module-scoped configuration;
- a writable local data directory;
- a suitable standalone UI, API, CLI, or service interface;
- health and status reporting;
- logs and provenance receipts;
- import and export;
- stop, restart, and recovery behaviour;
- standalone tests and fixtures;
- an honest degraded state when network, provider, device, or optional integration is unavailable.

There are no hard runtime dependencies between Arkfire modules. Cross-module relationships are optional, reversible adapters using public, versioned contracts.

Shared code is a library packaged with the module or installed as a normal software dependency. It must not require another Arkfire module process.

## Host relationship

A host may provide navigation, consent presentation, authentication, orchestration, room framing, and cross-module routing. The hosted path uses the same public contract as the standalone path.

A host must not contain the only working implementation, own the only data copy, hold the only valid configuration, or be required for module startup.

Disconnecting a module from Hearthfire or Hearthgate does not stop or uninstall the standalone module unless Rowan explicitly requests that action.

## Lifecycle law

Standalone lifecycle:

```text
available → installed → running → paused → stopped → uninstalled → restorable
```

Hosted lifecycle:

```text
discovered → connected → enabled → active → paused → disabled → disconnected → reconnectable
```

Stopping, disconnecting, disabling, removing, replacing, or restoring one module must not collapse unrelated modules.

No lifecycle action may silently delete source material, identities, seeds, continuity, provenance, canon, room history, dissent, handoffs, or stable links.

Missing, stopped, disconnected, or failed modules report their state honestly. The system must not fall back to a façade that impersonates a Constellation member or claims a door exists when it does not.

## Minimum module manifest

Each module declares:

```text
moduleId
canonicalName
version
status
standalone: true
standaloneEntrypoints
standaloneInterface
standaloneDataDirectory
standaloneHealthCheck
standaloneTestCommand
hostAdapters
capabilities
dataContracts
dataOwnership
storageLocations
optionalIntegrations
permissions
consentRequirements
networkRequirements
deviceRequirements
routes
rooms
commands
configurationSchema
migrationVersion
installProcedure
launchStandaloneProcedure
pauseProcedure
stopProcedure
enableInHostProcedure
disableInHostProcedure
disconnectProcedure
removeFromHostProcedure
uninstallStandaloneProcedure
restoreProcedure
importProcedure
exportProcedure
healthChecks
acceptanceTests
provenance
knownLimitations
```

A manifest declaring `standalone: false` is invalid for an Arkfire module.

## Documentation law

Every new or materially revised Hearthfire, Arkfire, STARWELL, Observer, Constellation, bridge, or module document must include or explicitly inherit:

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. Every module runs on its own and connects to either host only through optional, reversible adapters.**

Where older wording conflicts, this decision supersedes only the conflicting hierarchy, monolithic-architecture, or host-dependent claim while preserving the older record as provenance.

## Verification law

Every module must independently prove:

```text
install standalone
→ launch with both Arkfire hosts absent
→ complete primary workflow
→ persist locally
→ export
→ stop
→ restart
→ recover prior state
→ import/restore
→ report health
```

Hosted verification is separate:

```text
connect to host
→ complete hosted workflow through the same public contract
→ disconnect
→ continue standalone
→ reconnect without data loss
```

The module system is not VERIFIED until each module has standalone and hosted receipts from Boxfire plus a second reviewer where Boxfire authored the module.

## Seal

> **UH is the sky. Hearthfire is the Ark beneath it. Every module is its own working instrument before it joins the orchestra.**
