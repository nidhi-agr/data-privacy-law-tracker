#!/usr/bin/env python3
"""Fetch privacy-law news from regulator RSS feeds and Google News RSS queries.

Reads data/sources.json, filters items by privacy keywords and a rolling
window (default 30 days), dedupes, and writes data/news.json.

Usage:
    python tools/fetch_news.py [--days 30] [--max-per-source 8]
"""
import argparse
import html
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import feedparser

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

GNEWS_URL = "https://news.google.com/rss/search?q={q}+when:30d&hl=en-US&gl=US&ceid=US:en"
USER_AGENT = "Mozilla/5.0 (privacy-law-tracker; +https://github.com/)"


def strip_html(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def entry_date(entry):
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None) or entry.get(attr)
        if t:
            return datetime.fromtimestamp(time.mktime(t), tz=timezone.utc)
    return None


def matches_keywords(text, keywords):
    lower = text.lower()
    return any(k.lower() in lower for k in keywords)


def clean_source_name(entry, fallback):
    # Google News titles look like "Headline - Publisher"
    src = entry.get("source", {})
    if isinstance(src, dict) and src.get("title"):
        return src["title"]
    return fallback


def fetch_source(src, keywords, cutoff, max_items):
    if src["kind"] == "gnews":
        url = GNEWS_URL.format(q=quote(src["query"]))
    else:
        url = src["url"]

    parsed = feedparser.parse(url, agent=USER_AGENT)
    if parsed.bozo and not parsed.entries:
        print(f"  WARN {src['name']}: feed error ({getattr(parsed, 'bozo_exception', '')})")
        return []

    items = []
    for entry in parsed.entries:
        title = strip_html(entry.get("title", ""))
        link = entry.get("link", "")
        if not title or not link:
            continue
        dt = entry_date(entry)
        if dt is None or dt < cutoff:
            continue
        summary = strip_html(entry.get("summary", ""))[:400]
        # Regulator feeds are inherently on-topic; keyword-filter only news searches
        if src["kind"] == "gnews" and not matches_keywords(title + " " + summary, keywords):
            continue
        # For gnews, strip trailing " - Publisher" from the title
        publisher = clean_source_name(entry, src["name"])
        if src["kind"] == "gnews" and title.endswith(f" - {publisher}"):
            title = title[: -len(f" - {publisher}")]
        items.append({
            "title": title,
            "url": link,
            "date": dt.date().isoformat(),
            "source": publisher,
            "summary": summary,
            "jurisdiction": src["jurisdiction"],
            "region": src["region"],
        })
        if len(items) >= max_items:
            break
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--max-per-source", type=int, default=8)
    args = ap.parse_args()

    registry = json.loads((DATA / "sources.json").read_text(encoding="utf-8"))
    keywords = registry["keywords_filter"]
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)

    all_items = []
    for src in registry["sources"]:
        print(f"Fetching: {src['name']}")
        try:
            all_items.extend(fetch_source(src, keywords, cutoff, args.max_per_source))
        except Exception as e:  # keep the pipeline alive if one feed breaks
            print(f"  WARN {src['name']}: {type(e).__name__}: {e}")

    # Dedupe by normalized title (Google News often surfaces the same story via multiple queries)
    seen, deduped = set(), []
    for item in sorted(all_items, key=lambda i: i["date"], reverse=True):
        key = re.sub(r"\W+", "", item["title"].lower())[:80]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_days": args.days,
        "items": deduped,
    }
    (DATA / "news.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(deduped)} items (from {len(all_items)} raw) to data/news.json")


if __name__ == "__main__":
    main()
