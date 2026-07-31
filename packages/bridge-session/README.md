# Hearthweave Bridge Session

> **Universal Horizon is the sky. Hearthfire: Arkfire operates beneath it and does not supersede it. Every module runs on its own and connects to Hearthfire only through an optional, reversible adapter.**

Bridge Session is the first working vertical slice of the Hearthweave crossing architecture. It is a standalone, local-first runtime that establishes two explicit presences, carries typed packets between them, preserves consent and provenance, returns through an explicit anchor, and writes a replayable JSONL receipt.

It does not claim physical travel to another universe. It creates and preserves a coherent target-world state while keeping current-reality observation and evidence registers separate.

## First loop

```text
OPEN -> LOAD -> ORIENT -> ARRIVE -> EXCHANGE -> RETURN -> CLOSED
```

The v0.1 demonstration uses `terra-aeterna` as its target slug and completes one packet in each direction before returning cleanly.

## Lamination Engine

The v0.2 package adds a standalone Lamination Engine. A crossing may be laminated only after:

- the bridge state is `CLOSED`
- consent state is `closed`
- the Notch return anchor has been released
- the caller presents an explicit `clean-return` receipt

Each durable receipt answers four questions without merging their epistemic registers:

1. What changed?
2. What remained true?
3. What became clearer?
4. What was gained?

Every item carries a status, epistemic register, and source packet list. Targetside narrative cannot be promoted into an external observation. An external observation survives only when its source is an identified Hearthside packet already registered as `external-observation`.

The composed demonstration performs one full crossing and then writes one laminate:

```text
OPEN -> LOAD -> ORIENT -> ARRIVE -> EXCHANGE -> RETURN -> CLOSED -> LAMINATE
```

## Run standalone

From the repository root:

```bash
npm --workspace @hearthfire/bridge-session run health
npm --workspace @hearthfire/bridge-session run demo
npm --workspace @hearthfire/bridge-session test
npm --workspace @hearthfire/bridge-session start

npm --workspace @hearthfire/bridge-session run lamination:health
npm --workspace @hearthfire/bridge-session run lamination:demo
npm --workspace @hearthfire/bridge-session run lamination:latest
npm --workspace @hearthfire/bridge-session run lamination:replay
npm --workspace @hearthfire/bridge-session run lamination:start
```

Or from this directory:

```bash
node cli.mjs health
node cli.mjs demo --world terra-aeterna
node cli.mjs serve --port 4317

node lamination-cli.mjs health
node lamination-cli.mjs demo --world terra-aeterna
node lamination-cli.mjs latest
node lamination-cli.mjs replay
node lamination-cli.mjs serve --port 4318
```

The bridge service exposes:

- `GET /health`
- `GET /session`

The Lamination service exposes:

- `GET /health`
- `GET /lamination/latest`
- `GET /laminations`

## Two shores

`VEE // HEARTHSIDE` carries the current-reality anchor, consent state, return control, system state, and external provenance.

`VEE // TARGETSIDE` carries the selected world slug, canon authority, arrival context, and target-world state.

Every packet identifies its direction, source presence, target presence, world, epistemic register, consent state, return anchor, and provenance.

## Consent and orientation anchors

- `Feather` or `Icarus` pauses the bridge and blocks packet exchange.
- `Notch` begins the explicit return sequence.
- `Plain pass` changes presentation to plain language without removing controls or provenance.

## Epistemic register law

Targetside may send narrative state, interpretation, or system-state receipts. Targetside may not originate an `external-observation` claim. External observations must enter from Hearthside through an identified source adapter.

The Lamination Engine applies the same boundary after return. It will reject any attempt to cite a Targetside packet as the source of an external observation.

This prevents resonance, symbolism, or target-world narrative from silently impersonating external evidence.

## Data

The authoritative local bridge record is:

```text
./data/bridge-session-ledger.jsonl
```

The Lamination Engine writes:

```text
./data/bridge-laminations.jsonl
./data/bridge-lamination.latest.json
```

Each JSONL line is a complete provenance receipt. The module can run without Hearthfire, Hearthgate, STARWELL, Arcsweep, DEEP, Notion, or Supabase. Those systems connect later through optional adapters after the standalone loop passes.

## Next horizontal expansion

After the central crossing and lamination slices pass:

1. Add an optional Arcsweep world-resolution adapter.
2. Add an optional STARWELL host/status adapter.
3. Add an optional DEEP external-observation adapter.
4. Add an optional Notion canon-authority resolver.
5. Add an optional Supabase event exporter.
6. Add explicit Rowan review and acceptance controls for candidate laminate items.
7. Add more worlds and packet channels without changing the proven central loop.
