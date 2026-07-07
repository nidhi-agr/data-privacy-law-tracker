# Workflow: Daily Tracker Update

## Objective
Keep the newsfeed and insights dashboard current with zero manual work. This runs unattended via GitHub Actions; this SOP explains the pipeline and how to intervene when it breaks.

## How the pipeline works
1. `.github/workflows/daily-update.yml` fires daily at 02:20 UTC (or via manual dispatch from the Actions tab).
2. It runs, in order:
   - `python tools/fetch_news.py` — pulls every source in `data/sources.json` (regulator RSS feeds + Google News RSS queries), filters items to the last 30 days and privacy keywords, dedupes by normalized title, writes `data/news.json`.
   - `python tools/build_insights.py` — aggregates `data/jurisdictions/*.json` + `news.json` into `data/insights.json`, and regenerates `data/jurisdictions/index.json` (the manifest the site uses to discover profiles).
   - `python tools/validate_data.py` — schema-checks everything; a failure aborts the run before anything is committed.
3. If `news.json`/`insights.json` changed, the workflow commits and pushes; the push triggers `deploy-pages.yml`, which copies `site/` + `data/` into the Pages artifact and redeploys.

## Required inputs
None. Everything is derived from files in the repo.

## Manual/local run
```
python tools/fetch_news.py          # optional: --days 30 --max-per-source 8
python tools/build_insights.py
python tools/validate_data.py       # add --links for official-text liveness check
python tools/serve_local.py         # preview at http://127.0.0.1:8000/
```

## Failure handling
- **One feed errors**: `fetch_news.py` logs a WARN and continues — a single broken RSS feed never kills the run. If a regulator feed 404s persistently, replace or remove its entry in `data/sources.json`.
- **Validation fails**: usually a malformed edit to a jurisdiction file. Run `python tools/validate_data.py` locally; the error lists file + field.
- **No commit made**: normal when no news changed (rare, since `generated_at` changes — the workflow only commits data files that actually differ).
- **Rate limiting**: Google News RSS tolerates this volume (~30 queries/day). If it starts returning empty feeds, add a `time.sleep(1)` between fetches in `fetch_news.py`.

## Known quirks (learned during build)
- Many official government legislation sites (gov.il, peraturan.bpk.go.id, officialgazette.gov.ph, pdpc.or.th, kvkk.gov.tr, law.go.kr, sdaia.gov.sa) **block non-browser HTTP clients** with 403s or connection resets. The `--links` checker reports these as DEAD, but they open fine in a real browser. Only treat a link as truly dead after confirming in a browser; prefer 404s as the actionable signal.
- `feedparser` needs a browser-ish User-Agent for some regulator feeds (already set in `fetch_news.py`).
