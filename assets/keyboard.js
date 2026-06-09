/* =========================================================
   SverzBlog — keyboard builder
   Builds a 75% layout (with expansion to 100% on ultrawide).
   Each key is a .kc element with data-key, data-w (width units),
   data-section (maps to a content window), data-accent, etc.
   ========================================================= */
(function(){

  // -------- Key metadata --------
  // section: which window to open when clicked
  // label: main legend
  // sub: sub-legend (bottom-left, visible on section keys)
  // w: width in units (1u default)
  // accent: true = orange keycap (Akko-style)
  // lock: caps/num/scroll locks (light)
  // letter: treat as letter key (center legend, bigger)
  // shortcut: keyboard shortcut string for tooltip
  //
  // Sections wired:
  //   W = writeups
  //   N = notes
  //   C = cheatsheets
  //   T = tools
  //   R = research
  //   A = about
  //   H = home/reset
  //   / = search
  //   ? = help

  const KEYS_75 = [
    // Row 0 — function row (4-4-4 clusters with gaps; knob replaces PrtSc)
    // Row totals to 16.5u + 14 gaps, matching rows 1-3 exactly.
    // Cluster gaps: 0.25u between F-clusters, 0.5u before the right nav column
    // (so Del+Knob align with the offset Home/PgUp/PgDn/End cluster).
    [
      {k:"Escape", label:"Esc", section:"home", accent:true, small:true, shortcut:"Esc", marginRight:0.25},
      {k:"F1", label:"F1", small:true},
      {k:"F2", label:"F2", small:true},
      {k:"F3", label:"F3", small:true},
      {k:"F4", label:"F4", small:true, marginRight:0.25},
      {k:"F5", label:"F5", small:true},
      {k:"F6", label:"F6", small:true},
      {k:"F7", label:"F7", small:true},
      {k:"F8", label:"F8", small:true, marginRight:0.25},
      {k:"F9", label:"F9", small:true},
      {k:"F10", label:"F10", small:true},
      {k:"F11", label:"F11", small:true},
      // F12 mr = 0.25u + 1g aligns Del's right edge with Backspace's (row 1)
      {k:"F12", label:"F12", small:true, marginRight:"calc(var(--u) * 0.25 + var(--gap))"},
      {k:"Delete", label:"Del", small:true, shortcut:"Del", marginRight:0.25},
      {knob:true},
    ],

    // Row 1 — number row
    [
      {k:"`", label:"~", small:true},
      {k:"1", label:"1", small:true},
      {k:"2", label:"2", small:true},
      {k:"3", label:"3", small:true},
      {k:"4", label:"4", small:true},
      {k:"5", label:"5", small:true},
      {k:"6", label:"6", small:true},
      {k:"7", label:"7", small:true},
      {k:"8", label:"8", small:true},
      {k:"9", label:"9", small:true},
      {k:"0", label:"0", small:true},
      {k:"-", label:"-", small:true},
      {k:"=", label:"=", small:true},
      {k:"Backspace", label:"⌫", w:2, small:true, shortcut:"⌫", marginRight:0.5},
      {k:"Home", label:"Home", small:true},
    ],

    // Row 2 — QWERTY top
    [
      {k:"Tab", label:"Tab", w:1.5, small:true},
      {k:"q", label:"Q", letter:true},
      {k:"w", label:"W", section:"writeups", letter:true, shortcut:"W"},
      {k:"e", label:"E", section:"enumeration", letter:true, shortcut:"E"},
      {k:"r", label:"R", letter:true},
      {k:"t", label:"T", letter:true},
      {k:"y", label:"Y", letter:true},
      {k:"u", label:"U", letter:true},
      {k:"i", label:"I", letter:true},
      {k:"o", label:"O", letter:true},
      {k:"p", label:"P", letter:true},
      {k:"[", label:"[", small:true},
      {k:"]", label:"]", small:true},
      {k:"\\", label:"\\", w:1.5, small:true, marginRight:0.5},
      {k:"PageUp", label:"PgUp", small:true},
    ],

    // Row 3 — home row
    [
      {k:"CapsLock", label:"Caps", w:1.75, small:true, lock:"caps"},
      {k:"a", label:"A", section:"about", letter:true, shortcut:"A"},
      {k:"s", label:"S", letter:true},
      {k:"d", label:"D", letter:true},
      {k:"f", label:"F", section:"fundamentals", letter:true, shortcut:"F"},
      {k:"g", label:"G", letter:true},
      {k:"h", label:"H", section:"home", letter:true, shortcut:"H"},
      {k:"j", label:"J", letter:true},
      {k:"k", label:"K", letter:true},
      {k:"l", label:"L", letter:true},
      {k:";", label:";", small:true},
      {k:"'", label:"'", small:true},
      {k:"Enter", label:"⏎", w:2.25, accent:true, small:true, shortcut:"⏎", marginRight:0.5},
      {k:"PageDown", label:"PgDn", small:true},
    ],

    // Row 4 — bottom letter row
    [
      {k:"Shift", label:"⇧", w:2.25, small:true, shortcut:"⇧"},
      {k:"z", label:"Z", letter:true},
      {k:"x", label:"X", letter:true},
      {k:"c", label:"C", section:"cheatsheets", letter:true, shortcut:"C"},
      {k:"v", label:"V", letter:true},
      {k:"b", label:"B", letter:true},
      {k:"n", label:"N", section:"notes", letter:true, shortcut:"N"},
      {k:"m", label:"M", letter:true},
      {k:",", label:",", small:true},
      {k:".", label:".", small:true},
      {k:"/", label:"/", section:"help", small:true, shortcut:"?"},
      {k:"Shift", label:"⇧", w:1.75, small:true, marginRight:0.5},
      {k:"ArrowUp", label:"▲", small:true},
      {k:"End", label:"End", small:true},
    ],

    // Row 5 — bottom row (modifiers + space)
    [
      {k:"Control", label:"Ctrl", w:1.25, small:true},
      {k:"Meta", label:"⌘", w:1.25, small:true},
      {k:"Alt", label:"Alt", w:1.25, small:true},
      {k:" ", label:" ", front:"sverz1 · offsec notebook", w:6.25, accent:true, space:true, section:"help", shortcut:"Space"},
      {k:"Alt", label:"Alt", w:1, small:true},
      {k:"Fn", label:"Fn", w:1, small:true},
      {k:"Control", label:"Ctrl", w:1, small:true, marginRight:0.5},
      {k:"ArrowLeft", label:"◀", small:true},
      {k:"ArrowDown", label:"▼", small:true},
      {k:"ArrowRight", label:"▶", small:true},
    ],
  ];

  // -------- Build --------
  function buildKeyboard(targetEl){
    targetEl.innerHTML = "";
    const plate = document.createElement("div");
    plate.className = "kb-plate";
    targetEl.appendChild(plate);

    // RGB mini-display — small etched label on the chassis (top-left of plate)
    const rgbLabel = document.createElement("div");
    rgbLabel.className = "kb-rgb-label";
    rgbLabel.id = "kbRgbLabel";
    rgbLabel.innerHTML = `
      <span class="kb-rgb-ico" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 1.5 L6 4 M9.2 2.8 L7.4 4.6 M10.5 6 L8 6 M9.2 9.2 L7.4 7.4 M6 10.5 L6 8 M2.8 9.2 L4.6 7.4 M1.5 6 L4 6 M2.8 2.8 L4.6 4.6"/>
          <circle cx="6" cy="6" r="1.6"/>
        </svg>
      </span>
      <span class="kb-rgb-mode" id="kbRgbMode">RAIN</span>
      <span class="kb-rgb-sep">·</span>
      <span class="kb-rgb-speed" id="kbRgbSpeed">SPD 3</span>
      <span class="kb-rgb-hint"><kbd>⇧</kbd><kbd>↕</kbd>mode <kbd>⇧</kbd><kbd>↔</kbd>speed</span>
    `;
    plate.appendChild(rgbLabel);

    KEYS_75.forEach((row, ri) => {
      const rowEl = document.createElement("div");
      rowEl.className = "kb-row";
      rowEl.dataset.row = ri;
      row.forEach(def => {
        if (def.spacer){
          const sp = document.createElement("span");
          sp.className = "kb-spacer";
          sp.style.setProperty("--w", def.spacer);
          rowEl.appendChild(sp);
        } else if (def.knob){
          const knob = buildKnob();
          if (def.marginRight) knob.style.marginRight = `calc(var(--u) * ${def.marginRight})`;
          rowEl.appendChild(knob);
        } else {
          rowEl.appendChild(buildKey(def));
        }
      });
      plate.appendChild(rowEl);
    });

    // Right column: houses the LCD tamagotchi + numpad — visible only at 100%
    const right = document.createElement("div");
    right.className = "kb-right";

    // LCD tamagotchi — compact single-line pixel pet screen (visible only when layout=100)
    const lcd = document.createElement("div");
    lcd.className = "kb-tama";
    lcd.id = "kbTama";
    lcd.innerHTML = `
      <div class="kb-tama-bezel">
        <div class="kb-tama-screen" id="kbTamaScreen" title="click to feed">
          <div class="kb-tama-scan"></div>
          <div class="kb-tama-hud">
            <span class="kb-tama-hud-l"><span id="tamaName">r00t.pet</span></span>
            <span class="kb-tama-hud-r"><span id="tamaAge">lv01</span> · <span id="tamaStat">hp85</span></span>
          </div>
          <div class="kb-tama-stage">
            <span class="kb-tama-sprite" id="tamaSprite">[o_o]</span>
            <span class="kb-tama-status" id="tamaStatus">idle</span>
          </div>
        </div>
      </div>`;
    right.appendChild(lcd);

    targetEl.appendChild(right);
  }

  function buildKnob(){
    const wrap = document.createElement("div");
    wrap.className = "kb-knob-slot";
    wrap.innerHTML = `
      <div class="kb-knob" id="kbKnob" title="click: toggle 75% ↔ 100% · drag: volume">
        <div class="kb-knob-ring"></div>
        <div class="kb-knob-dial">
          <div class="kb-knob-ticks"></div>
          <div class="kb-knob-indicator"></div>
          <div class="kb-knob-cap"></div>
        </div>
      </div>`;
    return wrap;
  }

  function buildKey(def){
    const el = document.createElement("button");
    el.className = "kc";
    el.type = "button";
    el.dataset.key = def.k;
    if (def.section) el.dataset.section = def.section;
    if (def.accent) el.dataset.accent = "";
    if (def.letter) el.dataset.letter = "";
    if (def.small) el.dataset.small = "";
    if (def.lock) el.dataset.lock = def.lock;
    if (def.space) el.dataset.space = "";
    if (def.w) {
      el.dataset.w = def.w;
      el.style.setProperty("--w", def.w);
    }
    if (def.h) {
      el.dataset.h = def.h;
      el.style.setProperty("--h", def.h);
    }
    if (def.marginRight) {
      el.style.marginRight = typeof def.marginRight === "string"
        ? def.marginRight
        : `calc(var(--u) * ${def.marginRight})`;
    }

    const cap = document.createElement("span");
    cap.className = "cap";
    el.appendChild(cap);

    // Per-key RGB LED overlay (underglow around the keycap)
    const led = document.createElement("span");
    led.className = "kc-led";
    el.appendChild(led);

    const lwrap = document.createElement("span");
    lwrap.className = "legend-wrap";

    const legend = document.createElement("span");
    legend.className = "legend";
    legend.textContent = def.label || "";
    lwrap.appendChild(legend);

    el.appendChild(lwrap);

    // Tooltip
    if (def.section || def.shortcut){
      const tip = document.createElement("span");
      tip.className = "kc-tip";
      const sec = def.section ? `<span class="kc-section">${labelForSection(def.section)}</span>` : "";
      const sh = def.shortcut ? `<span class="kc-shortcut">${def.shortcut}</span>` : "";
      tip.innerHTML = sec + sh;
      if (sec && sh) tip.innerHTML = sec + " " + sh;
      if (!sec && sh) tip.innerHTML = "press " + sh;
      el.appendChild(tip);
    }

    return el;
  }

  function labelForSection(s){
    return {
      writeups:"Writeups & walkthroughs",
      enumeration:"Enumeration checklists",
      notes:"Misc notes",
      cheatsheets:"Cheatsheets",
      fundamentals:"Fundamentals · theory",
      about:"whoami — about me",
      home:"home — reset",
      help:"help & shortcuts",
    }[s] || s;
  }

  // Numpad (shown in 100% layout).
  // Flat list — grid auto-placement handles row/col spans for + and Enter,
  // so 4-5-6 and the 0-row don't end up with empty cells.
  const NUMPAD = [
    // Top row
    {k:"NumLock",label:"Num",small:true,lock:"num"},
    {k:"/",label:"/",small:true},
    {k:"*",label:"*",small:true},
    {k:"-",label:"-",small:true},
    // Row 7-8-9-+
    {k:"7",label:"7",letter:true},
    {k:"8",label:"8",letter:true},
    {k:"9",label:"9",letter:true},
    {k:"+",label:"+",h:2,small:true},
    // Row 4-5-6 (+ continues from above)
    {k:"4",label:"4",letter:true},
    {k:"5",label:"5",letter:true},
    {k:"6",label:"6",letter:true},
    // Row 1-2-3-Enter
    {k:"1",label:"1",letter:true},
    {k:"2",label:"2",letter:true},
    {k:"3",label:"3",letter:true},
    {k:"Enter",label:"⏎",h:2,accent:true,small:true},
    // Bottom: 0 (2-wide) + .  (Enter continues from above)
    {k:"0",label:"0",w:2,letter:true},
    {k:".",label:".",small:true},
  ];

  function buildNumpad(targetEl){
    const right = targetEl.querySelector(".kb-right");
    if (!right) return;
    const old = right.querySelector(".kb-numpad");
    if (old) old.remove();
    const pad = document.createElement("div");
    pad.className = "kb-numpad";
    NUMPAD.forEach(def => pad.appendChild(buildKey(def)));
    right.appendChild(pad);
  }

  window.SVERZ_KB = { buildKeyboard, buildNumpad, labelForSection, KEYS_75 };
})();
