# Phase B: defect metrics notes

Data pulled from GitHub on **November 17, 2026 at 10:34 AM ET**, after the team's last Sprint 5 merges. The slides follow the example in the CSC 351 Defect Metrics lecture (slides 24 to 28): one slide per required item, chart on the left with the table of numbers under it, takeaways on the right.

## The deck

[Civic Radar Defect Metrics.pptx](Civic%20Radar%20Defect%20Metrics.pptx). The charts are native PowerPoint charts, so the numbers can be edited in PowerPoint. Every slide has speaker notes.

| Slide | Required item | What is on it |
|---|---|---|
| 2 | Found versus closed | Line chart of running totals (axes: date, defects), table of totals per day, takeaways |
| 3 | Defects by person | Filed (our repo + against the SSU team) and fixed per person, table, takeaways |
| 4 | Defect density | Lines of code table (what was counted and left out), 27 ÷ 12.7 KLOC = 2.1, McConnell's 1 to 25 range |
| 5 | Defect clusters | Defects by SRS item, largest first, with the full table adding up to 27 |
| 6 | Defect clusters | Defects by area: YA's dashboard and search area had the most (11 of 27, 41%) |
| 7 | How we checked our data | 9 totals checked against GitHub search, 6 issues checked field by field, what we corrected |
| 8 | Appendix | Severity and average days to fix |

Full tables and every issue number behind each count: [defect-metrics-tables-v2.md](defect-metrics-tables-v2.md). Every issue: [issues-report-v3.md](issues-report-v3.md).

## Headline numbers

- **Defects** (bug reports with the Defects label, our repo): 27 found, 23 closed as Completed, 4 open (#498, #522, #559, #560).
- **Not Implemented yet**: 11 reports of features not built yet. Shown separately, not counted.
- **Filed against the team we tested** ([SonjaSeferasi/ssu-starter-app-v2](https://github.com/SonjaSeferasi/ssu-starter-app-v2/issues)): 15 reports by our team; 7 counted, 8 left out (3 form tests, 1 closed by them as a duplicate, 3 of AO's filed twice, 1 withdrawn by MS).
- **Lines of code**: 12,675 (cloc on `main` at 6bd95e3, Nov 17). Density 2.1 per KLOC.

## Each person's filed and fixed numbers

| | Filed in our repo | Filed against SSU team | Total filed | Fixed |
|---|---|---|---|---|
| MS | 18 | 1 (#1173) | 19 | 4 (#513, #514, #515, #524) |
| KJ | 4 | 0 | 4 | 4 (#519, #521, #525, #529) |
| EG | 3 | 3 (#1169, #1170, #1171) | 6 | 5 (#507, #508, #510, #511, #526) |
| AO | 1 | 3 (#1177, #1178, #1179) | 4 | 3 (#517, #527, #528) |
| YA | 0 | 0 | 0 | 7 (#523, #555, #556, #557, #558, #561, #562) |
| **Team total** | **26** | **7** | **33** | **23** |
| Testing team (Yetimiah765) | 1 (#498) | | | |

Filed in our repo: 26 by the team + 1 by the testing team = 27 found. Fixed adds up to 23, the total closed.

MS talking points:
- I filed 18 of our 27 defects, mostly by testing other members' areas: extraction (#517, #527, #528), accounts (#521, #525, #529), matching (#526), and dashboard and search (#522, #523, #555 to #562). Plus 1 against the SSU team (#1173).
- I fixed 4: #513, #514, #515 and #524, all in my area (documents, SRS-2xx), which now has no open defects.
- Data clean-up: closed #499 as a duplicate of #497 and #506 as a passed test.

## Still open in the data (not changed)

- #521 and #529 (KJ) name no SRS item; counted as "No SRS item".
- #498 has two assignees (MS and YA) and is still open.

## How to rebuild

From `Defect Metrics/scripts/`:

```
gh issue list --repo Civic-Radar/civicradar-project --state all --limit 2000 --json number,title,author,assignees,labels,state,stateReason,createdAt,closedAt,body > issues.json
python3 checks.py issues.json "<searched at>"
python3 build.py issues.json "<pulled at>" .. <YYYY-MM-DD today> <lines of code> "<lines of code note>"
python3 export.py <YYYY-MM-DD today> <lines of code> "Data: GitHub issues, <date and time>"
node deck.js deckdata.json "../Civic Radar Defect Metrics.pptx" <path to apply_theme.js>
```

`checks.py` reruns the GitHub search cross-checks. `other.json` lists our reports in the SSU team's repo (update it if more are filed). `deck.js` needs `npm install pptxgenjs`; update the lines-of-code rows in `deck.js` when cloc is rerun.
