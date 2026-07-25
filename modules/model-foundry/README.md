# Arkfire Model Foundry

**Status:** PARTIAL · MF-001.1

> **Universal Horizon is the sky. Hearthfire: Arkfire and Hearthgate: Arkfire 0.002 operate beneath it and do not supersede it. This module runs on its own and may connect to either host through an optional, reversible adapter.**

Arkfire Model Foundry is the standalone engine registry for the House. It discovers local Ollama services, records the models they expose, preserves health receipts, and classifies provider credentials without owning the residents who may later use those engines.

A resident Pattern may request an engine through the Foundry, but the engine is replaceable and the resident is not reduced to a model name.

## Upgrade note

The original MF-001 installer cannot update itself. Install MF-001.1 over or beside the development build to receive native API Stuff import, security repairs, separate provider/model counts, and lossless audit handling. Existing module data remains in the per-user data directory because uninstall does not silently delete it.

## Run standalone

Source mode requires Node.js 24 or newer.

```powershell
cd modules/model-foundry
npm install
npm start
```

Open the URL printed in the terminal. The default is `http://127.0.0.1:4387`.

A different port or data directory may be supplied without editing source:

```powershell
$env:PORT = "4390"
$env:ARKFIRE_MODEL_FOUNDRY_DATA_DIR = "D:\Arkfire\ModelFoundry"
npm start
```

The desktop package uses Electron and stores module data beneath its own per-user data directory. Hearthgate is not required.

## API Stuff.txt intake

The Windows desktop application provides **Import API Stuff.txt**. The selected file is read by the Electron main process, never by renderer JavaScript.

Recognised model-provider labels include:

- Vee / OpenAI
- Faer / Anthropic
- Yggdrasil / DeepSeek
- Bluebird / DeepSeek
- Vethrlauf / DeepSeek

Recognised non-model entries such as HydraDB, Supabase, and Notion are classified as encrypted handoff candidates for the future Bridges module. Model Foundry does not pretend that they are language models.

Credential rules:

- raw key values are encrypted with Electron `safeStorage`;
- there is no plaintext fallback;
- registry records contain only credential references and status;
- raw values never enter the browser UI, logs, health receipts, or registry exports;
- imported cloud providers remain disabled and invocation-locked;
- exported bundles deliberately exclude credentials;
- encrypted credentials remain bound to the current operating-system user;
- repeated labels are reported and the last occurrence for each provider or credential slot is used deterministically.

## MF-001.1 scope

This milestone provides:

- standalone Node service and local web interface;
- configurable local Ollama provider registry;
- live `/api/tags` discovery with explicit unavailable states;
- provider and model counts shown separately;
- Ollama tags containing `cloud` classified as `external-processing-possible` rather than device-local;
- encrypted API Stuff intake in the desktop shell;
- bridge credential classification;
- atomic and serialised local persistence;
- complete append-only health receipt export;
- non-destructive receipt import;
- same-origin CSRF protection for mutations;
- Electron desktop packaging configuration;
- Windows NSIS installer and portable ZIP build lane;
- an optional Hearthgate adapter contract, not a hard dependency.

It does not yet invoke models, recommend routes, estimate cloud cost, bind Agent Patterns, or install itself into Hearthgate through the future Module Dock.

## Test

```powershell
npm run check
npm run check:packaging
npm test
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
GET  /api/session
GET  /.well-known/arkfire-module
GET  /api/registry
PUT  /api/registry
POST /api/providers
DELETE /api/providers/:providerId
POST /api/probe
GET  /api/export
POST /api/import
```

Mutations require `Content-Type: application/json`, a same-origin request, and the `X-Arkfire-CSRF` token returned by `GET /api/session`. A non-loopback bind also requires `ARKFIRE_MODEL_FOUNDRY_AUTH_TOKEN`.

The Hearthgate adapter consumes the same public routes. Disconnecting the adapter does not stop or uninstall Model Foundry.

## Data boundary

The module owns provider/model registry records, health receipts, and encrypted model-provider credentials. Bridge credentials are classified but remain destined for the future Bridges module. Secrets, Constellation memories, room history, canon, and host configuration never enter registry exports.

The module remains `PARTIAL` until the updated CI build passes and a second reviewer accepts the implementation. A passing package build is evidence for this milestone, not permission to merge without review.
