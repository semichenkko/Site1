// usage: node shot.js <scene> <out.png>
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [, , sceneName, out] = process.argv;
const root = __dirname;
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end(`<!doctype html><html><body style="margin:0;background:#000"><script type="module" src="/${sceneName}.js"></script></body></html>`);
  }
  fs.readFile(p, (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(d);
  });
}).listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 810 } });
  page.on('console', m => console.log('console:', m.text()));
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 300000 });
  console.log('voxels:', await page.evaluate(() => window.__done));
  await page.locator('canvas').screenshot({ path: out });
  await browser.close(); server.close();
});
