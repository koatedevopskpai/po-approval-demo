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
  // force a repaint and let the responsive UI5 shell size to the viewport
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  });
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
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.addStyleTag({ content: 'html, body { height: 100% !important; min-height: 100vh; }' });
  const app = `${base}/purchase-orders/webapp/index.html`;

  // List Report
  await page.goto(app, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout: 45000 },
    'Purchase Orders'
  );
  await settle(page);
  await page.screenshot({ path: path.join(OUT, 'list-report.png') });

  // Object Page (navigate via hash, no reload)
  await page.evaluate((k) => (location.hash = `#/PurchaseOrders('${k}')`), PO_KEY);
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout: 45000 },
    'Approval Workflow'
  );
  await settle(page);
  await page.screenshot({ path: path.join(OUT, 'object-page.png') });

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