// SverzBlog perf probe v2
// Note: python -m http.server doesn't gzip → raw sizes ~3x what gh-pages serves.
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8765/';

async function measure(label, cpuThrottle, networkThrottle) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);

  await client.send('Performance.enable');
  await client.send('Network.enable');

  if (cpuThrottle > 1) {
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }
  if (networkThrottle) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: networkThrottle.latency,
      downloadThroughput: networkThrottle.download,
      uploadThroughput: networkThrottle.upload,
    });
  }

  const responses = [];
  page.on('response', async (res) => {
    const url = res.url();
    const headers = res.headers();
    const cl = parseInt(headers['content-length'] || '0', 10);
    const ct = headers['content-type'] || '';
    responses.push({ url: url.replace('http://127.0.0.1:8765', ''), cl, ct });
  });

  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const out = {};
    const navEntry = performance.getEntriesByType('navigation')[0];
    if (navEntry) { out.dcl = navEntry.domContentLoadedEventEnd; out.load = navEntry.loadEventEnd; }
    for (const p of performance.getEntriesByType('paint')) {
      if (p.name === 'first-contentful-paint') out.fcp = p.startTime;
    }
    return new Promise((resolve) => {
      let lcp = 0;
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = entry.startTime;
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => { po.disconnect(); out.lcp = lcp; resolve(out); }, 500);
      } catch (e) { resolve(out); }
    });
  });

  // Sample 60 frames to characterise rAF cadence + sync work per frame
  const renderCost = await page.evaluate(() => {
    return new Promise((resolve) => {
      const N = 60;
      const samples = [];
      let prev = performance.now();
      let count = 0;
      const tick = () => {
        const t0 = performance.now();
        document.body.offsetHeight; // force layout to reveal pending style work
        const t1 = performance.now();
        samples.push({ interval: t0 - prev, syncWork: t1 - t0 });
        prev = t0;
        count++;
        if (count < N) requestAnimationFrame(tick);
        else {
          const avgInt = samples.reduce((s, x) => s + x.interval, 0) / N;
          const avgWork = samples.reduce((s, x) => s + x.syncWork, 0) / N;
          const maxInt = Math.max(...samples.map(x => x.interval));
          resolve({
            avgIntervalMs: avgInt.toFixed(2),
            maxIntervalMs: maxInt.toFixed(2),
            avgForcedLayoutMs: avgWork.toFixed(2),
            fps: (1000 / avgInt).toFixed(1),
          });
        }
      };
      requestAnimationFrame(tick);
    });
  });

  // Long tasks (>50ms blocking main thread)
  const longTasks = await page.evaluate(() => {
    return new Promise((resolve) => {
      const tasks = [];
      try {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) tasks.push({ duration: e.duration, start: e.startTime });
        });
        po.observe({ type: 'longtask', buffered: true });
        setTimeout(() => { po.disconnect(); resolve(tasks); }, 200);
      } catch (e) { resolve([]); }
    });
  });

  const rgbState = await page.evaluate(() => {
    if (!window.SVERZ_RGB) return { ok: false };
    return {
      ok: true,
      keysAnimated: document.querySelectorAll('.kb .kc').length,
      perFrameStyleWrites: document.querySelectorAll('.kb .kc').length * 4,
      kbStageOnScreen: (() => {
        const s = document.getElementById('keyboard-stage');
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      })(),
    };
  });

  const perfMetrics = await client.send('Performance.getMetrics');
  const m = {};
  for (const x of perfMetrics.metrics) m[x.name] = x.value;

  await ctx.close();
  await browser.close();

  const byType = {};
  for (const r of responses) {
    let b = 'other';
    if (/\.js(\?|$)/.test(r.url)) b = 'js';
    else if (/\.css(\?|$)/.test(r.url)) b = 'css';
    else if (r.url === '/' || r.url.endsWith('.html')) b = 'html';
    else if (r.ct.includes('font') || r.url.includes('fonts.g')) b = 'font';
    else if (r.ct.includes('image') || /\.(png|webp|jpg|svg)/.test(r.url)) b = 'image';
    byType[b] = (byType[b] || 0) + (r.cl || 0);
  }
  const totalKB = (Object.values(byType).reduce((s, v) => s + v, 0) / 1024).toFixed(0);

  return {
    label, metrics, renderCost, rgbState,
    longTasksCount: longTasks.length,
    longTasksTotalMs: longTasks.reduce((s, t) => s + t.duration, 0).toFixed(0),
    scriptDurationS: m.ScriptDuration?.toFixed(3),
    styleRecalcS: m.RecalcStyleDuration?.toFixed(3),
    layoutS: m.LayoutDuration?.toFixed(3),
    jsHeapMB: (m.JSHeapUsedSize / 1024 / 1024).toFixed(1),
    byType, totalKB,
  };
}

const scenarios = [
  { label: 'Desktop (no throttle)', cpu: 1, net: null },
  { label: 'Mid-range (4x CPU)', cpu: 4, net: null },
  { label: 'Low-end (8x CPU + slow 3G)', cpu: 8, net: { latency: 300, download: 400 * 1024 / 8, upload: 100 * 1024 / 8 } },
];

const results = [];
for (const s of scenarios) {
  console.log(`\n[run] ${s.label}…`);
  results.push(await measure(s.label, s.cpu, s.net));
}

console.log('\n========== RESULTS ==========\n');
for (const r of results) {
  console.log(`### ${r.label}`);
  console.log(`  FCP / LCP:           ${r.metrics.fcp?.toFixed(0)} / ${r.metrics.lcp?.toFixed(0)} ms`);
  console.log(`  DCL / Load:          ${r.metrics.dcl?.toFixed(0)} / ${r.metrics.load?.toFixed(0)} ms`);
  console.log(`  Script exec total:   ${r.scriptDurationS} s`);
  console.log(`  Style recalc total:  ${r.styleRecalcS} s`);
  console.log(`  Layout total:        ${r.layoutS} s`);
  console.log(`  Long tasks:          ${r.longTasksCount} (${r.longTasksTotalMs} ms total)`);
  console.log(`  rAF interval avg:    ${r.renderCost.avgIntervalMs} ms (~${r.renderCost.fps} fps)`);
  console.log(`  rAF interval max:    ${r.renderCost.maxIntervalMs} ms`);
  console.log(`  Forced layout / fr:  ${r.renderCost.avgForcedLayoutMs} ms`);
  console.log(`  Keys animated:       ${r.rgbState.keysAnimated}  → ${r.rgbState.perFrameStyleWrites} style writes/frame`);
  console.log(`  KB stage on screen:  ${r.rgbState.kbStageOnScreen} (rAF runs anyway → wasted work if false)`);
  console.log(`  Bytes (raw, no gz):  ${r.totalKB} KB total`);
  console.log(`     JS / CSS / Font / HTML: ${(r.byType.js/1024).toFixed(0)} / ${(r.byType.css/1024).toFixed(0)} / ${(r.byType.font/1024).toFixed(0)} / ${(r.byType.html/1024).toFixed(0)} KB`);
  console.log(`  JS heap:             ${r.jsHeapMB} MB`);
  console.log();
}
