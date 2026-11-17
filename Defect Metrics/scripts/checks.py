"""Counts each total two ways: from issues.json (our tables) and with GitHub's issue search.
python3 checks.py issues.json "<searched at>"  -> writes search.json (keeps the spot and cleanup lists)."""
import json, subprocess, sys
from build import defect_rows
from lib import load, is_bug_report, labels, et_date
R = 'Civic-Radar/civicradar-project'
issues = load(sys.argv[1]); rows = defect_rows(issues)
def gh(q):
    return int(subprocess.run(['gh', 'api', '-X', 'GET', 'search/issues', '-f', f'q=repo:{R} {q}', '-q', '.total_count'], capture_output=True, text=True, check=True).stdout)
niy = [i for i in issues if is_bug_report(i) and 'Not Implemented yet' in labels(i)]
first_day = min(r['found'] for r in rows)
rows_spec = [
  ['Every issue', 'is:issue', len(issues)],
  ['Defects found', 'is:issue label:Defects', len(rows)],
  ['Defects closed as Completed', 'is:issue label:Defects is:closed reason:completed', sum(1 for r in rows if r['closed'])],
  ['Defects still open', 'is:issue label:Defects is:open', sum(1 for r in rows if r['open'])],
  ['Defects closed as Not planned', 'is:issue label:Defects is:closed reason:"not planned"', sum(1 for r in rows if not r['open'] and not r['closed'])],
  ['Labeled Not Implemented yet', 'is:issue label:"Not Implemented yet"', len(niy)],
  ['Defects filed by MS', 'is:issue label:Defects author:marcos-j-salazar', sum(1 for r in rows if r['author'] == 'marcos-j-salazar')],
  ['Defects fixed by YA', 'is:issue label:Defects is:closed reason:completed assignee:yampomah', sum(1 for r in rows if r['closed'] and 'yampomah' in r['assignees'])],
  ['Defects fixed by AO', 'is:issue label:Defects is:closed reason:completed assignee:antikvng', sum(1 for r in rows if r['closed'] and 'antikvng' in r['assignees'])],
]
try:
    old = load('search.json')
except FileNotFoundError:
    old = {}
out = dict(old, searched=sys.argv[2], rows=[[w, q, gh(q), ours] for w, q, ours in rows_spec])
json.dump(out, open('search.json', 'w'), indent=1)
for r in out['rows']: print(r, 'OK' if r[2] == r[3] else 'MISMATCH')
