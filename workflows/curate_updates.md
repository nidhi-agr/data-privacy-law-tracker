# Workflow: Weekly AI Curation

## Objective
Once a week, review the automatically fetched news and promote significant regulatory developments into the durable jurisdiction profiles, so profiles stay authoritative rather than stale. This is the human-judgment layer on top of the mechanical daily pipeline — run by Claude (scheduled routine or interactive session).

## Required inputs
- `data/news.json` (the last 30 days of fetched items)
- `data/jurisdictions/*.json` (current profiles)

## Steps
1. **Scan the week's news.** Read `data/news.json` items with dates in the last 7 days. Group by jurisdiction.
2. **Identify significant items.** Significant = any of:
   - A law, amendment, bill, or implementing rule passed, notified, or entering force
   - A new adequacy decision, transfer framework, or treaty
   - A major enforcement action (headline fine, novel theory, first-of-kind)
   - A regulator established, restructured, or issuing major guidance
   - NOT significant: opinion pieces, vendor marketing, minor consultations, routine speeches.
3. **Verify before writing.** For each significant item, open the underlying source. Prefer the regulator/government press release over news coverage. Never add a development based on a headline alone.
4. **Update the affected profile** (`data/jurisdictions/{code}.json`):
   - Add an entry to `developments` (date, title, 1-2 sentence summary, source_url). Keep the array sorted newest-first; cap at ~8 entries, dropping the oldest.
   - If a **new legal instrument** was enacted/notified: add it to `legal_instruments` with its official text URL (must be the government/regulator source — verify it loads in a browser). Set `type` and `status` accurately.
   - If the jurisdiction's overall `status` changed (e.g. draft bill passed), update it and the `overview`.
   - Bump `last_reviewed` to today.
5. **Rebuild and validate.**
   ```
   python tools/build_insights.py
   python tools/validate_data.py
   ```
6. **Commit and push** with message `curate: <jurisdictions touched> — <one-line summary>`. The push auto-deploys Pages.

## Edge cases
- **Conflicting reports** (e.g. "law passed" vs "law stalled"): check the legislature/regulator's own site; if still unclear, skip this week and leave a note in the commit body.
- **Official text not yet published**: add the development now; add the `legal_instruments` entry only once an official URL exists.
- **No significant news this week**: perfectly fine — do nothing, don't invent updates. Optionally bump `last_reviewed` on any profile you actively re-verified.

## Output
Updated jurisdiction JSONs committed to `main`, deployed automatically.
