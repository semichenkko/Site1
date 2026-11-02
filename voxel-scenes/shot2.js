// usage: node shot2.js <scene> <out.png> [w] [h]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [, , sceneName, out, W = '2160', H = '1620'] = process.argv;
const root = __dirname;
const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script></head>
<body style="margin:0;background:#000"><script>window.W=${W};window.H=${H};</script><script type="module" src="/${sceneName}.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(d);
  });
}).listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  page.on('console', m => console.log('console:', m.text()));
  page.on('pageerror', e => console.log('pageerror:', e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 590000 });
  console.log('voxels:', await page.evaluate(() => window.__done), 'ms:', Date.now() - t0);
  await page.locator('canvas').screenshot({ path: out });
  await browser.close(); server.close();
});
