/* =========================================================
   SverzBlog — app wiring
   - builds keyboard on load
   - scroll-driven keyboard entrance (progress 0→1)
   - key presses (mouse + keyboard) open windows
   - easter-egg typed sequences
   - toolbar: theme, close-all, help
   - LCD status updates (caps/num/scroll, current mode/layer)
   ========================================================= */
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  // ---------- Boot ----------
  function boot(){
    // Build the keyboard into #keyboard
    window.SVERZ_KB.buildKeyboard($("#keyboard"));
    window.SVERZ_KB.buildNumpad($("#keyboard"));
    wireKeys();
    wireScroll();
    wireGlobalKeys();
    wireToolbar();
    wireScrollCue();
    wireKnob();
    hydrateMetaGrid();
    // Boot RGB engine AFTER keys are in the DOM
    if (window.SVERZ_RGB) window.SVERZ_RGB.init();
    setLCD("IDLE", "LYR 0");
  }

  // Populate the hero meta-grid counters from SVERZ_DATA on boot
  function hydrateMetaGrid(){
    const D = window.SVERZ_DATA;
    if (!D || !D.counts) return;
    const set = (id, v) => { const el = $("#" + id); if (el) el.textContent = v; };
    set("cWriteups", D.counts.writeups || 0);
    set("cEnum",     D.counts.enumeration || 0);
    set("cNotes",    D.counts.notes || 0);
    set("cCheats",   D.counts.cheatsheets || 0);
    set("cFundamentals", D.counts.fundamentals || 0);
    // Build hash = short hash of counts; gives a stable "version" string
    try {
      const s = JSON.stringify(D.counts);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h<<5) - h + s.charCodeAt(i)) | 0;
      const hash = ("0000000" + (h >>> 0).toString(16)).slice(-7);
      const bh = $("#buildHash"); if (bh) bh.textContent = hash;
    } catch(e){}
  }

  // ---------- Input priority helpers ----------
  // When the user is typing (search input, any <input>/<textarea>,
  // contentEditable, or the search window is focused) we must NOT
  // treat letter/symbol key presses as section shortcuts.
  function isTypingContext(e){
    const t = (e && e.target) || document.activeElement;
    if (!t || t === document.body) return false;
    const tag = (t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (t.isContentEditable) return true;
    // Search window open? Its panel has data-section="search"
    const searchWin = document.querySelector('.win[data-section="search"]');
    if (searchWin && searchWin.contains(t)) return true;
    return false;
  }

  // ---------- Rotary knob: click = toggle 75%↔100%, drag/scroll = rotate ----------
  function wireKnob(){
    const knob = $("#kbKnob");
    if (!knob) return;
    let rot = 0, dragging = false, moved = 0, lastAngle = 0;
    const kb = $("#keyboard");
    const center = () => {
      const r = knob.getBoundingClientRect();
      return {x: r.left + r.width/2, y: r.top + r.height/2};
    };
    const angleOf = (e) => {
      const c = center();
      return Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
    };
    knob.addEventListener("mousedown", e => {
      dragging = true; moved = 0;
      lastAngle = angleOf(e);
      e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      const a = angleOf(e);
      let d = a - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      rot += d; moved += Math.abs(d);
      lastAngle = a;
      knob.style.setProperty("--kn-rot", rot + "deg");
    });
    window.addEventListener("mouseup", () => dragging = false);
    knob.addEventListener("click", e => {
      // distinguish click from drag
      if (moved > 8) { moved = 0; return; }
      toggleLayout();
    });
    knob.addEventListener("wheel", e => {
      e.preventDefault();
      rot += e.deltaY > 0 ? 18 : -18;
      knob.style.setProperty("--kn-rot", rot + "deg");
    }, {passive:false});

    function toggleLayout(){
      const cur = kb.dataset.layout || "75";
      const next = cur === "75" ? "100" : "75";
      kb.dataset.layout = next;
      // spin the knob visually
      rot += next === "100" ? 180 : -180;
      knob.style.setProperty("--kn-rot", rot + "deg");
      setLCD(next + "% LAYOUT");
      // Boot/shutdown the tamagotchi based on layout
      if (next === "100") bootTama(); else sleepTama();
    }
  }

  // ---------- Offsec Tamagotchi (LCD pet) ----------
  // Compact single-line pixel pet. Lives only when keyboard is at 100%.
  const TAMA_SPRITES = {
    idle:   ["[o_o]", "[o.o]", "[-.-]", "[o_O]"],
    hack:   ["[>_<]", "[$_$]", "[x_x]"],
    shell:  ["[^_^]", "[*_*]"],
    caught: ["[X_X]", "[!_!]"],
    sleep:  ["[-_-]", "[z_z]"],
    feed:   ["[^ω^]", "[+_+]"],
  };
  const TAMA_STATUS = {
    idle:   ["sniffing packets", "reading exploitdb", "nmap -sC -sV", "burp idle", "ls /dev/null"],
    hack:   ["pwning /root", "bruteforce...", "fuzzing :80", "popping shell"],
    shell:  ["got r00t!", "shell ok"],
    caught: ["EDR alert!", "blue team ack", "sandboxed"],
    sleep:  ["zzz..."],
    feed:   ["nom nom CVE", "payload fed"],
  };
  let tamaState = {
    mode: "idle",
    frame: 0,
    hp: 85, xp: 40, fd: 60,
    lv: 1,
    age: 0,
    loopId: null,
  };
  function renderTama(){
    const sprite = document.getElementById("tamaSprite");
    const status = document.getElementById("tamaStatus");
    if (!sprite) return;
    const frames = TAMA_SPRITES[tamaState.mode] || TAMA_SPRITES.idle;
    sprite.textContent = frames[tamaState.frame % frames.length];
    const statuses = TAMA_STATUS[tamaState.mode] || TAMA_STATUS.idle;
    status.textContent = statuses[Math.floor(Math.random()*statuses.length)];
    const ageEl = document.getElementById("tamaAge");
    const statEl = document.getElementById("tamaStat");
    if (ageEl) ageEl.textContent = "lv" + String(tamaState.lv).padStart(2,"0");
    // Cycle which stat is shown on the HUD-right (hp → xp → fd)
    const statCycle = tamaState.age % 3;
    if (statEl){
      if (statCycle === 0)      statEl.textContent = "hp" + tamaState.hp;
      else if (statCycle === 1) statEl.textContent = "xp" + tamaState.xp;
      else                       statEl.textContent = "fd" + tamaState.fd;
    }
  }
  function tamaTick(){
    tamaState.age++;
    tamaState.fd = Math.max(0, tamaState.fd - 3);
    if (tamaState.fd < 20) tamaState.hp = Math.max(0, tamaState.hp - 2);
    const r = Math.random();
    if (tamaState.mode === "idle"){
      if (r < 0.2) setTamaMode("hack", 2);
      else tamaState.frame++;
    } else {
      tamaState.frame++;
      if (r < 0.4){
        if (tamaState.mode === "hack"){
          if (Math.random() < 0.7){
            setTamaMode("shell", 1);
            tamaState.xp = Math.min(100, tamaState.xp + 7);
            if (tamaState.xp >= 100){ tamaState.xp = 0; tamaState.lv++; }
          } else {
            setTamaMode("caught", 1);
            tamaState.hp = Math.max(0, tamaState.hp - 10);
          }
        } else {
          setTamaMode("idle", 0);
        }
      }
    }
    renderTama();
  }
  function setTamaMode(mode, glitch){
    tamaState.mode = mode;
    tamaState.frame = 0;
    const sprite = document.getElementById("tamaSprite");
    if (sprite && glitch){
      sprite.classList.remove("is-action");
      void sprite.offsetWidth;
      sprite.classList.add("is-action");
    }
  }
  function bootTama(){
    const screen = document.getElementById("kbTamaScreen");
    if (screen && !screen.dataset.wired){
      screen.dataset.wired = "1";
      screen.addEventListener("click", () => {
        // Feed: restore hunger
        tamaState.fd = Math.min(100, tamaState.fd + 25);
        setTamaMode("feed", 1);
        renderTama();
        setTimeout(() => { setTamaMode("idle", 0); renderTama(); }, 900);
      });
    }
    if (tamaState.loopId) return;
    renderTama();
    tamaState.loopId = setInterval(tamaTick, 1500);
  }
  function sleepTama(){
    if (tamaState.loopId){ clearInterval(tamaState.loopId); tamaState.loopId = null; }
    setTamaMode("sleep", 0);
    renderTama();
  }

  // ---------- Keyboard wiring ----------
  function wireKeys(){
    $$(".kc").forEach(el => {
      el.addEventListener("click", () => {
        flashKey(el);
        if (window.SVERZ_RGB) window.SVERZ_RGB.onPress(el);
        handleKeyAction(el);
      });
    });
  }

  function handleKeyAction(el){
    const section = el.dataset.section;
    const key = el.dataset.key;

    // Caps/Num/Scroll locks: toggle LED + LCD
    if (el.dataset.lock){
      el.classList.toggle("is-locked");
      const on = el.classList.contains("is-locked");
      const id = ({caps:"lcdCaps", num:"lcdNum", scroll:"lcdScroll"})[el.dataset.lock];
      if (id) $("#"+id).classList.toggle("on", on);
      setLCD(on ? el.dataset.lock.toUpperCase() : "IDLE");
      return;
    }

    // Close focused window on Delete key click
    if (key === "Delete"){ window.SVERZ_WIN.closeFocused(); setLCD("CLOSE"); return; }

    // Section keys open their window
    if (section){
      window.SVERZ_WIN.open(section);
      setLCD("OPEN " + section.toUpperCase().slice(0,6));
    }
  }

  function flashKey(el){
    el.classList.add("is-pressed");
    setTimeout(()=>el.classList.remove("is-pressed"), 120);
  }

  function flashKeyByKeyName(name){
    const sel = $$(".kc").find(k => k.dataset.key.toLowerCase() === name.toLowerCase());
    if (sel){
      flashKey(sel);
      if (window.SVERZ_RGB) window.SVERZ_RGB.onPress(sel);
      handleKeyAction(sel);
    }
  }

  // Visually press a key (no action) — used for typing/arrows to feed RGB
  function flashKeyVisualOnly(name){
    const sel = $$(".kc").find(k => k.dataset.key.toLowerCase() === name.toLowerCase());
    if (sel){
      flashKey(sel);
      if (window.SVERZ_RGB) window.SVERZ_RGB.onPress(sel);
    }
  }

  // ---------- Scroll-driven keyboard entrance ----------
  function wireScroll(){
    const stage = $("#keyboard-stage");
    const onScroll = () => {
      // Progress goes 0 → 1 over the first 80vh of scroll
      const y = window.scrollY;
      const vh = window.innerHeight;
      const p = Math.max(0, Math.min(1, y / (vh * 0.8)));
      stage.style.setProperty("--kb-progress", p.toFixed(3));

      // Fade whoami as keyboard rises
      const who = $("#whoami");
      who.style.opacity = (1 - p * 0.65).toFixed(3);
      who.style.transform = `scale(${(1 - p*0.04).toFixed(3)})`;

      // Ultrawide sizing hint (only scales units down; layout controlled by knob)
      if (window.innerWidth >= 1600 && p > 0.92){
        document.body.classList.add("kb-expanded");
      } else {
        document.body.classList.remove("kb-expanded");
      }
    };
    window.addEventListener("scroll", onScroll, {passive:true});
    onScroll();
  }

  function wireScrollCue(){
    const cue = $("#scrollCue");
    if (cue){
      cue.addEventListener("click", () => {
        window.scrollTo({top: window.innerHeight * 0.8, behavior:"smooth"});
      });
    }
  }

  // ---------- Global keyboard shortcuts ----------
  let eggBuffer = "";
  let escTick = 0;

  function wireGlobalKeys(){
    window.addEventListener("keydown", e => {
      // Ctrl+F → search (dedicated window). Works from ANY focus (even inside
      // inputs) so users can always summon search without thinking.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f"){
        e.preventDefault();
        window.SVERZ_WIN.open("search");
        setLCD("SEARCH");
        // Focus the input after window mounts
        setTimeout(() => {
          const inp = document.querySelector('.win[data-section="search"] input');
          if (inp){ inp.focus(); inp.select && inp.select(); }
        }, 60);
        return;
      }
      // Ctrl+K / ⌘K → palette (open help window)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){
        e.preventDefault();
        window.SVERZ_WIN.open("help");
        setLCD("PALETTE");
        return;
      }

      // Shift + Arrow → RGB control (doesn't trigger while typing; Shift+arrow
      // inside an input is text-selection and must be left alone)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey &&
          e.key.startsWith("Arrow") && !isTypingContext(e)){
        e.preventDefault();
        if (!window.SVERZ_RGB) return;
        if (e.key === "ArrowUp")         { window.SVERZ_RGB.cycleMode(+1); setLCD("RGB " + window.SVERZ_RGB.getMode().name); }
        else if (e.key === "ArrowDown")  { window.SVERZ_RGB.cycleMode(-1); setLCD("RGB " + window.SVERZ_RGB.getMode().name); }
        else if (e.key === "ArrowRight") { window.SVERZ_RGB.cycleSpeed(+1); setLCD("SPD " + window.SVERZ_RGB.getSpeed()); }
        else if (e.key === "ArrowLeft")  { window.SVERZ_RGB.cycleSpeed(-1); setLCD("SPD " + window.SVERZ_RGB.getSpeed()); }
        // Also visually press the matching arrow key
        flashKeyVisualOnly(e.key);
        return;
      }

      // Plain arrows (no Shift): let the browser scroll, but also feed the
      // RGB engine so pressing them lights up the key. NO preventDefault.
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey &&
          e.key.startsWith("Arrow") && !isTypingContext(e)){
        flashKeyVisualOnly(e.key);
        // fall through — don't return, let default scroll happen
      }

      // Shift+T → theme toggle (only when not typing — Shift+T inside an input
      // must type a capital T, not flip the theme)
      if (e.shiftKey && e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !isTypingContext(e)){
        toggleTheme();
        return;
      }

      // Escape handling
      if (e.key === "Escape"){
        const now = Date.now();

        // If the search window is open AND has non-empty input, first Esc
        // just clears the field (don't close the window yet).
        const searchWin = document.querySelector('.win[data-section="search"]');
        if (searchWin){
          const inp = searchWin.querySelector("input");
          if (inp && inp.value){
            e.preventDefault();
            inp.value = "";
            inp.dispatchEvent(new Event("input", {bubbles:true}));
            inp.focus();
            setLCD("CLEAR");
            escTick = now;
            return;
          }
        }

        if (now - escTick < 400){
          window.SVERZ_WIN.closeAll();
          setLCD("IDLE");
        } else {
          // If focused window has a nav stack with depth >1, pop it
          const layer = document.getElementById("window-layer");
          const focused = layer && layer.querySelector(".win.is-focused");
          if (focused && focused.__nav && focused.__nav.length > 1 && typeof focused.__back === "function"){
            focused.__back();
            setLCD("BACK");
          } else {
            window.SVERZ_WIN.closeFocused();
            setLCD("CLOSE");
          }
        }
        escTick = now;
        return;
      }

      // From here on: any key that might be a "letter section shortcut" OR an
      // easter-egg character. If the user is TYPING (input/textarea/contenteditable/
      // search window focused), we must NOT swallow the key.
      if (isTypingContext(e)) {
        // Even while typing, still visually flash the corresponding keycap for
        // that "physical keyboard" feel — but do NOT invoke section actions.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
          const sel = $$(".kc").find(k => k.dataset.key.toLowerCase() === e.key.toLowerCase());
          if (sel){
            flashKey(sel);
            if (window.SVERZ_RGB) window.SVERZ_RGB.onPress(sel);
          }
        }
        return; // do NOT process eggs or section shortcuts
      }

      // ? or Space → help (only when not typing in a field)
      if ((e.key === "?" || (e.key === " " && e.target === document.body))){
        e.preventDefault();
        window.SVERZ_WIN.open("help");
        setLCD("HELP");
        return;
      }
      // Single-letter section keys (w/n/c/t/r/a/h)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1){
        const k = e.key.toLowerCase();
        flashKeyByKeyName(k);
        // track easter-egg sequences
        eggBuffer = (eggBuffer + k).slice(-16);
        checkEggs();
      }
    });
  }

  function checkEggs(){
    const eggs = (window.SVERZ_DATA && window.SVERZ_DATA.easterEggs) || {};
    for (const seq in eggs){
      if (eggBuffer.endsWith(seq)){
        showEgg(eggs[seq]);
        eggBuffer = "";
        return;
      }
    }
  }

  function showEgg(msg){
    const log = $("#egg-log");
    const el = document.createElement("div");
    el.className = "egg";
    el.textContent = msg;
    log.appendChild(el);
    setTimeout(()=>el.remove(), 4200);
  }

  // ---------- Toolbar ----------
  function wireToolbar(){
    $("#tbTheme").addEventListener("click", toggleTheme);
    $("#tbCloseAll").addEventListener("click", () => {
      window.SVERZ_WIN.closeAll();
      setLCD("IDLE");
    });
    $("#tbHelp").addEventListener("click", () => {
      window.SVERZ_WIN.open("help");
      setLCD("HELP");
    });
  }

  function toggleTheme(){
    const html = document.documentElement;
    const cur = html.dataset.theme;
    html.dataset.theme = cur === "dark" ? "light" : "dark";
    try { localStorage.setItem("sverz-theme", html.dataset.theme); } catch(e){}
    setLCD("THEME " + html.dataset.theme.toUpperCase());
  }

  // Restore theme
  try {
    const saved = localStorage.getItem("sverz-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch(e){}

  // ---------- LCD ----------
  let lcdTimer = null;
  function setLCD(mode, layer){
    const m = $("#lcdMode");
    const l = $("#lcdLayer");
    if (m && mode) m.textContent = mode;
    if (l && layer) l.textContent = layer;
    if (mode && mode !== "IDLE"){
      clearTimeout(lcdTimer);
      lcdTimer = setTimeout(()=>{ if (m) m.textContent = "IDLE"; }, 1800);
    }
  }

  // ---------- Go ----------
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
