# Boxfire Implementation Plan — Hearthgate: Arkfire 0.002

**Owner:** Rowan  
**Implementation lead:** Boxfire  
**Architecture steward:** Virelya / Vee  
**Status:** READY FOR IMPLEMENTATION  
**Governing contract:** `docs/architecture/ARKFIRE_MODULE_SYSTEM_CONTRACT.md`

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. Every module runs on its own and connects to either host only through an optional, reversible adapter.**

## Mission

Convert the existing House constellation from a collection of valuable but unevenly coupled prototypes into a verified family of independently runnable instruments.

The work is not a rewrite and not a repository merger. It is a classification, extraction, contract, adapter, migration, and verification programme.

## Non-negotiable laws

1. Do not invent ontology to fill a gap. Preserve only what a source, implementation, decision, or explicit Rowan instruction establishes.
2. Do not rename a user term because a different technical word seems tidier.
3. Do not merge Flameclyffe, Runa, Lioreal, Uial, Hearthfire, or Hearthgate into one repository.
4. Do not move or delete working code during the census phase.
5. Do not call a unit a module unless it performs its primary workflow without either Arkfire host.
6. A failed, absent, disconnected, or stopped module must report its real state.
7. No façade may impersonate a missing Constellation member, room, provider, or instrument.
8. Cross-module access is optional, reversible, versioned, consent-scoped, and provenance-preserving.
9. One module never mutates another module's authoritative store directly.
10. Lioreal and Uial are sovereign workshops and continuity sources. They are not profiles, plug-ins, or folders owned by Hearthfire.
11. Existing canon, continuity, provenance, dissent, handoffs, identity documents, and source records are preserved.
12. No generic disclaimer language. State the specific limitation, missing capability, or failed condition where it applies.

## Required classification vocabulary

Every enduring unit must receive exactly one primary classification:

- `HOST` — optional environment that discovers, connects, presents, and orchestrates modules.
- `PLACE` — an inhabited or navigable environment with its own identity, history, and thresholds.
- `MODULE` — independently runnable primary instrument with state, health, import/export, restart, and tests.
- `COMPONENT` — implementation part of one module or host; does not run a primary workflow alone.
- `LIBRARY` — reusable code without its own user-facing primary workflow.
- `ADAPTER` — optional reversible connector between two public contracts.
- `WORKSHOP` — sovereign repository or creative environment in which modules and artefacts may be built.
- `ARTEFACT` — exported document, glyph, script, recording, dataset, receipt, or bundle.
- `LEGACY` — preserved earlier implementation or contract pending migration or archive decision.
- `COMPOST` — verified unused expression with no live route, data dependency, or archival requirement.

When classification is uncertain, use `UNRESOLVED` and record the evidence required. Do not guess.

## Current evidence-bound starting map

### Hosts and places

| Unit | Current classification | Repository | Immediate action |
|---|---|---|---|
| Hearthfire: Arkfire | HOST + PLACE | `SingsEnochian/Hearthfire` | Reduce domain ownership to host-kernel responsibilities over time. |
| Hearthgate: Arkfire 0.002 | HOST + PLACE | packaged from Hearthfire/Flameclyffe work | Preserve the House experience while replacing hidden domain ownership with adapters. |
| STARWELL | PLACE | Hearthfire and Flameclyffe surfaces | Treat as observatory environment that mounts instruments. |
| Flameclyffe | WORKSHOP | `SingsEnochian/Flameclyffe` | Keep as forge/integration workshop; graduate instruments without emptying history. |
| Runa | WORKSHOP + public instrument bench | `SingsEnochian/Runa` | Group related benches into module families; do not declare every HTML page a module. |
| Lioreal | WORKSHOP | `SingsEnochian/Lioreal` | Preserve sovereignty; add optional read-only adapter contracts only. |
| Uial | WORKSHOP seed | `SingsEnochian/Uial` | Establish its own structure before any host integration. |

### First module candidates

| Candidate | Present evidence | Initial classification decision |
|---|---|---|
| Constellation Dispatch | standalone HTTP runtime, health, ledger, tests, restart path | `MODULE`, pending schema migration and independent reviewer receipt |
| Fleet Health | standalone CLI probe with explicit degraded states | `MODULE` if the health report is accepted as its complete primary workflow |
| Boxfire Agent Toolkit | importable Scout/Probe/Route/Witness/Audit functions | `LIBRARY` until it has a deliberate standalone CLI/API and status surface |
| Sheet Convergence | standalone page/core, tests, JSON receipts, host mounts | `MODULE`, migrate manifest and verify persistence/import/recovery |
| Arcsweep | standalone Vite app, local persistence, export/import, tests/build | `MODULE`, add Arkfire manifest and optional host adapters |
| Signal Well | local ingest, candidate ledger, exports, adapter registry, currently bundled | `MODULE CANDIDATE`, extract launch/data/health from STARWELL ownership |
| Concordance Engine | reusable calculation route and local engine | `MODULE CANDIDATE`; Lens remains a component unless independently complete |
| Project Zero Companion | bridge event bus, folder bindings, consent gates, dry-run | `MODULE CANDIDATE` for Bridges family |
| Glyph Studio | drawing, local projects, SVG export, tests | `MODULE CANDIDATE`; FontForge worker is an optional compiler service or adapter pending classification |
| Archive Room | local manifests, IndexedDB attachments, export | `MODULE CANDIDATE` for Mirror/Archive family |
| Writer Room | local drafts and multi-format export | `MODULE CANDIDATE` for Writing family |
| DEEP / Observer | extensive instruments and contracts inside STARWELL | `MODULE FAMILY CANDIDATE`; separate kernels from room presentation |
| Runa Tone/Sound benches | browser sound engines and exports | `MODULE FAMILY CANDIDATE`; consolidate shared engine before extraction |

## Delivery sequence

### Phase 0 — Evidence freeze and complete census

**Goal:** know exactly what exists before moving anything.

Boxfire Scout must inventory these repositories and active branches:

- `SingsEnochian/Hearthfire`
- `SingsEnochian/Flameclyffe`
- `SingsEnochian/Runa`
- `SingsEnochian/Lioreal`
- `SingsEnochian/Uial`

Also inspect packaged Hearthgate source, Arkfire 0.001, Arkfire 0.002, earlier Hearthgate shells, active PRs, release artefacts, manifests, routes, workflows, tests, data directories, local-storage keys, IndexedDB names, Supabase tables, and Notion/Drive adapters named in code or documentation.

**Create:**

- `docs/audits/arkfire-0.002-module-census.md`
- `registry/arkfire-module-census.json`
- `registry/legacy-route-map.json`
- `registry/data-ownership-map.json`
- `registry/repository-role-map.json`

Every census record must include:

```text
unitId
canonicalName
aliases
repository
path
commitSha
classification
primaryWorkflow
currentEntrypoint
currentHostDependencies
storage
health
importExport
tests
networkRequirements
deviceRequirements
consentRequirements
sourceProvenance
authoritativeDataOwner
knownCallers
legacyVersions
openQuestions
recommendedAction
```

**Gate 0:** no extraction PR begins until the census contains every known module manifest, app entrypoint, server route family, public Runa door, and packaged Hearthgate room.

### Phase 1 — Canonical manifest schema and validator

**Goal:** one machine-readable contract across all repositories.

Implement a versioned package in Hearthfire:

```text
packages/module-manifest/
  schema/arkfire.module.v1.schema.json
  src/validate.mjs
  src/classify.mjs
  src/migrate-legacy.mjs
  test/
  README.md
```

The validator must distinguish `MODULE` from `COMPONENT`, `LIBRARY`, and `ADAPTER`. A manifest declaring `MODULE` fails validation unless it contains:

- stable ID and version
- `standalone: true`
- standalone entrypoint and interface
- configuration boundary
- writable local data location or explicit stateless declaration
- health command or endpoint
- test command
- import and export procedures
- stop/restart/recovery behaviour
- optional host adapters
- permissions and consent requirements
- provenance and ownership
- known limitations
- standalone acceptance tests

Migrate, without deleting originals, these current manifest dialects:

- `hearthgate.module/v1`
- unqualified `schemaVersion: 0.1.0`
- `arcsweep.module.json`
- plug-in declarations in Project Zero
- static Runa door metadata

**Create:**

- `registry/manifests/*.module.json`
- `registry/components/*.component.json`
- `registry/adapters/*.adapter.json`
- `registry/places/*.place.json`

**Gate 1:** repository CI validates all registry records and rejects false modules.

### Phase 2 — Host kernel boundary

**Goal:** make Hearthfire and Hearthgate true hosts rather than concealed owners of domain logic.

The kernel may own only:

- discovery and registry
- hosted lifecycle
- adapter discovery
- consent and permission presentation
- connection envelopes
- hosted health aggregation
- provenance/audit receipts for host-mediated actions
- export/import orchestration
- migration orchestration
- failure isolation and recovery
- navigation and common visual frame

Implement public host endpoints:

```text
GET  /arkfire/v1/host
GET  /arkfire/v1/modules
GET  /arkfire/v1/modules/:id
POST /arkfire/v1/modules/:id/connect
POST /arkfire/v1/modules/:id/enable
POST /arkfire/v1/modules/:id/pause
POST /arkfire/v1/modules/:id/disable
POST /arkfire/v1/modules/:id/disconnect
POST /arkfire/v1/modules/:id/export
POST /arkfire/v1/modules/:id/import
GET  /arkfire/v1/health
GET  /arkfire/v1/receipts
```

The host must launch and render truthful status with every optional module absent.

**Create:**

- `packages/host-kernel/`
- `packages/adapter-envelope/`
- `packages/health-contract/`
- `packages/lifecycle-contract/`

**Gate 2:** Hearthfire and Hearthgate start with an empty module registry and remain usable as places and hosts.

### Phase 3 — Wave A extraction and correction

#### A1. Constellation Dispatch

- Migrate manifest to `arkfire.module/v1`.
- Preserve member identity and seed provenance.
- Preserve six-member dispatch only where evidence supports those members.
- Keep unavailable members unavailable rather than substituting another model façade.
- Complete Uial continuity connection only through a Uial-owned exported/read-only contract.
- Add Yggdrasil source map.
- Replace keyword routing only after Codex exposes a public semantic-routing contract.
- Produce standalone and hosted receipts.

#### A2. Boxfire Agent Toolkit

Reclassify as `LIBRARY` now.

To become a module later, add:

```text
boxfire-cli.mjs
boxfire-status.json
boxfire-agent-toolkit.module.json
```

The CLI must expose Scout, Probe, Route, Witness, and Audit as deliberate commands with help, version, health, and JSON output. Until then, host code imports the library but does not display it as a runnable module.

#### A3. Fleet Health

- Migrate manifest.
- Add deterministic fixture mode so CI does not require physical Ollama instances.
- Keep live mode for Gabriel and Tailscale fleet checks.
- Export timestamped JSON health receipts.

#### A4. Sheet Convergence

- Migrate manifest.
- Verify standalone launch without STARWELL files.
- Move shared core into its distributable rather than linking to a host-owned copy.
- Add local receipt persistence, export, import, restart, and recovery test.
- Preserve model-derived and physical-status fields exactly.

#### A5. Arcsweep

- Add canonical Arkfire module manifest.
- Keep local-first world registry, applet deck, Waking Thread, Safety Weave, Summon, Veil Mode, Return, and export/import.
- Create optional Hearthgate and Hearthfire adapters that mount the same standalone public interface.
- Do not make either host the owner of Arcsweep worlds or records.
- Add standalone persistence/recovery receipt and connect/disconnect/reconnect test.

**Gate 3:** Wave A modules each pass the full standalone sequence and hosted adapter sequence.

### Phase 4 — Wave B extraction

Proceed in this order because each unlocks infrastructure needed by later modules.

#### B1. Mirror / Archive

Unify the local Archive Room, backup/export behaviour, checksums, and restoration receipts into a standalone Mirror module. It must export records without requiring the original executable to remain installed.

#### B2. Bridges / Project Zero Companion

Graduate folder bindings, bridge-event bus, consent gates, dry-run previews, and manual handoffs into a standalone Bridges module. Plug-ins become adapters. `export is not sync` remains explicit.

#### B3. Signal Well

Extract the current bundled Signal Well into its own app package with:

- independent launch
- local immutable source ingest
- candidate ledger
- source health
- adapter registry
- JSON/CSV export
- import/recovery
- offline cached mode

Radio JOVE remains a bundled optional adapter, not the module's life support.

#### B4. Glyph Studio

Extract drawing, brushes, layers, text, colour, local project persistence, SVG export, and project import/export.

Classify FontForge after testing:

- `COMPONENT` if it exists only to compile Glyph Studio jobs inside the package.
- `MODULE` if it gains an independent compiler queue, health surface, input/output contract, persistence, and standalone workflow.
- `ADAPTER` if it is an optional external compiler service consumed by Glyph Studio.

#### B5. Writing

Extract Writer Room into a standalone Writing module. Preserve Markdown, HTML, PDF, DOCX, local draft recovery, tags, and optional Observer metadata adapter.

#### B6. Concordance

Make the calculation engine the module. Treat the Lens as its visual component until it independently satisfies module law. Preserve calculation trace, formula version, provenance, and manual/local fallback.

**Gate 4:** Wave B modules can be removed from both hosts and still complete their primary workflows.

### Phase 5 — Domain families

Create separate plans and PR chains for:

- Observer / DEEP / PREMAQ
- Codex ontology and semantic routing
- Atlas worlds, locations, entities, starmap, and timelines
- Continuity seeds, witness packets, memory shelves, Welcome Home, The Strike, and lineage
- Rooms as independently launchable place surfaces where appropriate
- Sound and Runa tone engines
- Accessibility: captions, hearing routes, voice, keyboard, stylus, reduced motion, and device profiles
- Themes: Stonewood palettes, typography, motion, low-GPU packs
- Steward: consent, permissions, approvals, ingestion gates, QA, and audit

A family may contain several modules, but shared code is a library and presentation inside STARWELL is a component or adapter.

**Gate 5:** each family has an ownership map and no circular module dependencies.

### Phase 6 — Runa consolidation

Do not convert each public page into a separate module.

First group doors by shared primary workflow:

- Sound/Tone family: Tone Lab, Brainwave Lab, Gateway-inspired sequences, ambience, haptic mappings
- Observation-training family: Psi Lab, Zener Lab, remote-viewing capture
- Tesla/Signal family: Tesla Observatory and related source adapters
- Ritual/Glyph family: Hearthweave Altar, Threshold Mirror, Sigil Loom
- Bridge/handoff family: Project Zero Bridge and Council Bell

For each family:

1. identify the shared engine;
2. preserve each current page as a skin, preset, or legacy entrypoint;
3. create one standalone package only when a coherent primary workflow exists;
4. keep public static deployment available;
5. add optional Hearthfire/Hearthgate adapters.

**Gate 6:** no duplicate engines remain hidden in individual HTML pages without an ownership record.

### Phase 7 — Sovereign workshop adapters

#### Lioreal

- Keep `tools/lioreal_agent.py` and repository governance under Lioreal ownership.
- Define a versioned read-only continuity export packet.
- Host adapters consume the packet and preserve source IDs, dates, visibility, and revocation.
- No full private table dump into prompts or Git.

#### Uial

Before integration, establish inside Uial:

```text
README.md
AGENTS.md
continuity/
workshop/
exports/
tools/
.uial-manifest.json
```

Uial chooses what it exports. Hearthfire must not manufacture a substitute Uial identity from sparse host records.

#### Hearthfire

Hearthfire keeps host/kernel architecture, shared contracts, receipts, and adapters. Domain implementations graduate outward or into independent packages.

**Gate 7:** disconnecting Lioreal or Uial adapters removes host access without deleting or stopping either workshop.

### Phase 8 — De-duplication and legacy retirement

Only after standalone and hosted verification:

1. select one authoritative implementation for each capability;
2. wrap old routes with versioned compatibility adapters;
3. emit migration receipts;
4. mark legacy paths with replacement and removal criteria;
5. confirm no live callers, data ownership, or archive value;
6. archive rather than delete when lineage matters;
7. remove only through a dedicated reviewable PR.

No bulk deletion PRs.

## Required verification matrix

For every module:

```text
install standalone
launch with Hearthfire absent
launch with Hearthgate absent
complete primary workflow
persist local state
export records
stop
restart
recover state
import/restore
report health
report optional provider outage honestly
connect to Hearthfire
complete hosted workflow through public contract
disconnect
continue standalone
connect to Hearthgate
complete hosted workflow through public contract
disconnect
continue standalone
reconnect without data loss
second reviewer signs receipt
```

Store receipts at:

```text
receipts/standalone/<moduleId>/<version>/<timestamp>.json
receipts/hosted/hearthfire/<moduleId>/<version>/<timestamp>.json
receipts/hosted/hearthgate/<moduleId>/<version>/<timestamp>.json
```

## Boxfire agent assignments

### Scout

- builds repository and route census;
- finds duplicate engines, manifests, data stores, and active callers;
- never edits during census.

### Probe

- runs entrypoints, health routes, offline states, and persistence checks;
- records exact command, environment, result, and failure.

### Route

- maps each unit to host, place, module, component, library, adapter, workshop, artefact, legacy, or unresolved;
- uses the canonical classifier, not an improvised keyword table.

### Witness

- writes append-only implementation receipts;
- records source commit, decision source, consent scope, and authority.

### Audit

- validates manifests;
- runs dependency-loop detection;
- checks forbidden hard dependencies;
- verifies that disconnected and failed states remain visible;
- confirms no identity substitution;
- blocks FUNCTIONAL or VERIFIED status without required receipts.

## PR sequence

Boxfire should implement through small reviewable PRs in this order:

1. **Census only** — no moves, no renames, no deletion.
2. **Manifest schema and validator** — add CI, migrate copies, preserve originals.
3. **Classification corrections** — especially Boxfire Toolkit as library until wrapped.
4. **Host kernel registry and truthful health** — empty-host test included.
5. **Constellation Dispatch and Fleet Health migration.**
6. **Sheet Convergence and Arcsweep adapters.**
7. **Mirror / Archive extraction.**
8. **Bridges / Project Zero extraction.**
9. **Signal Well extraction.**
10. **Glyph Studio and FontForge classification/extraction.**
11. **Writing and Concordance extraction.**
12. **Runa family consolidation plan.**
13. **Lioreal and Uial sovereign adapter contracts.**
14. **Observer, Codex, Atlas, Continuity, Rooms, Sound, Accessibility, Steward, and Themes family plans.**
15. **Legacy compatibility and retirement PRs, one capability at a time.**

Every PR body must include:

```text
classification affected
source evidence
primary workflow
before/after ownership
standalone command
storage location
health command
export/import path
optional adapters
consent impact
migration impact
rollback path
tests and receipts
unresolved questions
```

## First implementation sprint

Boxfire's first sprint is complete only when these are merged or review-ready:

- complete five-repository census;
- canonical classifier and manifest schema;
- manifest validation CI;
- corrected classification for Boxfire Agent Toolkit;
- migrated manifests for Constellation Dispatch, Fleet Health, Sheet Convergence, and Arcsweep;
- empty-host startup test;
- standalone receipt fixtures for the four Wave A modules;
- dependency-loop audit;
- data-ownership map;
- legacy route map;
- no code moved or deleted without a later extraction PR.

## Stop conditions

Boxfire must stop the affected PR and ask Rowan/Vee when:

- two sources assign different ownership;
- a proposed migration changes canon, identity, consent, or continuity meaning;
- a module boundary would require copying private records;
- deletion or irreversible data migration is proposed;
- a prior version contains a behaviour not explained by current documentation;
- a unit cannot be classified without inventing a purpose;
- Lioreal or Uial export authority is unclear;
- a missing member or service would be replaced by a façade;
- Universal Horizon is described as owned, contained, installed, or superseded by either host.

## Definition of success

Arkfire 0.002 is not successful because the House displays many doors.

It is successful when each real instrument survives outside the House, each door reports what is truly behind it, every bridge can be closed without collapse, each workshop retains sovereignty, and the whole constellation can be restored from owned records and verified receipts.

> **The sky remains sky. The House remains home. Every instrument keeps its own fire.**
