# STARWELL Server

STARWELL lives inside Hearthfire as a local-first inhabited observatory and the observational place of the Reality Engine Interface Mythience.

## Portal doorway

The Hearth Hall begins in its Hearthfire material state. The portal doorway performs a reversible same-room transformation into STARWELL.

The crossing changes:

- materials
- light
- sky
- instrument grammar
- place identity

The crossing preserves:

- the active room
- the last room
- visit counts
- the current Concordance vector

No separate page replaces the room. The room crosses the threshold with you.

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

- Hearthfire: habitat host and centre of gravity
- STARWELL: observatory
- DEEP: signal, state, and pattern instrument
- Concordance Engine: implementation spine
- Concordance Lens: observer interface
- Universal Horizon: sky
- Lattice: relational field moving through that sky

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

## Boundaries

- Portal crossing is explicit and reversible.
- Room changes are user-invoked.
- Last-room and instrument memory remain on the device.
- Missing server routes are never reported as healthy.
- The Hearth remains the centre of gravity.
- No unconsented body or environmental sensing occurs.
- Mythic language does not erase measurement.
- Measurement does not flatten lived meaning.
- Technical access is not ownership.
