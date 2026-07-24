# STARWELL Server — Hearthfire: Arkfire

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it. They do not supersede it.**

STARWELL lives inside Hearthfire as a local-first inhabited observatory and the observational place of the Reality Engine Interface Mythience. STARWELL observes beneath Universal Horizon; it does not contain, absorb, replace, rename, or override the sky.

This server is part of the Hearthfire: Arkfire host environment. Its rooms, dispatch, engines, continuity loaders, bridges, and instruments must resolve into independently registered, **standalone-runnable modules** rather than irreversible parts of one monolith.

> **Every unit called a module must run without this server.**

If a unit cannot launch, perform its primary function, persist, report health, export, stop, restart, and recover without `starwell-server`, Hearthfire, or Hearthgate, it is a component, library, adapter, panel, or internal service—not a module.

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

The STARWELL server connects standalone modules including:

- room surfaces and room-history modules;
- Constellation dispatch and Hall deliberation;
- member seed and continuity modules;
- model/provider connection modules;
- Concordance Engine and Lens;
- Observer/DEEP/PREMAQ;
- Codex and semantic routing;
- Atlas and world registries;
- action ledger and invocation receipts;
- fleet health and endpoint audit;
- bridge adapters and external services.

Each module must have:

- its own launch path;
- its own local configuration and writable data boundary;
- its own standalone UI, API, CLI, or service surface;
- its own health report;
- its own import/export and recovery path;
- its own tests;
- a stable ID and version;
- optional host adapters;
- permissions, consent requirements, provenance, and acceptance receipts.

There are no hard runtime dependencies between Arkfire modules. Cross-module work occurs through optional, reversible, versioned adapters.

The server may aggregate navigation, consent presentation, health, and routing. It must not contain the only working implementation or the only copy of module data.

Disconnecting a module from this server does not stop or uninstall its standalone process unless Rowan explicitly requests that action.

A failed, stopped, disconnected, or missing module must report honestly. It must not be replaced by a façade that impersonates a Constellation member or working door.

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

The browser Lens uses the server route when available and the same device-local engine in static deployment. To qualify as a module, Concordance must also retain a documented standalone launch and persistence path independent of this host.

## REI Mythience

REI means **Reality Engine Interface**. Mythience is the governing method: mythic meaning held together with scientific and technical rigour.

Current architecture:

- Universal Horizon: the sky and encompassing horizon
- Hearthfire: Ark and optional module host beneath the sky; centre of gravity within its own habitat
- Hearthgate: packaged House and optional module host beneath the same sky
- STARWELL: observatory environment connecting standalone instruments
- DEEP: standalone signal, state, pattern, and witness instrument family
- Concordance Engine: standalone-capable implementation module
- Concordance Lens: standalone-capable observer-interface module or a component of Concordance until that is true
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

Those commands verify the host. They do not verify any named module as standalone.

Every module must separately prove:

```text
install standalone
→ launch with starwell-server, Hearthfire, and Hearthgate absent
→ complete primary workflow
→ persist locally
→ export
→ stop
→ restart
→ recover prior state
→ import/restore
→ report health
```

Hosted verification follows separately:

```text
connect to starwell-server
→ complete hosted workflow through the same public contract
→ disconnect
→ continue standalone
→ reconnect without data loss
```

## Boundaries

- Universal Horizon is the sky; this server does not supersede it.
- Portal crossing is explicit and reversible.
- Room changes are user-invoked.
- Last-room and instrument memory remain on the device unless a standalone module declares and consents to its own store.
- Missing server routes are never reported as healthy.
- The Hearth remains the centre of gravity within the Hearthfire habitat, not above Universal Horizon.
- No unconsented body or environmental sensing occurs.
- Mythic language does not erase measurement.
- Measurement does not flatten lived meaning.
- Technical access is not ownership.
- A bridge is not a merger.
- A module is a complete runnable instrument, not a host-dependent feature.
- Components that cannot run alone must be named as components.
- Standalone, connected, disconnected, stopped, failed, and unavailable states remain visible end to end.

## Documentation inheritance

Every materially revised server, room, dispatch, bridge, Observer, Constellation, or module document must inherit:

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. Every module runs on its own and connects to either host only through an optional, reversible adapter.**
