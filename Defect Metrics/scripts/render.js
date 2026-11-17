const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2];
  const fs = require('fs');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 2 });
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
    await p.setContent(`<html><body style="margin:0">${fs.readFileSync(dir + '/' + f, 'utf8')}</body></html>`);
    await p.screenshot({ path: dir + '/' + f.replace('.svg', '.png'), clip: { x: 0, y: 0, width: 1200, height: 675 } });
  }
  await b.close();
})();
