"""Writes deckdata.json for deck.js from issues.json, other.json and search.json.
python3 export.py <today YYYY-MM-DD> <lines of code> <as-of text>"""
import json, datetime, sys
from collections import defaultdict
from build import defect_rows, PEOPLE, SEVERITIES, NO_SRS
from lib import load, is_bug_report, labels
today, loc, as_of = sys.argv[1], int(sys.argv[2]), sys.argv[3]
issues = load('issues.json'); rows = defect_rows(issues); other = load('other.json'); sc = load('search.json')
first = datetime.date.fromisoformat(min(r['found'] for r in rows)); last = datetime.date.fromisoformat(today)
tl = []; f = c = 0
for k in range((last - first).days + 1):
    d = first + datetime.timedelta(k); s = d.isoformat()
    nf = sum(r['found'] == s for r in rows); nc = sum(r['closed'] == s for r in rows); f += nf; c += nc
    tl.append(dict(label=d.strftime('%a %-m/%-d'), short=d.strftime('%-m/%-d'), nf=nf, nc=nc, f=f, c=c))
def avg(g):
    d = [r['days'] for r in g if r['days'] is not None]
    return round(sum(d) / len(d), 1) if d else None
sev = [dict(name=s, found=len(g), closed=sum(1 for r in g if r['closed']), open=sum(1 for r in g if not r['closed']), avg=avg(g),
            open_issues=[r['n'] for r in g if r['open']]) for s in SEVERITIES for g in [[r for r in rows if r['severity'] == s]]]
closed = [r for r in rows if r['closed']]
people = [dict(who=w, ours=sum(r['author'] == l for r in rows), other=sum(c_[1] == l for c_ in other['counted']),
               fixed=sum(l in r['assignees'] for r in closed), open=sum(r['open'] and l in r['assignees'] for r in rows),
               filed_issues=[r['n'] for r in rows if r['author'] == l], other_issues=[c_[0] for c_ in other['counted'] if c_[1] == l],
               fixed_issues=[r['n'] for r in closed if l in r['assignees']], open_issues=[r['n'] for r in rows if r['open'] and l in r['assignees']]) for w, l in PEOPLE]
testing = sum(r['author'] not in {l for _, l in PEOPLE} for r in rows)
names = {'YA': 'YA: dashboard, search', 'EG': 'EG: matching, tagging', 'KJ': 'KJ: catalog, accounts', 'MS': 'MS: documents', 'AO': 'AO: extraction'}
by = defaultdict(list)
for r in rows: by[r['area']].append(r)
areas = [dict(name=names[a], code=a, closed=sum(1 for r in g if r['closed']), open=sum(1 for r in g if not r['closed'])) for a, g in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0]))]
srs = defaultdict(list)
for r in rows: srs[(r['srs'], r['area'])].append(r)
srs_list = [dict(srs=('No SRS item' if k[0] == NO_SRS else k[0]), area=k[1], n=len(v), closed=sum(1 for r in v if r['closed']), issues=[r['n'] for r in v])
            for k, v in sorted(srs.items(), key=lambda kv: (-len(kv[1]), kv[0][0] == NO_SRS, kv[0][0]))]
open_rows = [r for r in rows if r['open']]
json.dump(dict(as_of=as_of, total=len(rows), closed=len(closed), open=len(open_rows), loc=loc, timeline=tl, severity=sev, avg_all=avg(rows),
               people=people, testing=testing, other=other, areas=areas, srs=srs_list, checks=sc,
               niy=sum(1 for i in issues if is_bug_report(i) and 'Not Implemented yet' in labels(i)), issues_total=len(issues)),
          open('deckdata.json', 'w'), indent=1)
print('ok', len(rows), len(closed), len(srs_list))
