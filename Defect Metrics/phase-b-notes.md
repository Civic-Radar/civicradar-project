# Phase B: slide notes (draft)

Data pulled from GitHub on **November 16, 2026 at 10:56 PM ET**. Numbers come from [defect-metrics-tables-v2.md](defect-metrics-tables-v2.md); charts are in [charts/](charts/). Everything will be re-pulled before the demo.

## Charts, in slide order

Put each table from defect-metrics-tables-v2.md directly under its chart.

| Slide | Chart | Table under it |
|---|---|---|
| 1 | [Found vs. closed over time](charts/1-found-vs-closed.png) | Table 1, found versus closed over time |
| 2 | [By severity](charts/2-severity.png) | Defects by severity |
| 3 | [By person](charts/3-by-person.png) | Table 2, defects by person |
| 4 | [By area](charts/4-by-area.png) | Table 3, by area (and the SRS item table if there is room) |
| 5 | [Density vs. McConnell](charts/5-density.png) | Table 4, lines of code and defect density |
| 6 | Data checking (text below) | Cross-check table and data clean-up table |

Colors mean the same thing on every chart: blue = found/filed, orange = closed/fixed, green = still open.

## Slide 6: How we checked the data

**What we counted.** A defect is a bug report with the team's Defects label: 27 found, 11 closed, 16 open. Issues labeled Not Implemented yet (10) are features not built yet, so they are shown separately, not counted.

**How we checked it.**
- Every total was counted a second way with GitHub's own issue search. All 9 checks match (for example `label:Defects is:closed reason:completed` = 11).
- The tables check themselves: the last day of the timeline, the severity table, filed by person and defects by SRS item each add up to 27.
- 5 defects (#498, #517, #521, #526, #555) were opened one by one on GitHub and matched the report field by field.

**What we found and corrected.**
- #499 was the same bug as #497, filed twice. Closed as Duplicate.
- #506 was a passed test ("Bug Found: None"), not a bug. Closed as Not planned, like #504 and #505.
- #521 and #529 name no SRS item. Counted under "No SRS item (accounts)" until one is added.
- #498 has two assignees. Still open; when it closes, one person should be assigned so the fix counts once.

## MS: my own numbers

| | Count | Issues |
|---|---|---|
| Defects I filed | 18 of 27 (67%) | #517, #521 to #529 (9), #555 to #562 (8) |
| Other bug reports I filed | 1 | #563, labeled Not Implemented yet |
| Defects I fixed | 2 | #515, #524 |
| Not Implemented yet issues I closed | 5 | #497, #500, #501, #502, #516 (Sprint 5 PRs #599 to #608) |
| My open defects with a PR | 2 | #513 (PR #650), #514 (PR #651) |
| Shared, not mine to fix | 1 | #498 (Yolanda's SRS-502.9) |
| Data clean-up | 2 | #499 closed as Duplicate, #506 closed as Not planned |

After PRs #650 and #651 merge: **4 defects fixed**, and none of the defects in my area (documents, SRS-2xx) are still open.

Talking points:
- I filed two thirds of the team's defects, mostly by testing other members' areas (extraction, dashboard and search, accounts).
- In my own area, 4 defects were found (3 by EG: #513, #514, #515; 1 by me: #524); 2 are fixed and the other 2 have PRs open.

## The deck

[Civic Radar Defect Metrics.pptx](Civic%20Radar%20Defect%20Metrics.pptx): 10 slides with native PowerPoint charts (editable in PowerPoint), each metric's table under its chart, and speaker notes. Lines of code were recounted on November 16 with cloc on `main` (commit 78d6819): 12,340 lines, so density is 2.2 per KLOC.

## Still to do before the demo

1. Re-pull the issues and rebuild the tables, charts and deck with the scripts in [scripts/](scripts/), so the numbers include the team's last merges (and #650, #651).
2. Recount lines of code on the final `main` if it changed.

### How to rebuild

From `Defect Metrics/scripts/`:

```
gh issue list --repo Civic-Radar/civicradar-project --state all --limit 2000 --json number,title,author,assignees,labels,state,stateReason,createdAt,closedAt,body > issues.json
python3 build.py issues.json "<pulled at>" .. <YYYY-MM-DD today> <lines of code> "<lines of code note>"
python3 charts.py issues.json ../charts <YYYY-MM-DD today> <lines of code> "<as-of text>"
```

Update the counts in `search.json` from GitHub's issue search first, so the cross-check table stays honest. The SVG charts are turned into PNGs with Playwright (`render.js`, which needs `npm install playwright` in the folder it runs from). For the deck: `python3 export.py` writes `deckdata.json`, then `node deck.js deckdata.json "../Civic Radar Defect Metrics.pptx" <path to apply_theme.js>` (needs `npm install pptxgenjs`). Update the line counts written in `deck.js` and `export.py` when cloc is rerun.
