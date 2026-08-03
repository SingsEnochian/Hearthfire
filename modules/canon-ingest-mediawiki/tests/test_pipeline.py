from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from hearthfire_canon_ingest.mediawiki import html_to_text
from hearthfire_canon_ingest.pipeline import CanonIngestPipeline, classify_entity, classify_lane, stable_hash


PROFILE = {
    "id": "test",
    "world_id": "mlp-test",
    "source": {
        "wiki_name": "Test Wiki",
        "base_url": "https://example.invalid",
        "api_url": "https://example.invalid/api.php",
        "license": "CC-BY-SA",
        "authority": "accepted",
        "source_kind": "community-wiki"
    },
    "canon_policy": {
        "base_canon_is_immutable": True,
        "overlay_worlds": ["starsong"],
        "overlay_mode": "reference-and-diverge-with-receipts",
        "contradictions": "preserve-do-not-flatten",
        "lane_policy": "separate-not-merge"
    },
    "profiles": {
        "core": {
            "seed_pages": ["Twilight Sparkle", "Equestria Girls"],
            "seed_categories": [],
            "allowed_lanes": ["fim_g4"],
            "category_depth": 1,
            "include_transcripts": False
        }
    }
}


class FakeClient:
    def iter_category(self, category: str):
        return iter([])

    def parse_page(self, title: str):
        category = "Main characters" if title == "Twilight Sparkle" else "Equestria Girls characters"
        return {
            "title": title,
            "page_id": 1 if title == "Twilight Sparkle" else 2,
            "revision_id": 99,
            "display_title": title,
            "html": f"<p>{title}</p>",
            "text": title,
            "sections": [],
            "categories": [category],
            "links": ["Ponyville"],
            "images": [],
            "properties": [],
        }


class PipelineTests(unittest.TestCase):
    def test_html_to_text(self):
        self.assertEqual(html_to_text("<h2>One</h2><p>Two <b>Three</b></p>"), "One\nTwo Three")

    def test_classification(self):
        self.assertEqual(classify_lane("Twilight Sparkle", ["Main characters"]), "fim_g4")
        self.assertEqual(classify_lane("Sunset Shimmer", ["Equestria Girls characters"]), "eqg")
        self.assertEqual(classify_entity("Twilight Sparkle", ["Main characters"]), "character")
        self.assertEqual(classify_entity("The Ticket Master", ["Season 1 episodes"]), "episode")

    def test_hash_is_deterministic(self):
        self.assertEqual(stable_hash({"b": 2, "a": 1}), stable_hash({"a": 1, "b": 2}))

    def test_pipeline_filters_lanes_and_writes_receipts(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "out"
            pipeline = CanonIngestPipeline(PROFILE, "core", out)
            pipeline.client = FakeClient()
            result = pipeline.run()
            self.assertEqual(result.accepted_pages, 1)
            self.assertEqual(result.filtered_pages, 1)
            records = [json.loads(line) for line in (out / "normalized" / "canon-records.jsonl").read_text().splitlines()]
            self.assertEqual(records[0]["title"], "Twilight Sparkle")
            self.assertEqual(records[0]["overlay_policy"]["lane_policy"], "separate-not-merge")
            self.assertIn("sha256", records[0]["integrity"])
            run = json.loads((out / "run.json").read_text())
            self.assertEqual(run["accepted_pages"], 1)


if __name__ == "__main__":
    unittest.main()
