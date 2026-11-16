// Run with Node.js and Playwright installed; Chromium must be available.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const prefix = '/repair-system/';
// Appended to sw.js to simulate deploying a new release while a page is open.
let swRelease = '';
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
    res.end(relative === 'sw.js' && swRelease ? Buffer.concat([content, Buffer.from(swRelease)]) : content);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${prefix}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'drink-pwa-test-'));
  const browser = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'], viewport: { width: 390, height: 844 } });
  try {
    const context = browser;
    const page = await context.newPage();
    let reads = 0, writes = 0, fail = false, lastPayload;
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
      contentType: 'application/javascript', body: `window.supabase={createClient:()=>({from:()=>({select:()=>({order(){return this},limit:async()=>{try{return {data:await (await fetch('https://api.example.test/orders')).json()}}catch(error){return {error}}}}),insert:async payload=>{await fetch('https://api.example.test/orders',{method:'POST',body:JSON.stringify(payload)});return {}}})})};`
    }));
    await context.route('https://api.example.test/orders', route => {
      if (route.request().method() === 'POST') {
        writes++;
        lastPayload = JSON.parse(route.request().postData());
        // A whole order is sent as one array insert; every row has the same columns.
        assert(Array.isArray(lastPayload) && lastPayload.length > 0);
        for (const row of lastPayload) {
          assert.deepEqual(Object.keys(row).sort(), ['amount', 'customer_name', 'drink', 'ice', 'note', 'order_no', 'quantity', 'sugar']);
          assert.match(row.order_no, /^[0-9]{6}-[0-9A-HJ-NP-Z]{4}$/);
          assert.equal(row.order_no, lastPayload[0].order_no);
        }
      } else reads++;
      if (fail) return route.abort();
      return route.fulfill({ json: ['待製作','製作中','已完成'].map((status, id) => ({ id, status, drink: ['紅茶','珍珠奶茶','拿鐵'][id],
        sugar: '半糖', ice: '少冰', amount: [30, 55, 70][id], quantity: id + 1, order_no: ['261111-AB12', '261111-AB12', null][id], note: id ? null : '示範備註', customer_name: '示範使用者', created_at: '2026-11-11T00:00:00Z' })) });
    });
    await page.goto(url);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForSelector('.order-card');
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.equal(manifest.errors.length, 0);
    const parsed = JSON.parse(manifest.data);
    assert.equal(parsed.display, 'standalone');
    assert.equal(new URL(parsed.start_url, url).pathname, prefix);
    const errors = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(errors.installabilityErrors, []);
    // Rows sharing an order number are grouped into one card with the order total.
    assert.equal(await page.locator('.order-card').count(), 2);
    assert.equal(await page.locator('.order-item').count(), 3);
    assert.match(await page.locator('#cup-total').innerText(), /共 2 張訂單、6 杯，合計 NT\$350/);
    const firstCard = await page.locator('.order-card').first().innerText();
    assert.match(firstCard, /訂單 261111-AB12[\s\S]*合計 NT\$140/);
    assert.match(firstCard, /紅茶 × 1[\s\S]*珍珠奶茶 × 2[\s\S]*NT\$110[\s\S]*每杯 NT\$55/);
    assert.match(await page.locator('.order-card').nth(1).innerText(), /訂單（無編號）[\s\S]*拿鐵 × 3/);
    assert.equal(await page.locator('.order-note').count(), 1);
    await page.locator('[data-status-filter="已完成"]').click();
    assert.equal(await page.locator('.order-card').count(), 1);
    assert.match(await page.locator('#cup-total').innerText(), /「已完成」共 1 張訂單、3 杯，合計 NT\$210/);
    assert.equal(reads, 1);
    fail = true;
    await page.locator('#refresh-button').click();
    await page.waitForFunction(() => document.querySelector('#list-message').textContent.includes('無法載入訂單'));
    await page.locator('[data-status-filter="製作中"]').click();
    assert.match(await page.locator('#list-message').innerText(), /無法載入訂單/);
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
    await page.locator('[name=customer_name]').fill('離線測試（虛構）');
    await page.evaluate(() => document.querySelector('#order-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes, 0);
    assert.match(await page.locator('#form-message').innerText(), /尚未送出/);
    await page.reload();
    await page.waitForSelector('#connection-message:not([hidden])');
    assert.equal(await page.locator('.order-card').count(), 0);
    assert.equal(await page.locator('#refresh-button').isDisabled(), true);
    assert.match(await page.locator('#list-message').innerText(), /目前離線/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.PWA_SCREENSHOT) await page.screenshot({ path: process.env.PWA_SCREENSHOT, fullPage: true });
    await context.setOffline(false);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => !document.querySelector('#refresh-button').disabled);
    await page.locator('#refresh-button').click();
    await page.waitForSelector('.order-card');
    assert.equal(writes, 0);
    const text = selector => page.locator(selector).innerText();
    const dialogOpen = () => page.evaluate(() => document.querySelector('#summary-dialog').open);
    await page.locator('[name=customer_name]').fill('示範使用者（虛構）');
    await page.locator('[name=drink]').fill('珍珠奶茶');
    // Amount is required and must be a whole number in range.
    await page.locator('#submit-button').click();
    assert.equal(await dialogOpen(), false);
    await page.locator('#next-button').click();
    assert.equal(await page.locator('#cart').isHidden(), true);
    await page.locator('[name=amount]').fill('0');
    await page.evaluate(() => document.querySelector('#order-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(await dialogOpen(), false);
    await page.locator('[name=amount]').fill('65');
    await page.locator('[name=quantity]').fill('2');
    assert.match(await text('#subtotal'), /NT\$65 × 2 杯 = NT\$130/);
    // 「新增下一筆飲品」 stores this drink and opens a fresh page for the next one.
    assert.equal(await text('#item-title'), '第 1 杯');
    await page.locator('#next-button').click();
    assert.equal(await text('#item-title'), '第 2 杯');
    assert.equal(await page.locator('.cart-item').count(), 1);
    assert.match(await text('#cart-total'), /1 項、2 杯，小計 NT\$130/);
    assert.equal(await page.locator('[name=customer_name]').inputValue(), '示範使用者（虛構）');
    assert.equal(await page.locator('[name=drink]').inputValue(), '');
    assert.equal(await page.locator('[name=amount]').inputValue(), '');
    assert.equal(await page.locator('[name=quantity]').inputValue(), '1');
    assert.equal(await page.locator('[name=sugar]:checked').inputValue(), '半糖');
    assert.equal(await page.locator('[name=ice]:checked').inputValue(), '少冰');
    await page.locator('[name=drink]').fill('  四季春青茶  ');
    await page.locator('[value=溫]').check();
    await page.locator('[value=無糖]').check();
    await page.locator('[name=amount]').fill('80');
    await page.locator('[name=note]').fill('  燕麥奶  ');
    await page.locator('#next-button').click();
    assert.equal(await text('#item-title'), '第 3 杯');
    assert.match(await text('#cart-total'), /2 項、3 杯，小計 NT\$210/);
    await page.locator('[name=drink]').fill('紅茶');
    await page.locator('[name=amount]').fill('30');
    // 「完成訂單」 opens a confirmation page with the automatic total, and sends nothing yet.
    await page.locator('#submit-button').click();
    assert.equal(await dialogOpen(), true);
    assert.equal(await page.locator('.summary-item').count(), 3);
    assert.equal(await text('#summary-total'), 'NT$240');
    assert.equal(await text('#summary-count'), '3 項、4 杯');
    assert.equal(writes, 0);
    // 「返回修改」 keeps everything, and the current drink is not added twice.
    await page.locator('#summary-back').click();
    assert.equal(await dialogOpen(), false);
    assert.equal(await page.locator('.cart-item').count(), 2);
    assert.equal(await page.locator('[name=drink]').inputValue(), '紅茶');
    // A failed send keeps the order; retrying sends it once.
    await page.locator('#submit-button').click();
    fail = true;
    await page.locator('#summary-confirm').click();
    await page.waitForFunction(() => document.querySelector('#summary-message').textContent.includes('送出失敗'));
    const shownNo = await text('#summary-no');
    assert.match(shownNo, /^[0-9]{6}-[0-9A-HJ-NP-Z]{4}$/);
    assert.equal(lastPayload[0].order_no, shownNo);
    assert.equal(await dialogOpen(), true);
    assert.equal(await page.locator('.cart-item').count(), 2);
    fail = false;
    await page.locator('#summary-confirm').click();
    await page.waitForFunction(() => document.querySelector('#form-message').textContent.includes('成功送出'));
    assert.equal(writes, 2);
    // The retry reuses the order number shown on the confirmation page.
    assert(lastPayload.every(row => row.order_no === shownNo));
    assert(String(await text('#form-message')).includes(`訂單編號 ${shownNo}`));
    assert.deepEqual(lastPayload.map(({ order_no, ...row }) => row), [
      { customer_name: '示範使用者（虛構）', drink: '珍珠奶茶', sugar: '半糖', ice: '少冰', amount: 65, quantity: 2, note: null },
      { customer_name: '示範使用者（虛構）', drink: '四季春青茶', sugar: '無糖', ice: '溫', amount: 80, quantity: 1, note: '燕麥奶' },
      { customer_name: '示範使用者（虛構）', drink: '紅茶', sugar: '半糖', ice: '少冰', amount: 30, quantity: 1, note: null }
    ]);
    assert.match(await text('#form-message'), /共 3 項、4 杯，合計 NT\$240/);
    assert.equal(await dialogOpen(), false);
    assert.equal(await page.locator('#cart').isHidden(), true);
    assert.equal(await text('#item-title'), '第 1 杯');
    assert.equal(await page.locator('[name=customer_name]').inputValue(), '');
    assert.equal(await page.locator('[name=drink]').inputValue(), '');
    assert.match(await text('#subtotal'), /請輸入金額與數量/);
    // Removing a drink from the list, then finishing with an empty current page.
    await page.locator('[name=customer_name]').fill('示範使用者（虛構）');
    await page.locator('[name=drink]').fill('綠茶');
    await page.locator('[name=amount]').fill('25');
    await page.locator('#next-button').click();
    await page.locator('.cart-remove').click();
    assert.equal(await page.locator('#cart').isHidden(), true);
    assert.equal(await text('#item-title'), '第 1 杯');
    await page.locator('#submit-button').click();
    assert.equal(await dialogOpen(), false);
    await page.locator('[name=drink]').fill('烏龍茶');
    await page.locator('[name=amount]').fill('35');
    await page.locator('#next-button').click();
    await page.locator('#submit-button').click();
    assert.equal(await page.locator('.summary-item').count(), 1);
    assert.equal(await text('#summary-total'), 'NT$35');
    assert.equal(await text('#summary-count'), '1 項、1 杯');
    await page.locator('#summary-confirm').click();
    await page.waitForFunction(() => document.querySelector('#form-message').textContent.includes('成功送出') && !document.querySelector('[name=customer_name]').value);
    assert.equal(writes, 3);
    assert.notEqual(lastPayload[0].order_no, shownNo);
    assert.deepEqual(lastPayload.map(({ order_no, ...row }) => row), [{ customer_name: '示範使用者（虛構）', drink: '烏龍茶', sugar: '半糖', ice: '少冰', amount: 35, quantity: 1, note: null }]);
    // Other applications' caches must survive this worker's activation.
    await page.evaluate(async () => {
      const cache = await caches.open('unrelated-app');
      await cache.put('/unrelated', new Response('keep'));
    });
    await page.reload();
    assert(await page.evaluate(async () => (await caches.keys()).includes('unrelated-app')));
    // New release: the page shows an update banner instead of reloading by itself.
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    swRelease = '\n// simulated release 2\n';
    await page.locator('[name=customer_name]').fill('更新前填寫（虛構）');
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForSelector('#update-banner:not([hidden])');
    assert.match(await page.locator('#update-text').innerText(), /新版本/);
    assert.equal(await page.locator('[name=customer_name]').inputValue(), '更新前填寫（虛構）');
    // Cancelling the confirmation keeps the unsent form and the banner.
    page.once('dialog', dialog => dialog.dismiss());
    await page.locator('#update-button').click();
    assert.equal(await page.locator('[name=customer_name]').inputValue(), '更新前填寫（虛構）');
    assert.equal(await page.locator('#update-banner').isVisible(), true);
    assert.equal(await page.locator('#update-button').isDisabled(), false);
    // Confirming activates the waiting worker and reloads once.
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => { window.__beforeUpdate = true; });
    await Promise.all([page.waitForEvent('load'), page.locator('#update-button').click()]);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    assert.equal(await page.evaluate(() => window.__beforeUpdate), undefined);
    assert.equal(await page.locator('#update-banner').isHidden(), true);
    assert.equal(await page.locator('[name=customer_name]').inputValue(), '');
    assert.equal(await page.evaluate(async () => !(await navigator.serviceWorker.getRegistration()).waiting), true);
    await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await context.setOffline(true);
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.reload();
    await page.waitForSelector('#connection-message:not([hidden])');
    assert.equal(await page.locator('#submit-button').isDisabled(), true);
    assert.equal(await page.locator('.order-card').count(), 0);
    await context.setOffline(false);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForFunction(() => document.querySelector('#list-message').textContent.includes('重新載入頁面'));
    assert.equal(await page.locator('#submit-button').isDisabled(), true);
    assert.equal(writes, 3);
    console.log('PASS: subpath manifest/installability, SW shell cache, offline reload, no API cache or queued writes, reconnect, status filters/amount total/error state, amount/quantity validation, multi-drink order/total/remove/retry, order number/grouping, payload fields, update banner, mobile layout');
    await context.close();
  } finally { await browser.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
