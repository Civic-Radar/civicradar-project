# Civic Radar: defect metrics tables (Step 3)

**Updated November 13, 2026 at 2:32 PM ET**, pulled from GitHub. The first version of this file used [issues-report-v2.md](issues-report-v2.md) (November 12, 12:47 PM ET); since then 9 more bugs were filed (#521–#529), 3 more were closed and the team added the **Defects** and **Not Implemented yet** labels. No charts yet.

Only our own repository is counted: [Civic-Radar/civicradar-project](https://github.com/Civic-Radar/civicradar-project/issues).

## What counts as a defect

- A **defect** is a bug report (filed with the bug report form, title starting with "[Bug]:") that carries the team's **Defects** label. That gives **19 defects**.
- **Found** = defects filed. **Closed** = defects closed as Completed. No defect has been closed as Not planned or Duplicate.
- SRS item cards and task issues are not defects.
- Left out, with the reason:

| # | Title | Filed by | Why it is not counted |
|---|---|---|---|
| #497 | Documents page does not show setup message when user follows zero towns | Yetimiah765 | Labeled Not Implemented yet |
| #499 | setup message | hershey111 | Labeled Not Implemented yet |
| #500 | Return from detail page | hershey111 | Labeled Not Implemented yet |
| #501 | Title search within scope | hershey111 | Labeled Not Implemented yet |
| #502 | Clear search | hershey111 | Labeled Not Implemented yet |
| #503 | Deleting cancel | hershey111 | Labeled Not Implemented yet |
| #509 | Matching, town preferences and the setup message ignore organization-shared towns and topics | KailunJu | Labeled Not Implemented yet |
| #512 | Dashboard shows matched topic names but not the agenda text that produced them | KailunJu | Labeled Not Implemented yet |
| #516 | Documents list says "Newest first" but isn't sorted by meeting date | Eriein | Labeled Not Implemented yet |
| #504 | SRS-101.3 | hershey111 | Not a bug report (test passed); closed as Not planned |
| #505 | SRS-101.2 | hershey111 | Not a bug report (test passed); closed as Not planned |

## 1. Found versus closed over time

Running totals, from the first defect (November 10) until today. Dates are Eastern time.

| Date | Total found | Total closed | Still open |
|---|---|---|---|
| 2026-11-10 | 9 | 0 | 9 |
| 2026-11-11 | 9 | 0 | 9 |
| 2026-11-12 | 19 | 1 | 18 |
| 2026-11-13 | 19 | 4 | 15 |

- Found on November 10: #498, #507, #508, #510, #511, #513, #514, #515, #517.
- Found on November 12: #519, #521, #522, #523, #524, #525, #526, #527, #528, #529.
- Closed on November 12: #519. Closed on November 13: #521, #525, #529.

### Defects by severity

| Severity | Found | Closed | Still open | Issues |
|---|---|---|---|---|
| Critical | 1 | 0 | 1 | #517 |
| Major | 5 | 1 | 4 | #507, #508, #513, #521, #522 |
| Minor | 13 | 3 | 10 | #498, #510, #511, #514, #515, #519, #523, #524, #525, #526, #527, #528, #529 |
| Cosmetic | 0 | 0 | 0 | |
| **Total** | **19** | **4** | **15** | |

## 2. Defects by person

**Filed** = defects the person opened. **Fixed** = defects closed as Completed and assigned to that person.

| Team member | GitHub | Filed | Fixed |
|---|---|---|---|
| MS | marcos-j-salazar | 10 | 0 |
| KJ | KailunJu | 4 | 4 |
| EG | Eriein | 3 | 0 |
| AO | antikvng | 1 | 0 |
| YA | yampomah | 0 | 0 |
| **Team total** | | **18** | **4** |

The other defect was filed by the team that tested our app: Yetimiah765 (1). 18 + 1 = 19 found.

Issues behind each count:

| Team member | Filed | Fixed |
|---|---|---|
| MS | #517, #521, #522, #523, #524, #525, #526, #527, #528, #529 | — |
| KJ | #507, #508, #510, #511 | #519, #521, #525, #529 |
| EG | #513, #514, #515 | — |
| AO | #519 | — |
| YA | — | — |
| Yetimiah765 (other team) | #498 | — |

## 3. Defects by SRS item

Each defect is counted once, under the first SRS number in its SRS item field. #521 and #529 name no SRS item ("accounts area, UR-1xx"), so they are counted under **No SRS item (accounts)**.

| SRS item | Area | Defects | Issues |
|---|---|---|---|
| SRS-401.4 | EG | 2 | #507, #508 |
| SRS-401.5 | EG | 2 | #511, #526 |
| No SRS item (accounts) | KJ | 2 | #521, #529 |
| SRS-104.1 | KJ | 1 | #525 |
| SRS-104.2 | KJ | 1 | #519 |
| SRS-201.2 | MS | 1 | #524 |
| SRS-202.2 | MS | 1 | #515 |
| SRS-204.1 | MS | 1 | #513 |
| SRS-211.1 | MS | 1 | #514 |
| SRS-301.7 | AO | 1 | #527 |
| SRS-301.8 | AO | 1 | #528 |
| SRS-306.1 | AO | 1 | #517 |
| SRS-401.11 | EG | 1 | #510 |
| SRS-502.9 | YA | 1 | #498 |
| SRS-506.2 | YA | 1 | #523 |
| SRS-507.2 | YA | 1 | #522 |
| **Total** | | **19** | |

### By area

| Area | Defects | Closed |
|---|---|---|
| EG (matching and tagging, SRS-401) | 5 | 0 |
| KJ (catalog, preferences and accounts, SRS-1xx) | 4 | 4 |
| MS (documents, SRS-2xx) | 4 | 0 |
| AO (extraction, SRS-3xx) | 3 | 0 |
| YA (dashboard, meeting details and search, SRS-5xx) | 3 | 0 |
| **Total** | **19** | **4** |

**Most defects:** EG's matching and tagging area, with 5 of 19 (26%). The two SRS items with the most defects, SRS-401.4 and SRS-401.5, are both in that area.

## 4. Lines of code and defect density

Counted with [cloc](https://github.com/AlDanial/cloc) on `main` at commit 46f9f67 (after #521 was merged). cloc skips blank lines and comments; only the code column is used.

```
npx cloc app lib supabase instrumentation.ts --exclude-dir=tests --exclude-ext=json,md,lock
```

| What we counted | Files | Lines of code |
|---|---|---|
| TypeScript: `app/`, `lib/`, `instrumentation.ts` | 134 | 10,192 |
| SQL: `supabase/schema.sql` and the seed and backfill scripts | 7 | 1,081 |
| CSS | 2 | 374 |
| **Total** | **143** | **11,647 (11.6 KLOC)** |

**Not counted:**

- Tests: `__tests__/` (15,740 lines) and `supabase/tests/` (985 lines). They are not part of the delivered app.
- Config and generated files: `next.config.js`, `postcss.config.js`, `tailwind.config.js`, `vitest.config.ts`, `next-env.d.ts` (generated by Next.js) and the `.github` templates and workflows (189 lines together).
- `node_modules`, `.next`, `.git`, `public`, `package-lock.json`, every `.json` and `.md` file.

| | |
|---|---|
| Defects found | 19 |
| Lines of code | 11,647 (11.6 KLOC) |
| **Defect density** | **19 ÷ 11.6 = 1.6 defects per KLOC** |
| McConnell's range for delivered software | 1 to 25 per KLOC (12 to 291 defects for our size) |

We are at the low end of McConnell's range. Our count is defects found before release, so the comparison is rough. If the test code were counted too (28,372 lines), the density would be 0.67 per KLOC.

## Checks

| Check | Result |
|---|---|
| Last row of table 1 equals total found and total closed | 19 found, 4 closed ✓ |
| Fixed counts in table 2 add up to total closed as Completed | 4 = 4 ✓ |
| Filed in table 2 (team 18 + other team 1) equals total found | 19 = 19 ✓ |
| Table 3 adds up to total found | 19 = 19 ✓ |
| Every defect has an assignee and a severity | ✓ |
| Every defect has an SRS item | ✗ #521 and #529 name none; counted under "No SRS item (accounts)" |

## Open questions for the team

- **Not Implemented yet.** These tables count only the **Defects** label. If the 9 issues labeled Not Implemented yet were counted too: found 28 (closed 4); filed MS 10, KJ 6, EG 4, AO 1, YA 0, other team 7; most defects in MS's area (10 of 28); density 2.4 per KLOC.
- **#521 and #529** have no SRS item. Either add the closest one (for example a UR-1xx accounts item) or keep the "No SRS item (accounts)" row.
- **#498** has two assignees (marcos-j-salazar and yampomah). It is still open; when it is closed, only one of them should be assigned so the fix is counted once.
- **#497 and #499** are the same bug (SRS-201.3). Both are labeled Not Implemented yet, so they are not counted here either way.
