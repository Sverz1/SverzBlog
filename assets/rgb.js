/* =========================================================
   SverzBlog — RGB per-key backlight engine
   ---------------------------------------------------------
   Palette: pastello cipria (soft, in tema col rosa/teal).
   Modes (cycle with Shift+ArrowUp / Shift+ArrowDown):
     0 reactive        — only pressed key lights up, fades out
     1 ripple          — wave expands outward from pressed key
     2 rainbow         — continuous diagonal rainbow wave
     3 breathing       — whole board pulses
     4 static          — fixed color on all keys
     5 reactive-rainbow— pressed key lights in random hue + propagates
   Speed (Shift+ArrowLeft / Shift+ArrowRight): 1..6, default 3

   Each keycap has a <span class="kc-led"> underglow overlay.
   We write CSS vars to the keycap (--led-a for alpha, --led-h
   for hue, --led-s/--led-l for saturation/lightness) and let
   CSS handle the actual glow. This lets animation coexist with
   hover/pressed states without JS repainting everything.

   External API (window.SVERZ_RGB):
     init()
     setMode(i)      — index or name
     setSpeed(n)     — 1..6
     onPress(keyEl)  — called by app.js when a key is tapped
   ========================================================= */
(function(){
  // Soft pastel cipria palette — hues (degrees), paired with
  // low saturation + high lightness so glows read as "tinted mist"
  // rather than neon.
  //   salmon · pesca · crema · menta · teal chiaro · lavanda · rosa
  const PASTEL_HUES = [8, 22, 42, 150, 175, 265, 330];
  // Saturation/lightness used for pastel LEDs
  const PASTEL_S = 78; // %
  const PASTEL_L = 72; // %

  const MODES = [
    { id:"reactive",        name:"REACT", label:"Reactive" },
    { id:"ripple",          name:"RIPPL", label:"Ripple" },
    { id:"rainbow",         name:"RAIN",  label:"Rainbow Wave" },
    { id:"breathing",       name:"BREAT", label:"Breathing" },
    { id:"static",          name:"STATC", label:"Static" },
    { id:"reactive-rainbow",name:"R-RBW", label:"Reactive Rainbow" },
  ];

  // Default = reactive-rainbow (index 5)
  let state = {
    modeIdx: 5,
    speed: 3,     // 1..6
    staticHue: 175, // teal chiaro for Static
    rafId: null,
    t0: performance.now(),
    // per-key transient events (reactive fades, ripple waves)
    ripples: [],   // {x, y, t0, hue}
    reacts: new Map(), // keyEl -> {t0, hue}
  };

  let keyEls = [];        // cached NodeList
  let keyCenters = [];    // {x, y} in plate-local coords
  let plateRect = null;
  let boardDiag = 1;

  // Per-key last-written values to dedupe setProperty calls.
  // Stored as Int16 hue (0..360, -1=unset) and Int16 alpha*1000 (0..1000, -1=unset).
  let lastH = null;
  let lastA = null;

  // Gates that pause the rAF loop when there's nothing to draw:
  //   tabVisible  → false when the browser tab is hidden
  //   stageVisible→ false when the keyboard stage is off-screen (user on hero)
  //   sceneDirty  → true when the engine has pending work (events, animated mode)
  // The loop self-stops on any tick where shouldRender() returns false; onPress /
  // setMode / setSpeed / visibility change call start() to wake it back up.
  let tabVisible = (typeof document.visibilityState === "undefined") || document.visibilityState !== "hidden";
  let stageVisible = true;

  // ---------- public API ----------
  function init(){
    cacheLayout();
    // Re-cache on resize / layout toggle
    window.addEventListener("resize", () => { cacheLayout(); });
    // Also when knob flips 75↔100
    const kb = document.getElementById("keyboard");
    if (kb){
      const mo = new MutationObserver(() => setTimeout(cacheLayout, 200));
      mo.observe(kb, {attributes:true, attributeFilter:["data-layout"]});
    }
    // Pause rAF when the tab is hidden — browsers throttle to 1Hz anyway, but
    // doing zero work is cleaner and lets the CPU truly idle.
    document.addEventListener("visibilitychange", () => {
      tabVisible = document.visibilityState !== "hidden";
      if (tabVisible) start();
    });
    // Pause rAF when the keyboard stage is fully off-screen (user is on the
    // hero / has scrolled past the keyboard). Saves continuous animation work
    // when nothing is being shown. We observe `.kb-stage-inner` because
    // `.kb-stage` itself is position:fixed inset:0 (always intersecting);
    // it's the inner element that actually slides in/out with scroll.
    const stageInner = document.querySelector("#keyboard-stage .kb-stage-inner");
    if (stageInner && "IntersectionObserver" in window){
      const io = new IntersectionObserver((entries) => {
        for (const e of entries){
          stageVisible = e.isIntersecting;
          if (stageVisible) start();
        }
      }, { root: null, threshold: 0 });
      io.observe(stageInner);
    }
    updateLabel();
    start();
  }

  function cacheLayout(){
    const kb = document.getElementById("keyboard");
    if (!kb) return;
    keyEls = Array.from(kb.querySelectorAll(".kc"));
    const plate = kb.querySelector(".kb-plate") || kb;
    plateRect = plate.getBoundingClientRect();
    keyCenters = keyEls.map(el => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width/2 - plateRect.left,
        y: r.top  + r.height/2 - plateRect.top,
      };
    });
    boardDiag = Math.hypot(plateRect.width, plateRect.height) || 1;
    // Reset memo arrays — layout changes may add/remove keys (75↔100 toggle)
    lastH = new Int16Array(keyEls.length).fill(-1);
    lastA = new Int16Array(keyEls.length).fill(-1);
    // Force a fresh paint of every key on the next render
    start();
  }

  function setMode(m){
    if (typeof m === "string"){
      const i = MODES.findIndex(x => x.id === m);
      if (i >= 0) state.modeIdx = i;
    } else {
      state.modeIdx = ((m % MODES.length) + MODES.length) % MODES.length;
    }
    // Clear transient events when changing mode to avoid carryover ghosts
    state.ripples.length = 0;
    state.reacts.clear();
    // New mode may want every key repainted from scratch (e.g. switching
    // OUT of static → reactive idle). Invalidate the memo to guarantee one
    // full redraw next tick.
    if (lastH) lastH.fill(-1);
    if (lastA) lastA.fill(-1);
    updateLabel(true);
    start();
  }

  function cycleMode(dir){
    setMode(state.modeIdx + (dir > 0 ? 1 : -1));
  }

  function setSpeed(n){
    state.speed = Math.max(1, Math.min(6, n|0));
    updateLabel(true);
    start();
  }

  function cycleSpeed(dir){
    setSpeed(state.speed + (dir > 0 ? 1 : -1));
  }

  // Modes that react to key presses with a glow + propagating ripple.
  // static / rainbow / breathing are "ambient" modes: the press is a no-op
  // for the LED engine — pattern keeps doing its thing, the keycap CSS
  // hover/pressed states still give the user tactile feedback.
  const REACTIVE_MODE_IDS = new Set(["reactive", "ripple", "reactive-rainbow"]);

  function onPress(keyEl){
    if (!keyEl) return;
    const mode = MODES[state.modeIdx].id;
    if (!REACTIVE_MODE_IDS.has(mode)) return; // ambient modes: no LED reaction

    // Pick a hue per the mode's character.
    let hue;
    if (mode === "reactive") {
      hue = 175; // soft teal — calm, single-color reactive
    } else {
      hue = PASTEL_HUES[Math.floor(Math.random() * PASTEL_HUES.length)];
    }

    // Transient glow on the pressed key itself.
    state.reacts.set(keyEl, { t0: performance.now(), hue });

    // Propagating ripple from the pressed key.
    const idx = keyEls.indexOf(keyEl);
    if (idx >= 0){
      const c = keyCenters[idx];
      // "short" ripple in non-ripple modes (reactive / reactive-rainbow):
      // tighter ring so the glow leads, the wave just hints at propagation.
      const short = (mode !== "ripple");
      state.ripples.push({
        x: c.x, y: c.y,
        t0: performance.now(),
        hue,
        short,
      });
      if (state.ripples.length > 16) state.ripples.splice(0, state.ripples.length - 16);
    }
    // Wake the loop if it self-paused on idle
    start();
  }

  // ---------- label (on-chassis LCD) ----------
  function updateLabel(flash){
    const mEl = document.getElementById("kbRgbMode");
    const sEl = document.getElementById("kbRgbSpeed");
    const wrap = document.getElementById("kbRgbLabel");
    if (mEl) mEl.textContent = MODES[state.modeIdx].name;
    if (sEl) sEl.textContent = "SPD " + state.speed;
    if (wrap && flash){
      wrap.classList.remove("is-flash");
      void wrap.offsetWidth;
      wrap.classList.add("is-flash");
    }
  }

  // ---------- main loop ----------
  // "Animated" modes need a fresh frame every tick because their hue/alpha
  // depend on `t`. Reactive / static / ripple modes are event-driven: they
  // only need ticks while transient events are unfolding.
  function isAnimatedMode(){
    const m = MODES[state.modeIdx].id;
    return m === "breathing" || m === "rainbow";
  }
  function hasPendingEvents(){
    return state.reacts.size > 0 || state.ripples.length > 0;
  }
  // Should the rAF loop continue after this tick?
  function shouldKeepRunning(){
    if (!tabVisible || !stageVisible) return false;
    if (isAnimatedMode()) return true;
    return hasPendingEvents();
  }

  function start(){
    if (state.rafId) return;
    if (!tabVisible || !stageVisible) return; // do nothing while hidden
    const tick = (now) => {
      render(now);
      if (shouldKeepRunning()){
        state.rafId = requestAnimationFrame(tick);
      } else {
        state.rafId = null; // self-pause until something wakes us
      }
    };
    state.rafId = requestAnimationFrame(tick);
  }

  // Speed curve: 1 = slow, 6 = fast.
  // Return a time-multiplier in "cycles per second"-ish units.
  function speedMul(){
    // 1 → 0.18, 2 → 0.32, 3 → 0.5, 4 → 0.72, 5 → 1.0, 6 → 1.4
    const table = [0.18, 0.32, 0.5, 0.72, 1.0, 1.4];
    return table[state.speed - 1] || 0.5;
  }

  // Ripple speed in px/s depending on global speed
  function rippleSpeedPx(){
    // Scales with board diagonal so it feels the same at 75% and 100%
    const base = boardDiag / 1.8; // ~1.8s to cross the board at speed 3
    return base * speedMul();
  }

  function render(now){
    if (!keyEls.length) return;
    const mode = MODES[state.modeIdx].id;
    const t = (now - state.t0) / 1000;
    const sp = speedMul();

    // Clean up expired transients
    const REACT_DUR = 900 / sp; // ms
    for (const [el, ev] of state.reacts){
      if (now - ev.t0 > REACT_DUR) state.reacts.delete(el);
    }
    const RIPPLE_DUR_LONG = 1400;  // ms of visible ring after emission
    const RIPPLE_DUR_SHORT = 650;
    state.ripples = state.ripples.filter(r => {
      const dur = r.short ? RIPPLE_DUR_SHORT : RIPPLE_DUR_LONG;
      return (now - r.t0) < dur;
    });

    // Per-mode base fill
    for (let i = 0; i < keyEls.length; i++){
      const el = keyEls[i];
      const c = keyCenters[i];
      let h = 0, s = PASTEL_S, l = PASTEL_L, a = 0;

      if (mode === "static"){
        h = state.staticHue; a = 0.42;
      } else if (mode === "breathing"){
        h = state.staticHue;
        const pulse = 0.5 + 0.5 * Math.sin(t * sp * 2.0);
        a = 0.14 + pulse * 0.42;
      } else if (mode === "rainbow"){
        // Diagonal traveling rainbow — hue depends on position + time
        const px = c ? (c.x / (plateRect.width || 1)) : 0;
        const py = c ? (c.y / (plateRect.height || 1)) : 0;
        const u = (px + py) * 0.5;
        // Map hue through pastel range — we rotate through PASTEL_HUES smoothly
        const phase = (u * 1.4 + t * sp * 0.25) % 1;
        h = pastelHueAt(phase);
        a = 0.42;
      } else if (mode === "reactive" || mode === "reactive-rainbow" || mode === "ripple"){
        // Idle dark base with faint teal sheen so the board doesn't look "dead"
        h = 175; a = 0.05;
      }

      // Ripple contribution — applies to ALL modes (press feedback)
      if (c && state.ripples.length){
        for (const r of state.ripples){
          const dt = (now - r.t0) / 1000;
          const radius = dt * rippleSpeedPx();
          const dist = Math.hypot(c.x - r.x, c.y - r.y);
          // Ring width grows slightly over time
          const width = 40 + dt * 60;
          const d = Math.abs(dist - radius);
          if (d < width){
            // Peak at d=0, falloff at edges
            const intensity = (1 - d/width);
            // Fade the whole ring over lifetime
            const dur = r.short ? 0.65 : 1.4;
            const life = Math.max(0, 1 - dt / dur);
            const add = intensity * life * (r.short ? 0.55 : 0.85);
            if (add > a){
              a = add;
              h = r.hue;
            } else {
              // blend hue slightly toward ripple if close
              a = Math.min(1, a + add * 0.4);
            }
          }
        }
      }

      // Reactive glow on the pressed key itself
      const reactEv = state.reacts.get(el);
      if (reactEv){
        const dt = (now - reactEv.t0) / 1000;
        const life = Math.max(0, 1 - dt / (REACT_DUR / 1000));
        const eased = life * life; // quad-out as it fades
        const add = 0.95 * eased;
        if (add > a){ a = add; h = reactEv.hue; }
      }

      // Write CSS vars — but only when they actually changed since last frame.
      // (--led-s / --led-l are hard-coded in .kc CSS, no need to set them here.)
      // Quantise to integer hue + alpha*1000 so steady-state pulses don't keep
      // dirtying the style.
      const hi = h | 0;
      const ai = (a * 1000) | 0;
      if (lastH[i] !== hi || lastA[i] !== ai){
        if (lastH[i] !== hi){ el.style.setProperty("--led-h", hi); lastH[i] = hi; }
        if (lastA[i] !== ai){ el.style.setProperty("--led-a", ai / 1000); lastA[i] = ai; }
      }
    }
  }

  // Smooth pastel hue interpolation: phase 0..1 → one of PASTEL_HUES
  function pastelHueAt(phase){
    const n = PASTEL_HUES.length;
    const f = phase * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const t = f - Math.floor(f);
    let a = PASTEL_HUES[i], b = PASTEL_HUES[j];
    // Wrap correctly across 360
    if (Math.abs(b - a) > 180){
      if (b < a) b += 360; else a += 360;
    }
    return (a + (b - a) * t) % 360;
  }

  window.SVERZ_RGB = {
    init, setMode, setSpeed, cycleMode, cycleSpeed, onPress,
    getMode: () => MODES[state.modeIdx],
    getSpeed: () => state.speed,
    MODES,
  };
})();
