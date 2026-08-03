from __future__ import annotations

import hashlib
import json
import re
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .mediawiki import MediaWikiClient


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")[:96] or "page"
    return f"{base}-{hashlib.sha256(title.encode('utf-8')).hexdigest()[:10]}"


def classify_lane(title: str, categories: list[str]) -> str:
    haystack = " ".join([title, *categories]).casefold()
    if "generation 5" in haystack or "g5" in haystack:
        return "g5_reference"
    if "equestria girls" in haystack:
        return "eqg"
    if "pony life" in haystack:
        return "pony_life"
    if "idw" in haystack or "comic" in haystack:
        return "idw_comics"
    if any(token in haystack for token in ("chapter book", "storybook", "prose")):
        return "prose"
    if any(token in haystack for token in ("film", "movie", "special")):
        return "fim_film"
    if any(token in haystack for token in ("wiki", "template", "help", "category:")):
        return "wiki_meta"
    return "fim_g4"


def classify_entity(title: str, categories: list[str]) -> str:
    haystack = " ".join([title, *categories]).casefold()
    rules = [
        ("transcript", ("transcript",)),
        ("episode", (" episode", "episodes")),
        ("character", ("character", "ponies", "antagonist", "young six", "wonderbolt")),
        ("location", ("location", "cities", "towns", "kingdoms")),
        ("creature", ("creature", "animals", "dragon", "griffon", "changeling")),
        ("song", ("song", "music")),
        ("film", ("film", "movie")),
        ("special", ("special",)),
        ("society", ("society", "holiday", "school", "government", "occupation")),
        ("timeline", ("chronology", "timeline")),
        ("friendship_lesson", ("friendship lesson",)),
        ("object", ("artifact", "object", "cutie mark", "book", "spell")),
    ]
    for entity_type, tokens in rules:
        if any(token in haystack for token in tokens):
            return entity_type
    return "canon_page"


@dataclass(slots=True)
class IngestResult:
    output_dir: Path
    accepted_pages: int
    filtered_pages: int
    errors: int


class CanonIngestPipeline:
    def __init__(self, profile: dict[str, Any], profile_name: str, output_dir: Path, max_pages: int = 0) -> None:
        self.profile = profile
        self.profile_name = profile_name
        self.settings = profile["profiles"][profile_name]
        self.output_dir = output_dir
        self.max_pages = max_pages
        self.source = profile["source"]
        self.client = MediaWikiClient(self.source["api_url"])

    def discover_titles(self) -> list[str]:
        queue: deque[tuple[str, int]] = deque()
        seen_categories: set[str] = set()
        titles: set[str] = set(self.settings.get("seed_pages", []))
        for category in self.settings.get("seed_categories", []):
            queue.append((category, 0))
        max_depth = int(self.settings.get("category_depth", 3))

        while queue:
            category, depth = queue.popleft()
            normalized = category.removeprefix("Category:")
            if normalized in seen_categories or depth > max_depth:
                continue
            seen_categories.add(normalized)
            for member in self.client.iter_category(normalized):
                member_title = member.get("title", "")
                namespace = member.get("ns")
                if namespace == 14 and depth < max_depth:
                    queue.append((member_title.removeprefix("Category:"), depth + 1))
                elif namespace == 0 and member_title:
                    titles.add(member_title)
                    if self.max_pages and len(titles) >= self.max_pages:
                        return sorted(titles)[: self.max_pages]
        return sorted(titles)

    def run(self) -> IngestResult:
        started_at = utc_now()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        raw_dir = self.output_dir / "raw"
        normalized_dir = self.output_dir / "normalized"
        raw_dir.mkdir(exist_ok=True)
        normalized_dir.mkdir(exist_ok=True)

        pages_path = normalized_dir / "canon-records.jsonl"
        edges_path = normalized_dir / "canon-edges.jsonl"
        errors_path = self.output_dir / "errors.jsonl"
        accepted = filtered = errors = 0
        allowed_lanes = set(self.settings.get("allowed_lanes", []))
        titles = self.discover_titles()

        with pages_path.open("w", encoding="utf-8") as pages_fh, edges_path.open("w", encoding="utf-8") as edges_fh, errors_path.open("w", encoding="utf-8") as errors_fh:
            for title in titles:
                try:
                    page = self.client.parse_page(title)
                    lane = classify_lane(page["title"], page["categories"])
                    if lane not in allowed_lanes:
                        filtered += 1
                        continue
                    if not self.settings.get("include_transcripts", False) and classify_entity(page["title"], page["categories"]) == "transcript":
                        filtered += 1
                        continue

                    canonical_url = f"{self.source['base_url']}/wiki/{page['title'].replace(' ', '_')}"
                    record_body = {
                        "schema_version": "hearthfire.canon.record.v1",
                        "record_id": f"{self.profile['world_id']}:{page.get('page_id') or slugify(page['title'])}",
                        "world_id": self.profile["world_id"],
                        "title": page["title"],
                        "entity_type": classify_entity(page["title"], page["categories"]),
                        "canon_lane": lane,
                        "canon_status": "accepted_reference",
                        "content": {
                            "text": page["text"],
                            "sections": page["sections"],
                            "categories": page["categories"],
                            "links": page["links"],
                            "images": page["images"],
                        },
                        "provenance": {
                            "source_name": self.source["wiki_name"],
                            "source_kind": self.source["source_kind"],
                            "authority": self.source["authority"],
                            "canonical_url": canonical_url,
                            "api_url": self.source["api_url"],
                            "revision_id": page.get("revision_id"),
                            "retrieved_at": utc_now(),
                            "license": self.source["license"],
                        },
                        "overlay_policy": self.profile["canon_policy"],
                    }
                    record = {**record_body, "integrity": {"sha256": stable_hash(record_body)}}
                    pages_fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")

                    for target in page["links"]:
                        edge_body = {
                            "schema_version": "hearthfire.canon.edge.v1",
                            "world_id": self.profile["world_id"],
                            "source_title": page["title"],
                            "target_title": target,
                            "relation": "wiki_link",
                            "source_revision_id": page.get("revision_id"),
                        }
                        edge = {**edge_body, "integrity": {"sha256": stable_hash(edge_body)}}
                        edges_fh.write(json.dumps(edge, ensure_ascii=False, sort_keys=True) + "\n")

                    raw_file = raw_dir / f"{slugify(page['title'])}.json"
                    raw_file.write_text(json.dumps(page, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
                    accepted += 1
                except Exception as exc:
                    errors += 1
                    errors_fh.write(json.dumps({"title": title, "error": str(exc), "at": utc_now()}, ensure_ascii=False) + "\n")

        completed_at = utc_now()
        manifest_body = {
            "schema_version": "hearthfire.canon.ingest.run.v1",
            "profile_id": self.profile["id"],
            "profile_name": self.profile_name,
            "world_id": self.profile["world_id"],
            "source": self.source,
            "started_at": started_at,
            "completed_at": completed_at,
            "discovered_titles": len(titles),
            "accepted_pages": accepted,
            "filtered_pages": filtered,
            "errors": errors,
            "outputs": {
                "records": str(pages_path.relative_to(self.output_dir)),
                "edges": str(edges_path.relative_to(self.output_dir)),
                "errors": str(errors_path.relative_to(self.output_dir)),
            },
        }
        manifest = {**manifest_body, "integrity": {"sha256": stable_hash(manifest_body)}}
        (self.output_dir / "run.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        return IngestResult(self.output_dir, accepted, filtered, errors)
