const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs', 'screenshots')).filter((x) => x.endsWith('.png'))) {
    const file = path.join(__dirname, '..', 'docs', 'screenshots', f);
    const b64 = fs.readFileSync(file).toString('base64');
    await page.setContent(`<img id="i" src="data:image/png;base64,${b64}">`);
    const stats = await page.evaluate(() => {
      const img = document.getElementById('i');
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonWhite = 0, colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        if (r + g + b > 720) nonWhite++;
        if (Math.abs(r - g) > 20 || Math.abs(g - b) > 20) colored++;
      }
      const total = c.width * c.height;
      return { w: c.width, h: c.height, nonWhitePct: (100 * nonWhite / total).toFixed(1), coloredPct: (100 * colored / total).toFixed(1) };
    });
    console.log(`${f}: ${stats.w}x${stats.h} non-white=${stats.nonWhitePct}% colored=${stats.coloredPct}%`);
  }
  await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });