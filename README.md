# SverzBlog

Offensive-security notebook rebuilt as an interactive 75% keyboard.
Press a letter on the keyboard (W / E / N / C / R / T / A) to open a section
as a draggable, resizable terminal window.

## Local development

```bash
cd ~/Desktop/SverzBlog
python3 -m http.server 8765
# then open http://127.0.0.1:8765/
```

## Rebuilding content

`assets/data.js` is auto-generated from the markdown sitting in
`~/Desktop/SverzBlog-old/` (the old Quartz tree). To regenerate after
adding or editing markdown:

```bash
python3 build.py
```

The script reads:

| Section     | Source                                          |
|-------------|-------------------------------------------------|
| writeups    | `SverzBlog-old/publish/Writeups/*_EN.md`        |
| enumeration | `SverzBlog-old/Enumeration/*_EN.md`             |
| notes       | `SverzBlog-old/publish/Misc/*.md`               |
| cheatsheets | `SverzBlog-old/HTB/Cheatsheets/*.md`            |
| research    | `SverzBlog-old/publish/Career/CyberSec/*.md`    |
| tools       | `SverzBlog-old/notes/PimpMyAI/README.md` + scripts |

Referenced images (`![[file.png]]` wikilinks and `![alt](relpath.png)`
markdown links) are auto-located across the whole old tree and copied
into `img/`.

## Keyboard shortcuts

| Key       | Action                          |
|-----------|---------------------------------|
| `W`       | writeups                        |
| `E`       | enumeration                     |
| `N`       | misc notes                      |
| `C`       | cheatsheets                     |
| `R`       | research / study chapters       |
| `T`       | tools                           |
| `A`       | about                           |
| `H`       | home                            |
| `?` / Space | help                          |
| `Ctrl+F`  | search                          |
| `Esc`     | close focused window (×2 = all) |
| `⇧T`      | toggle dark / pink-cipria theme |
| `⇧↑/↓`    | cycle RGB mode                  |
| `⇧←/→`    | RGB speed                       |
| knob click | toggle 75% ↔ 100% layout       |

## Layout

```
SverzBlog/
├── index.html        ← the hero + keyboard stage
├── assets/
│   ├── sverz.css     ← design (themes, keyboard, windows, md-body)
│   ├── data.js       ← AUTO-GENERATED content blob
│   ├── keyboard.js   ← key layout + builder
│   ├── windows.js    ← terminal window manager + section specs
│   ├── rgb.js        ← per-key LED engine
│   └── app.js        ← wiring, scroll, easter eggs, theme
├── img/              ← copied screenshots referenced by markdown
├── build.py          ← regenerates assets/data.js + img/
└── README.md
```

## GitHub Pages deployment (next step)

This folder is ready to be the gh-pages root — `index.html` sits at the
top level, no build step required at serve time.
