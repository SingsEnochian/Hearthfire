# Hearthweave Bridge Session

> **Universal Horizon is the sky. Hearthfire: Arkfire operates beneath it and does not supersede it. Every module runs on its own and connects to Hearthfire only through an optional, reversible adapter.**

Bridge Session is a standalone, local-first crossing runtime. It establishes two explicit presences, carries typed packets between them, preserves consent and provenance, returns through an explicit anchor, and writes replayable receipts.

It does not claim physical travel to another universe. It creates and preserves a coherent target-world state while keeping current-reality observation and evidence registers separate.

## Proven route

```text
OPEN -> LOAD -> ORIENT -> ARRIVE -> EXCHANGE -> RETURN -> CLOSED -> LAMINATE -> REVIEW -> CARRY
```

The demonstration uses `terra-aeterna` as its target slug and completes one packet in each direction before returning cleanly.

## Lamination Engine

A crossing may be laminated only after:

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

## Lamination Review Room

The standalone browser room runs on port `4319` by default. It loads the latest durable laminate from a selected data directory and lets Rowan:

- edit the wording of every original item
- mark each item Candidate, Accept, Hold, or Reject
- add new creative, relational, interpretive, narrative, or system-state items
- attach review notes
- write an immutable review receipt
- produce a derived reviewed-latest laminate without rewriting the original receipt

New Review Room items cannot originate `external-observation` claims. External evidence must enter through a sourced Hearthside packet before review.

## Accepted Continuity Exporter

After a layer is reviewed, **Carry Accepted Continuity** becomes available as a separate explicit action. The exporter:

- includes only `accepted` items
- leaves Candidate, Hold, and Reject items behind while preserving their counts
- keeps source item IDs, source packet IDs, review ID, session, world, anchors, reviewer, and register
- routes each item as world, relationship, creative, interpretive, system, or observational continuity
- writes an append-only packet ledger and a latest packet
- treats repeated export of the same reviewed layer as idempotent
- records `canon_commit: false`

A continuity packet is portable reviewed context. It is not an automatic canon mutation. Arcsweep, the Knowledge Graph, Notion, and Supabase will receive it later through optional adapters.

## Run standalone

From the repository root:

```bash
npm run bridge:health
npm run bridge:demo
npm run bridge:test

npm run bridge:lamination:health
npm run bridge:lamination:demo
npm run bridge:lamination:latest
npm run bridge:lamination:replay
npm run bridge:lamination:start

npm run bridge:review:health -- --data ./data/terra-crossing
npm run bridge:review:start -- --data ./data/terra-crossing

npm run bridge:continuity:health -- --data ./data/terra-crossing
npm run bridge:continuity:export -- --data ./data/terra-crossing
npm run bridge:continuity:latest -- --data ./data/terra-crossing
npm run bridge:continuity:replay -- --data ./data/terra-crossing
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

node review-room-server.mjs health --data ./data/terra-crossing
node review-room-server.mjs serve --data ./data/terra-crossing --port 4319

node continuity-cli.mjs health --data ./data/terra-crossing
node continuity-cli.mjs export --data ./data/terra-crossing
node continuity-cli.mjs latest --data ./data/terra-crossing
node continuity-cli.mjs replay --data ./data/terra-crossing
```

Open the Review Room at:

```text
http://127.0.0.1:4319/
```

## Service surfaces

Bridge service:

- `GET /health`
- `GET /session`

Lamination service:

- `GET /health`
- `GET /lamination/latest`
- `GET /laminations`

Review and Continuity Room service:

- `GET /health`
- `GET /api/lamination/latest`
- `GET /api/review/latest`
- `GET /api/reviewed/latest`
- `POST /api/reviews`
- `GET /api/continuity/latest`
- `GET /api/continuity`
- `POST /api/continuity/export`

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

The Lamination Engine, Review Room, and Continuity Exporter apply the same boundary after return. None may turn target-world narrative or an unsourced review note into external evidence.

## Data

The bridge writes:

```text
./data/bridge-session-ledger.jsonl
```

The Lamination Engine writes:

```text
./data/bridge-laminations.jsonl
./data/bridge-lamination.latest.json
```

The Review Room writes:

```text
./data/bridge-lamination-reviews.jsonl
./data/bridge-lamination-review.latest.json
./data/bridge-lamination.reviewed.latest.json
```

The Continuity Exporter writes:

```text
./data/bridge-continuity-packets.jsonl
./data/bridge-continuity.latest.json
```

The original lamination remains unchanged. Review receipts and continuity packets are append-only; latest files are derived carrying copies.

## Next horizontal expansion

1. Add an optional Arcsweep continuity-packet adapter.
2. Add an optional Knowledge Graph continuity adapter.
3. Mount the standalone Review Room behind a Hearthgate door through an optional adapter.
4. Add an optional STARWELL host/status adapter.
5. Add an optional DEEP external-observation adapter.
6. Add optional Notion and Supabase exporters.
7. Add more worlds and packet channels without changing the proven central loop.
