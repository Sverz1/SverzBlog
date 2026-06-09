// Confirm: only reactive/ripple/reactive-rainbow react to a key press.
// For each mode, scroll to keyboard, set mode, sample 1s baseline, press a key,
// sample 1.5s, then sample 1s after fade should be done.
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    window.__perf = { setPropCount: 0, rafCount: 0, reactsAdded: 0, ripplesAdded: 0 };
    const orig = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function(...a){ window.__perf.setPropCount++; return orig.apply(this, a); };
    const oraf = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb){ return oraf.call(window, (t)=>{ window.__perf.rafCount++; return cb(t); }); };
  });

  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.waitForTimeout(700);

  const modes = ['reactive', 'ripple', 'rainbow', 'breathing', 'static', 'reactive-rainbow'];
  for (const m of modes){
    // Set mode and let things stabilise
    await page.evaluate((m) => window.SVERZ_RGB.setMode(m), m);
    await page.waitForTimeout(400);

    // Baseline sample (1s before press)
    await page.evaluate(() => { window.__perf.setPropCount = 0; window.__perf.rafCount = 0; });
    await page.waitForTimeout(1000);
    const base = await page.evaluate(() => ({ ...window.__perf }));

    // Press a key
    const internal = await page.evaluate(() => {
      const k = document.querySelectorAll('.kb .kc')[20]; // some random middle key
      const before = { reacts: window.SVERZ_RGB ? 0 : 0 };
      window.SVERZ_RGB.onPress(k);
      // Sneak a peek at internal queues (we can't access state directly,
      // but we can rely on setProperty counter during the next window).
      window.__perf.setPropCount = 0;
      window.__perf.rafCount = 0;
      return true;
    });

    // Sample 1.5s post-press — captures fade animation
    await page.waitForTimeout(1500);
    const post = await page.evaluate(() => ({ ...window.__perf }));

    // Sample 1s after fade should be done (REACT_DUR ~900/sp = 1800ms at sp 0.5;
    // we waited 1.5s post-press → at speed 3 (default), REACT_DUR=1800 so fade
    // still ongoing slightly. Wait extra to ensure it's done.)
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__perf.setPropCount = 0; window.__perf.rafCount = 0; });
    await page.waitForTimeout(1000);
    const idle = await page.evaluate(() => ({ ...window.__perf }));

    const tag = m.padEnd(18);
    console.log(`${tag}  pre-press 1s: raf=${base.rafCount.toString().padStart(3)} setProp=${base.setPropCount.toString().padStart(5)}  |  post-press 1.5s: raf=${post.rafCount.toString().padStart(3)} setProp=${post.setPropCount.toString().padStart(5)}  |  late-idle 1s: raf=${idle.rafCount.toString().padStart(3)} setProp=${idle.setPropCount.toString().padStart(5)}`);
  }

  await ctx.close();
  await browser.close();
})();
