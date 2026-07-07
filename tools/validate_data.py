#!/usr/bin/env python3
"""Validate all tracker data files against their schemas.

Usage:
    python tools/validate_data.py            # schema validation only
    python tools/validate_data.py --links    # also spot-check official_text_url liveness

Exit code 0 = all valid, 1 = validation errors found.
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

STATUSES = {
    "comprehensive_law_in_force",
    "law_passed_not_in_force",
    "draft_bill",
    "sectoral_only",
    "not_covered",
}
INSTRUMENT_TYPES = {"act", "rules", "regulation", "order", "circular", "guideline", "bill", "decree", "directive", "standard"}
INSTRUMENT_STATUSES = {"in_force", "passed_not_in_force", "draft", "repealed", "partially_in_force"}
REGIONS = {"APAC", "EMEA"}

JURISDICTION_REQUIRED = ["code", "name", "region", "status", "overview", "regulator", "legal_instruments", "developments", "last_reviewed"]
INSTRUMENT_REQUIRED = ["title", "type", "status", "official_text_url", "summary"]


def err(errors, path, msg):
    errors.append(f"{path}: {msg}")


def check_date(errors, path, value, field):
    try:
        date.fromisoformat(value)
    except (TypeError, ValueError):
        err(errors, path, f"{field} is not a valid ISO date: {value!r}")


def validate_jurisdiction(path, doc, errors):
    for field in JURISDICTION_REQUIRED:
        if field not in doc:
            err(errors, path, f"missing required field '{field}'")
    if not isinstance(doc.get("regulator"), dict) or "name" not in doc.get("regulator", {}):
        err(errors, path, "regulator must be an object with at least 'name'")
    if doc.get("status") not in STATUSES:
        err(errors, path, f"invalid status {doc.get('status')!r}")
    if doc.get("region") not in REGIONS:
        err(errors, path, f"invalid region {doc.get('region')!r}")
    if doc.get("code") != path.stem:
        err(errors, path, f"code {doc.get('code')!r} does not match filename")
    if "last_reviewed" in doc:
        check_date(errors, path, doc["last_reviewed"], "last_reviewed")

    for i, inst in enumerate(doc.get("legal_instruments", [])):
        where = f"{path} legal_instruments[{i}]"
        for field in INSTRUMENT_REQUIRED:
            if not inst.get(field):
                err(errors, where, f"missing/empty required field '{field}'")
        if inst.get("type") not in INSTRUMENT_TYPES:
            err(errors, where, f"invalid type {inst.get('type')!r}")
        if inst.get("status") not in INSTRUMENT_STATUSES:
            err(errors, where, f"invalid status {inst.get('status')!r}")
        if inst.get("date"):
            check_date(errors, where, inst["date"], "date")

    for i, dev in enumerate(doc.get("developments", [])):
        where = f"{path} developments[{i}]"
        for field in ("date", "title", "summary"):
            if not dev.get(field):
                err(errors, where, f"missing/empty required field '{field}'")
        if dev.get("date"):
            check_date(errors, where, dev["date"], "date")


def validate_news(path, doc, errors):
    if not isinstance(doc.get("items"), list):
        err(errors, path, "news.json must have an 'items' list")
        return
    for i, item in enumerate(doc["items"]):
        where = f"{path} items[{i}]"
        for field in ("title", "url", "date", "source"):
            if not item.get(field):
                err(errors, where, f"missing/empty required field '{field}'")
        if item.get("date"):
            check_date(errors, where, item["date"], "date")


def check_links(errors):
    import concurrent.futures
    import requests

    urls = []
    for path in sorted((DATA / "jurisdictions").glob("*.json")):
        if path.name == "index.json":
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for inst in doc.get("legal_instruments", []):
            u = inst.get("official_text_url")
            if u:
                urls.append((path.name, inst["title"], u))

    def probe(entry):
        fname, title, url = entry
        try:
            r = requests.head(url, timeout=15, allow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0 (privacy-law-tracker link check)"})
            if r.status_code in (403, 405, 501):  # servers that dislike HEAD
                r = requests.get(url, timeout=20, stream=True,
                                 headers={"User-Agent": "Mozilla/5.0 (privacy-law-tracker link check)"})
            return (fname, title, url, r.status_code)
        except requests.RequestException as e:
            return (fname, title, url, f"ERROR {type(e).__name__}")

    print(f"Checking {len(urls)} official-text links...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        for fname, title, url, status in pool.map(probe, urls):
            ok = isinstance(status, int) and status < 400
            mark = "ok " if ok else "DEAD"
            if not ok:
                # Dead links are warnings, not hard failures: government sites
                # frequently block bots or have transient outages.
                print(f"  [{mark}] {fname} :: {title} :: {url} -> {status}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--links", action="store_true", help="also check official_text_url liveness")
    args = ap.parse_args()

    errors = []
    jur_files = [p for p in sorted((DATA / "jurisdictions").glob("*.json")) if p.name != "index.json"]
    if not jur_files:
        errors.append("no jurisdiction files found")

    for path in jur_files:
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            err(errors, path, f"invalid JSON: {e}")
            continue
        validate_jurisdiction(path, doc, errors)

    news_path = DATA / "news.json"
    if news_path.exists():
        try:
            validate_news(news_path, json.loads(news_path.read_text(encoding="utf-8")), errors)
        except json.JSONDecodeError as e:
            err(errors, news_path, f"invalid JSON: {e}")

    for name in ("insights.json", "sources.json"):
        p = DATA / name
        if p.exists():
            try:
                json.loads(p.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                err(errors, p, f"invalid JSON: {e}")

    if errors:
        print(f"FAILED: {len(errors)} error(s)")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    print(f"OK: {len(jur_files)} jurisdiction files valid; news/insights/sources parse cleanly.")
    if args.links:
        check_links(errors)


if __name__ == "__main__":
    main()
