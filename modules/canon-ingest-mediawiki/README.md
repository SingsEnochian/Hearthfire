# Canon Ingest: MediaWiki/Fandom

A standalone, local-first Hearthfire module for crawling a MediaWiki/Fandom canon source, preserving exact provenance, separating continuity lanes, and exporting deterministic JSON/JSONL records for Arcsweep.

> **Universal Horizon is the sky. Hearthfire: Arkfire operates beneath it and does not supersede it. Every module runs on its own and connects to Hearthfire only through an optional, reversible adapter.**

## My Little Pony profile

`profiles/mlp-fim-g4.json` registers the My Little Pony Friendship is Magic Wiki as Rowan's accepted canon reference. Provenance still records that the source is a community-maintained Fandom wiki, its exact page URL, revision ID, retrieval time, and CC-BY-SA licence.

The profile keeps continuity lanes separate:

- `fim_g4` for the television canon
- `fim_film` for films and specials
- `eqg`, `idw_comics`, `prose`, `pony_life`, and `g5_reference` as distinct lanes
- `wiki_meta` for maintenance pages

Starsong is an overlay world. It references base FiM record IDs and records divergences with receipts; it never silently overwrites imported base canon.

## Install and run

```bash
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .

hearthfire-canon-ingest \
  --profile profiles/mlp-fim-g4.json \
  --mode g4-core \
  --out data/canon/mlp-fim
```

Full G4 including transcript discovery:

```bash
hearthfire-canon-ingest \
  --profile profiles/mlp-fim-g4.json \
  --mode g4-complete \
  --out data/canon/mlp-fim
```

Entire wiki, with every continuity lane kept separate:

```bash
hearthfire-canon-ingest \
  --profile profiles/mlp-fim-g4.json \
  --mode full-wiki-separated \
  --out data/canon/mlp-fim
```

Use `--max-pages 25` for a smoke run.

## Output

- `run.json`: run receipt, counts, source declaration, and integrity hash
- `raw/*.json`: page-level parsed source payloads
- `normalized/canon-records.jsonl`: Arcsweep-ready records
- `normalized/canon-edges.jsonl`: deterministic page-link graph
- `errors.jsonl`: explicit failed-page receipts

Images are not downloaded by default. Their filenames are retained as source metadata. This avoids quietly copying large media archives or flattening rights/provenance.

## Invariants

1. Source text, interpretation, and Starsong overlay remain distinct.
2. Base canon is immutable after import; revisions create new receipts.
3. Contradictions are retained rather than harmonised away.
4. No model writes directly into canonical storage.
5. Every accepted record has a source URL, revision ID, retrieval time, licence, lane, and SHA-256 integrity seal.
6. The crawler is rate-limited, retrying, resumable by rerun, and honest about errors.

## Test

```bash
python -m unittest discover -s tests -v
```
