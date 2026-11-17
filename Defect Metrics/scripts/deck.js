// Builds "Civic Radar Defect Metrics.pptx" from phaseb/deckdata.json.
// node deck.js <deckdata.json> <out.pptx> <applyTheme.js path>
const pptxgen = require('pptxgenjs');
const fs = require('fs');
const [, , dataPath, outPath, applyThemePath] = process.argv;
const { applyTheme } = require(applyThemePath);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const THEME = {
  name: 'Civic Radar QA',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '0B0B0B', lt1: 'FFFFFF', dk2: '17283B', lt2: 'EEF1F5',
    accent1: '2A78D6', accent2: 'EB6834', accent3: '1BAF7A', accent4: 'EDA100',
    accent5: '6250D6', accent6: '52514E', hlink: '2A78D6', folHlink: '6250D6',
  },
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

const AS_OF = 'Data: GitHub issues, Nov 16, 2026, 10:56 PM ET';
const W = 13.333, M = 0.6;

pres.defineSlideMaster({
  title: 'TITLE_DARK',
  background: { color: HEX.navy },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 2.3, w: W - 2 * M, h: 1.4, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 3.9, w: W - 2 * M, h: 1.6, fontSize: 20, color: C.background2, valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CLOSING_DARK',
  background: { color: HEX.navy },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 1.2, w: W - 2 * M, h: 1.1, fontSize: 40, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: M, y: 2.7, w: W - 2 * M, h: 3.6, fontSize: 22, color: C.background1, valign: 'top', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: HEX.white },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.35, w: W - 2 * M, h: 0.8, fontSize: 30, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
    { text: { text: 'Civic Radar · Sprint 5 QA metrics', options: { x: M, y: 7.05, w: 6, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
  ],
  slideNumber: { x: W - M - 0.6, y: 7.05, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
});

// ---------- helpers ----------
const chartText = { catAxisLabelFontFace: '+mn-lt', valAxisLabelFontFace: '+mn-lt', legendFontFace: '+mn-lt', dataLabelFontFace: '+mn-lt',
  catAxisLabelColor: HEX.ink2, valAxisLabelColor: HEX.muted, legendColor: HEX.ink2, catAxisLabelFontSize: 13, valAxisLabelFontSize: 12,
  legendFontSize: 13, dataLabelFontSize: 12 };
function gridOpts() { return { valGridLine: { color: HEX.grid, size: 0.75 }, catGridLine: { style: 'none' }, catAxisLineColor: HEX.axis, valAxisLineShow: false }; }

function caption(slide, text, y = 6.62) {
  slide.addText(text, { x: M, y, w: W - 2 * M, h: 0.3, fontSize: 11, italic: true, color: C.accent6, margin: 0, isTextBox: true, objectName: 'Data source' });
}

// A compact table: first row is the header, first column is the row label.
function table(slide, rows, opts) {
  const head = { bold: true, color: HEX.white, fill: { color: HEX.navy }, align: 'center' };
  const data = rows.map((r, i) => r.map((v, j) => {
    const cell = typeof v === 'object' && v !== null && 'text' in v ? v : { text: String(v) };
    const o = { align: j === 0 ? 'left' : 'center', color: HEX.ink, ...(cell.options || {}) };
    if (i === 0) Object.assign(o, head, j === 0 ? { align: 'left' } : {});
    else if (i % 2 === 0) o.fill = { color: HEX.tint };
    if (opts.boldLast && i === rows.length - 1) o.bold = true;
    return { text: cell.text, options: o };
  }));
  slide.addTable(data, { x: opts.x ?? M, y: opts.y, w: opts.w ?? W - 2 * M, colW: opts.colW, fontSize: opts.fontSize ?? 12,
    rowH: opts.rowH ?? 0.27, margin: [2, 6, 2, 6], border: { type: 'solid', pt: 0.5, color: 'D5D8DE' }, valign: 'middle', objectName: opts.name });
}

function stat(slide, x, y, w, value, label, color, name) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 1.75, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: name + ' card' });
  slide.addText(value, { x: x + 0.25, y: y + 0.18, w: w - 0.5, h: 0.95, fontSize: 54, bold: true, fontFace: 'Cambria', color, margin: 0, isTextBox: true, objectName: name + ' value' });
  slide.addText(label, { x: x + 0.25, y: y + 1.1, w: w - 0.5, h: 0.5, fontSize: 15, color: C.text1, margin: 0, isTextBox: true, objectName: name + ' label' });
}

// ---------- 1. Title ----------
pres.addSection({ title: 'Overview' });
let s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: 'Overview' });
s.addText('Civic Radar defect metrics', { placeholder: 'title' });
s.addText('CSC 351 · Sprint 5 QA\nDefects found and fixed, where they cluster, and how we checked the data', { placeholder: 'body' });
s.addText(AS_OF, { x: M, y: 6.6, w: 8, h: 0.35, fontSize: 12, color: C.background2, margin: 0, isTextBox: true, objectName: 'Data source' });
s.addNotes('Civic Radar defect metrics for Sprint 5. Everything here is pulled from our GitHub issues on November 16, 2026, and every total was checked against GitHub\'s own search.');

// ---------- 2. Summary ----------
const pctClosed = Math.round(100 * D.closed / D.total);
const density = D.total / (D.loc / 1000);
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Overview' });
s.addText(`${D.total} defects found, ${D.closed} closed so far`, { placeholder: 'title' });
const cw = (W - 2 * M - 3 * 0.3) / 4;
stat(s, M, 1.55, cw, String(D.total), 'Defects found (Nov 10 to 16)', C.accent1, 'Found');
stat(s, M + (cw + 0.3), 1.55, cw, String(D.closed), `Closed as fixed (${pctClosed}%)`, C.accent2, 'Closed');
stat(s, M + 2 * (cw + 0.3), 1.55, cw, String(D.open), 'Still open', C.accent3, 'Open');
stat(s, M + 3 * (cw + 0.3), 1.55, cw, density.toFixed(1), 'Defects per 1,000 lines of code', C.text2, 'Density');
s.addText([
  { text: 'What counts as a defect: ', options: { bold: true } },
  { text: `a bug report with the team's Defects label. The ${D.niy} reports labeled Not Implemented yet are features not built yet, so they are shown separately, not counted.`, options: { breakLine: true } },
  { text: 'Found ', options: { bold: true } }, { text: '= defects filed. ' },
  { text: 'Closed ', options: { bold: true } }, { text: '= defects closed as Completed. Dates are Eastern time.' },
], { x: M, y: 3.7, w: W - 2 * M, h: 1.2, fontSize: 16, color: C.text1, margin: 0, paraSpaceAfter: 8, valign: 'top', isTextBox: true, objectName: 'Definitions' });
s.addText([
  { text: 'Takeaways', options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } },
  { text: 'Most defects were found in three testing bursts (Nov 10, 12 and 14), and fixes started landing Nov 12.', options: { bullet: true, breakLine: true } },
  { text: 'Defects cluster in the dashboard and search area (11 of 27), all still open.', options: { bullet: true, breakLine: true } },
  { text: 'Density is at the low end of the industry range of 1 to 25 per KLOC.', options: { bullet: true } },
], { x: M, y: 4.85, w: W - 2 * M, h: 1.7, fontSize: 16, color: C.text1, margin: 0, paraSpaceAfter: 6, valign: 'top', isTextBox: true, objectName: 'Takeaways' });
caption(s, AS_OF + '. Defects label only.');
s.addNotes(`${D.total} defects found, ${D.closed} closed (${pctClosed}%), ${D.open} open. Density ${density.toFixed(1)} per KLOC on ${D.loc.toLocaleString('en-US')} lines of code.`);

// ---------- 3. Found vs closed ----------
pres.addSection({ title: 'Metrics' });
const T = D.timeline;
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Found vs. closed: fixes are catching up', { placeholder: 'title' });
s.addChart(pres.charts.LINE, [
  { name: 'Total found', labels: T.map(t => t.label), values: T.map(t => t.f) },
  { name: 'Total closed', labels: T.map(t => t.label), values: T.map(t => t.c) },
], { x: M, y: 1.2, w: W - 2 * M, h: 3.45, chartColors: [HEX.blue, HEX.orange], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 8,
  showLegend: true, legendPos: 't', showValue: true, dataLabelPosition: 't', dataLabelColor: HEX.ink2, valAxisMinVal: 0, valAxisMaxVal: 30, valAxisMajorUnit: 5,
  ...chartText, ...gridOpts(), objectName: 'Found vs closed chart' });
table(s, [
  ['Date', ...T.map(t => t.label)],
  ['Found that day', ...T.map(t => t.nf)],
  ['Closed that day', ...T.map(t => t.nc)],
  ['Total found', ...T.map(t => t.f)],
  ['Total closed', ...T.map(t => t.c)],
  ['Still open', ...T.map(t => t.f - t.c)],
], { y: 4.8, colW: [1.93, ...T.map(() => (W - 2 * M - 1.93) / T.length)], name: 'Found vs closed table', boldLast: true });
caption(s, AS_OF + '. Running totals from the first defect.');
s.addNotes('Defects arrived in three bursts: 9 on Nov 10, 10 on Nov 12 and 8 on Nov 14, when I tested other members\' areas. Closing started Nov 12 and jumped on Nov 16 when the Sprint 5 fixes merged. The gap between the lines is what is still open: 16.');

// ---------- 4. Severity ----------
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('By severity: most defects are Minor', { placeholder: 'title' });
const sev = D.severity; const sevRev = [...sev].reverse();
s.addChart(pres.charts.BAR, [
  { name: 'Closed', labels: sevRev.map(r => r.name), values: sevRev.map(r => r.closed) },
  { name: 'Still open', labels: sevRev.map(r => r.name), values: sevRev.map(r => r.open) },
], { x: M, y: 1.2, w: W - 2 * M, h: 3.6, barDir: 'bar', barGrouping: 'stacked', barGapWidthPct: 60,
  chartColors: [HEX.orange, HEX.aqua], showLegend: true, legendPos: 't', showValue: true, dataLabelPosition: 'ctr', dataLabelColor: HEX.white,
  dataLabelFormatCode: '#;;;', valAxisMinVal: 0, valAxisMajorUnit: 5, ...chartText, ...gridOpts(), objectName: 'Severity chart' });
table(s, [
  ['Severity', 'Found', 'Closed', 'Still open'],
  ...sev.map(r => [r.name, r.closed + r.open, r.closed, r.open]),
  ['Total', D.total, D.closed, D.open],
], { y: 4.95, colW: [3.5, 2.87, 2.87, 2.89], name: 'Severity table', boldLast: true });
caption(s, AS_OF + '. Severity as written on each bug report.');
s.addNotes('18 of 27 are Minor. The one Critical defect is #517, an extraction that stays Processing forever if the server stops mid-run; it is still open.');

// ---------- 5. By person ----------
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('By person: who filed and who fixed', { placeholder: 'title' });
const P = D.people;
s.addChart(pres.charts.BAR, [
  { name: 'Filed', labels: P.map(p => p.who), values: P.map(p => p.filed) },
  { name: 'Fixed', labels: P.map(p => p.who), values: P.map(p => p.fixed) },
], { x: M, y: 1.2, w: W - 2 * M, h: 3.55, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 70, chartColors: [HEX.blue, HEX.orange],
  showLegend: true, legendPos: 't', showValue: true, dataLabelPosition: 'outEnd', dataLabelColor: HEX.ink, valAxisMinVal: 0, valAxisMaxVal: 20, valAxisMajorUnit: 5,
  ...chartText, ...gridOpts(), objectName: 'By person chart' });
table(s, [
  ['', ...P.map(p => p.who)],
  ['Filed', ...P.map(p => p.filed)],
  ['Fixed', ...P.map(p => p.fixed)],
  ['Still open, assigned', ...P.map(p => p.who === 'Testing team' ? '—' : p.open)],
], { y: 4.9, colW: [2.33, ...P.map(() => (W - 2 * M - 2.33) / P.length)], name: 'By person table' });
caption(s, AS_OF + '. Filed = opened the defect. Fixed = closed as Completed and assigned to them. "Testing team" is the other team.');
s.addNotes('Filed is who opened the defect; fixed is who it was assigned to when it was closed as Completed. KJ and EG have fixed every defect assigned to them. All 11 of YA\'s are still open.');

// ---------- 6. By area ----------
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText('Where defects cluster: dashboard and search', { placeholder: 'title' });
const A = D.areas; const Arev = [...A].reverse();
s.addChart(pres.charts.BAR, [
  { name: 'Closed', labels: Arev.map(a => a.name), values: Arev.map(a => a.closed) },
  { name: 'Still open', labels: Arev.map(a => a.name), values: Arev.map(a => a.open) },
], { x: M, y: 1.2, w: 7.6, h: 3.6, barDir: 'bar', barGrouping: 'stacked', barGapWidthPct: 55,
  chartColors: [HEX.orange, HEX.aqua], showLegend: true, legendPos: 't', showValue: true, dataLabelPosition: 'ctr', dataLabelColor: HEX.white,
  dataLabelFormatCode: '#;;;', valAxisMinVal: 0, valAxisMaxVal: 12, valAxisMajorUnit: 2, ...chartText, ...gridOpts(), objectName: 'By area chart' });
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 8.55, y: 1.35, w: W - M - 8.55, h: 3.3, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: 'SRS hot spots card' });
s.addText([
  { text: 'SRS items with 2 defects each', options: { bold: true, fontSize: 17, color: C.text2, breakLine: true } },
  ...D.topsrs.map((t, i) => ({ text: `${t.srs}: ${t.issues.map(n => '#' + n).join(', ')}`, options: { bullet: true, breakLine: i < D.topsrs.length - 1 } })),
], { x: 8.8, y: 1.55, w: W - M - 9.05, h: 2.95, fontSize: 15, color: C.text1, margin: 0, paraSpaceAfter: 6, valign: 'top', isTextBox: true, objectName: 'SRS hot spots' });
table(s, [
  ['Area', ...A.map(a => a.code)],
  ['Defects', ...A.map(a => a.closed + a.open)],
  ['Closed', ...A.map(a => a.closed)],
  ['Still open', ...A.map(a => a.open)],
  ['Share', ...A.map(a => Math.round(100 * (a.closed + a.open) / D.total) + '%')],
], { y: 4.95, colW: [2.33, ...A.map(() => (W - 2 * M - 2.33) / A.length)], name: 'By area table' });
caption(s, AS_OF + '. Each defect once, under the area that owns its first SRS item.');
s.addNotes('Each defect is counted once, under the area that owns its SRS item. YA\'s dashboard, meeting details and search area has 11 of 27 (41%), none closed yet. EG and KJ have closed all of theirs. No single SRS item has more than 2.');

// ---------- 7. Density ----------
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Metrics' });
s.addText(`Density: ${density.toFixed(1)} defects per KLOC, low in the industry range`, { placeholder: 'title' });
const L = M + 0.3, R = W - M - 0.3, Y = 2.45;
const sx = v => L + (R - L) * v / 25;
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: sx(1), y: Y - 0.45, w: sx(25) - sx(1), h: 0.9, rectRadius: 0.1, fill: { color: C.accent1, transparency: 85 }, line: { color: C.accent1, transparency: 85 }, objectName: 'McConnell range band' });
s.addText("McConnell's range for delivered software: 1 to 25 defects per KLOC", { x: sx(1), y: Y - 0.95, w: sx(25) - sx(1), h: 0.4, fontSize: 15, color: C.accent6, align: 'center', margin: 0, isTextBox: true, objectName: 'Range label' });
s.addShape(pres.shapes.LINE, { x: L, y: Y, w: R - L, h: 0, line: { color: HEX.axis, width: 2 }, objectName: 'Scale line' });
[0, 1, 5, 10, 15, 20, 25].forEach(v => {
  s.addShape(pres.shapes.LINE, { x: sx(v), y: Y - 0.08, w: 0, h: 0.16, line: { color: HEX.axis, width: 2 }, objectName: `Tick ${v}` });
  s.addText(String(v), { x: sx(v) - 0.3, y: Y + 0.55, w: 0.6, h: 0.3, fontSize: 13, color: C.accent6, align: 'center', margin: 0, isTextBox: true, objectName: `Tick label ${v}` });
});
s.addShape(pres.shapes.OVAL, { x: sx(density) - 0.14, y: Y - 0.14, w: 0.28, h: 0.28, fill: { color: C.accent2 }, line: { color: C.background1, width: 2 }, objectName: 'Civic Radar marker' });
s.addText(`Civic Radar: ${density.toFixed(1)}`, { x: sx(density) + 0.2, y: Y - 0.42, w: 3, h: 0.35, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: 'Civic Radar label' });
table(s, [
  ['What we counted', 'Files', 'Lines of code'],
  ['TypeScript: app/, lib/, instrumentation.ts', '148', '10,873'],
  ['SQL: schema, seed and backfill scripts', '7', '1,093'],
  ['CSS', '2', '374'],
  ['Total', '157', `${D.loc.toLocaleString('en-US')} (${(D.loc / 1000).toFixed(1)} KLOC)`],
], { x: M, y: 3.55, w: 7.4, colW: [4.2, 1.0, 2.2], name: 'Lines of code table', boldLast: true, fontSize: 13, rowH: 0.32 });
s.addText([
  { text: `${D.total} defects ÷ ${(D.loc / 1000).toFixed(1)} KLOC = ${density.toFixed(1)}`, options: { bold: true, fontSize: 20, color: C.text2, breakLine: true } },
  { text: 'Counted with cloc on main (commit 78d6819), the same command KJ used on Nov 13. Tests, config and generated files are not counted.', options: { breakLine: true } },
  { text: 'Our count is defects found before release, so the comparison with delivered software is rough.' },
], { x: 8.35, y: 3.55, w: W - M - 8.35, h: 2.6, fontSize: 14, color: C.text1, margin: 0, paraSpaceAfter: 8, valign: 'top', isTextBox: true, objectName: 'Density explanation' });
caption(s, AS_OF + '. Lines counted Nov 16 with: npx cloc app lib supabase instrumentation.ts --exclude-dir=tests --exclude-ext=json,md,lock');
s.addNotes(`27 defects over 12.3 thousand lines of code is ${density.toFixed(1)} per KLOC, near the low end of McConnell's 1 to 25 range. The code grew by 693 lines since KJ's Nov 13 count. If test code were counted the density would be lower still.`);

// ---------- 8. Data checking ----------
pres.addSection({ title: 'Data checking' });
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Data checking' });
s.addText('How we checked the data', { placeholder: 'title' });
const checks = [
  ['Every issue', '505'], ['Defects found', '27'], ['Closed as Completed', '11'], ['Still open', '16'], ['Closed as Not planned', '0'],
  ['Not Implemented yet', '10'], ['Filed by MS', '18'], ['Filed on 11/14', '8'], ['Open, assigned to YA', '11'],
];
s.addText('1. Every total counted a second way, with GitHub search', { x: M, y: 1.25, w: 6.1, h: 0.4, fontSize: 17, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'Cross-check heading' });
table(s, [['Total', 'GitHub search', 'Our tables', 'Match'], ...checks.map(([w, n]) => [w, n, n, { text: '✓', options: { color: HEX.aqua, bold: true } }])],
  { x: M, y: 1.75, w: 6.1, colW: [2.5, 1.3, 1.3, 1.0], name: 'Cross-check table', rowH: 0.3, fontSize: 13 });
s.addText([
  { text: '2. Tables add up: ', options: { bold: true, color: C.text2 } },
  { text: 'the timeline, severity, by-person and by-area tables each total 27.', options: { breakLine: true } },
  { text: '3. Spot check: ', options: { bold: true, color: C.text2 } },
  { text: '#498, #517, #521, #526 and #555 opened one by one; every field matched.' },
], { x: M, y: 4.95, w: 6.1, h: 1.4, fontSize: 14, color: C.text1, margin: 0, paraSpaceAfter: 8, valign: 'top', isTextBox: true, objectName: 'Other checks' });
const fixes = [
  ['#499', 'Same bug as #497, filed twice', 'Closed as Duplicate'],
  ['#506', 'A passed test ("Bug Found: None"), not a bug', 'Closed as Not planned'],
  ['#521, #529', 'Name no SRS item (accounts)', 'Counted as "No SRS item"'],
  ['#498', 'Two assignees', 'One assignee when it closes'],
];
s.addText('4. What we found and corrected', { x: 7.15, y: 1.25, w: W - M - 7.15, h: 0.4, fontSize: 17, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'Clean-up heading' });
fixes.forEach(([n, problem, fix], i) => {
  const y = 1.75 + i * 1.12;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.15, y, w: W - M - 7.15, h: 0.98, rectRadius: 0.1, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `Clean-up card ${n}` });
  s.addText([
    { text: n + '  ', options: { bold: true, color: C.text2 } }, { text: problem, options: { breakLine: true } },
    { text: fix, options: { color: C.accent6, italic: true } },
  ], { x: 7.4, y: y + 0.12, w: W - M - 7.65, h: 0.76, fontSize: 14, color: C.text1, margin: 0, valign: 'middle', isTextBox: true, objectName: `Clean-up text ${n}` });
});
caption(s, 'GitHub search run Nov 16, 2026, 10:56 PM ET. Full tables: Defect Metrics/defect-metrics-tables-v2.md');
s.addNotes('We counted every total twice: once from our pulled report and once with GitHub\'s own issue search. All nine matched. The tables also check each other. While checking, we found one duplicate and one passed test filed as a bug, and closed both with a comment; two defects with no SRS item and one with two assignees are flagged but not changed.');

// ---------- 9. My contribution (MS) ----------
pres.addSection({ title: 'My contribution' });
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'My contribution' });
s.addText('MS: two thirds of the team\'s defects found', { placeholder: 'title' });
const cw3 = (W - 2 * M - 2 * 0.3) / 3;
stat(s, M, 1.4, cw3, '18', 'of 27 defects filed (67%)', C.accent1, 'MS filed');
stat(s, M + cw3 + 0.3, 1.4, cw3, '2 → 4', 'defects fixed (4 after PRs #650, #651)', C.accent2, 'MS fixed');
stat(s, M + 2 * (cw3 + 0.3), 1.4, cw3, '5', 'Not Implemented yet issues closed', C.accent3, 'MS NIY closed');
s.addText([
  { text: 'Filed: ', options: { bold: true, color: C.text2 } },
  { text: 'mostly by testing other members\' areas: extraction (#517, #527, #528), accounts (#521, #525, #529), matching (#526), and dashboard and search (#522, #523, #555 to #562).', options: { breakLine: true } },
  { text: 'Fixed: ', options: { bold: true, color: C.text2 } },
  { text: '#515 and #524 merged; #513 and #514 have PRs open. Sprint 5 PRs #599 to #608 also closed #497, #500, #501, #502 and #516.', options: { breakLine: true } },
  { text: 'My area: ', options: { bold: true, color: C.text2 } },
  { text: '4 defects in documents (SRS-2xx); none open once #650 and #651 merge.', options: { breakLine: true } },
  { text: 'Data clean-up: ', options: { bold: true, color: C.text2 } },
  { text: 'closed #499 as a duplicate and #506 as not a bug.' },
], { x: M, y: 3.45, w: W - 2 * M, h: 3.0, fontSize: 16, color: C.text1, margin: 0, paraSpaceAfter: 10, valign: 'top', isTextBox: true, objectName: 'MS details' });
caption(s, AS_OF + '.');
s.addNotes('I filed 18 of the 27 defects, mostly while testing other members\' areas. In my own area, documents, 4 defects were found; 2 are fixed and 2 have PRs open. I also closed 5 Not Implemented yet issues with the Sprint 5 PRs and cleaned up a duplicate and a passed test.');

// ---------- 10. Wrap-up ----------
pres.addSection({ title: 'Wrap-up' });
s = pres.addSlide({ masterName: 'CLOSING_DARK', sectionTitle: 'Wrap-up' });
s.addText('What the numbers say', { placeholder: 'title' });
s.addText([
  { text: `${D.total} defects found in one week; ${D.closed} closed, ${D.open} open.`, options: { bullet: true, breakLine: true } },
  { text: 'Dashboard and search has the most open defects (11). That is where to focus next.', options: { bullet: true, breakLine: true } },
  { text: `${density.toFixed(1)} defects per KLOC: low in the industry range.`, options: { bullet: true, breakLine: true } },
  { text: 'Numbers will be re-pulled after the team\'s last merges, with the same scripts.', options: { bullet: true } },
], { placeholder: 'body', paraSpaceAfter: 8 });
s.addNotes('Wrap-up. The scripts in Defect Metrics/scripts rebuild every table and chart from GitHub in about a minute, so the final numbers can be refreshed right before the demo.');

(async () => {
  await pres.writeFile({ fileName: outPath });
  await applyTheme(outPath, THEME);
  console.log('wrote', outPath);
})();
