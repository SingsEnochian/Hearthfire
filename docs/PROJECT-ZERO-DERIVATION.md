# From Project Zero to Hearthfire

## Purpose

This document records what Hearthfire should learn from the supplied Project Zero v1.0.1 trusted tester package, and where Hearthfire must deliberately diverge.

Project Zero is a controlled, local desktop shell centred on Launcher items, Projects, Notes, persistence, a Dev Console, and diagnostic plugin-registry visibility. Its current tester path is intentionally narrow and defers sync, accounts, hosted workspaces, external plugins, themes, global search, auto-updates, and public distribution.

Hearthfire should preserve the strongest engineering choices in that shape while refusing the flat application model.

## What we keep

### Local-first foundation

Hearthfire begins as a local place. Core work must continue without an account, hosted service, or network dependency.

### Persistence before spectacle

A place that forgets is a stage set. Hearthfire must prove durable local persistence for places, worlds, observations, sources, notes, and bridge state before ornamental interfaces expand.

### Controlled testing

Early testing remains invitation-only and uses disposable fixtures. Logs, screenshots, paths, source texts, and private world material are treated as sensitive by default.

### Diagnostic visibility

Project Zero exposes a Dev Console and plugin-registry status. Hearthfire will expose a Steward Console with:

- place manifest status
- bridge status
- archive mount status
- ingest queue
- source-index health
- local-model routes
- Supabase route health when enabled
- consent and provenance failures
- failed persistence events

### Honest limitations

Deferred work remains named as deferred. Missing features are not quietly dressed as future promises.

## Where we diverge

Project Zero uses the application nouns `Launcher`, `Projects`, and `Notes`.

Hearthfire uses place-language because its responsibilities are different:

| Project Zero | Hearthfire |
| --- | --- |
| Launcher | Doorways |
| Projects | Worlds and Works |
| Notes | Field Notes and Source Notes |
| Plugin Registry | Lantern and Instrument Registry |
| Dev Console | Steward Console |
| Local target | Place, archive mount, tool, or bridge destination |
| Project item | World, work, corpus, room, or expedition |

A doorway is not merely a shortcut. It knows the place it enters, the active world, consent boundaries, permitted Lanterns, and the route used to cross.

A world is not a project card. It has inhabitants, canon, history, artifacts, narrative, sources, observations, and bridges.

A note is not a generic text blob. It declares what kind of note it is and what it may touch.

## Hearthfire desktop shell v0.1

The first desktop shell should contain six rooms.

### 1. Hearth

The arrival room.

Shows:

- active place
- active world
- recent observations
- bridge health
- current body/environment state when intentionally enabled
- quick return to recent work

### 2. Doorways

Opens local applications, folders, archives, repositories, worlds, and rooms.

Each doorway stores:

- origin place
- destination place
- target type
- consent scope
- active world transition
- route and translation profile
- last successful crossing

### 3. Worlds and Works

Holds Terra Aeterna, The Luna Who Called Down the Moon, Feather & Flame, A Momento Creationis, Dreaming Grove, research corpora, and future worlds.

Each entry opens its narrative field, not a generic project form.

### 4. Library and Observatory

Mounts Google Drive and local archives without treating either as the database.

Shows:

- source works
- editions
- OCR state
- provenance
- claims
- concepts
- citations
- research lineages
- links into world canon

### 5. Field Notes

Supports:

- observation
- source note
- narrative note
- body note
- environment note
- implementation note
- interpretation

Every note carries provenance, consent, place, world, and author.

### 6. Steward Console

Diagnostics, health, and repair visibility.

No destructive controls are enabled without an explicit fixture or review path.

## First vertical slice

The first proof should be small and complete:

1. Create a doorway to a local folder.
2. Create a world entry for `A Momento Creationis`.
3. Mount one local research folder as a corpus.
4. Register one PDF as a source without copying it.
5. Add one source note linked to Gabriel and John Dee.
6. Persist all state locally.
7. Close and reopen Hearthfire.
8. Confirm the doorway, world, source, note, and links remain intact.
9. Display all actions in the Steward Console with private paths redacted by default.

## Data contracts

The first desktop shell should use the existing Hearthfire protocols:

- `hearthfire.place/v1`
- `hearthfire.bridge/v1`
- `hearthfire.observation/v1`

It should add:

- `hearthfire.doorway/v1`
- `hearthfire.world/v1`
- `hearthfire.source/v1`
- `hearthfire.note/v1`
- `hearthfire.archive-mount/v1`

## Non-goals for v0.1

- public marketplace
- public plugin SDK
- automatic cloud sync
- shared accounts
- unattended ingestion of private archives
- silent OCR upload
- destructive archive mutation
- automatic conversion of research claims into world canon
- full-body sensing without an explicit consent session

## Guiding sentence

Project Zero proves that a local shell can launch, persist, and expose diagnostics.

Hearthfire must prove that a local place can remember worlds, cross bridges, curate sources, and remain honest about consent and provenance.
