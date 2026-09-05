/**
 * Captures Fiori Elements screenshots. By default it boots the demo locally
 * (in-memory); set DEMO_URL to capture from a deployed instance instead.
 *
 * Usage:  node tools/capture-screenshots.js
 *         DEMO_URL=https://... node tools/capture-screenshots.js
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots');

const PO_KEY = 'b2f0d1a1-0001-4000-8000-000000000001';

async function settle(page) {
  // give the app a moment to finish rendering (no forced resize here, as that
  // can re-collapse the FE layout after we inject the viewport CSS)
  await new Promise((r) => setTimeout(r, 2500));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  let base = process.env.DEMO_URL;
  let cds;
  if (!base) {
    cds = require('@sap/cds');
    process.env.CPI_MOCK_DELAY_MS = '0';
    ({ url: base } = await cds.exec('all', '--in-memory', '--port', '0'));
    console.log('booted local demo at', base);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  const app = `${base}/purchase-orders/webapp/index.html`;

  // List Report
  await page.goto(app, { waitUntil: 'networkidle2', timeout: 90000 });
  // let the List Report fully render before injecting the viewport CSS
  await new Promise((r) => setTimeout(r, 5000));
  await page.addStyleTag({
    content:
      'html, body { height: 100% !important; } body > div:not(#sap-ui-static):not(#sap-ui-preserve) { height: 100% !important; } .sapUiComponentContainer, .sapUiComponentContainer > * { height: 100% !important; }',
  });
  await new Promise((r) => setTimeout(r, 3000));
  fs.writeFileSync(path.join(OUT, 'list-report.png'), await page.screenshot());

  // Object Page (navigate via hash, no reload)
  await page.evaluate((k) => (location.hash = `#/PurchaseOrders('${k}')`), PO_KEY);
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout: 45000 },
    'Approval Workflow'
  );
  await new Promise((r) => setTimeout(r, 5000));
  await page.addStyleTag({
    content:
      'html, body { height: 100% !important; } body > div:not(#sap-ui-static):not(#sap-ui-preserve) { height: 100% !important; } .sapUiComponentContainer, .sapUiComponentContainer > * { height: 100% !important; }',
  });
  await new Promise((r) => setTimeout(r, 3000));
  fs.writeFileSync(path.join(OUT, 'object-page.png'), await page.screenshot());

  for (const f of ['list-report.png', 'object-page.png']) {
    console.log(`captured ${f} (${fs.statSync(path.join(OUT, f)).size} bytes)`);
  }

  await browser.close();
  if (cds) await cds.shutdown();
  console.log('done');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});