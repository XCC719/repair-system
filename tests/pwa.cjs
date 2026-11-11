// Run with Node.js and Playwright installed; Chromium must be available.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prefix = '/repair-system/';
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
  const relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(content);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${prefix}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-pwa-test-'));
  const browser = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'], viewport: { width: 390, height: 844 } });
  try {
    const context = browser;
    const page = await context.newPage();
    let reads = 0, writes = 0, fail = false;
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
      contentType: 'application/javascript', body: `window.supabase={createClient:()=>({from:()=>({select:()=>({order(){return this},limit:async()=>{try{return {data:await (await fetch('https://api.example.test/requests')).json()}}catch(error){return {error}}}}),insert:async payload=>{await fetch('https://api.example.test/requests',{method:'POST',body:JSON.stringify(payload)});return {}}})})};`
    }));
    await context.route('https://api.example.test/requests', route => {
      if (route.request().method() === 'POST') {
        writes++;
        assert.deepEqual(Object.keys(JSON.parse(route.request().postData())).sort(),
          ['category', 'description', 'location', 'reporter_name', 'urgency']);
      } else reads++;
      if (fail) return route.abort();
      return route.fulfill({ json: ['高','中','低'].map((urgency, id) => ({ id, urgency, location: '示範辦公室（虛構）',
        category: '設備', description: '示範內容', reporter_name: '示範使用者', status: '待處理', created_at: '2026-11-11T00:00:00Z' })) });
    });
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForSelector('.request-card');
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.equal(manifest.errors.length, 0);
    const parsed = JSON.parse(manifest.data);
    assert.equal(parsed.display, 'standalone');
    assert.equal(new URL(parsed.start_url, url).pathname, prefix);
    const errors = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(errors.installabilityErrors, []);
    assert.equal(await page.locator('.request-card').count(), 3);
    await page.locator('[data-urgency-filter="高"]').click();
    assert.equal(await page.locator('.request-card').count(), 1);
    assert.equal(reads, 1);
    fail = true;
    await page.locator('#refresh-button').click();
    await page.waitForFunction(() => document.querySelector('#list-message').textContent.includes('無法載入清單'));
    await page.locator('[data-urgency-filter="中"]').click();
    assert.match(await page.locator('#list-message').innerText(), /無法載入清單/);
    fail = false;
    const cachedURLs = await page.evaluate(async () => {
      const names = await caches.keys();
      const keys = await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(r => r.url)));
      return keys.flat();
    });
    assert(cachedURLs.length >= 10);
    assert(cachedURLs.every(value => value.startsWith(url)));
    assert(!cachedURLs.some(value => /api\.example|supabase\.co|cdn\.jsdelivr/.test(value)));
    await context.setOffline(true);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => document.querySelector('#submit-button').disabled);
    await page.locator('[name=reporter_name]').fill('離線測試（虛構）');
    await page.evaluate(() => document.querySelector('#repair-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes, 0);
    assert.match(await page.locator('#form-message').innerText(), /尚未送出/);
    await page.reload();
    await page.waitForSelector('#connection-message:not([hidden])');
    assert.equal(await page.locator('.request-card').count(), 0);
    assert.equal(await page.locator('#refresh-button').isDisabled(), true);
    assert.match(await page.locator('#list-message').innerText(), /目前離線/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.PWA_SCREENSHOT) await page.screenshot({ path: process.env.PWA_SCREENSHOT, fullPage: true });
    await context.setOffline(false);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
    await page.locator('#refresh-button').click();
    await page.waitForSelector('.request-card');
    assert.equal(writes, 0);
    await page.locator('[name=reporter_name]').fill('示範使用者（虛構）');
    await page.locator('[name=location]').fill('示範辦公室（虛構）');
    await page.locator('[name=category]').selectOption('設備');
    await page.locator('[name=description]').fill('連線恢復後的虛構報修');
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.querySelector('#form-message').textContent.includes('成功登記'));
    assert.equal(writes, 1);
    assert.equal(await page.locator('[name=reporter_name]').inputValue(), '');
    // Other applications' caches must survive this worker's activation.
    await page.evaluate(async () => {
      const cache = await caches.open('unrelated-app');
      await cache.put('/unrelated', new Response('keep'));
    });
    await page.reload();
    assert(await page.evaluate(async () => (await caches.keys()).includes('unrelated-app')));
    await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await context.setOffline(true);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.reload();
    await page.waitForSelector('#connection-message:not([hidden])');
    assert.equal(await page.locator('#submit-button').isDisabled(), true);
    assert.equal(await page.locator('.request-card').count(), 0);
    await context.setOffline(false);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => document.querySelector('#list-message').textContent.includes('重新載入頁面'));
    assert.equal(await page.locator('#submit-button').isDisabled(), true);
    assert.equal(writes, 1);
    console.log('PASS: subpath manifest/installability, SW shell cache, offline reload, no API cache or queued writes, reconnect, filters/error state, mobile layout');
    await context.close();
  } finally { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
