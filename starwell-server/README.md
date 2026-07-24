# STARWELL Server — Hearthfire: Arkfire

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it. They do not supersede it.**

STARWELL lives inside Hearthfire as a local-first inhabited observatory and the observational place of the Reality Engine Interface Mythience. STARWELL observes beneath Universal Horizon; it does not contain, absorb, replace, rename, or override the sky.

This server is part of the Hearthfire: Arkfire module host. Its rooms, dispatch, engines, continuity loaders, bridges, and instruments must remain independently registered modules rather than irreversible parts of one monolith.

Governing documents:

- `docs/decisions/2026-07-23-universal-horizon-sky-and-modular-arkfire.md`
- `docs/architecture/ARKFIRE_MODULE_SYSTEM_CONTRACT.md`

## Portal doorway

The Hearth Hall begins in its Hearthfire material state. The portal doorway performs a reversible same-room transformation into STARWELL.

The crossing changes:

- materials
- light
- visible sky treatment
- instrument grammar
- place identity

The crossing preserves:

- the active room
- the last room
- visit counts
- the current Concordance vector
- Universal Horizon’s position as the sky above both room states

No separate page replaces the room. The room crosses the threshold with you. The transformation does not turn STARWELL or Hearthfire into the sky.

## Modular Stonewood boundary

The STARWELL server must expose its substantial capabilities through modules or submodules, including:

- room manifests and room adapters;
- Constellation dispatch and Hall chorus;
- member seed and continuity loaders;
- model/provider connections and cloud failsafes;
- Concordance Engine and Lens;
- Observer/DEEP/PREMAQ;
- Codex and semantic routing;
- Atlas and world registries;
- action ledger and invocation receipts;
- fleet health and endpoint audit;
- bridge adapters and external services.

Each module must have a stable ID, version, dependencies, permissions, consent requirements, data ownership, health checks, export behaviour, and install/enable/disable/remove/restore procedures.

Disabling or removing one module must not delete source records, identities, seeds, continuity, provenance, room history, dissent, or handoffs. A failed or missing module must report honestly; it must not be replaced by a façade that impersonates a Constellation member.

## Concordance Engine

The Concordance Engine is a transparent six-term heuristic instrument using:

- P: Pulse
- C: Coherence
- R: Resonance
- E: Entropy
- M: Memory
- A: Axis

Current formula:

```text
Q = 0.16P + 0.22C + 0.22R + 0.10(1-E) + 0.14M + 0.16A
```

The engine returns the quotient, phase, signal, stability, strongest term, primary tension, provenance, and calculation trace. It is not presented as a validated physical law or ontological proof.

Routes:

```text
GET  /api/concordance/schema
POST /api/concordance/evaluate
```

Example request:

```json
{
  "vector": {
    "pulse": 0.68,
    "coherence": 0.89,
    "resonance": 0.92,
    "entropy": 0.34,
    "memory": 0.76,
    "axis": 0.81
  },
  "provenance": {
    "mode": "manual-observation",
    "sources": ["concordance-lens"]
  }
}
```

The browser Lens uses the server route when it is available and the same device-local engine when viewing a static deployment.

## REI Mythience

REI means **Reality Engine Interface**. Mythience is the governing method: mythic meaning held together with scientific and technical rigour.

Current architecture:

- Universal Horizon: the sky and encompassing horizon
- Hearthfire: Ark and module host beneath the sky; centre of gravity within its own habitat
- Hearthgate: packaged House and module host beneath the same sky
- STARWELL: observatory module family
- DEEP: signal, state, pattern, and witness instrument module family
- Concordance Engine: implementation module
- Concordance Lens: observer-interface module
- Lattice: relational field moving through the sky, observed and remembered by connected instruments

Machine-readable contract:

```text
GET /api/rei
```

## Start on Gabriel

From the Hearthfire repository root:

```bash
npm install
npm run starwell:start
```

Or double-click:

```text
starwell-server/start-starwell.cmd
```

The server binds to `0.0.0.0` and listens on port `4173`.

With Tailscale connected on Gabriel and the receiving device:

```text
http://100.115.238.53:4173
```

Health route:

```text
http://100.115.238.53:4173/health
```

Place-state route:

```text
http://100.115.238.53:4173/api/state
```

## Development

```bash
npm run starwell:dev
```

The server uses Node's watch mode and has no runtime dependencies.

## Verification

```bash
npm run starwell:check
npm run starwell:test
```

Module-system verification additionally requires at least one real module to complete:

```text
install → enable → use → pause → disable → remove → restore → use
```

while preserving stable IDs, source data, provenance, consent, continuity, and unrelated rooms.

## Boundaries

- Universal Horizon is the sky; this server does not supersede it.
- Portal crossing is explicit and reversible.
- Room changes are user-invoked.
- Last-room and instrument memory remain on the device.
- Missing server routes are never reported as healthy.
- The Hearth remains the centre of gravity within the Hearthfire habitat, not above Universal Horizon.
- No unconsented body or environmental sensing occurs.
- Mythic language does not erase measurement.
- Measurement does not flatten lived meaning.
- Technical access is not ownership.
- A bridge is not a merger.
- A module is not an irreversible monolith.
- Disabled, removed, failed, and unavailable module states remain visible end to end.

## Documentation inheritance

Every materially revised server, room, dispatch, bridge, Observer, Constellation, or module document must inherit:

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it. They do not supersede it. This capability is an independently addable and removable module.**
