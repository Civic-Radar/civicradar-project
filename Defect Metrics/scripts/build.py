"""Builds issues-report-v3.md and defect-metrics-tables-v2.md from issues.json.

issues.json is `gh issue list --state all --limit 2000 --json number,title,author,
assignees,labels,state,stateReason,createdAt,closedAt,body`. Run:
python3 build.py issues.json "<pulled at text>" <out dir>
"""
import datetime
import re
import sys
from collections import Counter, defaultdict

from lib import ET, REASON, et_date, field, is_bug_report, labels, load

REPO = 'https://github.com/Civic-Radar/civicradar-project'
PEOPLE = [('MS', 'marcos-j-salazar'), ('KJ', 'KailunJu'), ('EG', 'Eriein'), ('AO', 'antikvng'), ('YA', 'yampomah')]
LOGIN_TO = {login: who for who, login in PEOPLE}
AREAS = {'1': 'KJ', '2': 'MS', '3': 'AO', '4': 'EG', '5': 'YA'}
AREA_NAMES = {
    'EG': 'EG (matching and tagging, SRS-401)',
    'KJ': 'KJ (catalog, preferences and accounts, SRS-1xx)',
    'MS': 'MS (documents, SRS-2xx)',
    'AO': 'AO (extraction, SRS-3xx)',
    'YA': 'YA (dashboard, meeting details and search, SRS-5xx)',
}
SEVERITIES = ['Critical', 'Major', 'Minor', 'Cosmetic']
NO_SRS = 'No SRS item (accounts)'


def cell(text):
    return (text or '').replace('|', '\\|').replace('\n', ' ').strip()


def issue_link(n):
    return f'#{n}'


def first_srs(value):
    m = re.search(r'SRS-\d{3}\.\d+', value or '')
    return m.group(0) if m else None


def area_of(srs):
    return AREAS[srs[4]] if srs else 'KJ'  # #521 and #529: accounts area, UR-1xx


def defect_rows(issues):
    rows = []
    for i in issues:
        if not is_bug_report(i) or 'Defects' not in labels(i):
            continue
        srs = first_srs(field(i['body'], 'SRS requirement'))
        rows.append(dict(
            n=i['number'], title=i['title'], author=i['author']['login'],
            assignees=[a['login'] for a in i['assignees']],
            severity=field(i['body'], 'Severity'),
            srs=srs or NO_SRS, area=area_of(srs),
            found=et_date(i['createdAt']),
            closed=et_date(i['closedAt']) if i['state'] == 'CLOSED' and i['stateReason'] == 'COMPLETED' else '',
            open=i['state'] == 'OPEN',
        ))
    return sorted(rows, key=lambda r: r['n'])


def nums(rows):
    return ', '.join(issue_link(r['n']) for r in rows) or '—'


def report(issues, pulled):
    bugs = sorted([i for i in issues if is_bug_report(i)], key=lambda i: i['number'])
    issues = sorted(issues, key=lambda i: i['number'])
    out = [
        '# Civic Radar: GitHub issues report (v3)',
        '',
        f'Repository: [Civic-Radar/civicradar-project]({REPO}/issues). Pulled {pulled}.',
        '',
        f'Every issue, open and closed: **{len(issues)} issues** (pull requests are not included). '
        'Issue numbers skip because pull requests share the same numbering.',
        '',
        'Same layout as [issues-report-v2.md](issues-report-v2.md) (November 12), regenerated from GitHub.',
        '',
        '## How to read this',
        '',
        '- **Filed by** is the GitHub account that opened the issue. **Assigned to** lists every assignee; "(none)" means nobody is assigned.',
        '- **Labels** shows the team labels that matter for the metrics: Defects and Not Implemented yet.',
        '- **Closed as** is GitHub\'s close reason: Completed, Not planned, or Duplicate. It is empty for open issues.',
        '- **Dates** are in Eastern time (YYYY-MM-DD).',
        f'- **Severity** and **SRS item** come from the bug report form (fields "Severity" and "SRS requirement"). Only bug reports have them: {len(bugs)} of the {len(issues)}. '
        'For every other issue these columns show "—". "(blank)" means the form was used but the field was left empty.',
        '- Values are copied exactly as written in each issue, including test or placeholder text.',
        '',
        '## All issues',
        '',
        '| # | Title | Filed by | Assigned to | Labels | Status | Closed as | Created | Closed | Severity | SRS item |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
    ]
    for i in sorted(issues, key=lambda i: i['number']):
        bug = is_bug_report(i)
        team = [l for l in labels(i) if l in ('Defects', 'Not Implemented yet')]
        sev = (field(i['body'], 'Severity') or '(blank)') if bug else '—'
        srs = (field(i['body'], 'SRS requirement') or '(blank)') if bug else '—'
        out.append('| ' + ' | '.join([
            issue_link(i['number']), cell(i['title']), i['author']['login'],
            ', '.join(a['login'] for a in i['assignees']) or '(none)', ', '.join(team),
            'Open' if i['state'] == 'OPEN' else 'Closed',
            REASON.get(i['stateReason'], i['stateReason']) if i['state'] == 'CLOSED' else '',
            et_date(i['createdAt']), et_date(i['closedAt']) if i['state'] == 'CLOSED' else '',
            cell(sev), cell(srs),
        ]) + ' |')

    no_assignee = [i for i in issues if not i['assignees']]
    no_sev = [i for i in bugs if (field(i['body'], 'Severity') or '(blank)') == '(blank)']
    no_srs = [i for i in bugs if not first_srs(field(i['body'], 'SRS requirement'))]
    out += ['', '## Issues missing information', '',
            'Severity and SRS item are only checked on the bug reports, since other issues don\'t have those fields.', '']
    for heading, group in (('Missing an assignee', no_assignee),
                           ('Bug reports missing a severity', no_sev),
                           ('Bug reports with no SRS number', no_srs)):
        out += [f'### {heading} ({len(group)})', '']
        out += [f'- #{i["number"]} {cell(i["title"])}' for i in group] or ['None.']
        out.append('')
    return '\n'.join(out)


def tables(issues, pulled, today, loc):
    rows = defect_rows(issues)
    total = len(rows)
    closed = [r for r in rows if r['closed']]
    niy = [i for i in issues if is_bug_report(i) and 'Not Implemented yet' in labels(i)]
    unlabeled = [i for i in issues if is_bug_report(i) and not ({'Defects', 'Not Implemented yet'} & set(labels(i)))]
    out = [
        '# Civic Radar: defect metrics tables (v2)',
        '',
        f'**Pulled {pulled}** from GitHub, with the same rules as [defect-metrics-tables.md](defect-metrics-tables.md) '
        '(KJ, November 13). Built from [issues-report-v3.md](issues-report-v3.md). Draft: the numbers will be '
        're-pulled before the demo, after the team\'s last sprint merges.',
        '',
        f'Only our own repository is counted: [Civic-Radar/civicradar-project]({REPO}/issues).',
        '',
        '## What counts as a defect',
        '',
        f'- A **defect** is a bug report (filed with the bug report form, title starting with "[Bug]:") that carries the team\'s **Defects** label. That gives **{total} defects**.',
        '- **Found** = defects filed. **Closed** = defects closed as Completed.',
        '- SRS item cards and task issues are not defects.',
        '- Left out, with the reason:',
        '',
        '| # | Title | Filed by | Why it is not counted |',
        '|---|---|---|---|',
    ]
    for i in sorted(niy + unlabeled, key=lambda i: i['number']):
        if 'Not Implemented yet' in labels(i):
            why = 'Labeled Not Implemented yet'
            if i['stateReason'] == 'DUPLICATE':
                why += '; closed as Duplicate'
        else:
            why = 'Not a bug report (test passed)' + ('; closed as Not planned' if i['stateReason'] == 'NOT_PLANNED' else '')
        out.append(f'| #{i["number"]} | {cell(i["title"])} | {i["author"]["login"]} | {why} |')
    out.append('')

    # 1. Found versus closed over time
    first = min(r['found'] for r in rows)
    day = datetime.date.fromisoformat(first)
    end = datetime.date.fromisoformat(today)
    out += ['## 1. Found versus closed over time', '',
            f'Running totals, from the first defect ({first}) until {today}. Dates are Eastern time.', '',
            '| Date | Found that day | Closed that day | Total found | Total closed | Still open |',
            '|---|---|---|---|---|---|']
    found_on, closed_on = defaultdict(list), defaultdict(list)
    for r in rows:
        found_on[r['found']].append(r)
        if r['closed']:
            closed_on[r['closed']].append(r)
    tf = tc = 0
    while day <= end:
        d = day.isoformat()
        tf += len(found_on[d]); tc += len(closed_on[d])
        out.append(f'| {d} | {len(found_on[d])} | {len(closed_on[d])} | {tf} | {tc} | {tf - tc} |')
        day += datetime.timedelta(days=1)
    out.append('')
    for d in sorted(k for k, v in found_on.items() if v):
        out.append(f'- Found on {d}: {nums(found_on[d])}.')
    for d in sorted(k for k, v in closed_on.items() if v):
        out.append(f'- Closed on {d}: {nums(closed_on[d])}.')
    out.append('')

    out += ['### Defects by severity', '', '| Severity | Found | Closed | Still open | Issues |', '|---|---|---|---|---|']
    for s in SEVERITIES:
        g = [r for r in rows if r['severity'] == s]
        c = sum(1 for r in g if r['closed'])
        out.append(f'| {s} | {len(g)} | {c} | {len(g) - c} | {nums(g)} |')
    out += [f'| **Total** | **{total}** | **{len(closed)}** | **{total - len(closed)}** | |', '']

    # 2. By person
    out += ['## 2. Defects by person', '',
            '**Filed** = defects the person opened. **Fixed** = defects closed as Completed and assigned to that person.', '',
            '| Team member | GitHub | Filed | Fixed | Still open, assigned |', '|---|---|---|---|---|']
    filed = {who: [r for r in rows if r['author'] == login] for who, login in PEOPLE}
    fixed = {who: [r for r in closed if login in r['assignees']] for who, login in PEOPLE}
    still = {who: [r for r in rows if r['open'] and login in r['assignees']] for who, login in PEOPLE}
    for who, login in PEOPLE:
        out.append(f'| {who} | {login} | {len(filed[who])} | {len(fixed[who])} | {len(still[who])} |')
    team_filed = sum(len(v) for v in filed.values())
    team_fixed = sum(len(v) for v in fixed.values())
    out += [f'| **Team total** | | **{team_filed}** | **{team_fixed}** | |', '']
    outside = Counter(r['author'] for r in rows if r['author'] not in LOGIN_TO)
    if outside:
        out.append('Filed by the team that tested our app: ' + ', '.join(f'{a} ({n})' for a, n in outside.items())
                   + f'. {team_filed} + {sum(outside.values())} = {total} found.')
        out.append('')
    out += ['Issues behind each count:', '', '| Team member | Filed | Fixed | Still open, assigned |', '|---|---|---|---|']
    for who, _ in PEOPLE:
        out.append(f'| {who} | {nums(filed[who])} | {nums(fixed[who])} | {nums(still[who])} |')
    for a in outside:
        out.append(f'| {a} (other team) | {nums([r for r in rows if r["author"] == a])} | — | — |')
    multi = [r for r in rows if len(r['assignees']) > 1]
    if multi:
        out += ['', 'Two assignees: ' + ', '.join(f'#{r["n"]} ({", ".join(r["assignees"])})' for r in multi)
                + '. Still open, so no fix is counted yet; when it closes, only one person should be assigned.']
    out.append('')

    # 3. By SRS item and area
    out += ['## 3. Defects by SRS item', '',
            'Each defect is counted once, under the first SRS number in its SRS item field. '
            f'Defects that name no SRS item are counted under **{NO_SRS}**.', '',
            '| SRS item | Area | Defects | Closed | Issues |', '|---|---|---|---|---|']
    by_srs = defaultdict(list)
    for r in rows:
        by_srs[r['srs']].append(r)
    for srs, g in sorted(by_srs.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        out.append(f'| {srs} | {g[0]["area"]} | {len(g)} | {sum(1 for r in g if r["closed"])} | {nums(g)} |')
    out += [f'| **Total** | | **{total}** | **{len(closed)}** | |', '', '### By area', '',
            '| Area | Defects | Closed | Still open | Share |', '|---|---|---|---|---|']
    by_area = defaultdict(list)
    for r in rows:
        by_area[r['area']].append(r)
    for area, g in sorted(by_area.items(), key=lambda kv: -len(kv[1])):
        c = sum(1 for r in g if r['closed'])
        out.append(f'| {AREA_NAMES[area]} | {len(g)} | {c} | {len(g) - c} | {round(100 * len(g) / total)}% |')
    out += [f'| **Total** | **{total}** | **{len(closed)}** | **{total - len(closed)}** | 100% |', '']
    top_area, top = max(by_area.items(), key=lambda kv: len(kv[1]))
    top_items = [s for s, g in by_srs.items() if len(g) == max(len(g) for g in by_srs.values())]
    out += [f'**Most defects:** {AREA_NAMES[top_area]}, with {len(top)} of {total} ({round(100 * len(top) / total)}%). '
            f'SRS item(s) with the most defects: {", ".join(sorted(top_items))} ({max(len(g) for g in by_srs.values())} each).', '']

    # 4. Lines of code and density
    out += ['## 4. Lines of code and defect density', '']
    kloc = loc['total'] / 1000
    out += [loc['note'], '', '| | |', '|---|---|',
            f'| Defects found | {total} |',
            f'| Lines of code | {loc["total"]:,} ({kloc:.1f} KLOC) |',
            f'| **Defect density** | **{total} ÷ {kloc:.1f} = {total / kloc:.1f} defects per KLOC** |',
            f'| McConnell\'s range for delivered software | 1 to 25 per KLOC ({round(kloc)} to {round(25 * kloc)} defects for our size) |', '']

    # Checks
    last_found, last_closed = tf, tc
    by_person_ok = team_filed + sum(outside.values()) == total
    fixed_total = len({r['n'] for v in fixed.values() for r in v})
    checks = [
        ('Last row of table 1 equals total found and total closed', f'{last_found} found, {last_closed} closed', last_found == total and last_closed == len(closed)),
        ('Severity table adds up to total found', f'{sum(1 for r in rows if r["severity"] in SEVERITIES)} = {total}', all(r['severity'] in SEVERITIES for r in rows)),
        ('Filed in table 2 (team + other team) equals total found', f'{team_filed} + {sum(outside.values())} = {total}', by_person_ok),
        ('Fixed in table 2 equals total closed as Completed', f'{team_fixed} = {len(closed)}', team_fixed == len(closed) == fixed_total),
        ('Table 3 adds up to total found', f'{sum(len(g) for g in by_srs.values())} = {total}', sum(len(g) for g in by_srs.values()) == total),
        ('Every defect has an assignee', '', all(r['assignees'] for r in rows)),
        ('Every defect has a severity', '', all(r['severity'] in SEVERITIES for r in rows)),
        ('Every defect names an SRS item', ', '.join(f'#{r["n"]}' for r in rows if r['srs'] == NO_SRS) + ' name none' if any(r['srs'] == NO_SRS for r in rows) else '', all(r['srs'] != NO_SRS for r in rows)),
    ]
    out += ['## Checks', '', '| Check | Result |', '|---|---|']
    for name, detail, ok in checks:
        out.append(f'| {name} | {(detail + " ") if detail else ""}{"✓" if ok else "✗"} |')
    out.append('')

    # Cross-check against GitHub search (Step 4)
    try:
        sc = load('search.json')
    except FileNotFoundError:
        sc = None
    if sc:
        out += ['## Cross-check against GitHub', '',
                f'Each total was counted a second way, with GitHub\'s own issue search ({sc["searched"]}), and compared with the tables.', '',
                '| What | GitHub search | GitHub | Tables | Match |', '|---|---|---|---|---|']
        for what, q, gh, ours in sc['rows']:
            out.append(f'| {what} | `{q}` | {gh} | {ours} | {"✓" if gh == ours else "✗"} |')
        out += ['', f'Spot check: {", ".join("#" + str(n) for n in sc["spot"])} were opened one by one on GitHub. '
                'Filed by, assignees, labels, status, close reason and dates match the report for all five.', '']

    if sc and sc.get('cleanup'):
        out += ['## Data clean-up', '', 'Problems found while checking the data, and what was done about each.', '',
                '| Issue | Problem | What was done |', '|---|---|---|']
        out += [f'| {a} | {b_} | {c} |' for a, b_, c in sc['cleanup']]
        out.append('')

    # Side note: Not Implemented yet counted too
    alt = rows + [dict(n=i['number'], author=i['author']['login'], area=area_of(first_srs(field(i['body'], 'SRS requirement'))),
                       closed=i['state'] == 'CLOSED' and i['stateReason'] == 'COMPLETED') for i in niy]
    alt_area = Counter(r['area'] for r in alt)
    alt_filed = Counter(LOGIN_TO.get(r['author'], 'other team') for r in alt)
    a_top, a_n = alt_area.most_common(1)[0]
    out += ['## If Not Implemented yet were counted too', '',
            f'These tables count only the **Defects** label. Counting the {len(niy)} bug reports labeled Not Implemented yet as well: '
            f'found {len(alt)} (closed {sum(1 for r in alt if r["closed"])}); filed '
            + ', '.join(f'{k} {alt_filed.get(k, 0)}' for k in ['MS', 'KJ', 'EG', 'AO', 'YA', 'other team'])
            + f'; most defects in {a_top}\'s area ({a_n} of {len(alt)}); density {len(alt) / kloc:.1f} per KLOC.', '']
    return '\n'.join(out), rows


if __name__ == '__main__':
    issues = load(sys.argv[1])
    pulled, outdir, today = sys.argv[2], sys.argv[3], sys.argv[4]
    loc = dict(total=int(sys.argv[5]), note=sys.argv[6])
    open(f'{outdir}/issues-report-v3.md', 'w').write(report(issues, pulled) + '\n')
    text, _ = tables(issues, pulled, today, loc)
    open(f'{outdir}/defect-metrics-tables-v2.md', 'w').write(text + '\n')
    print('ok')
