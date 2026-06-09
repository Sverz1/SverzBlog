#!/usr/bin/env python3
"""
SverzBlog local editor — http://127.0.0.1:8766/

A tiny Flask app that lets you browse, edit, create, rename and delete
every markdown file the blog consumes, without leaving the browser.

  - Strictly local-bind (127.0.0.1)
  - No auth, no external calls (CodeMirror loaded once from a CDN)
  - Save writes to the .md file in place; nothing is rebuilt until you
    click "Rebuild data.js" (manual, per your preference)
  - Delete moves the file to .editor-trash/ inside the same section
    folder, so it's recoverable until you clean it up
  - Rename keeps the file in the same section; if a writeup is renamed
    the H1 + frontmatter `title:` are NOT auto-edited (preserves content)

Run:
    python3 edit_server.py
    # then open http://127.0.0.1:8766/
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from flask import Flask, jsonify, request, Response

# Reuse the build pipeline for preview rendering so what you see in the
# editor matches what the live site will render.
sys.path.insert(0, str(Path(__file__).parent))
import build  # noqa: E402

ROOT = Path(__file__).parent.resolve()
OLD  = Path(os.environ.get("SVERZBLOG_SRC", ROOT.parent / "SverzBlog-old")).resolve()

# Section name → source folder + filename rule + template
SECTIONS = {
    "writeups": {
        "dir":     OLD / "publish" / "Writeups",
        "suffix":  "_EN.md",
        "label":   "Writeups",
        "template": "---\ntitle: {name} - HTB\ntags:\n  - HTB\ndate: '2026-01-01'\nlang: en\ntranslated_from: {name}.md\n---\n\n# {name} — Hack The Box\n\n| Info       | Value |\n| ---------- | ----- |\n| OS         |  |\n| Difficulty |  |\n| IP         |  |\n| Hostname   |  |\n| Services   |  |\n\n---\n\n## Enumeration\n\n## Foothold\n\n## Privilege Escalation\n\n## Attack Chain Summary\n",
    },
    "enumeration": {
        "dir":     OLD / "Enumeration",
        "suffix":  "_EN.md",
        "label":   "Enumeration",
        "template": "---\ntitle: {name} — Enumeration and Exploitation Checklist\ntags:\n  - Enumeration\n  - Methodology\ndate: '2026-01-01'\nlang: en\ntranslated_from: {name}.md\n---\n\n# {name} — Enumeration Checklist\n\n## Recommended Execution Priority\n\n## Quick Commands\n\n## Notes\n",
    },
    "notes": {
        "dir":     OLD / "publish" / "Misc",
        "suffix":  ".md",
        "label":   "Misc Notes",
        "template": "---\ntitle: {name}\ntags:\n  - Misc\ndate: '2026-01-01'\n---\n\n# {name}\n\n## Context\n\n## Details\n",
    },
    "cheatsheets": {
        "dir":     OLD / "HTB" / "Cheatsheets",
        "suffix":  ".md",
        "label":   "Cheatsheets",
        "template": "# {name} — Cheatsheet\n\n> Short description of what this covers.\n\n## Commands\n\n```bash\n# example\n```\n",
    },
    "fundamentals": {
        "dir":     OLD / "Fundamentals",
        "suffix":  "_EN.md",
        "label":   "Fundamentals",
        "template": "---\ntitle: {name}\ntags:\n  - Fundamentals\n  - Theory\ndate: '2026-01-01'\nlang: en\n---\n\n# {name}\n\n## Overview\n\n## Theory\n\n## Why it matters\n",
    },
}

app = Flask(__name__)

# --- helpers --------------------------------------------------------------

def section_for(file_path: Path) -> str | None:
    """Return the section key whose dir contains file_path (resolved)."""
    fp = file_path.resolve()
    for k, spec in SECTIONS.items():
        try:
            fp.relative_to(spec["dir"].resolve())
            return k
        except ValueError:
            continue
    return None


def safe_resolve(path_param: str) -> Path:
    """Resolve a client-supplied path and ensure it sits inside one of the
    SECTIONS dirs — defends against path traversal."""
    p = Path(path_param).resolve()
    if section_for(p) is None:
        raise PermissionError(f"path outside allowed sections: {p}")
    return p


def display_name(p: Path, section: str) -> str:
    suf = SECTIONS[section]["suffix"]
    stem = p.name
    if stem.endswith(suf):
        stem = stem[: -len(suf)]
    elif p.suffix == ".md":
        stem = p.stem
    return stem


# --- API ------------------------------------------------------------------

@app.route("/api/list")
def api_list():
    out = []
    for key, spec in SECTIONS.items():
        d = spec["dir"]
        files = []
        if d.exists():
            for p in sorted(d.glob("*.md")):
                # Skip .bak / .deleted artefacts
                if p.name.endswith((".bak",)):
                    continue
                if key in ("writeups", "enumeration") and not p.name.endswith("_EN.md"):
                    continue
                files.append({
                    "name":    display_name(p, key),
                    "path":    str(p),
                    "size":    p.stat().st_size,
                    "mtime":   int(p.stat().st_mtime),
                })
        out.append({
            "key":     key,
            "label":   spec["label"],
            "dir":     str(d),
            "suffix":  spec["suffix"],
            "files":   files,
            "count":   len(files),
        })
    return jsonify({"sections": out})


@app.route("/api/read")
def api_read():
    path = request.args.get("path", "")
    try:
        p = safe_resolve(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 400
    if not p.exists():
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "path":    str(p),
        "content": p.read_text(encoding="utf-8", errors="replace"),
        "mtime":   int(p.stat().st_mtime),
    })


@app.route("/api/save", methods=["PUT", "POST"])
def api_save():
    data = request.get_json(force=True)
    path = data.get("path", "")
    content = data.get("content", "")
    try:
        p = safe_resolve(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 400
    p.write_text(content, encoding="utf-8")
    return jsonify({"ok": True, "path": str(p), "size": len(content.encode("utf-8"))})


@app.route("/api/create", methods=["POST"])
def api_create():
    data = request.get_json(force=True)
    section = data.get("section")
    name = (data.get("name") or "").strip()
    if section not in SECTIONS:
        return jsonify({"error": f"unknown section: {section}"}), 400
    if not re.match(r"^[\w .,()'+-]{1,80}$", name):
        return jsonify({"error": "invalid filename"}), 400
    spec = SECTIONS[section]
    spec["dir"].mkdir(parents=True, exist_ok=True)
    target = spec["dir"] / (name + spec["suffix"])
    if target.exists():
        return jsonify({"error": "file exists"}), 409
    target.write_text(spec["template"].format(name=name), encoding="utf-8")
    return jsonify({"ok": True, "path": str(target)})


@app.route("/api/delete", methods=["DELETE", "POST"])
def api_delete():
    path = request.args.get("path") or (request.get_json(silent=True) or {}).get("path", "")
    try:
        p = safe_resolve(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 400
    if not p.exists():
        return jsonify({"error": "not found"}), 404
    trash = p.parent / ".editor-trash"
    trash.mkdir(exist_ok=True)
    dest = trash / p.name
    # Avoid overwriting an older trashed copy
    i = 0
    while dest.exists():
        i += 1
        dest = trash / f"{p.stem}.{i}{p.suffix}"
    shutil.move(str(p), str(dest))
    return jsonify({"ok": True, "trashed_to": str(dest)})


@app.route("/api/rename", methods=["POST"])
def api_rename():
    data = request.get_json(force=True)
    src = data.get("from", "")
    new_name = (data.get("to") or "").strip()
    try:
        p = safe_resolve(src)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 400
    if not p.exists():
        return jsonify({"error": "not found"}), 404
    if not re.match(r"^[\w .,()'+-]{1,80}$", new_name):
        return jsonify({"error": "invalid filename"}), 400
    sec = section_for(p)
    suf = SECTIONS[sec]["suffix"]
    dest = p.parent / (new_name + suf)
    if dest.exists():
        return jsonify({"error": "destination exists"}), 409
    p.rename(dest)
    return jsonify({"ok": True, "path": str(dest)})


@app.route("/api/preview", methods=["POST"])
def api_preview():
    """Render markdown using the same pipeline as build.py (Obsidian
    wikilinks, callouts, image rewrites). Returns just the body HTML."""
    data = request.get_json(force=True)
    md_text = data.get("content", "")
    src_path_str = data.get("path", "")
    images_used = set()
    src_path = Path(src_path_str) if src_path_str else (OLD / "publish" / "Writeups" / "dummy.md")
    meta, body = build.parse_frontmatter(md_text)
    body = build.preprocess(body, images_used, src_path)
    build.MD.reset()
    html = build.MD.convert(body)
    return jsonify({"html": html, "frontmatter": meta or {}})


@app.route("/api/rebuild", methods=["POST"])
def api_rebuild():
    """Run build.py and return the captured stdout."""
    r = subprocess.run(
        [sys.executable, str(ROOT / "build.py")],
        capture_output=True, text=True, cwd=str(ROOT),
    )
    return jsonify({
        "ok":      r.returncode == 0,
        "stdout":  r.stdout,
        "stderr":  r.stderr,
        "code":    r.returncode,
    })


# --- UI -------------------------------------------------------------------

INDEX_HTML = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>SverzBlog — editor</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/theme/material-darker.min.css">
<style>
  :root{
    --bg:#0d0e10; --bg2:#15171a; --bg3:#1c1f24; --fg:#e6e6e6; --fg2:#9aa0a6;
    --fg3:#6b7280; --line:#23262c; --line2:#34373d; --accent:#ff9500; --ok:#7cd992;
    --danger:#ff647c; --mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
    --sans:Inter,system-ui,sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:13px}
  a{color:var(--accent);text-decoration:none}
  button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
  .app{display:grid;grid-template-columns:280px 1fr 1fr;grid-template-rows:42px 1fr 28px;height:100vh;gap:0}
  header{grid-column:1/-1;display:flex;align-items:center;padding:0 14px;background:var(--bg2);border-bottom:1px solid var(--line);gap:14px}
  header .brand{font-family:var(--mono);font-weight:700;color:var(--accent);letter-spacing:.04em}
  header .brand .h{color:var(--fg3)}
  header .spacer{flex:1}
  header .actions{display:flex;gap:6px}
  .btn{padding:5px 12px;border:1px solid var(--line2);border-radius:4px;background:var(--bg3);font-family:var(--mono);font-size:11.5px;color:var(--fg)}
  .btn:hover{border-color:var(--accent);color:var(--accent)}
  .btn.primary{background:var(--accent);color:#1a0f02;border-color:var(--accent);font-weight:700}
  .btn.primary:hover{filter:brightness(1.1);color:#1a0f02}
  .btn.danger:hover{border-color:var(--danger);color:var(--danger)}

  aside{background:var(--bg2);border-right:1px solid var(--line);overflow:auto;padding:8px 0}
  .sec{padding:6px 12px 4px;font-family:var(--mono);font-size:10px;color:var(--fg3);letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:6px;cursor:pointer}
  .sec:hover{color:var(--accent)}
  .sec .count{margin-left:auto;color:var(--fg3);background:var(--bg3);padding:1px 5px;border-radius:8px;font-size:9px}
  .sec .add{color:var(--fg3);padding:0 4px;font-size:14px}
  .sec .add:hover{color:var(--accent)}
  .sec.collapsed + .files{display:none}
  .files{display:flex;flex-direction:column;padding-bottom:6px}
  .file{padding:4px 14px;font-family:var(--mono);font-size:11.5px;color:var(--fg2);cursor:pointer;display:flex;align-items:center;gap:6px;border-left:2px solid transparent}
  .file:hover{background:var(--bg3);color:var(--fg)}
  .file.active{background:var(--bg3);color:var(--accent);border-left-color:var(--accent)}
  .file .dot{width:5px;height:5px;border-radius:50%;background:transparent}
  .file.dirty .dot{background:var(--accent)}
  .file .ctx{margin-left:auto;opacity:0;display:flex;gap:4px}
  .file:hover .ctx{opacity:1}
  .file .ctx button{color:var(--fg3);font-family:var(--mono);font-size:10px;padding:0 3px}
  .file .ctx button:hover{color:var(--accent)}
  .file .ctx button.del:hover{color:var(--danger)}

  main{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--line)}
  .tabs{display:flex;align-items:center;background:var(--bg2);border-bottom:1px solid var(--line);padding:0 10px;height:34px;gap:10px}
  .tabs .path{font-family:var(--mono);font-size:11.5px;color:var(--fg2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tabs .path .sec{display:inline;padding:0;color:var(--accent);text-transform:none;letter-spacing:0;font-size:inherit;cursor:default}
  .tabs .path .sec:hover{color:var(--accent)}
  .tabs .meta{font-family:var(--mono);font-size:10px;color:var(--fg3);display:flex;gap:8px}
  .tabs .meta .status{padding:1px 6px;border-radius:3px;border:1px solid var(--line2)}
  .tabs .meta .status.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--line))}
  .tabs .meta .status.dirty{color:var(--accent);border-color:var(--accent)}

  .CodeMirror{flex:1;height:auto !important;font-family:var(--mono) !important;font-size:13px;background:var(--bg) !important}
  .CodeMirror-gutters{background:var(--bg2) !important;border-right:1px solid var(--line) !important}
  .CodeMirror-linenumber{color:var(--fg3) !important}

  .preview{background:var(--bg);overflow:auto;padding:18px 22px}
  .preview-head{display:flex;align-items:center;justify-content:space-between;padding:0 22px;height:34px;background:var(--bg2);border-bottom:1px solid var(--line);font-family:var(--mono);font-size:11px;color:var(--fg3);letter-spacing:.04em;text-transform:uppercase}

  .empty{display:grid;place-items:center;flex:1;color:var(--fg3);font-family:var(--mono);font-size:12px}

  footer{grid-column:1/-1;background:var(--bg2);border-top:1px solid var(--line);display:flex;align-items:center;padding:0 14px;gap:14px;font-family:var(--mono);font-size:10.5px;color:var(--fg3)}
  footer .log{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  footer .log.ok{color:var(--ok)} footer .log.err{color:var(--danger)} footer .log.act{color:var(--accent)}

  /* Rendered markdown — mirrors the blog's md-body styles */
  .md h1{font-size:22px;margin:14px 0 10px;color:var(--fg);font-weight:600}
  .md h2{font-size:17px;margin:18px 0 8px;color:var(--fg);font-weight:600;border-bottom:1px solid var(--line);padding-bottom:4px}
  .md h3{font-size:14px;margin:16px 0 6px;color:var(--accent);font-family:var(--mono);font-weight:600}
  .md p{margin:0 0 10px;color:var(--fg2);line-height:1.55}
  .md code{font-family:var(--mono);font-size:.9em;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);padding:1px 5px;border-radius:3px}
  .md pre{background:var(--bg2);border:1px solid var(--line);border-left:2px solid var(--accent);border-radius:4px;padding:10px 12px;font-family:var(--mono);font-size:11.5px;line-height:1.55;overflow-x:auto;color:var(--fg2);margin:0 0 12px}
  .md pre code{background:transparent;color:inherit;padding:0}
  .md table{border-collapse:collapse;margin:0 0 12px;width:100%;font-family:var(--mono);font-size:11.5px}
  .md th,.md td{border:1px solid var(--line);padding:5px 9px;vertical-align:top;text-align:left}
  .md th{background:var(--bg2)} .md ul,.md ol{padding-left:22px;margin:0 0 10px}
  .md blockquote{margin:0 0 10px;padding:6px 12px;border-left:2px solid color-mix(in srgb,var(--accent) 60%,var(--line));background:var(--bg2);font-style:italic;color:var(--fg2);border-radius:0 4px 4px 0}
  .md img{max-width:100%;border:1px solid var(--line);border-radius:4px;margin:4px 0}
  .md hr{border:0;border-top:1px dashed var(--line);margin:14px 0}
  .md a{color:var(--accent);border-bottom:1px dashed color-mix(in srgb,var(--accent) 40%,transparent)}

  /* Modal */
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:50}
  .modal.on{display:flex}
  .modal-card{background:var(--bg2);border:1px solid var(--line2);border-radius:8px;padding:18px 20px;min-width:360px;max-width:480px;font-family:var(--mono);font-size:12px}
  .modal-card h3{margin:0 0 12px;font-family:var(--mono);font-size:13px;color:var(--accent)}
  .modal-card label{display:block;margin:8px 0 4px;color:var(--fg3);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  .modal-card input,.modal-card select{width:100%;padding:6px 10px;border:1px solid var(--line2);border-radius:4px;background:var(--bg);color:var(--fg);font:inherit;outline:0}
  .modal-card input:focus,.modal-card select:focus{border-color:var(--accent)}
  .modal-card .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
</style>
</head><body>
<div class="app">
  <header>
    <span class="brand">sverz1<span class="h">@</span>editor</span>
    <span class="spacer"></span>
    <div class="actions">
      <button class="btn" id="btnSave" title="Ctrl+S">save</button>
      <button class="btn" id="btnRename">rename</button>
      <button class="btn danger" id="btnDelete">delete</button>
      <button class="btn primary" id="btnRebuild">rebuild data.js</button>
      <a class="btn" href="http://127.0.0.1:8765/" target="_blank">open blog ↗</a>
    </div>
  </header>

  <aside id="sidebar"></aside>

  <main>
    <div class="tabs">
      <div class="path" id="filePath">no file open</div>
      <div class="meta">
        <span id="metaSize">— B</span>
        <span class="status" id="metaStatus">idle</span>
      </div>
    </div>
    <textarea id="editor"></textarea>
  </main>

  <section style="display:flex;flex-direction:column;overflow:hidden">
    <div class="preview-head">
      <span>preview</span>
      <span id="previewStat">—</span>
    </div>
    <div class="preview md" id="preview">
      <div class="empty">pick a file from the sidebar to start editing</div>
    </div>
  </section>

  <footer>
    <span class="log" id="log">ready</span>
    <span id="counts">—</span>
  </footer>
</div>

<div class="modal" id="modalCreate">
  <div class="modal-card">
    <h3>new file</h3>
    <label>section</label>
    <select id="newSection"></select>
    <label>name (no extension)</label>
    <input id="newName" placeholder="e.g. NewBox" autocomplete="off"/>
    <div class="row">
      <button class="btn" onclick="closeModal('modalCreate')">cancel</button>
      <button class="btn primary" id="btnCreateOk">create</button>
    </div>
  </div>
</div>

<div class="modal" id="modalRename">
  <div class="modal-card">
    <h3>rename file</h3>
    <label>new name (no extension)</label>
    <input id="renameTo" autocomplete="off"/>
    <div class="row">
      <button class="btn" onclick="closeModal('modalRename')">cancel</button>
      <button class="btn primary" id="btnRenameOk">rename</button>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/markdown/markdown.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/yaml/yaml.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/yaml-frontmatter/yaml-frontmatter.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.16/addon/edit/closebrackets.min.js"></script>
<script>
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const state = {
  current: null,    // {path, section, mtime}
  sections: [],
  dirty: false,
  previewTimer: null,
  saveTimer: null,
};

const cm = CodeMirror.fromTextArea($("#editor"), {
  mode: {name:"yaml-frontmatter", base:"markdown"},
  theme: "material-darker",
  lineNumbers: true,
  lineWrapping: true,
  autoCloseBrackets: true,
  tabSize: 2,
  indentUnit: 2,
});
cm.on("change", () => {
  if (!state.current) return;
  setDirty(true);
  schedulePreview();
});

function setDirty(d){
  state.dirty = d;
  const meta = $("#metaStatus");
  meta.textContent = d ? "modified" : "saved";
  meta.classList.toggle("dirty", d);
  meta.classList.toggle("ok", !d);
  if (state.current){
    const row = document.querySelector('.file[data-path="' + cssEscape(state.current.path) + '"]');
    if (row) row.classList.toggle("dirty", d);
  }
}

function cssEscape(s){ return s.replace(/(["\\])/g,'\\$1'); }

function log(msg, kind){
  const el = $("#log");
  el.textContent = msg;
  el.className = "log " + (kind || "");
}

async function loadList(){
  const r = await fetch("/api/list");
  const d = await r.json();
  state.sections = d.sections;
  renderSidebar();
  const totals = d.sections.map(s => s.label + ":" + s.count).join(" · ");
  $("#counts").textContent = totals;
  // populate "new file" section options
  const sel = $("#newSection");
  sel.innerHTML = d.sections.map(s => `<option value="${s.key}">${s.label}</option>`).join("");
}

function renderSidebar(){
  const root = $("#sidebar");
  root.innerHTML = "";
  for (const sec of state.sections){
    const header = document.createElement("div");
    header.className = "sec";
    header.innerHTML = `<span>${sec.label}</span>
      <span class="count">${sec.count}</span>
      <button class="add" title="new file in this section" data-add="${sec.key}">+</button>`;
    root.appendChild(header);
    const list = document.createElement("div");
    list.className = "files";
    for (const f of sec.files){
      const row = document.createElement("div");
      row.className = "file";
      row.dataset.path = f.path;
      row.dataset.section = sec.key;
      row.innerHTML = `<span class="dot"></span><span>${f.name}</span>
        <span class="ctx">
          <button title="rename" data-rename="${f.path}">ren</button>
          <button class="del" title="delete" data-del="${f.path}">del</button>
        </span>`;
      row.addEventListener("click", e => {
        if (e.target.closest("button")) return;
        openFile(f.path, sec.key);
      });
      list.appendChild(row);
    }
    root.appendChild(list);
    header.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      header.classList.toggle("collapsed");
    });
  }
  // wire +/rename/delete via delegation
  root.addEventListener("click", async e => {
    const addKey = e.target.dataset.add;
    if (addKey){ openCreateModal(addKey); return; }
    const renPath = e.target.dataset.rename;
    if (renPath){ openRenameModal(renPath); return; }
    const delPath = e.target.dataset.del;
    if (delPath){ doDelete(delPath); return; }
  }, true);
}

async function openFile(path, section){
  if (state.dirty && !confirm("Discard unsaved changes?")) return;
  const r = await fetch("/api/read?path=" + encodeURIComponent(path));
  if (!r.ok){ log("read failed: " + path, "err"); return; }
  const d = await r.json();
  state.current = { path, section, mtime: d.mtime };
  cm.setValue(d.content);
  cm.clearHistory();
  setDirty(false);
  $$(".file").forEach(x => x.classList.remove("active"));
  const row = document.querySelector('.file[data-path="' + cssEscape(path) + '"]');
  if (row) row.classList.add("active");
  $("#filePath").innerHTML = `<span class="sec">${section}</span> · ${path.split("/").pop()}`;
  $("#metaSize").textContent = byteFmt(d.content.length);
  log("opened " + path.split("/").pop(), "act");
  renderPreview();
}

async function saveCurrent(){
  if (!state.current) return;
  const r = await fetch("/api/save", {
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({path: state.current.path, content: cm.getValue()})
  });
  const d = await r.json();
  if (!r.ok){ log("save failed: " + (d.error || r.status), "err"); return; }
  setDirty(false);
  log("saved · " + byteFmt(d.size), "ok");
  $("#metaSize").textContent = byteFmt(d.size);
}

function schedulePreview(){
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(renderPreview, 350);
}

async function renderPreview(){
  if (!state.current){ return; }
  const r = await fetch("/api/preview", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({path: state.current.path, content: cm.getValue()})
  });
  const d = await r.json();
  if (!r.ok){ $("#preview").innerHTML = "<pre>preview error: "+(d.error||"")+"</pre>"; return; }
  $("#preview").innerHTML = d.html || "<div class=\"empty\">(empty)</div>";
  const fm = d.frontmatter || {};
  $("#previewStat").textContent = fm.title ? ("title: " + fm.title) : "no frontmatter";
}

function openCreateModal(sectionKey){
  $("#newSection").value = sectionKey;
  $("#newName").value = "";
  $("#modalCreate").classList.add("on");
  setTimeout(()=>$("#newName").focus(), 30);
}

function openRenameModal(path){
  state.renameTarget = path;
  const stem = path.split("/").pop().replace(/(_EN)?\.md$/,"");
  $("#renameTo").value = stem;
  $("#modalRename").classList.add("on");
  setTimeout(()=>$("#renameTo").focus(), 30);
}

function closeModal(id){ $("#"+id).classList.remove("on"); }

async function doCreate(){
  const section = $("#newSection").value;
  const name = $("#newName").value.trim();
  if (!name) return;
  const r = await fetch("/api/create", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({section, name})
  });
  const d = await r.json();
  if (!r.ok){ log("create failed: " + (d.error || r.status), "err"); return; }
  closeModal("modalCreate");
  log("created " + d.path.split("/").pop(), "ok");
  await loadList();
  openFile(d.path, section);
}

async function doRename(){
  if (!state.renameTarget) return;
  const to = $("#renameTo").value.trim();
  if (!to) return;
  const r = await fetch("/api/rename", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({from: state.renameTarget, to})
  });
  const d = await r.json();
  if (!r.ok){ log("rename failed: " + (d.error || r.status), "err"); return; }
  closeModal("modalRename");
  log("renamed → " + d.path.split("/").pop(), "ok");
  const wasOpen = state.current && state.current.path === state.renameTarget;
  await loadList();
  if (wasOpen) openFile(d.path, state.current.section);
}

async function doDelete(path){
  if (!confirm("Move to trash?\n" + path.split("/").pop())) return;
  const r = await fetch("/api/delete?path=" + encodeURIComponent(path), {method:"DELETE"});
  const d = await r.json();
  if (!r.ok){ log("delete failed: " + (d.error || r.status), "err"); return; }
  log("trashed → " + d.trashed_to, "ok");
  if (state.current && state.current.path === path){
    state.current = null;
    cm.setValue("");
    $("#preview").innerHTML = '<div class="empty">deleted</div>';
    $("#filePath").textContent = "no file open";
  }
  await loadList();
}

async function doRebuild(){
  log("running build.py …", "act");
  const r = await fetch("/api/rebuild", {method:"POST"});
  const d = await r.json();
  const tail = (d.stdout || "").trim().split("\n").pop() || "";
  log(d.ok ? ("rebuilt · " + tail) : ("rebuild FAILED: " + (d.stderr.trim().split('\n').pop() || "")), d.ok ? "ok" : "err");
}

function byteFmt(n){
  if (n < 1024) return n + " B";
  if (n < 1024*1024) return (n/1024).toFixed(1) + " KB";
  return (n/1024/1024).toFixed(2) + " MB";
}

// Wiring
$("#btnSave").addEventListener("click", saveCurrent);
$("#btnRebuild").addEventListener("click", doRebuild);
$("#btnRename").addEventListener("click", () => { if (state.current) openRenameModal(state.current.path); });
$("#btnDelete").addEventListener("click", () => { if (state.current) doDelete(state.current.path); });
$("#btnCreateOk").addEventListener("click", doCreate);
$("#btnRenameOk").addEventListener("click", doRename);

// Ctrl+S inside the editor
cm.setOption("extraKeys", {
  "Ctrl-S": () => saveCurrent(),
  "Cmd-S":  () => saveCurrent(),
});
// Also when the editor isn't focused
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"){
    e.preventDefault();
    saveCurrent();
  }
  if (e.key === "Escape"){
    $$(".modal.on").forEach(m => m.classList.remove("on"));
  }
});

loadList();
</script>
</body></html>
"""


@app.route("/")
def index():
    return Response(INDEX_HTML, mimetype="text/html")


if __name__ == "__main__":
    print("SverzBlog editor → http://127.0.0.1:8766/")
    app.run(host="127.0.0.1", port=8766, debug=False, use_reloader=False)
