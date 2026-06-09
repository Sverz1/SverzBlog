#!/usr/bin/env python3
"""
Standardise the form of every English writeup so they all follow the same
shape, without touching the actual content sections.

Applies to: SverzBlog-old/publish/Writeups/*_EN.md (in place).

Form standardisation:
  1. Frontmatter
     - Keys present in fixed order: title, tags, date, lang, translated_from
     - title  → "{Name} - HTB"
     - lang   → "en"  (added if missing)
     - translated_from → "{Name}.md"  (added if missing)
     - tags   → YAML list, "Title-Case-With-Hyphens"
                  (Active_Directory → Active-Directory,
                   sql-injection    → SQL-Injection,
                   phpMyAdmin       → phpMyAdmin   ← preserves natural case)
  2. H1 title
     - "# {Name} — Hack The Box"  (em-dash; converts "//" forms)
  3. Stray junk
     - Lone characters (≤2 chars, no markdown markup) appearing between the
       frontmatter and the H1 are removed.
  4. Info table
     - Header normalised to "| Info       | Value |"
     - Empty info tables are not synthesised — only existing rows kept, in
       canonical order: OS, Difficulty, IP, Hostname, Services.
     - "---" separator inserted after the info table if missing.
  5. Section headers
     - "## Foothold // X" → "## Foothold — X"  (also for ###, ####).

Content is otherwise untouched. Run any time you edit a writeup:

    python3 normalize_writeups.py
    python3 build.py      # rebuild data.js
"""
import re
import sys
from pathlib import Path

import yaml

SRC_DIR = Path("/home/sverz1/Desktop/SverzBlog-old/publish/Writeups")

CANONICAL_KEYS = ["title", "tags", "date", "lang", "translated_from"]
CANONICAL_INFO_ROWS = ["OS", "Difficulty", "IP", "Hostname", "Services"]

# Tags whose natural capitalisation differs from Title-Case
TAG_CASE_OVERRIDES = {
    "htb": "HTB", "thm": "THM", "oscp": "OSCP",
    "rce": "RCE", "lfi": "LFI", "rfi": "RFI", "ssrf": "SSRF",
    "xss": "XSS", "xxe": "XXE", "sqli": "SQLi", "sql-injection": "SQL-Injection",
    "union-injection": "UNION-Injection", "cors": "CORS",
    "smb": "SMB", "ldap": "LDAP", "ftp": "FTP", "nfs": "NFS",
    "dns": "DNS", "smtp": "SMTP", "imap": "IMAP", "pop3": "POP3",
    "ssh": "SSH", "rpc": "RPC", "vnc": "VNC", "winrm": "WinRM",
    "mssql": "MSSQL", "mysql": "MySQL", "mariadb": "MariaDB",
    "phpmyadmin": "phpMyAdmin", "node.js": "Node.js", "nodejs": "Node.js",
    "vm2": "vm2", "uac": "UAC", "amsi": "AMSI", "adcs": "ADCS",
    "esc1": "ESC1", "ntlmv2": "NTLMv2", "sha1": "SHA1",
    "freebsd": "FreeBSD", "linux": "Linux", "windows": "Windows",
    "active-directory": "Active-Directory", "active_directory": "Active-Directory",
    "pass-the-hash": "Pass-the-Hash", "path-traversal": "Path-Traversal",
    "directory-traversal": "Directory-Traversal",
    "dll-hijacking": "DLL-Hijacking", "dll-injection": "DLL-Injection",
    "dllmain": "DllMain", "themebleed": "ThemeBleed",
    "clfs-eop": "CLFS-EoP",
    "log-poisoning": "Log-Poisoning", "php-rce": "PHP-RCE",
    "file-upload": "File-Upload", "fileupload": "File-Upload",
    "mime-bypass": "MIME-Bypass",
    "api-information-disclosure": "API-Information-Disclosure",
    "api-security": "API-Security",
    "session-management": "Session-Management",
    "access-control": "Access-Control",
    "cross-compilation": "Cross-Compilation",
    "port-forwarding": "PortForwarding", "portforwarding": "PortForwarding",
    "ssh-tunneling": "SSH-Tunneling",
    "shared-library-hijack": "Shared-Library-Hijack",
    "buffer-overflow": "BufferOverflow", "bufferoverflow": "BufferOverflow",
    "always-install-elevated": "AlwaysInstallElevated",
    "alwaysinstallelevated": "AlwaysInstallElevated",
    "vhost-enumeration": "VHost-Enumeration",
    "process-snooping": "Process-Snooping",
    "bash-glob-injection": "Bash-Glob-Injection",
    "sandbox-escape": "Sandbox-Escape",
    "command-injection": "Command-Injection",
    "log4j": "Log4j", "log4shell": "Log4Shell",
    "godpotato": "GodPotato",
    "seimpersonateprivilege": "SeImpersonatePrivilege",
    "mass-assignment": "Mass-Assignment",
    "setenv": "SETENV",
    "world-writable-script": "World-Writable-Script",
    "restricted-shell": "Restricted-Shell",
    "cron-job": "Cron-Job",
    "pam-motd": "PAM-MOTD",
    "symlink-attack": "Symlink-Attack",
    "gtfobins": "GTFOBins",
    "gitpython": "GitPython",
    "gymmanagementsystem": "GymManagementSystem",
    "votingsystem": "VotingSystem",
    "hmailserver": "hMailServer",
    "apache-james": "Apache-James",
    "activemq": "ActiveMQ",
    "joomla": "Joomla", "wordpress": "WordPress", "umbraco": "Umbraco",
    "dolibarr": "Dolibarr",
    "ligolo": "Ligolo",
    "cloudme": "CloudMe",
    "enlightenment": "Enlightenment",
    "perl": "Perl", "php": "PHP", "python": "Python",
    "bcrypt": "bcrypt",
    "deserialization": "Deserialization",
    "password-reuse": "Password-Reuse",
    "phishing": "Phishing",
    "libreoffice": "LibreOffice",
    "base64": "Base64", "nginx": "nginx", "sudo": "sudo",
    "suid": "SUID",
    "webshell": "Webshell",
    "hashcat": "hashcat",
    "apport-cli": "apport-cli",
    "gwolle-gb": "gwolle-gb",
}


def title_case_hyphen(tag: str) -> str:
    """Default Title-Case for hyphenated tags ('foo-bar' → 'Foo-Bar')."""
    return "-".join(p.capitalize() for p in tag.split("-"))


def normalise_tag(t: str) -> str:
    raw = str(t).strip()
    # Underscores → hyphens; whitespace → hyphens
    canon = re.sub(r"[\s_]+", "-", raw).lower()
    # CVE preserved with uppercase prefix
    if canon.startswith("cve-"):
        return "CVE-" + canon[4:].upper().replace("-", "-")
    if canon in TAG_CASE_OVERRIDES:
        return TAG_CASE_OVERRIDES[canon]
    return title_case_hyphen(canon)


def parse_frontmatter(text: str):
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end == -1:
        return None, text
    raw_fm = text[3:end].strip("\n")
    body = text[end + 4 :].lstrip("\n")
    try:
        meta = yaml.safe_load(raw_fm) or {}
    except yaml.YAMLError:
        return None, text
    return meta, body


def dump_frontmatter(meta: dict) -> str:
    ordered = {}
    for k in CANONICAL_KEYS:
        if k in meta and meta[k] not in (None, "", []):
            ordered[k] = meta[k]
    # Carry over any extra keys at the end so we never silently drop them
    for k, v in meta.items():
        if k not in ordered:
            ordered[k] = v
    out = ["---"]
    for k, v in ordered.items():
        if k == "tags" and isinstance(v, list):
            out.append("tags:")
            for t in v:
                out.append(f"  - {t}")
        else:
            out.append(yaml.safe_dump({k: v}, default_flow_style=False).strip())
    out.append("---")
    return "\n".join(out)


def normalise_h1(line: str, name: str) -> str:
    # Already H1 of the form "# X — Hack The Box" or "# X // Hack The Box"
    m = re.match(r"^#\s+(.+?)\s*$", line)
    if not m:
        return line
    return f"# {name} — Hack The Box"


def normalise_info_table(lines: list[str]) -> tuple[list[str], int]:
    """Find the leading `| Info | Value |` table and rewrite it. Returns
    (new_lines, consumed_count)."""
    if len(lines) < 3:
        return [], 0
    if not re.match(r"^\|\s*Info\b", lines[0]):
        return [], 0
    rows = {}
    consumed = 0
    for i, ln in enumerate(lines):
        if not ln.startswith("|"):
            consumed = i
            break
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) != 2:
            continue
        head, val = cells
        if head.lower() in ("info", "----------", "-" * len(head)):
            continue
        if set(head) <= set("-: ") or head == "":
            continue  # markdown separator row
        rows[head] = val
    else:
        consumed = len(lines)

    if not rows:
        return [], consumed

    # Canonical order: known fields first in fixed order, then any extras
    ordered_keys = [k for k in CANONICAL_INFO_ROWS if k in rows] + [
        k for k in rows if k not in CANONICAL_INFO_ROWS
    ]
    out = [
        "| Info       | Value |",
        "| ---------- | ----- |",
    ]
    for k in ordered_keys:
        out.append(f"| {k:<10} | {rows[k]} |")
    return out, consumed


SECTION_DASH = re.compile(r"^(#+\s+[^/\n]+?)\s+//\s+(.+?)\s*$")


def normalise_section_separator(line: str) -> str:
    """## Foothold // X  →  ## Foothold — X"""
    m = SECTION_DASH.match(line)
    if m:
        return f"{m.group(1)} — {m.group(2)}"
    return line


def normalise_file(path: Path):
    raw = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(raw)
    if meta is None:
        print(f"  ! {path.name}: no parseable frontmatter, skipping")
        return False

    # Display name: preserve whatever the existing title ("Tartar Sauce - HTB"
    # → "Tartar Sauce"), fall back to the filename stem only if absent.
    existing_title = str(meta.get("title") or "").strip()
    m = re.match(r"^(.+?)\s*[-—–]\s*HTB\s*$", existing_title, re.IGNORECASE)
    name = m.group(1).strip() if m else path.stem.removesuffix("_EN")

    # Frontmatter normalisation
    meta["title"] = f"{name} - HTB"
    meta.setdefault("lang", "en")
    meta.setdefault("translated_from", f"{name}.md")
    if "tags" in meta and isinstance(meta["tags"], list):
        seen = set()
        normalised = []
        for t in meta["tags"]:
            nt = normalise_tag(t)
            if nt not in seen:
                seen.add(nt)
                normalised.append(nt)
        meta["tags"] = normalised
    if "date" in meta and meta["date"]:
        meta["date"] = str(meta["date"]).strip()

    # Body normalisation — code-fence aware. Single-pass.
    # Only the FIRST H1 (outside fences, before the info table) is rewritten;
    # junk filtering only applies between frontmatter and that first H1.
    body_lines = body.splitlines()
    rebuilt = []
    in_fence = False
    h1_done = False        # rewrote the leading "# X" line yet?
    info_done = False      # processed the leading info table yet?
    fence_re = re.compile(r"^\s*(```|~~~)")

    i = 0
    while i < len(body_lines):
        ln = body_lines[i]
        stripped = ln.strip()

        # Track fenced code blocks — never touch their contents
        if fence_re.match(stripped):
            in_fence = not in_fence
            rebuilt.append(ln)
            i += 1
            continue
        if in_fence:
            rebuilt.append(ln)
            i += 1
            continue

        # Drop stray single-char junk lines BEFORE the first H1 (e.g. Mailing's "k")
        if not h1_done and stripped and not stripped.startswith("#") \
                and not stripped.startswith("|"):
            if len(stripped) <= 2 and not re.match(r"^[A-Z\d]{1,2}$", stripped):
                i += 1
                continue

        # First H1 → canonical title
        if not h1_done and stripped.startswith("# "):
            rebuilt.append(normalise_h1(ln, name))
            h1_done = True
            i += 1
            continue

        # Info table — only the first one, only after the H1
        if h1_done and not info_done and stripped.startswith("| Info"):
            table_lines, consumed = normalise_info_table(body_lines[i:])
            if table_lines:
                rebuilt.extend(table_lines)
                i += consumed
                # Collapse any existing blank/`---` after the table, then emit ours
                while i < len(body_lines) and body_lines[i].strip() == "":
                    i += 1
                if i < len(body_lines) and body_lines[i].strip() == "---":
                    i += 1
                rebuilt.append("")
                rebuilt.append("---")
                rebuilt.append("")
                info_done = True
                continue

        # Section header dash style — applies to ## / ### / #### only
        if re.match(r"^#{2,4}\s", stripped):
            rebuilt.append(normalise_section_separator(ln))
            i += 1
            continue

        rebuilt.append(ln)
        i += 1

    new_body = "\n".join(rebuilt).rstrip() + "\n"
    new_text = dump_frontmatter(meta) + "\n\n" + new_body
    if new_text != raw:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


def main():
    files = sorted(SRC_DIR.glob("*_EN.md"))
    changed = 0
    for p in files:
        if normalise_file(p):
            print(f"  ✓ {p.name}")
            changed += 1
        else:
            print(f"    {p.name}  (already standard)")
    print(f"\n[ok] normalised {changed}/{len(files)} writeups")

    # Report content anomalies the script intentionally does NOT auto-fix
    print("\n--- content anomalies (NOT auto-fixed, decide manually) ---")
    for p in files:
        text = p.read_text(encoding="utf-8")
        # Duplicate trailing-section blocks (Clicker case)
        for h in ("## References", "## Conclusion", "## Practice", "## Notes"):
            if text.count(h + "\n") > 1:
                print(f"  · {p.name}: '{h}' appears {text.count(h)} times")
                break
        # Missing Enumeration section
        if "## Enumeration" not in text:
            print(f"  · {p.name}: no '## Enumeration' section")


if __name__ == "__main__":
    main()
