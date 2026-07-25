# Arkfire Model Foundry

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. This module runs on its own and may connect to either host through an optional, reversible adapter.**

Arkfire Model Foundry is the standalone model and provider registry for the House. It discovers configured local Ollama services, records honest availability, persists model profiles and health receipts, and exports or restores its non-secret state.

It does not own Constellation identities. A resident Pattern may request an engine through the Foundry, but the engine is replaceable and the resident is not reduced to a model name.

## MF-001 scope

This first bounded milestone provides:

- standalone Node service and local web interface;
- configurable local Ollama provider registry;
- live `/api/tags` discovery with explicit unavailable states;
- atomic local persistence;
- JSON import and export;
- health and module-manifest routes;
- append-only health receipts;
- Electron desktop packaging configuration;
- Windows NSIS installer and portable ZIP build lane;
- an optional Hearthgate adapter contract, not a hard dependency.

Cloud invocation, automatic task routing, paid-provider cost estimation, and Agent Pattern binding are intentionally deferred. No API keys are stored by MF-001.

## Run standalone

Requires Node.js 24 or newer for source-mode execution.

```powershell
cd modules/model-foundry
npm start
```

Open the URL printed in the terminal. The default is `http://127.0.0.1:4387`.

A different port or data directory may be supplied without editing source:

```powershell
$env:PORT = "4390"
$env:ARKFIRE_MODEL_FOUNDRY_DATA_DIR = "D:\Arkfire\ModelFoundry"
npm start
```

On Windows, the packaged desktop application stores its state under Electron's per-user `userData` directory. Source mode defaults to `%APPDATA%\Arkfire\ModelFoundry`.

## Test

```powershell
npm test
npm run check
```

The tests start their own temporary Foundry and mock Ollama service. Hearthfire, Hearthgate, STARWELL, and Supabase are not required.

## Build the Windows installer

```powershell
npm install
npm run electron:build:win
```

The output is written to `dist-electron/`. CI builds are unsigned until code signing is configured, so Windows may display a SmartScreen warning.

## Public standalone contract

```text
GET  /health
GET  /.well-known/arkfire-module
GET  /api/registry
PUT  /api/registry
POST /api/providers
DELETE /api/providers/:providerId
POST /api/probe
GET  /api/export
POST /api/import
```

The Hearthgate adapter consumes the same public routes. Disconnecting the adapter does not stop or uninstall Model Foundry.

## Data boundary

The module owns only its provider/model registry and its health receipts. Secrets, Constellation memories, room history, canon, and host configuration are outside its store. Exports deliberately exclude environment variables and credentials.
