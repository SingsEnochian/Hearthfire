from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import CanonIngestPipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest a MediaWiki/Fandom canon into Hearthfire records.")
    parser.add_argument("--profile", type=Path, required=True, help="Path to a canon ingest profile JSON file")
    parser.add_argument("--mode", default=None, help="Named profile mode, e.g. g4-core or full-wiki-separated")
    parser.add_argument("--out", type=Path, required=True, help="Output directory")
    parser.add_argument("--max-pages", type=int, default=0, help="Limit discovered pages for smoke tests; 0 means unlimited")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    mode = args.mode or profile["default_profile"]
    if mode not in profile["profiles"]:
        available = ", ".join(sorted(profile["profiles"]))
        raise SystemExit(f"Unknown mode {mode!r}. Available: {available}")
    result = CanonIngestPipeline(profile, mode, args.out, max_pages=args.max_pages).run()
    print(json.dumps({
        "output_dir": str(result.output_dir),
        "accepted_pages": result.accepted_pages,
        "filtered_pages": result.filtered_pages,
        "errors": result.errors,
    }, indent=2))
    return 0 if result.errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
