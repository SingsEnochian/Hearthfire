# Arkfire Module Inventory — 2026-07-25

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. Every module runs on its own and connects to either host only through optional, reversible adapters.**

**Classification:** OBSERVATION / IMPLEMENTATION INVENTORY  
**Purpose:** Prevent duplicate modules and distinguish standalone instruments from host components, static benches, adapters, stores, and embedded services.

This inventory was made before MF-001 implementation by inspecting the accessible Hearthfire, Flameclyffe/Hearthgate, Runa, Lioreal, Uial, and Flameclyffe Supabase sources.

## Existing Arkfire module claims in Hearthfire

| Existing unit | Evidence | Current judgement | Required action |
|---|---|---|---|
| Constellation Dispatch | `starwell-server/constellation-dispatch.module.json`, `arkfire-dispatch.mjs`, seed/context loaders | Real embedded and standalone-capable runtime. Manifest uses older `hearthgate.module/v1`; model/provider logic remains fused into dispatch. | Preserve. Later make it a client of Model Foundry and migrate its manifest to `arkfire.module/v1`. |
| Boxfire Agent Toolkit | `starwell-server/boxfire-agents.module.json`, `boxfire-agents.mjs` | Standalone importable toolkit, though some agents need a server for their useful path. | Preserve and verify each primary workflow separately. Reclassify any agent that cannot satisfy standalone module law as an internal component. |
| Fleet Health Monitor | `starwell-server/fleet-health.module.json`, `fleet-health.mjs` | Genuine CLI probe, but stateless health probing is a capability/component of the wider Models family rather than the complete Models module required by the contract. | Preserve as source lineage. Fold its probing capability into Model Foundry without deleting the original until replacement verification. |

## Existing Flameclyffe and Hearthgate candidates

| Existing unit | Evidence | Current judgement | Required action |
|---|---|---|---|
| Hearthgate desktop shell | `apps/starwell-server/electron/main.js`, NSIS workflow and packaging docs | Host and packaged gateway, not an Arkfire module. | Extend with a Module Dock kernel component. Do not call the host itself a module. |
| Sheet Convergence | `apps/starwell/public/modules/sheet-convergence.module.json` and tests | Strong standalone module candidate with explicit standalone and embeddable paths. Manifest predates `arkfire.module/v1`. | Migrate contract, verify standalone persistence/export where applicable, then connect through adapter. |
| Signal Well | implemented room, module manifest, adapter directory, packaging checks, installable-core decision | Strong standalone module candidate. Existing decision still describes a bundled Hearthgate core, which conflicts with the later law if Hearthgate is required for primary operation. | Preserve functionality, extract a separately runnable package, then let Hearthgate bundle or connect it without becoming life support. |
| Glyph Studio and FontForge worker | Glyph Studio UI, IO layer, local worker, packaging checks | Substantial real implementation. Whether it is a module depends on standalone launch, state, import/export, health, compiler-degraded state, and restart verification. | Audit against module contract before building anything new. Likely extract as the Glyph module rather than rewrite. |
| Hearthgate Archive | archive UI, documentation, example format | Existing room/component and possible Mirror source. | Do not create a competing archive. Evaluate it as input to a standalone Mirror and Recovery module. |
| Setup Wizard | `public/setup-wizard.html` and server routes | Host configuration component, not a standalone domain module. | Replace host-centred module fields with Module Dock views over canonical public manifests. |

## Runa

Runa already contains independent static benches including Tone Lab, Brainwave Lab, Gateway-inspired Lab, Psi Lab, Zener Lab, RV Capture, Tesla Observatory, Sigil Loom, Threshold Mirror, and Council Bell.

These are real applications or experiments, but they are not automatically Arkfire modules. Each must be classified separately:

- a bench that launches, performs its workflow, persists, exports, restarts, and reports health can become a module;
- a static view with no durable primary workflow remains a component or experiment;
- related sound benches may belong inside one standalone Sound or Runa module rather than becoming a swarm of tiny installers.

No Model Foundry equivalent was found in Runa.

## Lioreal

Lioreal contains a local-first caretaker at `tools/lioreal_agent.py` with inventory and health reporting. It is an agent/tool belonging to Lioreal's workshop, not a general model/provider registry and not evidence that Model Foundry already exists.

Its audit pattern may later inform module self-inspection, but its identity and workshop records remain Lioreal-owned.

## Uial

The GitHub repository currently contains only its root identity marker. The Supabase `uial` Edge Function serves an interactive place with its own sound and visual surface. It is a place, not a provider registry, module host, or Model Foundry implementation.

No Model Foundry equivalent was found in Uial.

## Supabase

The Flameclyffe Supabase project is active and contains bridge, Observer, Flameclyffe, STARWELL, hearing, resonance, studio, and thinking-room records. No public table or column named for a model registry, provider registry, module registry, or capability matrix was found during this inspection.

Supabase is an optional external persistence and bridge system. It must not become the sole store or life support for standalone modules. Existing private thinking-room data remains outside Model Foundry.

## Decision from the inventory

### Build now

**Arkfire Model Foundry (`arkfire.models`)**

Reason: the Models family is required by the current contract, and existing health/model code is scattered across Fleet Health and Constellation Dispatch rather than present as one standalone provider registry with persistence, import/export, and health receipts.

### Build next in the host

**Hearthgate Module Dock**

Classification: host kernel component, not an Arkfire module.

It will:

- discover `arkfire.module/v1` manifests;
- distinguish standalone and hosted lifecycle state;
- install or register package locations;
- launch standalone modules without absorbing their data;
- connect and disconnect optional adapters;
- show permissions, consent, data location, export state, versions, limitations, and verification receipts;
- keep disabled, stopped, disconnected, failed, and unavailable states honest;
- provide a reliable return Home without turning modules into shell-dependent tabs.

### Extraction queue after the Dock

1. Sheet Convergence contract migration and verification.
2. Signal Well standalone extraction.
3. Glyph Studio standalone audit and extraction.
4. Sound/Runa family boundary decision, beginning with Tone Lab rather than duplicating its engine.
5. Mirror and Recovery built from existing archive/export work.
6. Continuity extraction from existing graph, source, and provenance machinery.

## Non-decision

This inventory does not certify any existing unit as VERIFIED. Existing labels such as `functional-standalone` remain source claims until the current Arkfire acceptance sequence and second-review requirements are satisfied.
