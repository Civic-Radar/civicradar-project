import json, re, datetime, zoneinfo
ET = zoneinfo.ZoneInfo('America/New_York')
def load(p): return json.load(open(p))
def et_date(ts):
    if not ts: return ''
    return datetime.datetime.fromisoformat(ts.replace('Z','+00:00')).astimezone(ET).strftime('%Y-%m-%d')
def field(body, name):
    m = re.search(r'###\s*' + re.escape(name) + r'\s*\n+(.*?)(?=\n###|\Z)', body or '', re.S)
    if not m: return None
    v = m.group(1).strip()
    return '(blank)' if v in ('', '_No response_') else v
def labels(i): return [l['name'] for l in i['labels']]
def is_bug_report(i): return i['title'].startswith('[Bug]') or 'bug' in labels(i)
REASON = {'COMPLETED':'Completed','NOT_PLANNED':'Not planned','DUPLICATE':'Duplicate','REOPENED':'', None:''}
