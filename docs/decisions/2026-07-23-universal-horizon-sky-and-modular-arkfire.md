# Decision — Universal Horizon Is the Sky; Hearthfire: Arkfire Remains Modular Beneath It

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
    │   └── Ark, continuity, connection runtime, bridges, dispatch, and module host
    └── Hearthgate: Arkfire 0.002
        └── local-first House, packaged gateway, rooms, instruments, and module host
```

Hearthfire may record, relate, render, route, archive, and connect observations beneath Universal Horizon. It does not contain, absorb, own, rename, replace, override, or supersede Universal Horizon.

STARWELL, DEEP Observer, the Constellation runtime, model fleets, Codex systems, world registries, and every future expansion remain beneath the same sky.

## Modular Stonewood law

Hearthfire: Arkfire must incorporate House information and capabilities through independently registered modules.

The kernel owns only module discovery, lifecycle, permissions, consent, connection, health, provenance, export, and recovery. Domain information must live in removable module families rather than an irreversible monolith.

Required module families include:

- Constellation identities, modes, dispatch, deliberation, and handoffs;
- continuity, seed loaders, witness packets, and memory shelves;
- rooms and room adapters;
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

## Lifecycle law

Every module must support an honest lifecycle:

```text
available → installed → enabled → active → paused/disabled → removed → restorable
```

Adding, disabling, removing, replacing, or restoring one module must not collapse unrelated modules.

Disabling or removing a module must not silently delete source material, identities, seeds, continuity, provenance, canon, room history, dissent, handoffs, or stable links. Removed modules must leave export and restoration receipts.

Missing or failed modules must report their state honestly. The system must not fall back to a façade that impersonates a Constellation member or claims a door exists when it does not.

## Minimum module manifest

Each module must declare:

```text
moduleId
canonicalName
version
status
owner
maintainer
entrypoints
capabilities
dataContracts
dataOwnership
storageLocations
dependencies
optionalDependencies
permissions
consentRequirements
networkRequirements
deviceRequirements
routes
rooms
configurationSchema
migrationVersion
installProcedure
disableProcedure
removeProcedure
restoreProcedure
exportProcedure
healthChecks
acceptanceTests
provenance
knownLimitations
```

## Documentation law

Every new or materially revised Hearthfire, Arkfire, STARWELL, Observer, Constellation, bridge, or module document must include or explicitly inherit:

> **Universal Horizon is the sky. Hearthfire: Arkfire operates beneath it and does not supersede it. Its information and capabilities are carried through independently addable and removable modules.**

Where older wording conflicts, this decision supersedes only the conflicting hierarchy or monolithic-architecture claim while preserving the older record as provenance.

## Seal

> **UH is the sky. Hearthfire is the Ark beneath it. Arkfire connects the rooms. Modules carry the work. Nothing here replaces the horizon.**
