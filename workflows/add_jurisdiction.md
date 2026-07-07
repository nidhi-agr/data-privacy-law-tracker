# Workflow: Add a Jurisdiction

## Objective
Add a new country/territory profile to the tracker with verified official sources.

## Required inputs
- Jurisdiction name and ISO 3166-1 alpha-2 code (lowercase — this becomes the filename)
- Its ISO 3166-1 **numeric** code (for the map)

## Steps
1. **Research the regime.** Establish: the primary law(s) and their status, the regulator, key obligations (DPO, breach notification), penalties, cross-border rules, and 1-3 recent developments. Use the regulator's own site and official legislation portals as primary sources.
2. **Create `data/jurisdictions/{code}.json`.** Copy the structure of an existing file (e.g. `sg.json`). Requirements:
   - `status` ∈ `comprehensive_law_in_force | law_passed_not_in_force | draft_bill | sectoral_only | not_covered`
   - Every `legal_instruments[]` entry needs `title`, `type`, `status`, `official_text_url` (official government/regulator source only — open it in a browser to confirm), `summary`.
   - `region` ∈ `APAC | EMEA` (extend the validator + site if adding other regions).
3. **Wire the map.** In `site/js/app.js`, add the numeric-id → code entry to `NUMERIC_TO_CODE`. If the territory is too small to render at 110m resolution (like Singapore/Hong Kong/Bahrain), add a `[lon, lat]` entry to `DOT_MARKERS` instead.
4. **Add news sources.** In `data/sources.json`, add a `gnews` query entry (and a direct `rss` entry if the regulator publishes a feed).
5. **Rebuild and validate.**
   ```
   python tools/fetch_news.py
   python tools/build_insights.py
   python tools/validate_data.py --links
   ```
   (`--links` flags dead URLs; remember many gov sites 403 bots — verify those in a browser.)
6. **Preview locally** (`python tools/serve_local.py`): the country colors on the map, the profile opens, instruments list with working official links.
7. **Commit and push** — Pages redeploys automatically.
