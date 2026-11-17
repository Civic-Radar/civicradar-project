// Builds "Civic Radar Defect Metrics.pptx" from deckdata.json (written by export.py).
// Follows the CSC 351 Defect Metrics lecture example: one slide per required item, chart on
// the left with its table of numbers under it, takeaways on the right.
// node deck.js <deckdata.json> <out.pptx> <apply_theme.js path>
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const [, , dataPath, outPath, applyThemePath] = process.argv;
const { applyTheme } = require(applyThemePath);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const THEME = {
  name: 'Civic Radar QA', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '0B0B0B', lt1: 'FFFFFF', dk2: '17283B', lt2: 'EEF1F5', accent1: '2A78D6', accent2: 'EB6834',
    accent3: '1BAF7A', accent4: 'EDA100', accent5: '6250D6', accent6: '52514E', hlink: '2A78D6', folHlink: '6250D6' },
};
const HEX = { ink: '0B0B0B', ink2: '52514E', muted: '898781', grid: 'E1E0D9', axis: 'C3C2B7',
  blue: '2A78D6', orange: 'EB6834', aqua: '1BAF7A', navy: '17283B', tint: 'EEF1F5', white: 'FFFFFF' };

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333" x 7.5"
pres.title = 'Civic Radar Defect Metrics';
pres.subject = 'CSC 351 Sprint 5 QA metrics';
pres.author = 'Civic Radar team';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333, M = 0.6;
const LEFT_W = 8.1;                 // chart + table column
const RX = M + LEFT_W + 0.4;        // takeaways column
const RW = W - M - RX;
const KLOC = D.loc / 1000;
const DENSITY = D.total / KLOC;

pres.defineSlideMaster({
  title: 'TITLE_DARK', background: { color: HEX.navy },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.3, w: W - 2 * M, h: 1.4, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.9, w: W - 2 * M, h: 1.6, fontSize: 20, color: C.background2, valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT', background: { color: HEX.white },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.35, w: W - 2 * M, h: 0.8, fontSize: 32, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'Civic Radar · CSC 351 Sprint 5 · Defect metrics', options: { x: M, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.05, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
});

// ---------- helpers ----------
const chartText = { catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', legendFontFace: '+mn-lt', dataLabelFontFace: '+mn-lt',
  catAxisLabelColor: HEX.ink2, valAxisLabelColor: HEX.muted, legendColor: HEX.ink2, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
  legendFontSize: 12, dataLabelFontSize: 11, valAxisTitleFontSize: 12, catAxisTitleFontSize: 12, valAxisTitleColor: HEX.ink2, catAxisTitleColor: HEX.ink2,
  valAxisTitleFontFace: '+mn-lt', catAxisTitleFontFace: '+mn-lt' };
const gridOpts = () => ({ valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: 'none' }, catAxisLineColor: HEX.axis, valAxisLineShow: false });
const axes = (x, y) => ({ showCatAxisTitle: true, catAxisTitle: x, showValAxisTitle: true, valAxisTitle: y });

function caption(slide, text, y = 6.62) {
  slide.addText(text, { x: M, y, w: W - 2 * M, h: 0.3, fontSize: 10, italic: true, color: C.accent6, margin: 0, isTextBox: true, objectName: 'Data source' });
}

function table(slide, rows, opts) {
  const data = rows.map((r, i) => r.map((v, j) => {
    const cell = typeof v === 'object' && v !== null && 'text' in v ? v : { text: String(v) };
    const o = { align: j === 0 ? 'left' : 'center', color: HEX.ink, ...(cell.options || {}) };
    if (i === 0) Object.assign(o, { bold: true, color: HEX.white, fill: { color: HEX.navy } });
    else if (i % 2 === 0) o.fill = { color: HEX.tint };
    if (opts.boldLast && i === rows.length - 1) o.bold = true;
    return { text: cell.text, options: o };
  }));
  slide.addTable(data, { x: opts.x ?? M, y: opts.y, w: opts.w ?? LEFT_W, colW: opts.colW, fontSize: opts.fontSize ?? 11,
    rowH: opts.rowH ?? 0.25, margin: [1, 5, 1, 5], border: { type: 'solid', pt: 0.5, color: 'D5D8DE' }, valign: 'middle', objectName: opts.name });
}

function takeaways(slide, items, opts = {}) {
  slide.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })),
    { x: opts.x ?? RX, y: opts.y ?? 1.45, w: opts.w ?? RW, h: opts.h ?? 4.9, fontSize: opts.fontSize ?? 16, color: C.text1, margin: 0,
      paraSpaceAfter: 12, valign: 'top', isTextBox: true, objectName: opts.name ?? 'Takeaways' });
}

const evenCols = (first, n, w = LEFT_W) => [first, ...Array(n).fill((w - first) / n)];

// ---------- 1. Title ----------
pres.addSection({ title: 'Overview' });
let s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: 'Overview' });
s.addText('Civic Radar defect metrics', { placeholder: 'title' });
s.addText('CSC 351 · Sprint 5 QA\nFound versus closed, defects by person, density, clusters, and how we checked our data', { placeholder: 'body' });
s.addText(`${D.as_of}. Every total checked against GitHub.`, { x: M, y: 6.6, w: 9, h: 0.35, fontSize: 12, color: C.background2, margin: 0, isTextBox: true, objectName: 'Data source' });
s.addNotes('Our defect metrics for Sprint 5, pulled from our GitHub issues and checked against GitHub before charting.');

// ---------- 2. Found versus closed over time ----------
pres.addSection({ title: 'Metrics' });
const T = D.timeline;
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Found versus closed over time', { placeholder: 'title' });
s.addChart(pres.charts.LINE, [
  { name: 'Total found', labels: T.map(t => t.label), values: T.map(t => t.f) },
  { name: 'Total closed', labels: T.map(t => t.label), values: T.map(t => t.c) },
], { x: M, y: 1.2, w: LEFT_W, h: 3.75, chartColors: [HEX.blue, HEX.orange], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 7,
  showLegend: true, legendPos: 'b', showValue: true, dataLabelPosition: 't', dataLabelColor: HEX.ink2, valAxisMinVal: 0, valAxisMaxVal: 30, valAxisMajorUnit: 5,
  ...axes('Date (Eastern time)', 'Defects (running total)'), ...chartText, ...gridOpts(), objectName: 'Found versus closed chart' });
table(s, [
  ['Date', ...T.map(t => t.short)],
  ['Total found', ...T.map(t => t.f)],
  ['Total closed', ...T.map(t => t.c)],
  ['Still open', ...T.map(t => t.f - t.c)],
], { y: 5.1, colW: evenCols(1.3, T.length), name: 'Found versus closed table', boldLast: true });
const openSev = D.severity.filter(x => x.open > 0).map(x => `${x.open} ${x.name}`).join(', ');
const openNums = D.severity.flatMap(x => x.open_issues).map(n => '#' + n).join(', ');
takeaways(s, [
  `${D.total} found, ${D.closed} closed, ${D.open} still open`,
  `Found in three bursts of testing: Nov 10, 12 and 14`,
  `Fixing caught up Nov 16 and 17: ${T.slice(-2).reduce((a, t) => a + t.nc, 0)} defects closed in two days`,
  `The ${D.open} open defects are ${openSev} (${openNums}). None are Critical`,
  'Found has been flat since Nov 14. Nobody filed new defects while we fixed, so this is not proof that none are left',
]);
caption(s, `${D.as_of}. Defects = bug reports with the Defects label. Closed = closed as Completed.`);
s.addNotes(`Running totals, not daily counts. The gap between the lines is the backlog: ${D.open} open now. Found is flat since Nov 14 because nobody filed new bugs while we fixed; it does not mean there are none left.`);

// ---------- 3. Defects by person ----------
const P = D.people;
const totalOther = P.reduce((a, p) => a + p.other, 0);
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Defects by person', { placeholder: 'title' });
s.addChart(pres.charts.BAR, [
  { name: 'Filed', labels: P.map(p => p.who), values: P.map(p => p.ours + p.other) },
  { name: 'Fixed', labels: P.map(p => p.who), values: P.map(p => p.fixed) },
], { x: M, y: 1.2, w: LEFT_W, h: 3.55, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 70, chartColors: [HEX.blue, HEX.orange],
  showLegend: true, legendPos: 'b', showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: HEX.ink, valAxisMinVal: 0, valAxisMaxVal: 20, valAxisMajorUnit: 5,
  ...axes('Team member', 'Defects'), ...chartText, ...gridOpts(), objectName: 'Defects by person chart' });
table(s, [
  ['', ...P.map(p => p.who), 'Team'],
  ['Filed in our repo', ...P.map(p => p.ours), P.reduce((a, p) => a + p.ours, 0)],
  ['Filed against SSU team', ...P.map(p => p.other), totalOther],
  ['Total filed', ...P.map(p => p.ours + p.other), P.reduce((a, p) => a + p.ours + p.other, 0)],
  ['Fixed', ...P.map(p => p.fixed), P.reduce((a, p) => a + p.fixed, 0)],
], { y: 4.9, colW: evenCols(2.1, P.length + 1), name: 'Defects by person table', boldLast: true });
takeaways(s, [
  `Filed: defects each person reported, including the ${totalOther} filed against the team we tested (SSU starter app)`,
  'Fixed: our defects closed as Completed and assigned to that person',
  `Fixed adds up to ${P.reduce((a, p) => a + p.fixed, 0)}, the team's total closed. No defect was closed as a duplicate or not planned`,
  `The team that tested us filed ${D.testing} of our ${D.total} defects, so filed adds up to ${P.reduce((a, p) => a + p.ours, 0)} + ${D.testing} = ${D.total} in our repo`,
], { fontSize: 15 });
caption(s, `${D.as_of}. Against the SSU team: ${D.other.repo}, 7 real reports counted; form tests, duplicates and 1 withdrawn report left out.`);
s.addNotes('Each person explains their own bar. MS filed most of our defects by testing other members\' areas. YA fixed the most (7). Filed against the SSU team counts only real reports: we left out our three form test issues, AO\'s three duplicates and one report MS withdrew.');

// ---------- 4. Defect density ----------
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Defect density', { placeholder: 'title' });
table(s, [
  ['What we counted', 'Files', 'Lines of code'],
  ['TypeScript (app/, lib/, instrumentation.ts)', '151', '11,208'],
  ['SQL (schema, seed and backfill scripts)', '7', '1,093'],
  ['CSS', '2', '374'],
  ['Total', '160', `${D.loc.toLocaleString('en-US')} (${KLOC.toFixed(1)} KLOC)`],
], { x: M, y: 1.45, w: 6.4, colW: [3.7, 0.9, 1.8], name: 'Lines of code table', boldLast: true, fontSize: 14, rowH: 0.42 });
s.addText('Not counted: tests (__tests__, supabase/tests), config and generated files, node_modules, .next, public, and .json, .md and lock files',
  { x: M, y: 3.7, w: 6.4, h: 0.6, fontSize: 12, italic: true, color: C.accent6, margin: 0, isTextBox: true, objectName: 'Not counted' });
const DX = 7.6, DW = W - M - DX;
s.addText(`${D.total} defects ÷ ${KLOC.toFixed(1)} KLOC`, { x: DX, y: 1.5, w: DW, h: 0.5, fontSize: 22, color: C.text1, margin: 0, isTextBox: true, objectName: 'Calculation' });
s.addText(`= ${DENSITY.toFixed(1)} per KLOC`, { x: DX, y: 2.0, w: DW, h: 0.8, fontSize: 40, bold: true, fontFace: 'Cambria', color: C.accent3, margin: 0, isTextBox: true, objectName: 'Density value' });
s.addText('McConnell: 1 to 25 per KLOC in delivered software', { x: DX, y: 3.05, w: DW, h: 0.35, fontSize: 14, color: C.accent6, margin: 0, isTextBox: true, objectName: 'Range label' });
const bx = DX, bw = DW, by = 3.5, sx = v => bx + bw * (v - 1) / 24;
s.addShape(pres.shapes.RECTANGLE, { x: bx, y: by, w: bw, h: 0.5, fill: { color: C.accent3, transparency: 85 }, line: { color: C.accent3, width: 1 }, objectName: 'McConnell range' });
s.addShape(pres.shapes.RECTANGLE, { x: sx(DENSITY) - 0.04, y: by - 0.12, w: 0.08, h: 0.74, fill: { color: C.text2 }, line: { color: C.text2 }, objectName: 'Our marker' });
s.addText('1', { x: bx - 0.1, y: by + 0.55, w: 0.3, h: 0.3, fontSize: 12, color: C.accent6, margin: 0, isTextBox: true, objectName: 'Range start' });
s.addText('25', { x: bx + bw - 0.3, y: by + 0.55, w: 0.3, h: 0.3, fontSize: 12, color: C.accent6, align: 'right', margin: 0, isTextBox: true, objectName: 'Range end' });
s.addText(`Us: ${DENSITY.toFixed(1)}`, { x: sx(DENSITY) - 0.5, y: by + 0.75, w: 1.2, h: 0.3, fontSize: 13, bold: true, color: C.text1, align: 'center', margin: 0, isTextBox: true, objectName: 'Our label' });
takeaways(s, [
  'We are in the low part of the industry range',
  'Our count is defects found before release, so this is a rough comparison only',
  'Counted with cloc on main (commit 6bd95e3, Nov 17), the same command as the Nov 13 count',
], { x: M, y: 4.6, w: W - 2 * M, h: 1.6, fontSize: 15, name: 'Density takeaways' });
caption(s, 'npx cloc app lib supabase instrumentation.ts --exclude-dir=tests --exclude-ext=json,md,lock');
s.addNotes(`${D.total} defects over ${KLOC.toFixed(1)} thousand lines is ${DENSITY.toFixed(1)} per KLOC, near the low end of McConnell's 1 to 25. We counted only code we wrote: TypeScript, SQL and CSS, no tests, config, generated files or libraries.`);

// ---------- 5. Defects by SRS item ----------
const S = D.srs;
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Defects by SRS item', { placeholder: 'title' });
const Srev = [...S].reverse();
s.addChart(pres.charts.BAR, [{ name: 'Defects', labels: Srev.map(x => `${x.srs} (${x.area})`), values: Srev.map(x => x.n) }],
  { x: M, y: 1.15, w: 6.6, h: 5.4, barDir: 'bar', barGapWidthPct: 35, chartColors: [HEX.blue], showLegend: false, showValue: true,
    dataLabelPosition: 'outEnd', dataLabelColor: HEX.ink, valAxisMinVal: 0, valAxisMaxVal: 3, valAxisMajorUnit: 1,
    ...axes('SRS item (area)', 'Defects'), ...chartText, catAxisLabelFontSize: 10, ...gridOpts(), objectName: 'Defects by SRS item chart' });
const half = Math.ceil(S.length / 2);
const srsRows = (part) => [['SRS item', 'Area', 'Defects'], ...part.map(x => [x.srs, x.area, x.n])];
table(s, srsRows(S.slice(0, half)), { x: 7.45, y: 1.2, w: 2.55, colW: [1.25, 0.6, 0.7], name: 'SRS table part 1', fontSize: 10, rowH: 0.22 });
table(s, [...srsRows(S.slice(half)), ['Total', '', D.total]], { x: 10.18, y: 1.2, w: 2.55, colW: [1.25, 0.6, 0.7], name: 'SRS table part 2', fontSize: 10, rowH: 0.22, boldLast: true });
s.addText(`${S.length} SRS items have a defect. No item has more than 2. The ${S.filter(x => x.n > 1).length} items with 2: ${S.filter(x => x.n > 1).map(x => x.srs).join(', ')}.`,
  { x: 7.45, y: 4.3, w: W - M - 7.45, h: 1.1, fontSize: 13, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: 'SRS note' });
caption(s, `${D.as_of}. Each defect once, under the first SRS number in its report. "No SRS item": #521 and #529 (accounts), which name none.`);
s.addNotes('Largest first. The counts add up to the total found. Defects are spread thin across SRS items; the cluster shows up when we group them by area, on the next slide.');

// ---------- 6. Where our defects clustered ----------
const A = D.areas, Arev = [...A].reverse();
const top = A[0];
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Where our defects clustered', { placeholder: 'title' });
s.addChart(pres.charts.BAR, [
  { name: 'Closed', labels: Arev.map(a => a.name), values: Arev.map(a => a.closed) },
  { name: 'Still open', labels: Arev.map(a => a.name), values: Arev.map(a => a.open) },
], { x: M, y: 1.2, w: LEFT_W, h: 3.7, barDir: 'bar', barGrouping: 'stacked', barGapWidthPct: 55, chartColors: [HEX.orange, HEX.aqua],
  showLegend: true, legendPos: 'b', showValue: true, dataLabelPosition: 'ctr', dataLabelColor: HEX.white, dataLabelFormatCode: '#;;;',
  valAxisMinVal: 0, valAxisMaxVal: 12, valAxisMajorUnit: 2, ...axes('Area (owner, SRS group)', 'Defects'), ...chartText, ...gridOpts(), objectName: 'By area chart' });
table(s, [
  ['Area', ...A.map(a => a.code), 'Total'],
  ['Defects', ...A.map(a => a.closed + a.open), D.total],
  ['Closed', ...A.map(a => a.closed), D.closed],
  ['Still open', ...A.map(a => a.open), D.open],
  ['Share', ...A.map(a => Math.round(100 * (a.closed + a.open) / D.total) + '%'), '100%'],
], { y: 5.05, colW: evenCols(1.6, A.length + 1), name: 'By area table' });
takeaways(s, [
  `Dashboard, meeting details and search (YA, SRS-5xx) had ${top.closed + top.open} of our ${D.total} defects (${Math.round(100 * (top.closed + top.open) / D.total)}%)`,
  `${top.closed} of those are fixed; ${top.open} are still open`,
  'The dashboard and search show data from every other area, so they are where problems are easiest to see',
  'So that area should get the most retesting before the final release',
]);
caption(s, `${D.as_of}. Area = the team member whose SRS group owns the defect's SRS item.`);
s.addNotes('Grouped by area, the cluster is clear: YA\'s dashboard, meeting details and search area. 8 of the 11 were filed by MS in one testing pass on Nov 14.');

// ---------- 7. How we checked our data ----------
pres.addSection({ title: 'Data checking' });
const K = D.checks;
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Data checking' });
s.addText('How we checked our data', { placeholder: 'title' });
s.addText('What we compared', { x: M, y: 1.2, w: 6.0, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'Compared heading' });
table(s, [['Total', 'GitHub search', 'Our tables', 'Match'], ...K.rows.map(([w, , g, o]) => [w, g, o, { text: g === o ? '✓' : '✗', options: { color: g === o ? HEX.aqua : HEX.orange, bold: true } }])],
  { x: M, y: 1.7, w: 6.0, colW: [2.75, 1.15, 1.1, 1.0], name: 'Cross-check table', fontSize: 11, rowH: 0.27 });
takeaways(s, [
  `Six issues (${K.spot.map(n => '#' + n).join(', ')}) opened on GitHub; all 9 columns matched`,
  'Per-person, per-SRS and per-area counts each add up to the team totals',
  'MS\'s filed count and YA\'s and AO\'s fixed counts, checked with GitHub search',
], { x: M, y: 4.6, w: 6.0, h: 1.9, fontSize: 14, name: 'Compared bullets' });
s.addText('What we corrected', { x: 7.0, y: 1.2, w: W - M - 7.0, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'Corrected heading' });
takeaways(s, [
  '#499 was the same bug as #497, filed twice. Closed as Duplicate',
  '#506 was a passed test ("Bug Found: None"). Closed as Not planned',
  `Against the SSU team we found 15 reports; 8 were form tests, duplicates or withdrawn. Counted the 7 real ones`,
  `${D.niy} reports are features not built yet (Not Implemented yet). Shown separately, not counted as defects`,
  '#521 and #529 name no SRS item. Flagged and counted as "No SRS item"; #498 has two assignees. Flagged',
], { x: 7.0, y: 1.7, w: W - M - 7.0, h: 4.8, fontSize: 14, name: 'Corrected bullets' });
caption(s, `GitHub search run ${K.searched}. Full tables and issue lists: Defect Metrics/defect-metrics-tables-v2.md`);
s.addNotes('Every total was counted twice: from our report and with GitHub\'s own issue search, and all nine matched. Then the corrections: one duplicate, one passed test, the test and duplicate reports we filed against the SSU team, and the Not Implemented yet reports kept separate.');

// ---------- 8. Appendix: severity and time to fix ----------
pres.addSection({ title: 'Appendix' });
const SV = D.severity;
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Appendix' });
s.addText('Severity and time to fix', { placeholder: 'title' });
table(s, [
  ['Severity', 'Found', 'Closed', 'Still open', 'Average days to fix'],
  ...SV.map(x => [x.name, x.found, x.closed, x.open, x.avg == null ? '—' : x.avg.toFixed(1)]),
  ['Total', D.total, D.closed, D.open, D.avg_all.toFixed(1)],
], { y: 1.5, w: 7.6, colW: [2.0, 1.2, 1.2, 1.4, 1.8], name: 'Severity table', boldLast: true, fontSize: 15, rowH: 0.45 });
takeaways(s, [
  `The one Critical defect (#517) took ${SV[0].avg.toFixed(1)} days, the longest. Critical should be fastest, so this is worth a look`,
  `${D.open} open: ${openSev}. None Critical`,
  'Time to fix = closed time minus created time, for closed defects only',
], { x: 8.6, y: 1.5, w: W - M - 8.6 });
caption(s, `${D.as_of}.`);
s.addNotes('Backup slide with the lecture\'s severity and time-to-fix table. The one Critical defect took the longest, which is the opposite of what we want.');

(async () => {
  await pres.writeFile({ fileName: outPath });
  await applyTheme(outPath, THEME);
  console.log('wrote', outPath);
})();
