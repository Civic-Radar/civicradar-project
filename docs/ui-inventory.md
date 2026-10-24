# UI Inventory

Snapshot of every file that renders UI, taken on branch `ui/foundation` at commit `0e11baf` (2026-10-24). The goal is to plan the restyle: which files are safe to touch now, and which need their logic separated from their markup first.

> **Corrected 2026-10-24 on `ui/restyle`:** the notes on `app/components/ui/`, UI tests, `globals.css`, `meetings.module.css`, the Tailwind `content` setting, page shells, text colors and the suggested order of work were updated after the restyle. Line counts, last authors and the rest of the snapshot are unchanged.

Excluded from the scan: `docs/figma-reference/`, `node_modules/`, `.next/`.

## At a glance

- **22 UI files**: 14 pages, 2 layouts, 2 shared components, 4 page-specific components.
- **12 of the 22 need a logic/view split** before restyling.
- **No route-level `loading.tsx`, `error.tsx`, or `not-found.tsx` exist.** Each page handles its own loading and error states inline.
- **There is no root `components/` folder.** Shared components live in `app/components/`. The restyle's shared primitives (`Button`, `Card`, `Alert`, `TextField`, `Badge`, `PageShell`, `SignedOutNotice` and the `cx` helper) are in `app/components/ui/`.
- **Three tests render a UI file**, all with `renderToStaticMarkup`: `document-list-link.test.ts` and `document-town-tag.test.ts` render the Documents page, and `summary-display.test.ts` renders the document detail page. `document-town-tag` asserts the exact town tag markup `<span class="text-fg-muted">…</span>`. The other test files in `__tests__/` (37 in all) cover API routes and `lib/`. No other page has an automated safety net, even though `extract` and `extractions/[id]` carry `data-testid` attributes for tests that were never written.

## How the app is laid out

```
app/layout.tsx                 root: <html><body>, imports globals.css
├── /                          app/page.tsx              (landing, no sidebar)
├── /login, /register          use app/components/AuthCard.tsx (no sidebar)
├── /admin/towns               app/admin/towns/page.tsx  (no sidebar, not in nav)
└── app/(app)/layout.tsx       wraps everything below in app/components/Sidebar.tsx
    ├── /dashboard
    ├── /meetings, /meetings/[id]
    ├── /documents, /documents/[id]
    ├── /extract, /extractions/[id]
    ├── /search
    ├── /preferences
    └── /profile
```

Auth on the client works the same way on every protected page: read `localStorage.getItem('access_token')`, send it as `Authorization: Bearer …`, and show a "You must be logged in" block when it is missing or the API returns 401. There is no middleware and no shared auth hook, so this check is written out separately in 8 files.

---

## 1. UI file inventory

Columns: **Kind**: client = has `'use client'`; server = no directive (`DocumentSummary` and `AuthCard` have no directive but are only imported by client pages, so they run on the client). **Lines** = `wc -l`. **Last author** = `git log -1 --format=%an`.

### Root and layouts

#### `app/layout.tsx`
| | |
|---|---|
| Renders at | Every route (root layout) |
| Type | Layout |
| Kind | server |
| Styling | Global CSS (imports `globals.css`) |
| Logic | None (static `metadata` export) |
| Split needed | **No** |
| Lines | 14 |
| Last author | Yolanda |

#### `app/(app)/layout.tsx`
| | |
|---|---|
| Renders at | `/dashboard`, `/meetings`, `/meetings/[id]`, `/documents`, `/documents/[id]`, `/extract`, `/extractions/[id]`, `/search`, `/preferences`, `/profile` |
| Type | Layout |
| Kind | server |
| Styling | Tailwind |
| Logic | None |
| Split needed | **No** |
| Lines | 12 |
| Last author | Yolanda |

### Shared components

#### `app/components/Sidebar.tsx`
| | |
|---|---|
| Used by | `app/(app)/layout.tsx`, so every page inside `(app)` |
| Type | Shared component |
| Kind | client |
| Styling | Tailwind |
| Logic | `useState` (menu open), `useEffect` ×2 (close on route change; Escape key listener, body scroll lock, focus move), `useRef` ×2, `usePathname`. Nav items are a hard-coded array. No data fetching. |
| Split needed | **No.** The logic is UI behavior only (mobile drawer, focus handling). If you want, you could move it into a `useMobileMenu` hook, but restyling doesn't require that. |
| Lines | 181 |
| Last author | Yolanda |

Note: `/admin/towns` is not in the nav array.

#### `app/components/AuthCard.tsx`
| | |
|---|---|
| Used by | `/login`, `/register` |
| Type | Shared component |
| Kind | no directive (imported by client pages) |
| Styling | Tailwind; also exports `inputClass` and `primaryButtonClass` strings |
| Logic | None |
| Split needed | **No** |
| Lines | 37 |
| Last author | Yolanda |

### Pages (sorted by route)

#### `app/page.tsx`: `/`
| | |
|---|---|
| Type | Page (public landing) |
| Kind | server |
| Styling | Tailwind |
| Logic | None (static `features` array) |
| Split needed | **No** |
| Lines | 75 |
| Last author | Yolanda |

#### `app/admin/towns/page.tsx`: `/admin/towns`
| | |
|---|---|
| Type | Page (admin) |
| Kind | client |
| Styling | Tailwind (plus an `inputClass(field)` function that builds class strings) |
| Logic | `useState` ×9, `useEffect`; fetch GET `/api/towns`, POST `/api/towns`, PATCH `/api/towns/[id]`; form submit handler with server-side missing-field highlighting; edit/reset form state; auth check (token present). **No admin-role check on the client**, so the page relies entirely on the API to reject non-admins. No try/catch around fetches. |
| Split needed | **Yes** |
| Lines | 231 |
| Last author | Marcos Salazar |

Note: this page sits outside `(app)`, so it renders without the sidebar. Its "Back to home" link goes to `/` (the landing page).

#### `app/(app)/dashboard/page.tsx`: `/dashboard`
| | |
|---|---|
| Type | Page |
| Kind | server (`export const dynamic = 'force-dynamic'`) |
| Styling | Tailwind |
| Logic | **Direct Supabase queries** in the page (`towns` and `meetings` tables via `getSupabaseClient()`); reads `process.env.SUPABASE_SERVICE_ROLE_KEY`; try/catch error state; `Intl.DateTimeFormat` time-zone formatting. No user/auth check: it shows the next 6 meetings across all towns, not the user's followed ones. |
| Split needed | **Yes.** Move `getMeetingData` and `formatMeetingTime` out of the page. |
| Lines | 159 |
| Last author | Yolanda |

#### `app/(app)/documents/page.tsx`: `/documents`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind |
| Logic | None of its own. It calls `useDocuments()` and renders by `state.status`. |
| Split needed | **No.** Already split: the logic lives in `useDocuments.ts`. |
| Lines | 36 |
| Last author | Marcos Salazar |

#### `app/(app)/documents/[id]/page.tsx`: `/documents/[id]`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind |
| Logic | None of its own. It calls `useDocument(id)`. |
| Split needed | **No.** Already split (`useDocument.ts` + `DocumentSummary.tsx`). |
| Lines | 37 |
| Last author | Marcos Salazar |

#### `app/(app)/extract/page.tsx`: `/extract`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind; status pill colors come from `STATUS_STYLES` in `lib/extractions.ts` |
| Logic | `useState` ×11, `useEffect`; parallel fetch GET `/api/extractions/documents` + `/api/extractions`; POST `/api/extractions`; fire-and-forget POST `/api/extractions/[id]/run`; refetch after run; 401 → `localStorage.removeItem('access_token')`; derived state: search filter, group-by-meeting, pagination ("show older meetings"), in-flight duplicate check (SRS-306.3); two-step confirm flow; auth check. No try/catch around the initial load. |
| Split needed | **Yes** |
| Lines | 358 (largest UI file) |
| Last author | antikvng |

#### `app/(app)/extractions/[id]/page.tsx`: `/extractions/[id]`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind; `STATUS_STYLES` from `lib/extractions.ts` |
| Logic | `useState` ×6, `useCallback`, `useEffect` ×3, `useRef`; fetch GET `/api/extractions/[id]`; **auto-starts** the run (POST `/run`) once if Queued; **polls every 3 s** while Queued/Processing; 401 clears the token; **403 renders "Access denied" and nothing else (SRS-310.2 ownership check)**; mailto/tel link building. |
| Split needed | **Yes** |
| Lines | 255 |
| Last author | antikvng |

#### `app/(app)/meetings/page.tsx`: `/meetings`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | **CSS Modules** (`meetings.module.css`) |
| Logic | `useState` ×7, `useEffect`; fetch GET `/api/meetings` (no auth header); POST `/api/retrieval/meetings` ("Run retrieval" button, an admin-style action shown to every user); picks only the first town returned; time-zone formatting. No auth check. |
| Split needed | **Yes** |
| Lines | 178 |
| Last author | Marcos (git name differs from "Marcos Salazar"; probably the same person) |

#### `app/(app)/meetings/[id]/page.tsx`: `/meetings/[id]`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | **CSS Modules** + one inline `style={{ marginTop: '1.5rem' }}` |
| Logic | `useState` ×5, `useEffect`; fetch GET `/api/meetings/[id]` (no auth header); 404 handling; time-zone formatting. Also defines 4 display helpers in the file (`TextOrNotProvided`, `LinkOrNotProvided`, `DetailRow`, `DocumentTypeBadge`, `DocumentList`). |
| Split needed | **Yes** (the fetch is small; the bigger win is moving the helper components out) |
| Lines | 209 |
| Last author | Yolanda |

#### `app/(app)/preferences/page.tsx`: `/preferences`
| | |
|---|---|
| Type | Page |
| Kind | server |
| Styling | Tailwind |
| Logic | None (composes `TownPreferences` and `TopicPreferences`) |
| Split needed | **No** |
| Lines | 21 |
| Last author | Kailun Ju |

#### `app/(app)/profile/page.tsx`: `/profile`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind |
| Logic | `useState` ×11, `useEffect`, `useRef`; fetch GET/POST/PATCH `/api/profile`; POST `/api/profile/avatar` (multipart `FormData` upload); 3 handlers (create, save bio, avatar change); edit-mode toggle; auth check. **No try/catch anywhere**, so a network error leaves the spinner state stuck. `profile.username[0]` crashes on an empty username. |
| Split needed | **Yes** |
| Lines | 232 |
| Last author | Marcos Salazar |

#### `app/(app)/search/page.tsx`: `/search`
| | |
|---|---|
| Type | Page (placeholder, "coming soon") |
| Kind | server |
| Styling | Tailwind |
| Logic | None |
| Split needed | **No** |
| Lines | 35 |
| Last author | Yolanda |

#### `app/login/page.tsx`: `/login`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind (uses `AuthCard` class exports) |
| Logic | `useState` ×4; form submit handler; fetch POST `/api/auth/login`; **writes `access_token` to `localStorage`**; `router.push('/dashboard')`. No try/catch. |
| Split needed | **Yes** (small, but this file is where the token gets stored) |
| Lines | 85 |
| Last author | Yolanda |

#### `app/register/page.tsx`: `/register`
| | |
|---|---|
| Type | Page |
| Kind | client |
| Styling | Tailwind (uses `AuthCard` class exports) |
| Logic | `useState` ×5; form submit handler; fetch POST `/api/auth/register`. No try/catch. |
| Split needed | **Yes** (small) |
| Lines | 97 |
| Last author | Yolanda |

### Page-specific components

#### `app/(app)/documents/[id]/DocumentSummary.tsx`
| | |
|---|---|
| Used by | `/documents/[id]` |
| Type | Page-specific component |
| Kind | no directive (imported by a client page) |
| Styling | Tailwind |
| Logic | Splits text into paragraphs (pure) |
| Split needed | **No** |
| Lines | 16 |
| Last author | Marcos Salazar |

#### `app/(app)/meetings/[id]/FollowMeetingButton.tsx`
| | |
|---|---|
| Used by | `/meetings/[id]` |
| Type | Page-specific component |
| Kind | client |
| Styling | **CSS Modules** (shares `meetings.module.css`) |
| Logic | 8-state status machine; `useState` ×5, `useEffect` ×2, `useRef` ×3; fetch GET/PUT/DELETE `/api/followed-meetings/[id]`; native `<dialog>` `showModal()` / `close()` driven by state; in-flight guard ref; auth check (token + 401). |
| Split needed | **Yes** |
| Lines | 188 |
| Last author | Eriein |

#### `app/(app)/preferences/TownPreferences.tsx`
| | |
|---|---|
| Used by | `/preferences` |
| Type | Page-specific component |
| Kind | client |
| Styling | Tailwind |
| Logic | `useState` ×8, `useEffect`, `useRef`; fetch GET/PUT `/api/followed-towns`; form submit handler; toggle; retry; auth check (shows the login prompt for the whole Preferences page). |
| Split needed | **Yes** |
| Lines | 154 |
| Last author | Marcos Salazar |

#### `app/(app)/preferences/TopicPreferences.tsx`
| | |
|---|---|
| Used by | `/preferences` |
| Type | Page-specific component |
| Kind | client |
| Styling | Tailwind |
| Logic | `useState` ×7, `useEffect`, `useRef`; fetch GET/PUT `/api/followed-topics`; form submit handler; toggle. Renders nothing when signed out (relies on `TownPreferences` to show the prompt). Nearly identical to `TownPreferences`. |
| Split needed | **Yes** |
| Lines | 128 |
| Last author | Kailun Ju |

### Style files (not components, but part of the restyle)

| File | Lines | Last author | Used by | Notes |
|---|---|---|---|---|
| `app/globals.css` | 56 | Marcos Salazar | Root layout | Defines all theme color tokens as CSS variables, using the Figma prototype's Local Lookout palette (light green-grey neutrals, green accent, dark green sidebar). Each value's comment names the prototype token it comes from. The body uses a flat `surface` background. |
| `app/(app)/meetings/meetings.module.css` | 298 | Yolanda | `/meetings`, `/meetings/[id]`, `FollowMeetingButton` | Uses the same tokens; each comment names the prototype token the value comes from. Its rules copy the look of the shared primitives in `app/components/ui/` (`.button` = `Button` primary, `.secondaryButton` = secondary, `.message` / `.error` = `Alert` success / error, `.eyebrow` / `.heading` = `PageShell`) instead of importing them. |
| `tailwind.config.js` | 57 | Marcos Salazar | All Tailwind files | Maps the tokens. `content` scans `app/**`, `components/**` and `lib/**`. |

> **Resolved:** `STATUS_STYLES` in `lib/extractions.ts` holds class names like `border-warning-vivid/40`, `bg-info-vivid/10`, `text-info-soft`, `border-accent-vivid/40` and `bg-danger-vivid/10`, which appear nowhere in `app/`. `content` now includes `./lib/**/*.{ts,tsx}`, so Tailwind generates them and the extraction status pills on `/extract` and `/extractions/[id]` get their border and background colors.

---

## 2. Skipped files (logic only, no JSX)

Listed so you can confirm nothing was missed.

**Data hooks inside `app/` (`.ts`, return state, no JSX)**
- `app/(app)/documents/useDocuments.ts` (52 lines, Marcos Salazar)
- `app/(app)/documents/[id]/useDocument.ts` (59 lines, Marcos Salazar)

These two are the model for the logic/view split recommended below.

**API routes (`app/api/**/route.ts`)**: 22 files
`auth/login`, `auth/register`, `documents`, `documents/[id]`, `extractions`, `extractions/[id]`, `extractions/[id]/run`, `extractions/documents`, `followed-meetings/[meetingId]`, `followed-topics`, `followed-towns`, `matching-meetings`, `meetings`, `meetings/[id]`, `profile`, `profile/avatar`, `retrieval/meetings`, `summaries/process`, `topic-tagging`, `topics`, `towns`, `towns/[townId]`

**`lib/`**: 21 files, all `.ts`, none render JSX
`supabase.ts`, `residentAuth.ts`, `extractions.ts` (UI helpers: `STATUS_STYLES`, date formatters, labels; no JSX), `towns.ts`, `meetingTagging.ts`, `topicTagger.ts`, `extraction/findOfficials.ts`, `extraction/runExtraction.ts`, `retrieval/hashFile.ts`, `retrieval/insertDocument.ts`, `retrieval/retrieveDocuments.ts`, `retrieval/saveMeetings.ts`, `retrieval/storeDocumentFile.ts`, `sources/civicclerk.ts`, `sources/civicclerkFiles.ts`, `sources/types.ts`, `summaries/attempts.ts`, `summaries/processSecret.ts`, `summaries/readStoredPdf.ts`, `summaries/runSummaryJob.ts`, `summaries/summarize.ts`

**Config**: `next.config.js`, `postcss.config.js`, `tailwind.config.js`, `tsconfig.json`, `vitest.config.ts`, `next-env.d.ts`, `package.json`, `.env.example`

**Other non-UI**: `__tests__/**` (37 test files + 1 fixture), `supabase/**` (SQL), `docs/**` (except `figma-reference/`, which is excluded)

There are no server actions (`'use server'`) and no custom hooks outside the two listed above.

---

## 3. Summary

### All UI pages, sorted by route

| Route | File | Kind | Styling | Data loading | Auth check | Split? | Lines | Last author |
|---|---|---|---|---|---|---|---|---|
| `/` | `app/page.tsx` | server | Tailwind | none | none | No | 75 | Yolanda |
| `/admin/towns` | `app/admin/towns/page.tsx` | client | Tailwind | fetch ×3 | token only | **Yes** | 231 | Marcos Salazar |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | server | Tailwind | Supabase direct | **none** | **Yes** | 159 | Yolanda |
| `/documents` | `app/(app)/documents/page.tsx` | client | Tailwind | via hook | via hook | No | 36 | Marcos Salazar |
| `/documents/[id]` | `app/(app)/documents/[id]/page.tsx` | client | Tailwind | via hook | via hook | No | 37 | Marcos Salazar |
| `/extract` | `app/(app)/extract/page.tsx` | client | Tailwind | fetch ×4 | token + 401 | **Yes** | 358 | antikvng |
| `/extractions/[id]` | `app/(app)/extractions/[id]/page.tsx` | client | Tailwind | fetch + poll | token + 401 + 403 | **Yes** | 255 | antikvng |
| `/login` | `app/login/page.tsx` | client | Tailwind | fetch ×1 | writes token | **Yes** | 85 | Yolanda |
| `/meetings` | `app/(app)/meetings/page.tsx` | client | CSS Modules | fetch ×2 | **none** | **Yes** | 178 | Marcos |
| `/meetings/[id]` | `app/(app)/meetings/[id]/page.tsx` | client | CSS Modules + inline | fetch ×1 | none (button has its own) | **Yes** | 209 | Yolanda |
| `/preferences` | `app/(app)/preferences/page.tsx` | server | Tailwind | in children | in children | No | 21 | Kailun Ju |
| `/profile` | `app/(app)/profile/page.tsx` | client | Tailwind | fetch ×4 + upload | token only | **Yes** | 232 | Marcos Salazar |
| `/register` | `app/register/page.tsx` | client | Tailwind | fetch ×1 | none | **Yes** | 97 | Yolanda |
| `/search` | `app/(app)/search/page.tsx` | server | Tailwind | none | none | No | 35 | Yolanda |

Non-page UI files: `app/layout.tsx`, `app/(app)/layout.tsx`, `Sidebar.tsx`, `AuthCard.tsx`, and `DocumentSummary.tsx` don't need a split. `FollowMeetingButton.tsx`, `TownPreferences.tsx` and `TopicPreferences.tsx` do.

### Safest to restyle first

These are display-only or already split, so a restyle can't break data flow:

1. `app/page.tsx` (landing)
2. `app/(app)/search/page.tsx`
3. `app/components/AuthCard.tsx`: one change restyles both auth pages, including the `inputClass` and `primaryButtonClass` exports.
4. `app/(app)/preferences/page.tsx` (the shell only)
5. `app/(app)/documents/page.tsx` and `app/(app)/documents/[id]/page.tsx`: logic already lives in `useDocuments` / `useDocument`.
6. `app/(app)/documents/[id]/DocumentSummary.tsx`
7. `app/layout.tsx`, `app/(app)/layout.tsx`
8. `app/components/Sidebar.tsx`: safe for classes, but keep the `aria-*` attributes, refs and the `md:` breakpoint behavior (SRS-510/511).
9. `app/globals.css` tokens: changing token values restyles everything at once, including the CSS Module.

### Riskiest

Ranked by how much logic is tangled into the JSX and how bad a regression would be:

1. **`app/(app)/extract/page.tsx`** (358 lines): 4 fetches including a fire-and-forget run trigger, token clearing on 401, and derived search, group and pagination state computed inline in the render body. It enforces the SRS-301.3 disabled rule and the SRS-306.3 duplicate guard, and has no try/catch on initial load.
2. **`app/(app)/extractions/[id]/page.tsx`** (255 lines): polling interval, a one-shot auto-run effect guarded by a ref, and the **SRS-310.2 ownership check**. On 403 the page must render "Access denied" and nothing else, so a restyle that hoists the header or card out of the branch would leak that the extraction exists.
3. **`app/(app)/profile/page.tsx`** (232 lines): 4 handlers, including a multipart avatar upload; three UI modes (create, view, edit) in one component; no error handling on any fetch.

Close behind:
- `FollowMeetingButton.tsx`: an 8-state machine coupled to a native `<dialog>`.
- `admin/towns/page.tsx`: an admin form with no client-side role gate.
- `dashboard/page.tsx`: a server component that queries Supabase with the service-role key. **Never add `'use client'` to it while restyling.** That would break it and try to pull server-only code into the browser bundle.

### Duplicated UI patterns that should become shared components

| Pattern | Where it's repeated | Suggested component |
|---|---|---|
| **"You must be logged in" + "Go to login" block** | `TownPreferences`, `profile`, `admin/towns`, `extract`, `extractions/[id]`, `documents`, `documents/[id]`, `FollowMeetingButton` (8 copies, with 3 different markups) | `<SignedOutNotice message=… />` and a `useAccessToken()` hook |
| **Full-screen "Loading…"** | `profile`, `admin/towns`, `extract`, `extractions/[id]` (identical `<main>` block); inline variants in 5 more files | `<PageLoading />`, or a route-level `loading.tsx` |
| **Alert / status message box** (danger and success) | `login`, `register`, `TownPreferences` ×3, `TopicPreferences` ×3, `profile`, `admin/towns` ×2, `extract` ×2, `extractions/[id]` ×2, `meetings.module.css` `.error` / `.message` | `<Alert tone="error" \| "success">` |
| **Primary button**, in 4 different looks | `bg-sidebar-active` (landing, search, `AuthCard`); `bg-accent-strong rounded-xl` (preferences ×2, profile, admin); `bg-accent-strong rounded-full` (extract); CSS-module `.button` (meetings, follow) | `<Button variant="primary">` |
| **Secondary / pill button** | `rounded-full border border-line bg-raised px-4 py-2 text-sm hover:border-accent-strong hover:text-accent-soft` appears 7 times; `rounded-xl border border-line bg-raised` Cancel buttons ×2; `rounded-full border border-line px-5 py-2` ×2; CSS `.secondaryButton` | `<Button variant="secondary">` |
| **Card / panel**, in 3 styles | `rounded-xl border-line bg-card p-6` (landing, dashboard, search, `AuthCard`); `rounded-3xl border-raised bg-card/90 shadow-2xl` (preferences, profile, admin, extract ×3, extractions ×2); CSS `.card` (meetings) | `<Card>` |
| **Page shell** | Pages inside `(app)` now use `PageShell` (dashboard, documents, search) or copy its `<main>` classes `min-w-0 flex-1 p-4 text-fg sm:p-8` where it would add an unwanted `<h1>` (documents/[id], extract, extractions/[id], preferences, profile). CSS `.main` (meetings) uses the same padding. Only `admin/towns`, outside `(app)`, still uses the old centered card. | `<PageShell title eyebrow>` (done) |
| **Eyebrow label** | `text-sm uppercase tracking-[0.25em] text-accent` in preferences, profile, admin, extract, extractions; CSS `.eyebrow` | part of `<PageShell>` or `<Eyebrow>` |
| **Text input + label** | `AuthCard.inputClass`; profile ×3 inline copies; `admin/towns` `inputClass()`; extract search box | `<TextField>` |
| **Checkbox follow list + Save** | `TownPreferences` and `TopicPreferences` share near-identical markup **and** logic | `<FollowChecklist>` + `useFollowedItems(endpoint, key)` |
| **Status / type badges** | `STATUS_STYLES` pills (extract, extractions); `DocumentTypeBadge` (meetings/[id]); "Selected" pill (extract) | `<Badge tone=…>` |
| **"Not provided" helpers + meeting time formatting** | `TextOrNotProvided`, `LinkOrNotProvided`, `NOT_PROVIDED` and `formatStartTime` are each written twice (meetings, meetings/[id]); `dashboard` has a third time formatter | move to a `meetings/` shared module and `lib/` |
| **Meeting card / row** | dashboard meeting cards; meetings table rows; extract meeting groups | `<MeetingCard>` |
| **Brand mark** (Landmark icon + "Civic Radar") | `page.tsx` header, `AuthCard`, `Sidebar` `Brand` | export `Brand` from `Sidebar` or `<Logo>` |
| **Text colors** | Resolved: the restyled files use the `text-fg` / `text-on-dark` tokens, and no `text-white` is left in `app/` | `text-fg` (done) |
| **"Back to home" footer link** | preferences, profile, admin, extract all link to `/` (the public landing page), not `/dashboard`, even when the sidebar is visible | remove inside `(app)`, or point at `/dashboard` |

### Suggested order of work

1. Done: fix the Tailwind `content` glob (one line) so the `lib/` class names are generated.
2. Build the shared primitives (`Button`, `Card`, `Alert`, `TextField`, `Badge`, `PageShell`, `SignedOutNotice`) and restyle the safe files with them.
3. Split the "Yes" files using the `useDocuments` / `useDocument` pattern (a `useX.ts` hook that returns a status union, plus a thin view), starting with `TownPreferences` / `TopicPreferences` (they share one hook) and `login` / `register`.
4. Leave `extract`, `extractions/[id]` and `profile` for last, ideally with a few component tests in place first; today only the Documents list and detail pages are rendered by tests.
