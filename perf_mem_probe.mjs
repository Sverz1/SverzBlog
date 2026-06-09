// Memory-focused probe (v2: CDP-based — performance.memory is rounded in headless).
//
// Uses Performance.getMetrics (real heap counters via Blink) + HeapProfiler.collectGarbage
// to force a major GC between measurements. document.getElementsByTagName("*").length
// is reliable for DOM-node leak detection.
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/';

async function gc(client){
  await client.send('HeapProfiler.collectGarbage');
}

async function snapshot(client, page){
  await gc(client);
  // Two GCs to drain finalizers
  await client.send('HeapProfiler.collectGarbage');
  const m = await client.send('Performance.getMetrics');
  const map = {}; for (const x of m.metrics) map[x.name] = x.value;
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  return {
    heapUsed: map.JSHeapUsedSize,
    heapTotal: map.JSHeapTotalSize,
    cdpNodes: map.Nodes,
    domNodes: nodes,
    listeners: map.JSEventListeners,
    layoutObjects: map.LayoutObjects,
  };
}

function fmt(b){ return (b/1024/1024).toFixed(2) + 'MB'; }

function row(label, s){
  console.log(`  ${label.padEnd(28)} heap=${fmt(s.heapUsed).padStart(7)}  total=${fmt(s.heapTotal).padStart(7)}  nodes(dom/cdp)=${s.domNodes}/${s.cdpNodes}  listeners=${s.listeners}  layout=${s.layoutObjects}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);
  await client.send('Performance.enable');
  await client.send('HeapProfiler.enable');

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // -- 1) baseline --
  console.log('=== 1) Baseline ===');
  const s0 = await snapshot(client, page);
  row('post-load + GC', s0);

  // -- 2) SVERZ_DATA payload --
  const dataInfo = await page.evaluate(() => {
    const d = window.SVERZ_DATA || {};
    let totalBody = 0, totalDesc = 0, totalItems = 0;
    const summary = {};
    for (const k of Object.keys(d)){
      const arr = d[k];
      if (!Array.isArray(arr)) continue;
      let body = 0, desc = 0;
      for (const it of arr){ body += (it.body || '').length; desc += (it.desc || '').length; }
      summary[k] = { items: arr.length, body };
      totalBody += body; totalDesc += desc; totalItems += arr.length;
    }
    return { summary, totalBody, totalDesc, totalItems };
  });
  console.log('\n=== 2) SVERZ_DATA payload ===');
  console.log(`  total items: ${dataInfo.totalItems}`);
  console.log(`  total body : ${dataInfo.totalBody.toLocaleString()} chars (~${fmt(dataInfo.totalBody * 2)} as UTF-16 in heap)`);
  console.log(`  total desc : ${dataInfo.totalDesc.toLocaleString()} chars`);
  for (const [k, v] of Object.entries(dataInfo.summary)){
    console.log(`    ${k.padEnd(15)} ${v.items} items, body=${(v.body/1024).toFixed(0)}KB`);
  }

  // -- 3) 30s rainbow stress (kb visible) --
  console.log('\n=== 3) 30s in rainbow mode, sampling every 5s ===');
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.SVERZ_RGB && window.SVERZ_RGB.setMode('rainbow'));
  const stressBase = await snapshot(client, page);
  row('start', stressBase);
  for (let t = 5; t <= 30; t += 5){
    await page.waitForTimeout(5000);
    const m = await client.send('Performance.getMetrics');
    const map = {}; for (const x of m.metrics) map[x.name] = x.value;
    console.log(`  t=${t.toString().padStart(2)}s  heap=${fmt(map.JSHeapUsedSize).padStart(7)}  listeners=${map.JSEventListeners}`);
  }
  const stressEnd = await snapshot(client, page);
  row('after 30s + GC', stressEnd);
  console.log(`  Δ heap: ${((stressEnd.heapUsed - stressBase.heapUsed)/1024).toFixed(1)} KB`);

  // -- 4) idle on hero (loop should be self-paused) --
  console.log('\n=== 4) 10s idle on hero (rAF paused by IntersectionObserver) ===');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.SVERZ_RGB && window.SVERZ_RGB.setMode('reactive-rainbow'));
  await page.waitForTimeout(500);
  const idle0 = await snapshot(client, page);
  await page.waitForTimeout(10000);
  const idle1 = await snapshot(client, page);
  row('start', idle0);
  row('after 10s + GC', idle1);
  console.log(`  Δ heap: ${((idle1.heapUsed - idle0.heapUsed)/1024).toFixed(1)} KB`);

  // -- 5) open/close cycles (leak hunt) --
  console.log('\n=== 5) Open/close cycles (DOM leak + listener growth) ===');
  await page.evaluate(() => window.scrollTo(0, 1300));
  await page.waitForTimeout(400);
  const cycle0 = await snapshot(client, page);
  row('before', cycle0);

  const sections = await page.evaluate(() => Object.keys(window.SVERZ_DATA || {}).filter(k => Array.isArray(window.SVERZ_DATA[k]) && window.SVERZ_DATA[k].length));
  console.log(`  sections: ${sections.join(', ')}`);
  const CYCLES = 5;
  for (let c = 0; c < CYCLES; c++){
    for (const s of sections){
      await page.evaluate((s) => window.SVERZ_WIN && window.SVERZ_WIN.open(s), s);
      await page.waitForTimeout(60);
      await page.evaluate(() => window.SVERZ_WIN && window.SVERZ_WIN.closeAll());
      await page.waitForTimeout(60);
    }
  }
  const cycle1 = await snapshot(client, page);
  row(`after ${CYCLES * sections.length} open/close`, cycle1);
  console.log(`  Δ heap     : ${((cycle1.heapUsed - cycle0.heapUsed)/1024).toFixed(1)} KB`);
  console.log(`  Δ DOM nodes: ${cycle1.domNodes - cycle0.domNodes}`);
  console.log(`  Δ listeners: ${cycle1.listeners - cycle0.listeners}`);
  console.log(`  Δ layout   : ${cycle1.layoutObjects - cycle0.layoutObjects}`);

  // -- 6) hammer: open every section AND leave them open --
  console.log('\n=== 6) Open ALL section windows at once (peak DOM/heap) ===');
  await page.evaluate(() => window.SVERZ_WIN && window.SVERZ_WIN.closeAll());
  await page.waitForTimeout(200);
  for (const s of sections){
    await page.evaluate((s) => window.SVERZ_WIN && window.SVERZ_WIN.open(s), s);
    await page.waitForTimeout(40);
  }
  const peak = await snapshot(client, page);
  row('peak (all windows open)', peak);
  await page.evaluate(() => window.SVERZ_WIN && window.SVERZ_WIN.closeAll());
  await page.waitForTimeout(400);
  const recovered = await snapshot(client, page);
  row('after closeAll + GC', recovered);
  console.log(`  Δ heap retained vs baseline : ${((recovered.heapUsed - s0.heapUsed)/1024).toFixed(1)} KB`);
  console.log(`  Δ DOM nodes retained        : ${recovered.domNodes - s0.domNodes}`);
  console.log(`  Δ listeners retained        : ${recovered.listeners - s0.listeners}`);

  await ctx.close();
  await browser.close();
})();
