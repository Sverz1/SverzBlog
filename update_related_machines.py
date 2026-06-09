#!/usr/bin/env python3
"""
Walk every writeup, decide which enumeration topics it touches, and rewrite
the `## Related Machines` table at the bottom of each Enumeration note.

Detection is keyword-based against the writeup body. Briefs are short
templates that quote the box's specific finding when possible (tag-derived
fallback otherwise). Run after editing any writeup:

    python3 update_related_machines.py
    python3 build.py
"""
from __future__ import annotations
import re
from pathlib import Path

WRITEUPS = Path("/home/sverz1/Desktop/SverzBlog-old/publish/Writeups")
ENUM     = Path("/home/sverz1/Desktop/SverzBlog-old/Enumeration")

# ---------------------------------------------------------------------------
# Hardcoded per-topic mapping. Only boxes that *genuinely* use the technique
# get a row — no row is better than a vague row. Briefs cite the specific
# finding in that box so the table doubles as a "go see how it was used".
# ---------------------------------------------------------------------------

MAP = {
    "SMB_EN.md": {
        "Escape":  "SMB `Public` share enumerated with `smbget --recursive` → `SQL Server Procedures.pdf` with plaintext MSSQL credentials",
        "Mailing": "NTLMv2 hash of the user captured over SMB after CVE-2024-21413 (Outlook moniker) phishing — relay path",
    },
    "FTP_EN.md": {
        "Remote": "FTP enumerated alongside NFS — banner only, the real foothold comes from NFS",
    },
    "NFS_EN.md": {
        "Clicker": "NFS export with `no_root_squash` — drop a SUID-root binary, execute, become root in one move",
        "Remote":  "Anonymous NFS mount exposes Umbraco `umbraco.sdf` → admin SHA1 hash cracked for the panel login",
    },
    "RPC_EN.md": {
        "Remote": "`rpcinfo` enumeration on port 111 discovers the NFS service before mounting",
        "Escape": "MS-RPC interfaces on the DC enumerated as part of the AD service signature (DNS / Kerberos / LDAP cluster)",
    },
    "DNS_EN.md": {
        "Escape":     "DNS/LDAP/Kerberos cluster signature identifies the host as a Domain Controller — anchors the whole AD enum",
        "Devvortex":  "Virtual-host fuzzing finds `dev.devvortex.htb` (Joomla admin) that the main domain hides",
        "BoardLight": "Virtual-host fuzzing uncovers `crm.board.htb` running Dolibarr — main domain is a decoy static page",
        "Mailing":    "VHost / DNS check identifies the mail subdomain hosting the hMailServer admin interface",
    },
    "SSH_EN.md": {
        "Editorial":  "SSH as `dev` once the SSRF exposes the internal Flask API and the private key is recoverable",
        "Codify":     "SSH as `joshua` after the bcrypt hash from `tickets.db` cracks to `spongebob1`",
        "BoardLight": "SSH as `larissa` reusing the Dolibarr DB password — classic password-reuse anti-pattern",
        "Broker":     "SSH used for stable shell after the ActiveMQ deserialisation RCE drops a one-liner",
        "Devvortex":  "SSH as `logan` after the MySQL hash extracted from the Joomla DB is cracked",
        "Jarvis":     "SSH as `pepper` reached through the chained SQLi → phpMyAdmin LFI → webshell flow",
        "Poison":     "SSH on FreeBSD using the password reused from the listfiles.php content",
        "SolidState": "SSH as `mindy` using credentials found inside a James-managed mailbox",
        "Clicker":    "SSH as the user after the SQLi-driven credential chain completes",
    },
    "Database_EN.md": {
        "Escape":     "MSSQL guest access via `impacket-mssqlclient` as `PublicUser` → `xp_dirtree` triggers SMB auth → NTLMv2 capture",
        "Devvortex":  "MySQL accessed as the Joomla DB user — `#__users` extracted for offline bcrypt cracking",
        "Jarvis":     "MySQL reached through phpMyAdmin CVE-2018-12613 LFI → `INTO OUTFILE` writes a PHP webshell to the docroot",
        "Clicker":    "MySQL backend driven via SQL injection — `password_hash` column extracted for offline crack",
        "BoardLight": "MySQL backend of Dolibarr — DB user password reused for SSH login as `larissa`",
        "Love":       "MariaDB enumeration after the SSRF reveals the admin Voting System credentials are reused for DB",
    },
    "SQLInjection_EN.md": {
        "Jarvis":  "UNION-based SQLi in `room.php?cod=` — 5-column query, extracts `phpmyadmin` config + DB credentials",
        "Love":    "Time-based blind SQLi on Voting System login — alternative path; SSRF reaches admin faster",
        "Clicker": "SQL injection in parameter *names* (mass-assignment): `%0a` newline bypasses the filter, lets you set `role=Admin` at signup",
    },
    "WebServices_EN.md": {
        "Aero":         "IIS hosting `.theme` upload — CVE-2023-38146 (ThemeBleed) → DLL injection RCE",
        "BoardLight":   "Apache hosting Dolibarr on a discovered vhost — CVE-2023-30253 contact-form RCE",
        "Broker":       "nginx in front of ActiveMQ — the RCE itself hits OpenWire on 61616, not the web port",
        "Buff":         "Apache + Gym Management System — unauthenticated `.php` upload → RCE",
        "Clicker":      "Custom PHP clicker game — mass-assignment SQLi at signup",
        "Codify":       "Apache + Node/Express on 3000 — vm2 sandbox escape against the Node service",
        "Devvortex":    "Apache hosting Joomla — vhost discovery finds the admin panel; CVE-2023-23752 dumps creds",
        "Editorial":    "nginx — SSRF in book-cover upload exposes an internal Flask API",
        "Jarvis":       "Apache hosting a hotel booking app + phpMyAdmin on port 64999",
        "Love":         "Apache + Voting System — SSRF to staging vhost retrieves admin creds, then PHP file upload",
        "Mailing":      "PHP page on hMailServer admin endpoint — LFI in `?file=` parameter",
        "Popcorn":      "Torrent Hoster app — file-upload MIME bypass → PHP RCE",
        "Poison":       "FreeBSD Apache — LFI in `listfiles.php` chained with log poisoning → PHP execution",
        "Remote":       "Umbraco CMS — authenticated RCE through `/umbraco/RestServices/CodeSnippets`",
        "Tartar Sauce": "WordPress with gwolle-gb plugin — RFI via `abspath` parameter",
    },
    "FileTransfer_EN.md": {
        "Aero":     "PowerShell + `Invoke-WebRequest` to stage CLFS exploit; `certutil` fallback when needed",
        "Buff":     "PowerShell download for CloudMe binary; Ligolo for the tunnelled exploit transfer",
        "Remote":   "WinRM file copy for GodPotato + winPEAS",
        "Mailing":  "Phishing payload (`.lnk` with UNC reference) delivered to capture NTLMv2 — file-staging is half the chain",
        "Escape":   "`smbget --recursive` for the Public share dump; later `certipy` ferries cert artifacts in/out",
    },
    "PortForwarding_EN.md": {
        "Buff":   "**Ligolo-ng** forwards CloudMe's local-only 8888 port to Kali — CloudMe BOF runs against the tunnel",
        "Poison": "**SSH dynamic forward (`-D`)** reaches VNC on `127.0.0.1:5901` from the FreeBSD host",
        "Escape": "Local Responder + xp_dirtree relay — the 'port' is the attacker's SMB listener exposed back at the target",
    },
    "PrivilegeEscalation_EN.md": {  # Linux + FreeBSD
        "BoardLight":  "SUID `enlightenment_sys` (CVE-2022-37706) → arbitrary `chown` primitive → root",
        "Broker":      "Sudo entry for `nginx` + writable shared library → `.so` hijack on next sudo call",
        "Clicker":     "Path-traversal + `SETENV` in sudoers → Perl SUID with controlled `@INC`",
        "Codify":      "`sudo /opt/scripts/mysql-backup.sh` + bash glob injection + process snooping → `joshua`'s sudo password",
        "Devvortex":   "CVE-2023-1326 in `apport-cli` (less/pager escape) → root",
        "Editorial":   "`sudo /opt/internal_apps/clean_db/repo_path.py` — GitPython CVE-2022-24439 → arbitrary git config → exec",
        "Jarvis":      "SUID `systemctl` — craft a service unit that runs as root on `start`",
        "Poison":      "VNC password file on FreeBSD — `vncpwd` decode → VNC into the root session",
        "Popcorn":     "Kernel CVE-2010-0832 (PAM MOTD) — pre-modern-mitigation Ubuntu kernel exploit",
        "SolidState":  "World-writable script invoked by a 1-minute cron as root → drop a reverse shell, wait",
        "Tartar Sauce":"Cron + symlink race against `tar -zxvf` preserving SUID — drop SUID `bash` via the race",
    },
    "PrivilegeEscalationWindows_EN.md": {
        "Aero":    "CLFS EoP CVE-2023-28252 — kernel exploit drops a SYSTEM token",
        "Buff":    "CloudMe buffer overflow + msfvenom shellcode → SYSTEM after Ligolo tunnel exposes the local-only listener",
        "Escape":  "ADCS ESC1 — `UserAuthentication` template with `EnrolleeSuppliesSubject` → impersonate Administrator → PtH",
        "Love":    "`AlwaysInstallElevated` registry pair both = 1 → craft malicious MSI → `msiexec /quiet /i` → SYSTEM",
        "Mailing": "CVE-2023-2255 LibreOffice macro chained with WinRM into the elevated user's session",
        "Remote":  "GodPotato — `SeImpersonatePrivilege` on the service account → SYSTEM",
    },
    "MailServer_EN.md": {
        "Mailing":    "**hMailServer** front-end LFI leaks SMTP/IMAP credentials, then CVE-2024-21413 phishing fires NTLMv2",
        "SolidState": "**Apache James 2.3.2** admin port (4555) takes default creds — reset a user, read POP3 for SSH credentials",
    },
}


def _entry_for(enum_filename: str, name: str, tags: list[str], body: str):
    """Look up the curated brief; return None if this box doesn't apply."""
    return MAP.get(enum_filename, {}).get(name)

# ---------------------------------------------------------------------------

def read_writeup(p: Path):
    raw = p.read_text(encoding="utf-8", errors="replace")
    # Extract name + tags
    name_match = re.search(r"^title:\s*(.+?)\s*-\s*HTB\s*$", raw, re.MULTILINE)
    name = name_match.group(1).strip() if name_match else p.stem.removesuffix("_EN")
    tags = []
    in_tags = False
    for line in raw.splitlines():
        if line.startswith("tags:"): in_tags = True; continue
        if in_tags:
            m = re.match(r"^\s+-\s+(.+)\s*$", line)
            if m: tags.append(m.group(1).strip().lower())
            else: in_tags = False
    return name, tags, raw.lower()


def mail_server_brief(n, t, b):
    if "hmailserver" in b or "apache james" in b or "james " in b or "smtp" in b or "imap" in b or "pop3" in b:
        if n == "Mailing":   return "**hMailServer** as admin interface — LFI in PHP front-end leaks SMTP/IMAP credentials, then CVE-2024-21413 phishing"
        if n == "SolidState":return "**Apache James 2.3.2** — admin port (4555) accepts default creds, reset a user's password, read POP3 for SSH credentials"
        if "smtp" in b or "imap" in b:
            return "Mail service enumerated and used in the foothold chain"
    return None


def build_table(enum_filename: str, writeups: list[tuple[str, list[str], str]]):
    if enum_filename not in MAP:
        return None
    rows = []
    for name, tags, body in writeups:
        brief = _entry_for(enum_filename, name, tags, body)
        if brief:
            wiki = f"[[{name} - HTB|{name}]]"
            rows.append(f"| {wiki} | {brief} |")
    if not rows:
        return "| _no related machine yet — add one when a writeup uses this technique_ | |"
    return "\n".join(rows)


def rewrite_enum(enum_path: Path, table_body: str):
    raw = enum_path.read_text(encoding="utf-8")
    pattern = re.compile(r"(^## Related Machines\s*\n)(.*?)(?=^## |\Z)", re.MULTILINE | re.DOTALL)
    replacement = (
        r"\1"
        "\n"
        "| Machine | Technique |\n"
        "| ------- | --------- |\n"
        + table_body + "\n\n"
    )
    if pattern.search(raw):
        new_raw = pattern.sub(replacement, raw)
    else:
        # Append the section if it's missing (NFS_EN.md case)
        prefix = raw if raw.endswith("\n") else raw + "\n"
        new_raw = (
            prefix
            + "\n## Related Machines\n\n"
            + "| Machine | Technique |\n"
            + "| ------- | --------- |\n"
            + table_body + "\n"
        )
    if new_raw == raw:
        return False
    enum_path.write_text(new_raw, encoding="utf-8")
    return True


def main():
    writeups = []
    for p in sorted(WRITEUPS.glob("*_EN.md")):
        writeups.append(read_writeup(p))
    print(f"[i] parsed {len(writeups)} writeups")

    enum_files = sorted(ENUM.glob("*_EN.md"))
    changed = 0
    for f in enum_files:
        table = build_table(f.name, writeups)
        if table is None:
            print(f"    skip {f.name} (no detector)")
            continue
        if rewrite_enum(f, table):
            n_rows = table.count("\n") + 1
            print(f"  ✓ {f.name}  ({n_rows} rows)")
            changed += 1
        else:
            print(f"    {f.name}  (unchanged — section not found?)")
    print(f"\n[ok] updated {changed} enum files")


if __name__ == "__main__":
    main()
