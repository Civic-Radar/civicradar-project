# Civic Radar: defect metrics tables (v2)

**Pulled November 16, 2026 at 10:56 PM ET** from GitHub, with the same rules as [defect-metrics-tables.md](defect-metrics-tables.md) (KJ, November 13). Built from [issues-report-v3.md](issues-report-v3.md). Draft: the numbers will be re-pulled before the demo, after the team's last sprint merges.

Only our own repository is counted: [Civic-Radar/civicradar-project](https://github.com/Civic-Radar/civicradar-project/issues).

## What counts as a defect

- A **defect** is a bug report (filed with the bug report form, title starting with "[Bug]:") that carries the team's **Defects** label. That gives **27 defects**.
- **Found** = defects filed. **Closed** = defects closed as Completed.
- SRS item cards and task issues are not defects.
- Left out, with the reason:

| # | Title | Filed by | Why it is not counted |
|---|---|---|---|
| #497 | [Bug]: Documents page does not show setup message when user follows zero towns | Yetimiah765 | Labeled Not Implemented yet |
| #499 | [Bug]: setup message | hershey111 | Labeled Not Implemented yet; closed as Duplicate |
| #500 | [Bug]: Return from detail page | hershey111 | Labeled Not Implemented yet |
| #501 | [Bug]: Title search within scope | hershey111 | Labeled Not Implemented yet |
| #502 | [Bug]: Clear search | hershey111 | Labeled Not Implemented yet |
| #503 | [Bug]: Deleting cancel | hershey111 | Labeled Not Implemented yet |
| #504 | SRS-101.3 | hershey111 | Not a bug report (test passed); closed as Not planned |
| #505 | SRS-101.2 | hershey111 | Not a bug report (test passed); closed as Not planned |
| #509 | [Bug]: Matching, town preferences and the setup message ignore organization-shared towns and topics | KailunJu | Labeled Not Implemented yet |
| #512 | [Bug]: Dashboard shows matched topic names but not the agenda text that produced them | KailunJu | Labeled Not Implemented yet |
| #516 | [Bug]: Documents list says "Newest first" but isn't sorted by meeting date | Eriein | Labeled Not Implemented yet |
| #563 | [Bug]: Meeting details page has no update history link, although update records exist for the meeting | marcos-j-salazar | Labeled Not Implemented yet |

## 1. Found versus closed over time

Running totals, from the first defect (2026-11-10) until 2026-11-16. Dates are Eastern time.

| Date | Found that day | Closed that day | Total found | Total closed | Still open |
|---|---|---|---|---|---|
| 2026-11-10 | 9 | 0 | 9 | 0 | 9 |
| 2026-11-11 | 0 | 0 | 9 | 0 | 9 |
| 2026-11-12 | 10 | 1 | 19 | 1 | 18 |
| 2026-11-13 | 0 | 3 | 19 | 4 | 15 |
| 2026-11-14 | 8 | 0 | 27 | 4 | 23 |
| 2026-11-15 | 0 | 0 | 27 | 4 | 23 |
| 2026-11-16 | 0 | 7 | 27 | 11 | 16 |

- Found on 2026-11-10: #498, #507, #508, #510, #511, #513, #514, #515, #517.
- Found on 2026-11-12: #519, #521, #522, #523, #524, #525, #526, #527, #528, #529.
- Found on 2026-11-14: #555, #556, #557, #558, #559, #560, #561, #562.
- Closed on 2026-11-12: #519.
- Closed on 2026-11-13: #521, #525, #529.
- Closed on 2026-11-16: #507, #508, #510, #511, #515, #524, #526.

### Defects by severity

| Severity | Found | Closed | Still open | Issues |
|---|---|---|---|---|
| Critical | 1 | 0 | 1 | #517 |
| Major | 7 | 3 | 4 | #507, #508, #513, #521, #522, #555, #557 |
| Minor | 18 | 8 | 10 | #498, #510, #511, #514, #515, #519, #523, #524, #525, #526, #527, #528, #529, #556, #558, #559, #560, #561 |
| Cosmetic | 1 | 0 | 1 | #562 |
| **Total** | **27** | **11** | **16** | |

## 2. Defects by person

**Filed** = defects the person opened. **Fixed** = defects closed as Completed and assigned to that person.

| Team member | GitHub | Filed | Fixed | Still open, assigned |
|---|---|---|---|---|
| MS | marcos-j-salazar | 18 | 2 | 3 |
| KJ | KailunJu | 4 | 4 | 0 |
| EG | Eriein | 3 | 5 | 0 |
| AO | antikvng | 1 | 0 | 3 |
| YA | yampomah | 0 | 0 | 11 |
| **Team total** | | **26** | **11** | |

Filed by the team that tested our app: Yetimiah765 (1). 26 + 1 = 27 found.

Issues behind each count:

| Team member | Filed | Fixed | Still open, assigned |
|---|---|---|---|
| MS | #517, #521, #522, #523, #524, #525, #526, #527, #528, #529, #555, #556, #557, #558, #559, #560, #561, #562 | #515, #524 | #498, #513, #514 |
| KJ | #507, #508, #510, #511 | #519, #521, #525, #529 | — |
| EG | #513, #514, #515 | #507, #508, #510, #511, #526 | — |
| AO | #519 | — | #517, #527, #528 |
| YA | — | — | #498, #522, #523, #555, #556, #557, #558, #559, #560, #561, #562 |
| Yetimiah765 (other team) | #498 | — | — |

Two assignees: #498 (marcos-j-salazar, yampomah). Still open, so no fix is counted yet; when it closes, only one person should be assigned.

## 3. Defects by SRS item

Each defect is counted once, under the first SRS number in its SRS item field. Defects that name no SRS item are counted under **No SRS item (accounts)**.

| SRS item | Area | Defects | Closed | Issues |
|---|---|---|---|---|
| No SRS item (accounts) | KJ | 2 | 2 | #521, #529 |
| SRS-401.4 | EG | 2 | 2 | #507, #508 |
| SRS-401.5 | EG | 2 | 2 | #511, #526 |
| SRS-506.2 | YA | 2 | 0 | #523, #558 |
| SRS-507.1 | YA | 2 | 0 | #557, #561 |
| SRS-104.1 | KJ | 1 | 1 | #525 |
| SRS-104.2 | KJ | 1 | 1 | #519 |
| SRS-201.2 | MS | 1 | 1 | #524 |
| SRS-202.2 | MS | 1 | 1 | #515 |
| SRS-204.1 | MS | 1 | 0 | #513 |
| SRS-211.1 | MS | 1 | 0 | #514 |
| SRS-301.7 | AO | 1 | 0 | #527 |
| SRS-301.8 | AO | 1 | 0 | #528 |
| SRS-306.1 | AO | 1 | 0 | #517 |
| SRS-401.11 | EG | 1 | 1 | #510 |
| SRS-501.1 | YA | 1 | 0 | #555 |
| SRS-501.2 | YA | 1 | 0 | #562 |
| SRS-501.5 | YA | 1 | 0 | #556 |
| SRS-502.6 | YA | 1 | 0 | #560 |
| SRS-502.9 | YA | 1 | 0 | #498 |
| SRS-507.2 | YA | 1 | 0 | #522 |
| SRS-510.2 | YA | 1 | 0 | #559 |
| **Total** | | **27** | **11** | |

### By area

| Area | Defects | Closed | Still open | Share |
|---|---|---|---|---|
| YA (dashboard, meeting details and search, SRS-5xx) | 11 | 0 | 11 | 41% |
| EG (matching and tagging, SRS-401) | 5 | 5 | 0 | 19% |
| MS (documents, SRS-2xx) | 4 | 2 | 2 | 15% |
| KJ (catalog, preferences and accounts, SRS-1xx) | 4 | 4 | 0 | 15% |
| AO (extraction, SRS-3xx) | 3 | 0 | 3 | 11% |
| **Total** | **27** | **11** | **16** | 100% |

**Most defects:** YA (dashboard, meeting details and search, SRS-5xx), with 11 of 27 (41%). SRS item(s) with the most defects: No SRS item (accounts), SRS-401.4, SRS-401.5, SRS-506.2, SRS-507.1 (2 each).

## 4. Lines of code and defect density

Counted with [cloc](https://github.com/AlDanial/cloc) 1.96 on `main` at commit 78d6819 (November 16, 2026), with the same command KJ used on November 13. cloc skips blank lines and comments; only the code column is used.

```
npx cloc app lib supabase instrumentation.ts --exclude-dir=tests --exclude-ext=json,md,lock
```

| What we counted | Files | Lines of code |
|---|---|---|
| TypeScript: `app/`, `lib/`, `instrumentation.ts` | 148 | 10,873 |
| SQL: `supabase/schema.sql` and the seed and backfill scripts | 7 | 1,093 |
| CSS | 2 | 374 |
| **Total** | **157** | **12,340 (12.3 KLOC)** |

Not counted, as on November 13: tests (`__tests__/`, `supabase/tests/`), config and generated files, `node_modules`, `.next`, `public`, and every `.json`, `.md` and lock file. KJ counted 11,647 lines at commit 46f9f67 on November 13; the Sprint 5 work since added 693.

| | |
|---|---|
| Defects found | 27 |
| Lines of code | 12,340 (12.3 KLOC) |
| **Defect density** | **27 ÷ 12.3 = 2.2 defects per KLOC** |
| McConnell's range for delivered software | 1 to 25 per KLOC (12 to 308 defects for our size) |

## Checks

| Check | Result |
|---|---|
| Last row of table 1 equals total found and total closed | 27 found, 11 closed ✓ |
| Severity table adds up to total found | 27 = 27 ✓ |
| Filed in table 2 (team + other team) equals total found | 26 + 1 = 27 ✓ |
| Fixed in table 2 equals total closed as Completed | 11 = 11 ✓ |
| Table 3 adds up to total found | 27 = 27 ✓ |
| Every defect has an assignee | ✓ |
| Every defect has a severity | ✓ |
| Every defect names an SRS item | #521, #529 name none ✗ |

## Cross-check against GitHub

Each total was counted a second way, with GitHub's own issue search (November 16, 2026, 10:56 PM ET), and compared with the tables.

| What | GitHub search | GitHub | Tables | Match |
|---|---|---|---|---|
| Every issue | `is:issue` | 505 | 505 | ✓ |
| Defects found | `is:issue label:Defects` | 27 | 27 | ✓ |
| Defects closed as Completed | `is:issue label:Defects is:closed reason:completed` | 11 | 11 | ✓ |
| Defects still open | `is:issue label:Defects is:open` | 16 | 16 | ✓ |
| Defects closed as Not planned | `is:issue label:Defects is:closed reason:"not planned"` | 0 | 0 | ✓ |
| Labeled Not Implemented yet | `is:issue label:"Not Implemented yet"` | 10 | 10 | ✓ |
| Defects filed by MS | `is:issue label:Defects author:marcos-j-salazar` | 18 | 18 | ✓ |
| Defects filed on 2026-11-14 | `is:issue label:Defects created:2026-11-14` | 8 | 8 | ✓ |
| Open defects assigned to YA | `is:issue label:Defects is:open assignee:yampomah` | 11 | 11 | ✓ |

Spot check: #498, #517, #521, #526, #555 were opened one by one on GitHub. Filed by, assignees, labels, status, close reason and dates match the report for all five.

## Data clean-up

Problems found while checking the data, and what was done about each.

| Issue | Problem | What was done |
|---|---|---|
| #499 | Same bug as #497 (SRS-201.3 setup message), filed twice by the testing team | Closed as Duplicate of #497 (MS, 11/16) |
| #506 | A passed test, not a bug (SRS-216.3, "Bug Found: None"), with no bug label | Closed as Not planned (MS, 11/16), like #504 and #505 |
| #521, #529 | Bug reports that name no SRS item (accounts area, UR-1xx) | Not changed: counted under "No SRS item (accounts)"; KJ can add the closest SRS-1xx item |
| #498 | Two assignees (marcos-j-salazar, yampomah) | Not changed: still open, so no fix is counted twice yet |

## If Not Implemented yet were counted too

These tables count only the **Defects** label. Counting the 10 bug reports labeled Not Implemented yet as well: found 37 (closed 17); filed MS 19, KJ 6, EG 4, AO 1, YA 0, other team 7; most defects in YA's area (12 of 37); density 3.0 per KLOC.

