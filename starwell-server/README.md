# STARWELL Server

STARWELL lives inside Hearthfire as a local-first inhabited observatory.

## Start on Gabriel

From the Hearthfire repository root:

```bash
npm install
npm run starwell:start
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

- Room changes are user-invoked.
- Last-room memory remains on the device in local storage.
- Missing server routes are never reported as healthy.
- The Hearth is the centre of gravity and every room retains a visible return path.
