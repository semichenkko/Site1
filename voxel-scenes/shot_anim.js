// usage: node shot_anim.js <scene> <outDir> <from> <to> [w] [h]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const [, , sceneName, outDir, from = '0', to = '390', W = '1080', H = '810'] = process.argv;
const root = __dirname;
fs.mkdirSync(outDir, { recursive: true });
const html = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script></head>
<body style="margin:0;background:#000"><script>window.W=${W};window.H=${H};</script><script type="module" src="/${sceneName}.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'application/json');
    res.end(d);
  });
}).listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: +W, height: +H } });
  page.on('console', m => console.log('console:', m.text()));
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 590000 });
  const p = await page.evaluate(() => window.__path);
  if (p) fs.writeFileSync(path.join(root, 'path.json'), JSON.stringify(p));
  console.log('ready', await page.evaluate(() => window.__done), p && { total: p.total, v: p.v });
  if (process.env.WARM) for (let i = Math.max(0, +from - +process.env.WARM); i < +from; i++) await page.evaluate((i) => window.renderFrame(i, true), i);
  const t0 = Date.now();
  const list = process.env.FRAMES ? process.env.FRAMES.split(',').map(Number) : Array.from({ length: +to - +from }, (_, k) => +from + k);
  for (const i of list) {
    const url = await page.evaluate((i) => window.renderFrame(i), i);
    fs.writeFileSync(path.join(outDir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    console.log('frame', i, ((Date.now() - t0) / 1000).toFixed(2), 's/frame');
  }
  await browser.close(); server.close();
});
