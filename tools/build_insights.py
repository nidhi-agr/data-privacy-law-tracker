#!/usr/bin/env python3
"""Aggregate jurisdiction data + news into data/insights.json for the dashboard.

Usage: python tools/build_insights.py
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def main():
    jurisdictions = []
    for path in sorted((DATA / "jurisdictions").glob("*.json")):
        if path.name == "index.json":
            continue
        jurisdictions.append(json.loads(path.read_text(encoding="utf-8")))

    status_by_region = defaultdict(Counter)
    instrument_types = Counter()
    adoption_timeline = []
    obligations = {"dpo_required": 0, "breach_notification": 0}
    recent_developments = []

    for j in jurisdictions:
        status_by_region[j["region"]][j["status"]] += 1
        for k in obligations:
            if j.get(k):
                obligations[k] += 1
        for inst in j.get("legal_instruments", []):
            if inst.get("status") != "repealed":
                instrument_types[inst["type"]] += 1
            # Timeline: the primary comprehensive act's effective year
            if inst["type"] == "act" and inst.get("date") and inst.get("status") in ("in_force", "partially_in_force"):
                adoption_timeline.append({
                    "jurisdiction": j["name"],
                    "code": j["code"],
                    "region": j["region"],
                    "year": int(inst["date"][:4]),
                    "title": inst["title"],
                })
        for dev in j.get("developments", []):
            recent_developments.append({**dev, "jurisdiction": j["name"], "code": j["code"], "region": j["region"]})

    # Keep only each jurisdiction's earliest in-force act for the adoption timeline
    earliest = {}
    for row in adoption_timeline:
        cur = earliest.get(row["code"])
        if cur is None or row["year"] < cur["year"]:
            earliest[row["code"]] = row
    timeline = sorted(earliest.values(), key=lambda r: r["year"])

    recent_developments.sort(key=lambda d: d["date"], reverse=True)

    news_activity = Counter()
    news_path = DATA / "news.json"
    if news_path.exists():
        news = json.loads(news_path.read_text(encoding="utf-8"))
        for item in news.get("items", []):
            news_activity[item.get("jurisdiction", "unknown")] += 1

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_jurisdictions": len(jurisdictions),
        "status_by_region": {r: dict(c) for r, c in status_by_region.items()},
        "status_totals": dict(sum(status_by_region.values(), Counter())),
        "instrument_types": dict(instrument_types),
        "adoption_timeline": timeline,
        "obligations": obligations,
        "news_activity_by_jurisdiction": dict(news_activity),
        "recent_developments": recent_developments[:15],
    }
    (DATA / "insights.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    # Manifest the site uses to discover jurisdiction files
    index = {"codes": sorted(j["code"] for j in jurisdictions)}
    (DATA / "jurisdictions" / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"Wrote insights for {len(jurisdictions)} jurisdictions to data/insights.json (+ jurisdictions/index.json)")


if __name__ == "__main__":
    main()
