import json, datetime, sys
from collections import defaultdict
from build import defect_rows, PEOPLE, SEVERITIES
from lib import load, is_bug_report, labels
issues = load('issues.json'); rows = defect_rows(issues); today = '2026-11-16'
first = datetime.date.fromisoformat(min(r['found'] for r in rows)); last = datetime.date.fromisoformat(today)
days = [(first + datetime.timedelta(d)) for d in range((last - first).days + 1)]
tl = []; f = c = 0
for d in days:
    s = d.isoformat(); nf = sum(r['found'] == s for r in rows); nc = sum(r['closed'] == s for r in rows)
    f += nf; c += nc; tl.append(dict(label=d.strftime('%a %-m/%-d'), nf=nf, nc=nc, f=f, c=c))
sev = [dict(name=s, closed=sum(1 for r in rows if r['severity']==s and r['closed']), open=sum(1 for r in rows if r['severity']==s and not r['closed'])) for s in SEVERITIES]
closed = [r for r in rows if r['closed']]
people = [dict(who=w, filed=sum(r['author']==l for r in rows), fixed=sum(l in r['assignees'] for r in closed), open=sum(r['open'] and l in r['assignees'] for r in rows)) for w,l in PEOPLE]
people.append(dict(who='Testing team', filed=sum(r['author'] not in {l for _,l in PEOPLE} for r in rows), fixed=0, open=0))
names={'YA':'YA: dashboard, search','EG':'EG: matching, tagging','KJ':'KJ: catalog, accounts','MS':'MS: documents','AO':'AO: extraction'}
by=defaultdict(list)
for r in rows: by[r['area']].append(r)
areas=[dict(name=names[a], code=a, closed=sum(1 for r in g if r['closed']), open=sum(1 for r in g if not r['closed'])) for a,g in sorted(by.items(), key=lambda kv:(-len(kv[1]),kv[0]))]
srs=defaultdict(list)
for r in rows: srs[r['srs']].append(r['n'])
top=[dict(srs=k, n=len(v), issues=v) for k,v in sorted(srs.items(), key=lambda kv:(-len(kv[1]),kv[0])) if len(v)>1]
json.dump(dict(total=len(rows), closed=len(closed), open=len(rows)-len(closed), loc=12340, timeline=tl, severity=sev, people=people, areas=areas, topsrs=top,
  niy=sum(1 for i in issues if is_bug_report(i) and 'Not Implemented yet' in labels(i))), open('deckdata.json','w'), indent=1)
print(open('deckdata.json').read()[:1500])
