// Gera o PDF do Manual do Usuário a partir do manual.html, usando o
// Chromium do Playwright. Mantém os links do sumário clicáveis (âncoras
// internas) e gera o painel de marcadores (outline) a partir dos títulos.
const path = require('path');
const { chromium } = require('I:/p2p/frontend/node_modules/playwright');

(async () => {
  const dir = __dirname;
  const htmlPath = 'file://' + path.join(dir, 'manual.html').replace(/\\/g, '/');
  const outPath = path.join(dir, 'Manual do Usuario - P2P.pdf');

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(htmlPath, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    tagged: true,
    outline: true,
  });

  await browser.close();
  console.log('PDF gerado em:', outPath);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
