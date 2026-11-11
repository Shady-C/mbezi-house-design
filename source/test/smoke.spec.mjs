import { test, expect } from '@playwright/test';

const errorsOf = (page) => {
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  return errs;
};

async function open(page, hash = '') {
  await page.goto('/' + hash);
  await page.waitForFunction(() => window.app && window.app.house);
}

async function distinctColours(page) {
  return page.evaluate(async () => {
    const url = await window.app.viewer.renderView('aerial', { width: 320, height: 200 });
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 320; c.height = 200;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 320, 200).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return set.size;
  });
}

test('page loads without errors and shows the plan', async ({ page }) => {
  const errs = errorsOf(page);
  await open(page);
  await expect(page.locator('#view-plan svg [data-room="bd2"]').first()).toBeVisible();
  expect(errs).toEqual([]);
});

test('3D view renders something', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  expect(await distinctColours(page)).toBeGreaterThan(1);
});

test('walk mode spawns at the gate and walls stop you', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  const spawn = await page.evaluate(() => window.app.viewer.getPlanPosition());
  expect(spawn[0]).toBeLessThan(2.5);
  expect(spawn[1]).toBeGreaterThan(2.0);
  expect(spawn[1]).toBeLessThan(7.0);
  // Face west (bearing 270) and hold forward: the compound wall stops you.
  const p = await page.evaluate(() => {
    const v = window.app.viewer;
    v.setPose(v.getPlanPosition(), 270);
    v.simulate(4, { forward: 1 });
    return v.getPlanPosition();
  });
  expect(p[0]).toBeGreaterThanOrEqual(0.2);
});

test('walk mode passes from the living room into the hallway', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  const p = await page.evaluate(() => {
    const v = window.app.viewer;
    v.setPose([6.78, 19.0], 180);
    v.simulate(3, { forward: 1 });
    return v.getPlanPosition();
  });
  expect(p[1]).toBeLessThan(16.5); // past the living/hall line at y = 17.15
  expect(p[0]).toBeGreaterThan(6.05);
});

test('without WebGL the 3D tab explains and the plan still works', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl')) return null;
      return orig.call(this, type, ...rest);
    };
  });
  await open(page);
  await page.click('#tab-3d');
  await expect(page.locator('#view-3d')).toContainText('3D needs WebGL');
  await page.click('#tab-plan');
  await expect(page.locator('#view-plan svg [data-room="living"]').first()).toBeVisible();
});

test('touch joystick appears in walk mode on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  await expect(page.locator('#joystick')).toBeVisible();
});

test('clicking a photo pin opens it, arrows step through photos', async ({ page }) => {
  await open(page, '#photos');
  await page.locator('#photos-svg [data-photo="IMG_3474"]').click({ force: true });
  await expect(page.locator('#lightbox')).toBeVisible();
  await expect(page.locator('#lb-img')).toHaveAttribute('src', /IMG_3474\.jpg$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lb-img')).toHaveAttribute('src', /IMG_3475\.jpg$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#lightbox')).toBeHidden();
});

test('"Photos here" lists photos taken near where you stand', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  await page.evaluate(() => window.app.viewer.setPose([4.9, 9.2], 0));
  await page.click('#photos-here');
  const files = await page.locator('#nearby img').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  expect(files.length).toBe(3);
  expect(files.some((f) => /IMG_34(67|68|69|70|74|75)\.jpg$/.test(f))).toBe(true);
});

const bd1Label = (page) => page.locator('#edit-svg g.label[data-room="bd1"]').textContent();

test('a valid size edit updates the plan and the 3D model', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('#tab-edit');
  await page.locator('#edit-svg polygon').first().waitFor();
  await page.locator('#edit-svg g.room[data-room="bd1"]:not(.label) polygon').click();
  const before = await bd1Label(page);
  const depth = Number(await page.inputValue('#f-depth'));
  await page.fill('#f-depth', String((depth + 0.3).toFixed(1)));
  await page.press('#f-depth', 'Enter');
  await expect.poll(() => bd1Label(page)).not.toBe(before);
  expect(await bd1Label(page)).toContain(`× ${(depth + 0.3).toFixed(1)} m`);
  expect(await page.evaluate(() => window.app.viewer.house === window.app.house)).toBe(true);
  await expect(page.locator('#edit-errors')).toBeHidden();
});

test('an impossible edit is refused with a message', async ({ page }) => {
  await open(page, '#edit');
  await page.locator('#edit-svg g.room[data-room="bd1"]:not(.label) polygon').click();
  const before = await bd1Label(page);
  await page.fill('#f-width', '0.1');
  await page.press('#f-width', 'Enter');
  await expect(page.locator('#edit-errors')).toBeVisible();
  expect(await bd1Label(page)).toBe(before);
});

test('loading a broken house file keeps the current house', async ({ page }) => {
  await open(page, '#edit');
  const before = await page.evaluate(() => JSON.stringify(window.app.house));
  await page.setInputFiles('#load-file', { name: 'house.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#edit-errors')).toContainText('JSON');
  expect(await page.evaluate(() => JSON.stringify(window.app.house))).toBe(before);
});

test('if the 3D library cannot load, the 3D tab says so (not a WebGL message)', async ({ page }) => {
  await page.route('**/three.module.js', (r) => r.abort());
  await open(page);
  await page.click('#tab-3d');
  await expect(page.locator('#view-3d')).toContainText("3D viewer couldn't load");
  await page.click('#tab-plan');
  await expect(page.locator('#view-plan svg [data-room="living"]').first()).toBeVisible();
});

test('an import that fails to render is rolled back and not saved', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('#tab-edit');
  const before = await page.evaluate(() => JSON.stringify(window.app.house));
  await page.evaluate(() => { window.app.viewer.setHouse = () => { throw new Error('boom'); }; });
  const h = JSON.parse(before);
  h.rooms[0].name = 'Renamed';
  await page.setInputFiles('#load-file', { name: 'house.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(h)) });
  await expect(page.locator('#edit-errors')).toContainText('boom');
  expect(await page.evaluate(() => JSON.stringify(window.app.house))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('mbezi-house-edits-v2'))).toBeNull();
});

test('text from an imported house file is shown as text, not run as HTML', async ({ page }) => {
  await open(page, '#edit');
  const h = await page.evaluate(() => structuredClone(window.app.house));
  h.rooms.find((r) => r.id === 'bd1').name = 'BD1<img src=x onerror="window.__xss=1">';
  h.rooms.find((r) => r.id === 'bd1').estimate.note = '<b onmouseover="window.__xss=2">note</b><img src=x onerror="window.__xss=3">';
  await page.setInputFiles('#load-file', { name: 'house.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(h)) });
  await page.locator('#edit-svg g.room[data-room="bd1"]:not(.label) polygon').click();
  await page.click('#tab-plan');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator('#estimates')).toContainText('BD1<img');
});

test('saved edits made on older house data are not applied silently', async ({ page }) => {
  await open(page, '#edit');
  await page.evaluate(() => {
    const h = structuredClone(window.app.house);
    h.rooms[0].name = 'Old edit';
    localStorage.setItem('mbezi-house-edits-v2', JSON.stringify({ base: 'old-data', house: h }));
  });
  await page.reload();
  await page.waitForFunction(() => window.app && window.app.house);
  expect(await page.evaluate(() => window.app.house.rooms[0].name)).not.toBe('Old edit');
  await expect(page.locator('#stale-edits')).toBeVisible();
  await page.click('#stale-use');
  expect(await page.evaluate(() => window.app.house.rooms[0].name)).toBe('Old edit');
});

test('outdoor sizes: parking depth can be corrected', async ({ page }) => {
  await open(page, '#edit');
  await page.locator('#edit-svg g.room[data-room="parking"]:not(.label) polygon').click();
  const d = Number(await page.inputValue('#f-parking'));
  await page.fill('#f-parking', String((d + 0.5).toFixed(2)));
  await page.press('#f-parking', 'Enter');
  await expect(page.locator('#edit-errors')).toBeHidden();
  const y = await page.evaluate(() => Math.min(...window.app.house.rooms.find((r) => r.id === 'bd2').polygon.map((p) => p[1])));
  expect(Math.abs(y - 7.6)).toBeLessThan(0.02);
});

test('if the house data cannot load, the page says so instead of staying blank', async ({ page }) => {
  await page.route('**/data/house.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
  await page.goto('/');
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.locator('#load-error')).toContainText("couldn't load");
});

test('arrow keys page through photos without turning the walker behind them', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  await page.evaluate(() => window.app.viewer.setPose([4.9, 9.2], 0));
  await page.click('#photos-here');
  await page.locator('#nearby img').first().click();
  await expect(page.locator('#lightbox')).toBeVisible();
  const src0 = await page.locator('#lb-img').getAttribute('src');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  expect(await page.locator('#lb-img').getAttribute('src')).not.toBe(src0);
  expect(await page.evaluate(() => window.app.viewer.getPose().bearing)).toBe(0);
});

test('the 3D view stops drawing when idle or hidden, and draws again when needed', async ({ page }) => {
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  const renders = () => page.evaluate(() => window.app.viewer.renders);
  await page.waitForTimeout(1500); // let the orbit damping settle
  const idle = await renders();
  await page.waitForTimeout(600);
  expect(await renders()).toBe(idle);
  await page.click('[data-mode="dollhouse"]');
  await expect.poll(renders).toBeGreaterThan(idle);
  // Hidden tab: a pending walk input must not keep it drawing.
  await page.click('[data-mode="walk"]');
  await page.click('#tab-plan');
  const hidden = await renders();
  await page.evaluate(() => { window.app.viewer.input.turn = 1; });
  await page.waitForTimeout(600);
  expect(await renders()).toBe(hidden);
  await page.evaluate(() => { window.app.viewer.input.turn = 0; });
});

test('on a slow device the 3D view lowers its quality instead of crawling', async ({ page }) => {
  // A weak device: frames arrive about 12 times a second.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => setTimeout(() => raf(cb), 80);
  });
  await open(page);
  await page.click('#tab-3d');
  await page.waitForFunction(() => window.app.viewer);
  await page.click('[data-mode="walk"]');
  await page.evaluate(() => { window.app.viewer.input.turn = 1; });
  await expect.poll(() => page.evaluate(() => window.app.viewer.quality), { timeout: 15000 }).toBeGreaterThan(0);
  await page.evaluate(() => { window.app.viewer.input.turn = 0; });
});

test('the room you resized is marked as your size; rooms that moved with it as adjusted', async ({ page }) => {
  await open(page, '#edit');
  await page.locator('#edit-svg g.room[data-room="bd1"]:not(.label) polygon').click();
  const depth = Number(await page.inputValue('#f-depth'));
  await page.fill('#f-depth', String((depth + 0.3).toFixed(2)));
  await page.press('#f-depth', 'Enter');
  await expect(page.locator('#edit-panel')).toContainText('Your size');
  await page.click('#tab-plan');
  const tag = (name) => page.locator('#estimates tbody tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${name}$`) }) }).locator('.conf');
  await expect(tag('BD 1')).toHaveText('your size');
  const tags = await page.locator('#estimates tbody .conf').allTextContents();
  expect(tags).toContain('adjusted');
});

test('opening a photo also fetches its neighbours so paging is instant', async ({ page }) => {
  await open(page, '#photos');
  const fetched = new Set();
  page.on('request', (r) => { const m = /photos\/(IMG_\d+)\.jpg$/.exec(r.url()); if (m) fetched.add(m[1]); });
  await page.locator('#photos-svg [data-photo="IMG_3474"]').click({ force: true });
  await expect.poll(() => [...fetched].sort()).toEqual(['IMG_3473', 'IMG_3474', 'IMG_3475']);
});
