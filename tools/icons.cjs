// Rendert favicon.svg zu icon-192.png, icon-512.png und icon-maskable.png.
// Aufruf: node tools/icons.cjs <pfad zu playwright>   (z. B. ../collective-calc/node_modules/playwright)
const path = require('path'), fs = require('fs');
const { chromium } = require(process.argv[2] || 'playwright');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'favicon.svg'), 'utf8');
  const b = await chromium.launch();
  const p = await b.newPage();
  const render = async (size, file, maskable) => {
    await p.setViewportSize({ width: size, height: size });
    const inner = maskable
      ? `<div style="width:${size}px;height:${size}px;background:#0E1116;display:grid;place-items:center"><div style="width:${size * 0.78}px;height:${size * 0.78}px">${svg}</div></div>`
      : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
    await p.setContent(`<html><body style="margin:0;background:transparent">${inner}<style>svg{width:100%;height:100%;display:block}</style></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', file), omitBackground: !maskable });
  };
  await render(192, 'icon-192.png');
  await render(512, 'icon-512.png');
  await render(512, 'icon-maskable.png', true);
  await b.close();
})();
