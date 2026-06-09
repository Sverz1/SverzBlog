#!/usr/bin/env python3
"""
SverzBlog build script.

Reads markdown content from /home/sverz1/Desktop/SverzBlog-old/{publish,HTB,Enumeration,notes}
and emits /home/sverz1/Desktop/SverzBlog/assets/data.js — a self-contained
JS module loaded by index.html.

Each section maps to a keyboard key:
  W → writeups       (publish/Writeups/*_EN.md)
  E → enumeration    (Enumeration/*_EN.md)
  N → notes          (publish/Misc/*.md)
  C → cheatsheets    (HTB/Cheatsheets/*.md)
  R → research       (publish/Career/CyberSec/*.md)
  T → tools          (notes/PimpMyAI + scripts)
"""
import json
import os
import re
import shutil
from pathlib import Path

import markdown
import yaml

DST = Path(__file__).parent.resolve()
SRC = Path(os.environ.get("SVERZBLOG_SRC", DST.parent / "SverzBlog-old")).resolve()
IMG_DST = DST / "img"
DATA_JS = DST / "assets" / "data.js"

MD = markdown.Markdown(
    extensions=[
        "fenced_code", "tables", "toc", "attr_list", "sane_lists",
        "pymdownx.tasklist",
    ],
    extension_configs={
        # Render task list items as real <input type="checkbox"> with
        # custom_checkbox=true so we can fully style them via CSS.
        "pymdownx.tasklist": {"custom_checkbox": True, "clickable_checkbox": True},
    },
    output_format="html5",
)

WIKI_IMG = re.compile(r"!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]")
WIKI_LINK = re.compile(r"\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]")
CALLOUT = re.compile(r"^> \[!(\w+)\][+-]?\s*(.*)$")
MD_IMG = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")

# Build a once-per-run index of every image basename → absolute source path,
# so wikilinks like ![[upload.png]] resolve regardless of where the .md lives.
def index_images():
    idx = {}
    for ext in ("png", "jpg", "jpeg", "gif", "svg", "webp"):
        for p in SRC.rglob(f"*.{ext}"):
            # Prefer first match if duplicates exist
            idx.setdefault(p.name, p)
    return idx

IMG_INDEX = None  # populated in main()


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s·-]", "", s.lower())
    s = re.sub(r"[\s·]+", "-", s).strip("-")
    return re.sub(r"-+", "-", s)[:80]


def parse_frontmatter(text: str):
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    try:
        meta = yaml.safe_load(text[3:end]) or {}
    except yaml.YAMLError:
        meta = {}
    body = text[end + 4 :].lstrip("\n")
    return meta, body


def preprocess(body: str, images_used: set, md_path: Path) -> str:
    """Pre-process Obsidian-style markup before markdown rendering."""
    # Wikilink images: ![[file.png]] → ![file.png](img/file.png)
    def wiki_img_repl(m):
        name = m.group(1).strip()
        images_used.add(name)
        safe = name.replace(" ", "%20")
        return f"![{name}](img/{safe})"

    body = WIKI_IMG.sub(wiki_img_repl, body)

    # Standard markdown images: ![alt](relpath/to/img.png) — resolve relative
    # to the .md file's location and remap to img/<basename>.
    def md_img_repl(m):
        alt, src = m.group(1), m.group(2).strip()
        if src.startswith(("http://", "https://", "data:")):
            return m.group(0)  # leave external untouched
        candidate = (md_path.parent / src).resolve()
        if candidate.exists():
            images_used.add(candidate.name)
            safe = candidate.name.replace(" ", "%20")
            return f"![{alt}](img/{safe})"
        # Fallback: just take the basename
        name = os.path.basename(src)
        images_used.add(name)
        safe = name.replace(" ", "%20")
        return f"![{alt}](img/{safe})"

    body = MD_IMG.sub(md_img_repl, body)

    # [[Page|alt]] → alt (strip wikilinks since we don't build cross-section links)
    def link_repl(m):
        target, alt = m.group(1), m.group(2)
        return alt if alt else target.split("#")[0]

    body = WIKI_LINK.sub(link_repl, body)

    # Obsidian callouts → titled blockquote
    out = []
    for line in body.splitlines():
        m = CALLOUT.match(line)
        if m:
            kind, title = m.group(1), m.group(2)
            out.append(f"> **{title or kind.upper()}**  ")
        else:
            out.append(line)
    return "\n".join(out)


def first_paragraph(html: str, n: int = 280) -> str:
    """Pull a plaintext excerpt from rendered HTML for the list-view desc."""
    m = re.search(r"<p>(.+?)</p>", html, re.DOTALL)
    text = m.group(1) if m else html
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > n:
        text = text[: n - 1].rsplit(" ", 1)[0] + "…"
    return text


def parse_md(path: Path, images_used: set):
    raw = path.read_text(encoding="utf-8", errors="replace")
    meta, body = parse_frontmatter(raw)
    body = preprocess(body, images_used, path)
    MD.reset()
    html = MD.convert(body)

    title = meta.get("title")
    if not title:
        m = re.search(r"^#\s+(.+?)\s*$", body, re.MULTILINE)
        title = m.group(1) if m else path.stem.replace("_", " ").replace("-", " ")
    title = re.sub(r"\s*[—–-]\s*HTB\s*$", "", title).strip()

    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    tags = [str(t).lower() for t in tags][:6]

    date = meta.get("date")
    date = str(date) if date else ""
    if date:
        # Normalise YYYY-MM-DD → YYYY·MM·DD to match the design's date style
        date = date.replace("-", "·")

    return {
        "title": title,
        "slug": slugify(title),
        "date": date,
        "tags": tags,
        "desc": first_paragraph(html),
        "body": html,
    }


def list_md(folder: Path, only_suffix: str | None = None):
    if not folder.exists():
        return []
    items = []
    for p in sorted(folder.glob("*.md")):
        if only_suffix and not p.stem.endswith(only_suffix):
            continue
        items.append(p)
    return items


def copy_images(image_names: set):
    """Copy referenced images using the whole-repo image index so wikilinks
    that point at HTB/Machines/<box>/screenshot/foo.png resolve correctly."""
    copied = 0
    missing = []
    for name in image_names:
        src = IMG_INDEX.get(name)
        if src and src.exists():
            shutil.copy2(src, IMG_DST / name)
            copied += 1
        else:
            missing.append(name)
    return copied, missing


def section_writeups(images_used):
    items = []
    for p in list_md(SRC / "publish" / "Writeups", only_suffix="_EN"):
        d = parse_md(p, images_used)
        # Auto-tag HTB writeups so the design's t-* badges colour them
        if "htb" not in d["tags"]:
            d["tags"].insert(0, "htb")
        items.append(d)
    items.sort(key=lambda x: x["date"], reverse=True)
    return items


def section_enumeration(images_used):
    items = []
    for p in list_md(SRC / "Enumeration", only_suffix="_EN"):
        d = parse_md(p, images_used)
        if "enum" not in d["tags"]:
            d["tags"].append("enum")
        items.append(d)
    items.sort(key=lambda x: x["title"])
    return items


def section_notes(images_used):
    items = []
    for p in list_md(SRC / "publish" / "Misc"):
        d = parse_md(p, images_used)
        # Note format: snippet (first ~3 code-ish lines) + foot
        snippet_match = re.search(r"<pre><code[^>]*>(.+?)</code></pre>", d["body"], re.DOTALL)
        snippet = ""
        if snippet_match:
            snippet = re.sub(r"<[^>]+>", "", snippet_match.group(1))
            snippet = "\n".join(snippet.strip().splitlines()[:4])
        d["snippet"] = snippet or d["desc"][:160]
        d["foot"] = f"/notes/{p.stem}.md"
        items.append(d)
    items.sort(key=lambda x: x["title"])
    return items


def section_cheatsheets(images_used):
    items = []
    for p in list_md(SRC / "HTB" / "Cheatsheets"):
        d = parse_md(p, images_used)
        # Pull the longest fenced code block as the cheatsheet body
        code_blocks = re.findall(r"<pre><code[^>]*>(.+?)</code></pre>", d["body"], re.DOTALL)
        if code_blocks:
            longest = max(code_blocks, key=len)
            body_text = re.sub(r"<[^>]+>", "", longest)
            body_text = re.sub(r"&lt;", "<", body_text)
            body_text = re.sub(r"&gt;", ">", body_text)
            body_text = re.sub(r"&amp;", "&", body_text)
            body_text = re.sub(r"&#39;", "'", body_text)
            d["snippet_body"] = body_text.strip()
        else:
            d["snippet_body"] = d["desc"]
        items.append(d)
    items.sort(key=lambda x: x["title"])
    return items


def section_fundamentals(images_used):
    # File-order numbering: 01-Principles…, 02-Network-OSI…, etc.
    # list_md already sorts by path, so the numeric prefix dictates order.
    items = []
    for p in list_md(SRC / "Fundamentals", only_suffix="_EN"):
        d = parse_md(p, images_used)
        d["tag"] = "THEORY · CHAPTER"
        items.append(d)
    return items


def main():
    global IMG_INDEX
    IMG_INDEX = index_images()
    images = set()
    data = {
        "writeups": section_writeups(images),
        "enumeration": section_enumeration(images),
        "notes": section_notes(images),
        "cheatsheets": section_cheatsheets(images),
        "fundamentals": section_fundamentals(images),
        "easterEggs": {
            "sudo":   "nice try. sudo is disabled on this box.",
            "rmrf":   "rm -rf /  # aborted. you know better.",
            "matrix": "wake up, neo...",
            "ghost":  "👻 ghost in the shell detected",
            "konami": "↑↑↓↓←→←→BA — 30 extra lives granted",
            "coffee": "☕ brewing... sverz1 needs coffee",
            "hack":   "hacking the planet 🌐",
            "xyzzy":  "nothing happens.",
            "pwn":    "💀 pwned — but by whom?",
            "0day":   "we don't talk about 0days in public 🤫",
            "sverz":  "you found me. hi 👋",
            "htb":    "ippsec is watching.",
        },
        "counts": {},
    }
    data["counts"] = {k: len(v) for k, v in data.items() if isinstance(v, list)}

    copied, missing = copy_images(images)

    js = "/* AUTO-GENERATED by build.py — do not edit by hand */\n"
    js += "window.SVERZ_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    DATA_JS.write_text(js, encoding="utf-8")
    print(f"[ok] wrote {DATA_JS} — {sum(data['counts'].values())} entries")
    for k, n in data["counts"].items():
        print(f"      {k:14} {n:3d}")
    print(f"[ok] images: {copied}/{len(images)} copied, {len(missing)} missing")
    if missing:
        for m in missing[:10]:
            print(f"      MISSING: {m}")

    # Bust the browser cache on every rebuild — rewrite ?v=... in index.html
    # to a hash of data.js so the browser never serves a stale copy.
    import hashlib
    idx = DST / "index.html"
    if idx.exists():
        ver = hashlib.md5(js.encode("utf-8")).hexdigest()[:8]
        html = idx.read_text(encoding="utf-8")
        new_html = re.sub(r"\?v=[A-Za-z0-9]+", f"?v={ver}", html)
        if new_html != html:
            idx.write_text(new_html, encoding="utf-8")
            print(f"[ok] cache bust: index.html → ?v={ver}")
        else:
            print(f"[ok] cache bust: already at ?v={ver}")


if __name__ == "__main__":
    main()
