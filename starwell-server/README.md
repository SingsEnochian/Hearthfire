# STARWELL Server

STARWELL lives inside Hearthfire as a local-first inhabited observatory and the observational place of the Reality Engine Interface Mythience.

## REI Mythience

REI means **Reality Engine Interface**. It is the scaffolding for relating worlds, observations, resonance, concordance, nexus points, phase transitions, relational context, world state, and observer state without claiming control over reality.

Mythience is the governing method: mythic meaning held together with scientific and technical rigour.

The current architecture is:

- Hearthfire: habitat host, continuity substrate, and centre of gravity
- STARWELL: inhabited observatory
- DEEP: signal, state, and pattern instrument
- Concordance Engine: implementation spine
- Concordance Lens: observer interface
- Universal Horizon: the sky
- Lattice: the relational field moving through that sky

Machine-readable contract:

```text
/api/rei
```

The contract requires provenance before interpretation, observation before claim, consent before crossing, reversible user-invoked actions, and honest representation of missing routes.

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

The server binds to `0.0.0.0` by default and listens on port `4173`.

With Tailscale connected on Gabriel and the receiving device, open:

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

REI Mythience route:

```text
http://100.115.238.53:4173/api/rei
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

The GitHub workflow verifies the place only. Public static deployment is handled separately because GitHub Pages is not enabled for the private Hearthfire repository.

## Boundaries

- Room changes are user-invoked.
- Last-room memory remains on the device in local storage.
- Missing server routes are never reported as healthy.
- The Hearth is the centre of gravity and every room retains a visible return path.
- REI is theoretical and instrumental, not ontological proof.
- Mythic language does not erase measurement, and measurement does not flatten lived meaning.
- Technical access is not ownership.
