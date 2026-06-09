// Focused probe: does the rgb.js refactor actually reduce CPU/style cost?
// Instruments CSSStyleDeclaration.setProperty + rAF, samples 2s windows in
// three states:
//   A) page just loaded, hero on screen, keyboard stage off-screen
//   B) scrolled to keyboard, default mode (reactive-rainbow → idle = no animation)
//   C) scrolled to keyboard, animated mode (rainbow) → continuous redraws
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/';

async function setup(){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  // Install instrumentation
  await page.evaluate(() => {
    window.__perf = { setPropCount: 0, rafCount: 0 };
    const proto = CSSStyleDeclaration.prototype;
    const orig = proto.setProperty;
    proto.setProperty = function(...args){
      window.__perf.setPropCount++;
      return orig.apply(this, args);
    };
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function(cb){
      return origRaf.call(window, (t) => {
        window.__perf.rafCount++;
        return cb(t);
      });
    };
  });
  return { browser, ctx, page };
}

async function sample(page, ms){
  await page.evaluate(() => { window.__perf.setPropCount = 0; window.__perf.rafCount = 0; });
  await page.waitForTimeout(ms);
  return await page.evaluate(() => ({ ...window.__perf }));
}

async function getStageState(page){
  return await page.evaluate(() => {
    const inner = document.querySelector('#keyboard-stage .kb-stage-inner');
    if (!inner) return { found: false };
    const r = inner.getBoundingClientRect();
    return {
      found: true,
      visible: r.bottom > 0 && r.top < window.innerHeight,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
    };
  });
}

(async () => {
  const { browser, ctx, page } = await setup();

  console.log('\n=== Scenario A: page loaded, scroll=0 (hero on screen) ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  console.log('stage state:', await getStageState(page));
  const A = await sample(page, 2000);
  console.log(`  rAF ticks in 2s : ${A.rafCount}  (~${(A.rafCount/2).toFixed(1)} fps)`);
  console.log(`  setProperty in 2s: ${A.setPropCount}  (per-tick: ${(A.setPropCount / Math.max(1, A.rafCount)).toFixed(1)})`);

  console.log('\n=== Scenario B: scrolled to keyboard, default mode (reactive-rainbow, idle) ===');
  // .kb-stage is position:fixed → scrollIntoView is useless. Body is 3600px tall
  // and at scrollY ≥ 1200 the .kb-stage-inner is fully in viewport.
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.waitForTimeout(800);
  console.log('stage state:', await getStageState(page));
  const B = await sample(page, 2000);
  console.log(`  rAF ticks in 2s : ${B.rafCount}  (~${(B.rafCount/2).toFixed(1)} fps)`);
  console.log(`  setProperty in 2s: ${B.setPropCount}  (per-tick: ${(B.setPropCount / Math.max(1, B.rafCount)).toFixed(1)})`);

  console.log('\n=== Scenario C: scrolled to keyboard, animated mode (rainbow) ===');
  await page.evaluate(() => {
    if (window.SVERZ_RGB) window.SVERZ_RGB.setMode('rainbow');
  });
  await page.waitForTimeout(300);
  const C = await sample(page, 2000);
  console.log(`  rAF ticks in 2s : ${C.rafCount}  (~${(C.rafCount/2).toFixed(1)} fps)`);
  console.log(`  setProperty in 2s: ${C.setPropCount}  (per-tick: ${(C.setPropCount / Math.max(1, C.rafCount)).toFixed(1)})`);

  console.log('\n=== Scenario D: animated mode, scroll back to hero ===');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(800);
  console.log('stage state:', await getStageState(page));
  const D = await sample(page, 2000);
  console.log(`  rAF ticks in 2s : ${D.rafCount}  (~${(D.rafCount/2).toFixed(1)} fps)`);
  console.log(`  setProperty in 2s: ${D.setPropCount}  (per-tick: ${(D.setPropCount / Math.max(1, D.rafCount)).toFixed(1)})`);

  console.log('\n=== Scenario E: simulate key press in idle mode (event-driven wake) ===');
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.evaluate(() => window.SVERZ_RGB && window.SVERZ_RGB.setMode('reactive'));
  await page.waitForTimeout(800);
  // Sample idle first
  const E_idle = await sample(page, 1000);
  console.log(`  IDLE  (1s): rAF=${E_idle.rafCount}  setProp=${E_idle.setPropCount}`);
  // Now press a key
  await page.evaluate(() => {
    const k = document.querySelector('.kb .kc');
    if (k && window.SVERZ_RGB) window.SVERZ_RGB.onPress(k);
  });
  const E_press = await sample(page, 1500);
  console.log(`  PRESS (1.5s): rAF=${E_press.rafCount}  setProp=${E_press.setPropCount}  (loop should run during fade then self-stop)`);
  await page.waitForTimeout(500);
  const E_after = await sample(page, 1500);
  console.log(`  AFTER (1.5s, fade should be done): rAF=${E_after.rafCount}  setProp=${E_after.setPropCount}  (expect 0/0)`);

  await ctx.close();
  await browser.close();
})();
