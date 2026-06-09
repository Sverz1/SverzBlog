# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, zero-build site that presents an offensive-security notebook as an interactive 75% mechanical-keyboard UI. `index.html` sits at the top level — no bundler, no framework. Content is sourced from a sibling markdown tree (`../SverzBlog-old/`) and baked into a single `assets/data.js` blob by `build.py`.

## Commands

```bash
# Static dev server (read-only view of the built site)
python3 -m http.server 8765
# → http://127.0.0.1:8765/

# Markdown editor + preview + manual rebuild trigger (Flask, port 8766)
python3 edit_server.py
# → http://127.0.0.1:8766/

# Regenerate assets/data.js + copy referenced images into img/
python3 build.py

# Normalize frontmatter / H1 / info tables of every writeup (in-place edit
# of the source markdown under SverzBlog-old/publish/Writeups). Run before
# build.py whenever writeups were touched by hand.
python3 normalize_writeups.py

# Rewrite the "## Related Machines" tables across enumeration notes by
# scanning every writeup for keyword matches. Run after writeup edits.
python3 update_related_machines.py
```

There is no test suite, no lint config, no CI. `package.json` only carries `@playwright/test` as a dev dep — there is no `playwright.config.*` checked in, and the npm `test` script is a placeholder.

Override the markdown source root with `SVERZBLOG_SRC=/path/to/old/tree` (both `build.py` and `edit_server.py` honor it). Default is `../SverzBlog-old` relative to this repo.

## Architecture — the parts that aren't obvious from the tree

**Content pipeline (Python → JS blob).** `build.py` walks the sibling `SverzBlog-old/` markdown tree, parses YAML frontmatter, renders markdown (via `python-markdown` + `pymdownx.tasklist`), resolves Obsidian-style image wikilinks (`![[file.png]]`) by indexing every image basename across the whole old tree, copies referenced images into `img/`, and emits a single `assets/data.js` exposing `window.SVERZ_DATA` with one entry per section (writeups / enumeration / notes / cheatsheets / fundamentals / tools / research). `index.html` cache-busts every asset URL with `?v=<hash>` — `build.py` rewrites those query strings in-place, so editing `index.html`'s `?v=` by hand will be clobbered on the next build.

**Section → key mapping** is the contract between four files: `build.py` (emits the section), `assets/data.js` (output), `assets/windows.js` (`SECTION_SPECS` defines title/layout per section), `assets/keyboard.js` (which physical key triggers it). Adding a new section means editing all four.

**Runtime is four globals, no module system.** Scripts are loaded as plain `<script>` tags in `index.html` and each module exposes its API on `window`:
- `SVERZ_DATA` (from `data.js`) — content blob.
- `SVERZ_KB` (`keyboard.js`) — `buildKeyboard()` / `buildNumpad()`; constructs the keycap DOM from a row-based layout array.
- `SVERZ_RGB` (`rgb.js`) — per-key LED engine, six modes, palette of pastel hues; reads/writes CSS custom properties (`--led-a/h/s/l`) on each `.kc` so glow coexists with hover/pressed states without JS repainting.
- `SVERZ_WIN` (`windows.js`) — draggable/resizable terminal-window manager; one window per section, identity by section name, focus = z-index bump.
- `app.js` — boots everything and wires global hotkeys, scroll-driven keyboard entrance, easter eggs, theme toggle.

**Keyboard layout details that bite.** `.kb-stage-inner` has a 3D perspective tilt (`matrix3d` with ≈0.85 X-scale) — row 0 is foreshortened, so visual alignment ≠ unrotated-pixel alignment. The knob slot uses `transform: translateX(...)` to compensate. Row layout in `keyboard.js` uses a `marginRight: <units>` property per key (multiplied by `--u`, the key unit) to insert cluster gaps; the `buildKey` handler applies this as a style. CSS custom properties: `--u` (key unit, ≈36px at default viewport), `--gap` (≈4px).

**Editor server is a thin Flask CRUD over the markdown tree.** `edit_server.py` exposes `/api/{list,read,save,create,delete,rename,preview,rebuild}` and reuses `build.py`'s markdown pipeline for the preview so the editor matches the live render. Delete moves files to `.editor-trash/` inside their section folder — recoverable until cleaned. Rebuild is **manual** (button → `/api/rebuild` → runs `build.py` as a subprocess); the editor never auto-builds on save. Bound strictly to `127.0.0.1`, no auth.

**The full key-binding table, layout description, and section-source mapping live in `README.md` — read it before changing user-facing shortcuts or adding a section.**

# Project: Browser Automation

## Tools Available
- Playwright CLI via `npx playwright` (Chromium installed)
- Session storage saved to `./session-state/`

## Conventions
- Always check for existing session files before logging in
- Save screenshots to `./screenshots/` with descriptive names
- Return structured JSON where possible using page.evaluate()
