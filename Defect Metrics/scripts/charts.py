"""Draws the five defect-metrics charts as SVG (16:9, light mode, for slides).

python3 charts.py issues.json <out dir> <today YYYY-MM-DD> <lines of code> "<as-of text>"
Colors: reference palette slots 1-3 (validated: scripts/validate_palette.js).
Found/Filed = blue, Closed/Fixed = orange, Still open = aqua, on every chart.
"""
import datetime
import sys
from collections import defaultdict
from xml.sax.saxutils import escape

from build import AREA_NAMES, PEOPLE, SEVERITIES, defect_rows
from lib import load

W, H = 1200, 675
SURFACE, INK, INK2, MUTED, GRID, AXIS = '#fcfcfb', '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7'
BLUE, ORANGE, AQUA = '#2a78d6', '#eb6834', '#1baf7a'
FONT = "font-family='Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif'"


def text(x, y, s, size=16, color=INK2, anchor='start', weight=400):
    return (f"<text x='{x:.1f}' y='{y:.1f}' font-size='{size}' fill='{color}' text-anchor='{anchor}' "
            f"font-weight='{weight}' {FONT}>{escape(str(s))}</text>")


def frame(title, subtitle, body, legend, as_of):
    parts = [f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' width='{W}' height='{H}'>",
             f"<rect width='{W}' height='{H}' fill='{SURFACE}'/>",
             text(48, 58, title, 30, INK, weight=600), text(48, 90, subtitle, 18, INK2)]
    x = 48
    for color, label in legend:
        parts.append(f"<rect x='{x}' y='112' width='14' height='14' rx='3' fill='{color}'/>")
        parts.append(text(x + 22, 124, label, 16, INK2))
        x += 40 + 9 * len(label)
    parts += body
    parts.append(text(W - 48, H - 22, as_of, 13, MUTED, 'end'))
    parts.append('</svg>')
    return '\n'.join(parts)


def bar_end(x, y, w, h, color, round_right=True):
    """Horizontal bar, 4px rounded at the data end only."""
    if w <= 0:
        return ''
    r = min(4, w / 2, h / 2)
    if not round_right:
        return f"<rect x='{x:.1f}' y='{y:.1f}' width='{w:.1f}' height='{h:.1f}' fill='{color}'/>"
    return (f"<path d='M{x:.1f},{y:.1f} h{w - r:.1f} a{r},{r} 0 0 1 {r},{r} v{h - 2 * r:.1f} "
            f"a{r},{r} 0 0 1 -{r},{r} h-{w - r:.1f} z' fill='{color}'/>")


def col_end(x, base, w, h, color):
    """Vertical bar from the baseline, 4px rounded at the top."""
    if h <= 0:
        return ''
    r = min(4, w / 2, h / 2)
    top = base - h
    return (f"<path d='M{x:.1f},{base:.1f} v-{h - r:.1f} a{r},{r} 0 0 1 {r},-{r} h{w - 2 * r:.1f} "
            f"a{r},{r} 0 0 1 {r},{r} v{h - r:.1f} z' fill='{color}'/>")


def nice_max(v, step):
    return max(step, ((v + step - 1) // step) * step)


def chart_over_time(rows, today, as_of):
    first = datetime.date.fromisoformat(min(r['found'] for r in rows))
    last = datetime.date.fromisoformat(today)
    days = [(first + datetime.timedelta(d)).isoformat() for d in range((last - first).days + 1)]
    found, closed, f, c = [], [], 0, 0
    for d in days:
        f += sum(1 for r in rows if r['found'] == d)
        c += sum(1 for r in rows if r['closed'] == d)
        found.append(f); closed.append(c)
    L, R, T, B = 90, W - 170, 160, H - 90
    ymax = nice_max(max(found), 5)
    x = lambda i: L + (R - L) * i / max(1, len(days) - 1)
    y = lambda v: B - (B - T) * v / ymax
    body = []
    for v in range(0, ymax + 1, 5):
        body.append(f"<line x1='{L}' x2='{R}' y1='{y(v):.1f}' y2='{y(v):.1f}' stroke='{GRID if v else AXIS}' stroke-width='1'/>")
        body.append(text(L - 12, y(v) + 5, v, 14, MUTED, 'end'))
    for i, d in enumerate(days):
        dt = datetime.date.fromisoformat(d)
        body.append(text(x(i), B + 28, dt.strftime('%a %-m/%-d'), 14, MUTED, 'middle'))
    # Open gap between the lines, lightly shaded.
    poly = ' '.join(f'{x(i):.1f},{y(v):.1f}' for i, v in enumerate(found)) + ' ' + \
           ' '.join(f'{x(i):.1f},{y(v):.1f}' for i, v in reversed(list(enumerate(closed))))
    body.append(f"<polygon points='{poly}' fill='{AQUA}' fill-opacity='0.12'/>")
    for series, color in ((found, BLUE), (closed, ORANGE)):
        pts = ' '.join(f'{x(i):.1f},{y(v):.1f}' for i, v in enumerate(series))
        body.append(f"<polyline points='{pts}' fill='none' stroke='{color}' stroke-width='2.5' stroke-linejoin='round'/>")
        for i, v in enumerate(series):
            body.append(f"<circle cx='{x(i):.1f}' cy='{y(v):.1f}' r='5' fill='{color}' stroke='{SURFACE}' stroke-width='2'/>")
    n = len(days) - 1
    body.append(text(x(n) + 14, y(found[-1]) + 6, f'{found[-1]} found', 17, INK, weight=600))
    body.append(text(x(n) + 14, y(closed[-1]) + 6, f'{closed[-1]} closed', 17, INK, weight=600))
    mid = (y(found[-1]) + y(closed[-1])) / 2
    body.append(text(x(n) + 14, mid + 6, f'{found[-1] - closed[-1]} open', 15, INK2))
    sub = f'Running totals of defects found and closed, {first.strftime("%b %-d")} to {last.strftime("%b %-d")}. The shaded gap is the defects still open.'
    return frame('Defects found vs. closed over time', sub, body,
                 [(BLUE, 'Total found'), (ORANGE, 'Total closed')], as_of)


def stacked_rows(title, sub, groups, as_of, label_width=330):
    """groups: [(label, closed, open)] drawn as horizontal stacked bars."""
    L, R, T = 48 + label_width, W - 120, 165
    total_max = nice_max(max(c + o for _, c, o in groups), 5)
    band = min(70, (H - 90 - T) / len(groups))
    bh = band * 0.56
    sx = lambda v: (R - L) * v / total_max
    body = []
    for v in range(0, total_max + 1, 5 if total_max > 10 else 1):
        gx = L + sx(v)
        body.append(f"<line x1='{gx:.1f}' x2='{gx:.1f}' y1='{T - 10}' y2='{T + band * len(groups)}' stroke='{GRID if v else AXIS}'/>")
        body.append(text(gx, T + band * len(groups) + 24, v, 14, MUTED, 'middle'))
    for k, (label, c, o) in enumerate(groups):
        y0 = T + k * band + (band - bh) / 2
        body.append(text(L - 16, y0 + bh / 2 + 6, label, 17, INK, 'end'))
        wc, wo = sx(c), sx(o)
        if c:
            body.append(bar_end(L, y0, wc, bh, ORANGE, round_right=(o == 0)))
            if wc > 28:
                body.append(text(L + wc / 2, y0 + bh / 2 + 6, c, 15, '#ffffff', 'middle', 600))
        if o:
            gap = 2 if c else 0
            body.append(bar_end(L + wc + gap, y0, wo - gap, bh, AQUA))
            if wo > 28:
                body.append(text(L + wc + wo / 2, y0 + bh / 2 + 6, o, 15, '#ffffff', 'middle', 600))
        body.append(text(L + wc + wo + 12, y0 + bh / 2 + 6, f'{c + o}', 17, INK, weight=600))
    return frame(title, sub, body, [(ORANGE, 'Closed'), (AQUA, 'Still open')], as_of)


def chart_severity(rows, as_of):
    groups = []
    for s in SEVERITIES:
        g = [r for r in rows if r['severity'] == s]
        groups.append((s, sum(1 for r in g if r['closed']), sum(1 for r in g if not r['closed'])))
    return stacked_rows('Defects by severity', 'Each defect once, by the severity on its bug report.', groups, as_of, 200)


def chart_area(rows, as_of):
    by = defaultdict(list)
    for r in rows:
        by[r['area']].append(r)
    short = {'EG': 'EG: matching and tagging', 'KJ': 'KJ: catalog and accounts', 'MS': 'MS: documents',
             'AO': 'AO: extraction', 'YA': 'YA: dashboard and search'}
    groups = [(short[a], sum(1 for r in g if r['closed']), sum(1 for r in g if not r['closed']))
              for a, g in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0]))]
    return stacked_rows('Where defects cluster: by area', 'Each defect once, under the area that owns its SRS item.',
                        groups, as_of, 290)


def chart_person(rows, as_of):
    closed = [r for r in rows if r['closed']]
    data = [(who, sum(1 for r in rows if r['author'] == login), sum(1 for r in closed if login in r['assignees']))
            for who, login in PEOPLE]
    outside = sum(1 for r in rows if r['author'] not in {login for _, login in PEOPLE})
    data.append(('Testing team', outside, 0))
    L, R, T, B = 90, W - 60, 165, H - 95
    ymax = nice_max(max(max(f, x) for _, f, x in data), 5)
    y = lambda v: (B - T) * v / ymax
    body = []
    for v in range(0, ymax + 1, 5):
        body.append(f"<line x1='{L}' x2='{R}' y1='{B - y(v):.1f}' y2='{B - y(v):.1f}' stroke='{GRID if v else AXIS}'/>")
        body.append(text(L - 12, B - y(v) + 5, v, 14, MUTED, 'end'))
    slot = (R - L) / len(data)
    bw = min(56, slot * 0.3)
    for k, (who, f, x_) in enumerate(data):
        cx = L + slot * (k + 0.5)
        for j, (v, color) in enumerate(((f, BLUE), (x_, ORANGE))):
            bx = cx - bw - 1 + j * (bw + 2)
            body.append(col_end(bx, B, bw, y(v), color))
            body.append(text(bx + bw / 2, B - y(v) - 10, v, 16, INK, 'middle', 600))
        body.append(text(cx, B + 30, who, 17, INK, 'middle'))
    return frame('Defects filed and fixed, by person',
                 'Filed = defects the person opened. Fixed = defects closed as Completed and assigned to them.',
                 body, [(BLUE, 'Filed'), (ORANGE, 'Fixed')], as_of)


def chart_density(rows, loc, as_of):
    kloc = loc / 1000
    density = len(rows) / kloc
    L, R, Y = 110, W - 110, 360
    sx = lambda v: L + (R - L) * v / 25
    body = [f"<rect x='{sx(1):.1f}' y='{Y - 38}' width='{sx(25) - sx(1):.1f}' height='76' rx='6' fill='{BLUE}' fill-opacity='0.12'/>",
            text(sx(13), Y - 52, "McConnell's range for delivered software: 1 to 25 defects per KLOC", 17, INK2, 'middle'),
            f"<line x1='{L}' x2='{R}' y1='{Y}' y2='{Y}' stroke='{AXIS}' stroke-width='2'/>"]
    for v in (0, 1, 5, 10, 15, 20, 25):
        body.append(f"<line x1='{sx(v):.1f}' x2='{sx(v):.1f}' y1='{Y - 6}' y2='{Y + 6}' stroke='{AXIS}' stroke-width='2'/>")
        body.append(text(sx(v), Y + 66, v, 15, MUTED, 'middle'))
    body.append(f"<circle cx='{sx(density):.1f}' cy='{Y}' r='11' fill='{ORANGE}' stroke='{SURFACE}' stroke-width='3'/>")
    body.append(text(sx(density) + 20, Y - 14, f'Civic Radar: {density:.1f}', 22, INK, weight=600))
    body.append(text(sx(13), Y + 120, f'{len(rows)} defects found / {kloc:.1f} KLOC = {density:.1f} defects per KLOC', 20, INK, 'middle', 600))
    body.append(text(sx(13), Y + 150, 'Low end of the range. Our count is defects found before release, so the comparison is rough.', 16, INK2, 'middle'))
    return frame('Defect density vs. industry range', 'Defects per 1,000 lines of code (tests and config not counted). Lines counted with cloc on main, Nov 16.',
                 body, [], as_of)


if __name__ == '__main__':
    issues = load(sys.argv[1])
    outdir, today, loc, as_of = sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
    rows = defect_rows(issues)
    charts = {
        '1-found-vs-closed': chart_over_time(rows, today, as_of),
        '2-severity': chart_severity(rows, as_of),
        '3-by-person': chart_person(rows, as_of),
        '4-by-area': chart_area(rows, as_of),
        '5-density': chart_density(rows, loc, as_of),
    }
    for name, svg in charts.items():
        open(f'{outdir}/{name}.svg', 'w').write(svg)
    print(' '.join(charts))
