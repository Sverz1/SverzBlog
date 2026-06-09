/* =========================================================
   SverzBlog — window manager
   Draggable, resizable, translucent terminal windows.
   - Unique per section (reopening focuses existing window)
   - Z-index stack on focus
   - Close, minimize (hide), maximize (toggle)
   ========================================================= */
(function(){
  const LAYER = () => document.getElementById("window-layer");
  const openMap = new Map(); // section -> winEl
  let zTop = 100;

  function open(section, opts){
    if (openMap.has(section)){
      const w = openMap.get(section);
      w.classList.remove("is-minimized");
      focus(w);
      // Re-focus first input if present (e.g. Ctrl+F on already-open search)
      const firstInput = w.querySelector("input[type=text], input:not([type])");
      if (firstInput) setTimeout(()=>firstInput.focus(), 30);
      return w;
    }
    const spec = SECTION_SPECS[section];
    if (!spec) return null;
    const w = build(section, spec);
    LAYER().appendChild(w);
    openMap.set(section, w);
    focus(w);
    placeCascaded(w);
    return w;
  }

  function close(w){
    const section = w.dataset.section;
    openMap.delete(section);
    // Drop any active drag/resize state pointing at this window so the global
    // listeners don't keep a reference after w.remove() — would otherwise pin
    // the detached subtree until the next mouseup.
    if (activeDrag && activeDrag.w === w) activeDrag = null;
    if (activeResize && activeResize.w === w) activeResize = null;
    w.style.transition = "transform .2s, opacity .2s";
    w.style.transform = "scale(.96)";
    w.style.opacity = "0";
    setTimeout(()=>w.remove(), 200);
  }

  function closeAll(){
    openMap.forEach(w => close(w));
  }

  function focus(w){
    w.style.zIndex = (++zTop);
    LAYER().querySelectorAll(".win.is-focused").forEach(x => x.classList.remove("is-focused"));
    w.classList.add("is-focused");
  }

  function placeCascaded(w){
    const n = openMap.size;
    const baseX = 80 + (n-1)*28;
    const baseY = 60 + (n-1)*24;
    w.style.left = baseX + "px";
    w.style.top = baseY + "px";
    w.style.width = (spec_default_w(w) || 620) + "px";
    w.style.height = (spec_default_h(w) || 460) + "px";
  }
  function spec_default_w(w){ return +w.dataset.dw || null }
  function spec_default_h(w){ return +w.dataset.dh || null }

  function build(section, spec){
    const w = document.createElement("div");
    w.className = "win";
    w.dataset.section = section;
    if (spec.w) w.dataset.dw = spec.w;
    if (spec.h) w.dataset.dh = spec.h;

    // Header
    const head = document.createElement("div");
    head.className = "win-head";
    head.innerHTML = `
      <div class="tl">
        <b class="close" title="close"></b>
        <b class="min" title="minimize"></b>
        <b class="max" title="maximize"></b>
      </div>
      <button class="win-back" title="back" aria-label="back" hidden>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M10 3 L5 8 L10 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>back</span>
      </button>
      <div class="title"><span class="prompt">sverz1 ~ $</span> <span class="path">${spec.path}</span></div>
      <span class="badge">${spec.badge || "file"}</span>
    `;
    w.appendChild(head);

    // Body
    const body = document.createElement("div");
    body.className = "win-body";
    w.appendChild(body);

    // Navigation stack (root at index 0). Each entry: {route:"root"|"detail", item?, title?, path?, badge?}
    w.__nav = [{route:"root", path:spec.path, badge:spec.badge || "file"}];

    const pathEl  = head.querySelector(".path");
    const badgeEl = head.querySelector(".badge");
    const backBtn = head.querySelector(".win-back");

    function renderCurrent(){
      const top = w.__nav[w.__nav.length - 1];
      if (top.route === "root"){
        body.innerHTML = spec.render();
        pathEl.textContent = spec.path;
        badgeEl.textContent = spec.badge || "file";
        backBtn.hidden = true;
        body.scrollTop = 0;
        // wire clickable items for sections that support drill-in
        if (typeof spec.wireRoot === "function") spec.wireRoot(body, w);
      } else if (top.route === "detail"){
        body.innerHTML = spec.renderDetail(top.item);
        pathEl.textContent = top.path || spec.path;
        badgeEl.textContent = top.badge || spec.badge || "file";
        backBtn.hidden = false;
        body.scrollTop = 0;
        if (typeof spec.wireDetail === "function") spec.wireDetail(body, w, top.item);
        // Wire task-list checkboxes with persistence (scoped to this item)
        wireChecklists(body, section, top.item);
      }
    }
    // Expose navigation API on the window element
    w.__navigate = (entry) => { w.__nav.push(entry); renderCurrent(); };
    w.__back     = () => { if (w.__nav.length > 1){ w.__nav.pop(); renderCurrent(); } };
    w.__rerender = renderCurrent;

    backBtn.addEventListener("click", e => { e.stopPropagation(); w.__back(); });

    // Initial paint
    renderCurrent();

    // Resize handle
    const rz = document.createElement("div");
    rz.className = "win-resize";
    w.appendChild(rz);

    // Wire: focus on mousedown
    w.addEventListener("mousedown", ()=>focus(w));

    // Traffic lights
    head.querySelector(".close").addEventListener("click", e => { e.stopPropagation(); close(w); });
    head.querySelector(".min").addEventListener("click", e => { e.stopPropagation(); w.classList.add("is-minimized"); });
    head.querySelector(".max").addEventListener("click", e => { e.stopPropagation(); toggleMax(w); });

    // Drag
    wireDrag(w, head);
    // Resize
    wireResize(w, rz);

    // Optional lifecycle hook after DOM is built
    if (typeof spec.onMount === "function") {
      try { spec.onMount(w); } catch(e){ console.warn("[win] onMount failed", section, e); }
    }

    return w;
  }

  function toggleMax(w){
    if (w.dataset.maxed){
      w.style.left = w.dataset.px; w.style.top = w.dataset.py;
      w.style.width = w.dataset.pw; w.style.height = w.dataset.ph;
      delete w.dataset.maxed;
    } else {
      w.dataset.px = w.style.left; w.dataset.py = w.style.top;
      w.dataset.pw = w.style.width; w.dataset.ph = w.style.height;
      w.style.left="20px"; w.style.top="20px";
      w.style.width=(window.innerWidth-40)+"px";
      w.style.height=(window.innerHeight-40)+"px";
      w.dataset.maxed = "1";
    }
  }

  // Drag/resize: ONE pair of global listeners installed once at module init
  // (see bottom of IIFE). Each window only attaches a `mousedown` to its own
  // header/handle that sets shared state. This avoids leaking a window-bound
  // closure on `window` for every open() call.
  let activeDrag = null;   // {w, sx, sy, ox, oy}
  let activeResize = null; // {w, sx, sy, sw, sh}

  function wireDrag(w, head){
    head.addEventListener("mousedown", e => {
      if (e.target.closest(".tl")) return;
      activeDrag = {
        w,
        sx: e.clientX, sy: e.clientY,
        ox: parseFloat(w.style.left) || 0,
        oy: parseFloat(w.style.top)  || 0,
      };
      e.preventDefault();
    });
  }

  function wireResize(w, handle){
    handle.addEventListener("mousedown", e => {
      activeResize = {
        w,
        sx: e.clientX, sy: e.clientY,
        sw: w.offsetWidth, sh: w.offsetHeight,
      };
      e.preventDefault(); e.stopPropagation();
    });
  }

  // ============================================================
  // Section content specs
  // ============================================================
  const D = () => window.SVERZ_DATA;

  // Real-content render helpers — every detail page is just the markdown body
  // rendered by build.py, framed by a prompt-line, a meta strip, and a foot.
  function detailFrame(cmd, item, opts){
    opts = opts || {};
    const date = item.date ? `<span class="dm-date">${item.date}</span>` : "";
    const dot  = (item.date && (item.tags||[]).length) ? `<span class="dm-dot">·</span>` : "";
    const tagHtml = (item.tags || []).map(t=>`<span class="t-${t.replace(/[\s_]+/g,'-')}">#${t.replace(/[\s_]+/g,'-')}</span>`).join("");
    return `
      <div class="prompt-line">${cmd}</div>
      <div class="detail-meta">${date}${dot}<span class="dm-tags">${tagHtml}</span></div>
      <h1 style="margin-top:6px">${item.title || item.name || ""}</h1>
      ${item.desc ? `<p class="lede">${item.desc}</p>` : ""}
      <div class="md-body">${item.body || ""}</div>
      <div class="detail-foot">${opts.foot || "// rendered from " + (opts.path || "~")}</div>
    `;
  }

  const SECTION_SPECS = {
    writeups: {
      path:"~/writeups",
      get badge(){ return (D().counts && D().counts.writeups || D().writeups.length) + " entries"; },
      w:760, h:560,
      render: ()=>{
        const items = D().writeups.map((w,i)=>`
          <div class="w-item" data-idx="${i}">
            <div class="date">${w.date || "—"}</div>
            <div>
              <div class="wt">${w.title}</div>
              <p style="margin:4px 0 0;font-size:12px;color:var(--fg-3);font-family:var(--sans)">${w.desc}</p>
            </div>
            <div class="tags">${(w.tags||[]).slice(0,4).map(t=>`<span class="t-${t.replace(/[\s_]+/g,'-')}">#${t.replace(/[\s_]+/g,'-')}</span>`).join("")}</div>
          </div>`).join("");
        return `
          <div class="prompt-line">ls -la ~/writeups · sorted by date</div>
          <h1><em>Writeups</em> & walkthroughs</h1>
          <p>HTB walkthroughs and the odd CTF. Each entry preserves the recon, the wrong turns, and the final root.</p>
          <div class="w-list">${items}</div>
        `;
      },
      wireRoot: (body, w) => {
        body.querySelectorAll(".w-item").forEach(row => {
          row.addEventListener("click", () => {
            const item = D().writeups[+row.dataset.idx];
            const slug = item.slug || slugify(item.title);
            w.__navigate({
              route:"detail", item,
              path:`~/writeups/${slug}.md`,
              badge:(item.tags||[]).slice(0,3).map(t=>`#${t}`).join(" "),
            });
          });
        });
      },
      renderDetail: (item)=>detailFrame(
        `cat ~/writeups/${item.slug || slugify(item.title)}.md`,
        item,
        {path:`publish/Writeups/${item.title}.md`}
      ),
    },
    enumeration: {
      path:"~/enumeration",
      get badge(){ return (D().counts && D().counts.enumeration || D().enumeration.length) + " checklists"; },
      w:760, h:560,
      render: ()=>{
        const items = D().enumeration.map((e,i)=>`
          <div class="w-item" data-idx="${i}">
            <div class="date">${e.date || ""}</div>
            <div>
              <div class="wt">${e.title}</div>
              <p style="margin:4px 0 0;font-size:12px;color:var(--fg-3);font-family:var(--sans)">${e.desc}</p>
            </div>
            <div class="tags">${(e.tags||[]).slice(0,3).map(t=>`<span class="t-${t.replace(/[\s_]+/g,'-')}">#${t.replace(/[\s_]+/g,'-')}</span>`).join("")}</div>
          </div>`).join("");
        return `
          <div class="prompt-line">find ~/enumeration -type f -name '*.md'</div>
          <h1><em>Enumeration</em> checklists</h1>
          <p>Service-by-service checklists I follow on every box. Ports, scripts, common findings, and the next step once you have credentials.</p>
          <div class="w-list">${items}</div>
        `;
      },
      wireRoot: (body, w) => {
        body.querySelectorAll(".w-item").forEach(row => {
          row.addEventListener("click", () => {
            const item = D().enumeration[+row.dataset.idx];
            w.__navigate({
              route:"detail", item,
              path:`~/enumeration/${item.slug}.md`,
              badge:(item.tags||[]).slice(0,3).map(t=>`#${t}`).join(" "),
            });
          });
        });
      },
      renderDetail: (item)=>detailFrame(
        `vim ~/enumeration/${item.slug}.md`,
        item,
        {path:`Enumeration/${item.title}.md`}
      ),
    },
    notes: {
      path:"~/misc",
      get badge(){ return (D().counts && D().counts.notes || D().notes.length) + " articles"; },
      w:740, h:560,
      render: ()=>{
        const items = D().notes.map((n,i)=>`
          <div class="cheat-card note-row" data-idx="${i}" style="margin-bottom:10px;cursor:pointer">
            <h4>$ cat ${n.slug || n.title}.md</h4>
            <pre>${escapeHtml((n.snippet || n.desc || "").slice(0, 320))}</pre>
            <div style="font-family:var(--mono);font-size:9.5px;color:var(--fg-4);margin-top:6px">${n.foot || "publish/Misc/"+n.title+".md"}</div>
          </div>`).join("");
        return `
          <div class="prompt-line">cat ~/misc/*.md | head</div>
          <h1><em>Misc</em> notes</h1>
          <p>Topic notes that didn't fit any single writeup — SQLi tricks, Windows token games, file-write→RCE, etc.</p>
          ${items}
        `;
      },
      wireRoot: (body, w) => {
        body.querySelectorAll(".note-row").forEach(row => {
          row.addEventListener("click", () => {
            const item = D().notes[+row.dataset.idx];
            w.__navigate({
              route:"detail", item,
              path:`~/misc/${item.slug || item.title}.md`,
              badge:"markdown",
            });
          });
        });
      },
      renderDetail: (item)=>detailFrame(
        `vim ~/misc/${item.slug || item.title}.md`,
        item,
        {path:`publish/Misc/${item.title}.md`}
      ),
    },
    cheatsheets: {
      path:"~/cheatsheets",
      get badge(){ return (D().counts && D().counts.cheatsheets || D().cheatsheets.length) + " sheets"; },
      w:760, h:600,
      render: ()=>{
        const items = D().cheatsheets.map((c,i)=>`
          <div class="cheat-card cheat-tile" data-idx="${i}" style="cursor:pointer">
            <h4>${c.title}</h4>
            <pre>${escapeHtml((c.snippet_body || c.desc || "").slice(0, 420))}</pre>
          </div>`).join("");
        return `
          <div class="prompt-line">find ~/cheatsheets -type f -print</div>
          <h1><em>Cheatsheets</em></h1>
          <p>One-screen command kits. nxc, bloodyAD, impacket, mssql — copy-paste away.</p>
          <div class="cheat-grid">${items}</div>
        `;
      },
      wireRoot: (body, w) => {
        body.querySelectorAll(".cheat-tile").forEach(tile => {
          tile.addEventListener("click", () => {
            const item = D().cheatsheets[+tile.dataset.idx];
            w.__navigate({
              route:"detail", item,
              path:`~/cheatsheets/${item.slug || item.title}.md`,
              badge:"shell · copy-paste",
            });
          });
        });
      },
      renderDetail: (item)=>detailFrame(
        `cat ~/cheatsheets/${item.slug || item.title}.md`,
        item,
        {path:`HTB/Cheatsheets/${item.title}.md`}
      ),
    },
    fundamentals: {
      path:"~/fundamentals",
      get badge(){ return (D().counts && D().counts.fundamentals || D().fundamentals.length) + " chapters"; },
      w:760, h:580,
      render: ()=>{
        const items = D().fundamentals.map((r,i)=>`
          <div class="cheat-card research-row" data-idx="${i}" style="margin-bottom:10px;cursor:pointer">
            <div style="font-family:var(--mono);font-size:9.5px;color:var(--accent);letter-spacing:.08em;text-transform:uppercase">${r.tag || "THEORY · CHAPTER"}</div>
            <h3 style="margin:6px 0 8px;font-size:18px">${r.title}</h3>
            <p style="margin:0;font-size:12.5px;color:var(--fg-3);font-family:var(--sans);line-height:1.55">${r.desc}</p>
            <div style="font-family:var(--mono);font-size:10px;color:var(--fg-4);margin-top:8px">read →</div>
          </div>`).join("");
        return `
          <div class="prompt-line">less ~/fundamentals/*.md</div>
          <h1><em>Fundamentals</em></h1>
          <p>The theory behind the writeups. Cryptography, web vulnerability classes, memory corruption, AD identity — the "why it works" layer underneath every other section.</p>
          ${items}
        `;
      },
      wireRoot: (body, w) => {
        body.querySelectorAll(".research-row").forEach(row => {
          row.addEventListener("click", () => {
            const item = D().fundamentals[+row.dataset.idx];
            w.__navigate({
              route:"detail", item,
              path:`~/fundamentals/${item.slug || slugify(item.title)}.md`,
              badge:"theory",
            });
          });
        });
      },
      renderDetail: (item)=>detailFrame(
        `less ~/fundamentals/${item.slug || slugify(item.title)}.md`,
        item,
        {path:`Fundamentals/${item.title}.md`}
      ),
    },
    about: {
      path:"~/about.md", badge:"whoami", w:580, h:520,
      render: ()=>`
        <div class="prompt-line">cat ~/about.md</div>
        <h1><em>whoami</em> — sverz1</h1>
        <p>Offensive security researcher, OSCP+ candidate, HackTheBox grinder. I keep notes here so future-me (and anyone else) can pick up the same thread later.</p>
        <h3>what's on this site</h3>
        <ul>
          <li><code>W</code> · HTB walkthroughs (recon → root)</li>
          <li><code>E</code> · per-service enumeration checklists</li>
          <li><code>N</code> · misc cybersec notes (SQLi, token games, RCE patterns)</li>
          <li><code>C</code> · cheatsheets for nxc · bloodyAD · impacket · mssql</li>
          <li><code>F</code> · fundamentals — theory behind the writeups</li>
        </ul>
        <h3>rules of engagement</h3>
        <ul>
          <li>everything here is from authorised labs (HTB, OSCP, personal homelab).</li>
          <li>no client-identifying data, ever.</li>
          <li>if you spot something wrong, ping me — I'll fix the note.</li>
        </ul>
        <h3>contact</h3>
        <ul>
          <li>github · <a href="https://github.com/sverz1">sverz1</a></li>
        </ul>
      `
    },
    search: {
      path:"~/search", badge:"grep -ri", w:620, h:480,
      render: ()=>`
        <div class="prompt-line">grep -rni "" ~/blog</div>
        <h1><em>search</em> · everything</h1>
        <div class="srch-wrap">
          <label class="srch-field">
            <span class="srch-prompt">&gt;</span>
            <input id="srchInput" class="srch-input" type="text" placeholder="type to search writeups, notes, cheatsheets, tools, research…" autocomplete="off" spellcheck="false"/>
            <span class="srch-count" id="srchCount">0 results</span>
          </label>
          <div class="srch-filters" id="srchFilters">
            <button class="srch-chip is-on" data-f="all">all</button>
            <button class="srch-chip" data-f="writeups">writeups</button>
            <button class="srch-chip" data-f="enumeration">enum</button>
            <button class="srch-chip" data-f="notes">notes</button>
            <button class="srch-chip" data-f="cheatsheets">cheatsheets</button>
            <button class="srch-chip" data-f="fundamentals">fundamentals</button>
          </div>
          <div class="srch-results" id="srchResults">
            <div class="srch-hint">// start typing — fuzzy match across title, desc, tags</div>
          </div>
        </div>
      `,
      onMount: (winEl)=>{
        const input   = winEl.querySelector("#srchInput");
        const results = winEl.querySelector("#srchResults");
        const count   = winEl.querySelector("#srchCount");
        const filters = winEl.querySelector("#srchFilters");
        if (!input || !results) return;
        let activeFilter = "all";
        const D = window.SVERZ_DATA || {};
        // Flatten all indexable entries
        const all = [];
        function pushAll(key){
          (D[key] || []).forEach((item, idx) => {
            all.push({
              section: key,
              idx,
              date: item.date || "",
              tag: item.tag || "",
              title: item.title || item.name || "",
              desc: item.desc || item.summary || "",
              tags: (item.tags || []).join(" "),
            });
          });
        }
        ["writeups","enumeration","notes","cheatsheets","fundamentals"].forEach(pushAll);
        function render(q){
          const query = (q||"").trim().toLowerCase();
          const matches = all.filter(r => {
            if (activeFilter !== "all" && r.section !== activeFilter) return false;
            if (!query) return true;
            const hay = (r.title + " " + r.desc + " " + r.tag + " " + r.tags).toLowerCase();
            // fuzzy-ish: require every word to appear somewhere
            return query.split(/\s+/).every(w => hay.includes(w));
          });
          count.textContent = matches.length + " result" + (matches.length===1?"":"s");
          if (!matches.length){
            results.innerHTML = `<div class="srch-hint">// nothing matches <b>${escapeHtml(query)}</b></div>`;
            return;
          }
          results.innerHTML = matches.slice(0, 40).map(m => `
            <button class="srch-row" data-section="${m.section}" data-idx="${m.idx}">
              <span class="srch-row-section">[${m.section}]</span>
              <span class="srch-row-title">${highlight(m.title, query)}</span>
              <span class="srch-row-desc">${highlight(m.desc, query)}</span>
              <span class="srch-row-date">${m.date}</span>
            </button>
          `).join("");
          results.querySelectorAll(".srch-row").forEach(btn => {
            btn.addEventListener("click", () => {
              const section = btn.dataset.section;
              const idx = +btn.dataset.idx;
              const winEl = window.SVERZ_WIN.open(section);
              // Drill into the detail page if this section supports it
              const item = (window.SVERZ_DATA[section] || [])[idx];
              if (!winEl || !item || typeof winEl.__navigate !== "function") return;
              const spec = SECTION_SPECS[section];
              if (typeof spec.renderDetail !== "function") return;
              // Build the same route the section's wireRoot would have built
              const title = item.title || item.name || "entry";
              const badge =
                section === "writeups"     ? (item.tags || []).slice(0,3).map(t=>`#${t}`).join(" ") :
                section === "notes"        ? "markdown" :
                section === "cheatsheets"  ? "shell · copy-paste" :
                section === "fundamentals" ? "theory" :
                "file";
              const path =
                section === "notes"       ? `~/misc/${item.slug || item.title}.md` :
                section === "cheatsheets" ? `~/cheatsheets/${item.slug || item.title}.md` :
                section === "enumeration" ? `~/enumeration/${item.slug || slugify(title)}.md` :
                `~/${section}/${item.slug || slugify(title)}.md`;
              // Reset to root then drill in, so back button always returns to the list
              winEl.__nav = [{route:"root", path:spec.path, badge:spec.badge || "file"}];
              winEl.__navigate({route:"detail", item, path, badge});
            });
          });
        }
        function highlight(text, q){
          const t = escapeHtml(text || "");
          if (!q) return t;
          try {
            const re = new RegExp("(" + q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,"\\$&").split(/\s+/).join("|") + ")", "ig");
            return t.replace(re, "<mark>$1</mark>");
          } catch(e){ return t; }
        }
        input.addEventListener("input", () => render(input.value));
        filters.querySelectorAll(".srch-chip").forEach(c => {
          c.addEventListener("click", () => {
            filters.querySelectorAll(".srch-chip").forEach(x => x.classList.remove("is-on"));
            c.classList.add("is-on");
            activeFilter = c.dataset.f;
            render(input.value);
          });
        });
        // focus after the window mount animation settles
        setTimeout(()=>input.focus(), 60);
        render("");
      }
    },
    help: {
      path:"~/help", badge:"shortcuts", w:520, h:480,
      render: ()=>`
        <div class="prompt-line">man sverz1</div>
        <h1><em>Shortcuts</em> & help</h1>
        <p>The site is a keyboard. Every key does something — some more than others.</p>
        <h3>section keys</h3>
        <ul>
          <li><code>W</code> → writeups (HTB walkthroughs)</li>
          <li><code>E</code> → enumeration (per-service checklists)</li>
          <li><code>N</code> → misc notes</li>
          <li><code>C</code> → cheatsheets</li>
          <li><code>F</code> → fundamentals / theory</li>
          <li><code>A</code> → about</li>
          <li><code>H</code> → home</li>
        </ul>
        <h3>global</h3>
        <ul>
          <li><code>Ctrl+F</code> · search</li>
          <li><code>Ctrl+K</code> / <code>⌘K</code> · command palette</li>
          <li><code>Esc</code> · close focused window (<code>Esc Esc</code> closes all)</li>
          <li><code>?</code> or <code>Space</code> · this help</li>
          <li><code>⇧T</code> · toggle theme</li>
        </ul>
        <h3>easter eggs</h3>
        <p>Type words on the keyboard. Some do things. You'll know when you find one.</p>
      `
    },
    home: {
      path:"~/", badge:"readme", w:520, h:380,
      render: ()=>`
        <div class="prompt-line">cd ~ && cat README</div>
        <h1>sverz<em>1</em></h1>
        <p>Welcome. The site is a keyboard — press a letter to open a section. Windows are draggable, resizable, and stack up; <code>Esc</code> closes the focused one, <code>Esc Esc</code> closes them all.</p>
        <p>Start with <code>W</code> (writeups), <code>E</code> (enumeration), or <code>?</code> for the full key map.</p>
      `
    },
  };

  function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}
  function slugify(s){return (s||"").toString().toLowerCase().replace(/[^\w\s·-]/g,"").replace(/[\s·]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,60)}

  // Restore + persist task-list checkbox state in localStorage so the user's
  // progress through an enumeration checklist survives reloads.
  // Storage key: "sverz-check:<section>:<slug>" → array of booleans by index.
  function wireChecklists(body, section, item){
    const boxes = body.querySelectorAll("li.task-list-item input[type=checkbox]");
    if (!boxes.length) return;
    const slug = item.slug || slugify(item.title || item.name || "x");
    const key = `sverz-check:${section}:${slug}`;
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(key) || "[]") || []; } catch(e){}
    boxes.forEach((cb, i) => {
      const li = cb.closest("li.task-list-item");
      const on = !!saved[i];
      cb.checked = on;
      if (on && li) li.classList.add("is-done");
      cb.addEventListener("change", () => {
        const state = Array.from(boxes).map(x => !!x.checked);
        try { localStorage.setItem(key, JSON.stringify(state)); } catch(e){}
        if (li) li.classList.toggle("is-done", cb.checked);
      });
    });
  }

  // Close focused window (for Esc handling)
  function closeFocused(){
    const w = LAYER().querySelector(".win.is-focused");
    if (w) close(w);
  }

  // Install the ONE pair of global drag/resize listeners. They read shared
  // state set by per-window mousedown handlers — no per-window window-level
  // listener, no leak across open/close cycles.
  window.addEventListener("mousemove", (e) => {
    if (activeDrag){
      const d = activeDrag;
      d.w.style.left = (d.ox + e.clientX - d.sx) + "px";
      d.w.style.top  = Math.max(0, d.oy + e.clientY - d.sy) + "px";
    }
    if (activeResize){
      const r = activeResize;
      r.w.style.width  = Math.max(380, r.sw + e.clientX - r.sx) + "px";
      r.w.style.height = Math.max(240, r.sh + e.clientY - r.sy) + "px";
    }
  });
  window.addEventListener("mouseup", () => {
    activeDrag = null;
    activeResize = null;
  });

  window.SVERZ_WIN = { open, close, closeAll, focus, closeFocused, SECTION_SPECS };
})();
