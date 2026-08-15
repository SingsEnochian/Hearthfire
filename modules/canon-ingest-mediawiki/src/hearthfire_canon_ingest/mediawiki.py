from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any, Iterable


class MediaWikiError(RuntimeError):
    pass


class _TextExtractor(HTMLParser):
    BLOCKS = {"p", "div", "section", "article", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "br"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        value = " ".join(data.split())
        if not value:
            return
        if self.parts and not self.parts[-1].endswith(("\n", " ")) and value[0] not in ",.;:!?)]}":
            self.parts.append(" ")
        self.parts.append(value)

    def text(self) -> str:
        lines = [" ".join(line.split()) for line in "".join(self.parts).splitlines()]
        return "\n".join(line for line in lines if line)


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    return parser.text()


@dataclass(slots=True)
class MediaWikiClient:
    api_url: str
    user_agent: str = "HearthfireCanonIngest/0.1 (+local-first provenance crawler)"
    timeout: float = 30.0
    delay_seconds: float = 0.25
    retries: int = 4

    def request(self, **params: Any) -> dict[str, Any]:
        query = {"format": "json", "formatversion": "2", **params}
        url = f"{self.api_url}?{urllib.parse.urlencode(query, doseq=True)}"
        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": self.user_agent, "Accept": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if "error" in payload:
                    raise MediaWikiError(json.dumps(payload["error"], ensure_ascii=False))
                if self.delay_seconds:
                    time.sleep(self.delay_seconds)
                return payload
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, MediaWikiError) as exc:
                last_error = exc
                if attempt >= self.retries:
                    break
                time.sleep(min(8.0, 0.5 * (2**attempt)))
        raise MediaWikiError(f"MediaWiki request failed after retries: {last_error}")

    def iter_category(self, category: str) -> Iterable[dict[str, Any]]:
        title = category if category.startswith("Category:") else f"Category:{category}"
        continuation: dict[str, Any] = {}
        while True:
            payload = self.request(
                action="query",
                list="categorymembers",
                cmtitle=title,
                cmnamespace="0|14",
                cmlimit="max",
                **continuation,
            )
            yield from payload.get("query", {}).get("categorymembers", [])
            continuation = payload.get("continue", {})
            if not continuation:
                return

    def parse_page(self, title: str) -> dict[str, Any]:
        payload = self.request(
            action="parse",
            page=title,
            redirects=1,
            disabletoc=1,
            prop="text|sections|categories|links|images|displaytitle|revid|properties",
        )
        parsed = payload.get("parse")
        if not parsed:
            raise MediaWikiError(f"No parsed page returned for {title!r}")
        html = parsed.get("text", "")
        categories = [item.get("category", "") for item in parsed.get("categories", [])]
        links = [item.get("title", "") for item in parsed.get("links", []) if item.get("ns") == 0]
        return {
            "title": parsed.get("title", title),
            "page_id": parsed.get("pageid"),
            "revision_id": parsed.get("revid"),
            "display_title": parsed.get("displaytitle"),
            "html": html,
            "text": html_to_text(html),
            "sections": parsed.get("sections", []),
            "categories": sorted(set(filter(None, categories))),
            "links": sorted(set(filter(None, links))),
            "images": sorted(set(filter(None, parsed.get("images", [])))),
            "properties": parsed.get("properties", []),
        }
