# Data Privacy Law Tracker — APAC & EMEA

Interactive tracker of data privacy and protection laws across 30 APAC and EMEA jurisdictions, inspired by techieray.com's Global AI Regulation Tracker.

**Features**

- 🗺️ **Interactive map** — countries colored by law status; click any country for its full profile
- 📋 **Jurisdiction profiles** — overview, regulator, penalties, DPO/breach/cross-border obligations, latest developments
- 📜 **Legal Texts Library** — every act, rule, regulation, order and circular, each linked to its **official government/regulator text**
- 📰 **Live newsfeed** — regulator RSS feeds + curated news searches, refreshed daily
- 📊 **Insights dashboard** — adoption timeline, instrument breakdown, news activity
- 🔍 Client-side search, responsive layout, light/dark themes

**Architecture** (WAT framework)

| Layer | Where | What |
|---|---|---|
| Workflows | `workflows/` | SOPs: daily update pipeline, weekly AI curation, adding jurisdictions |
| Agents | Claude | Weekly curation: promotes significant news into profiles, verifies official sources |
| Tools | `tools/` | `fetch_news.py`, `build_insights.py`, `validate_data.py`, `serve_local.py` |

**Data** lives in `data/`: one JSON per jurisdiction, plus `news.json`, `insights.json`, `sources.json`. The static site in `site/` is deployed to GitHub Pages with `data/` copied alongside; all data files are fetchable as plain JSON.

**Automation**: `.github/workflows/daily-update.yml` refreshes news/insights daily and commits; `deploy-pages.yml` redeploys on every push.

**Local development**

```bash
pip install -r requirements.txt
python tools/fetch_news.py && python tools/build_insights.py && python tools/validate_data.py
python tools/serve_local.py   # http://127.0.0.1:8000/
```

*Independent reference; not legal advice.*
