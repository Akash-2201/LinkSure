#!/usr/bin/env python3
"""
Bulk Amazon ASIN link checker.

Paste/upload many product IDs (ASINs) -> get https://www.amazon.in/dp/<ID> links,
and find out which ones REDIRECT to a different product ID (like B0F6ZG4YKF -> B0F715G4NF)
or are broken.

Usage:
    python check_asins.py ids.txt
    python check_asins.py ids.txt --domain amazon.com
    python check_asins.py B0DY7VMML6 B0DX6ZYL49
    cat ids.txt | python check_asins.py -

Outputs: results.csv, results.html (open in browser; links are clickable)
"""
import argparse
import csv
import html
import random
import re
import sys
import time
from urllib.parse import urlparse

import requests

ASIN_RE = re.compile(r"\b[A-Z0-9]{10}\b")
PATH_ASIN_RE = re.compile(r"/(?:dp|gp/product|gp/aw/d|product)/([A-Z0-9]{10})", re.I)
CANON_RE = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', re.I)
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-IN,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml",
}

OK, REDIRECTED, NOT_FOUND, BLOCKED, ERROR = (
    "OK", "REDIRECTED", "NOT FOUND", "BLOCKED", "ERROR",
)


def parse_ids(raw_text):
    """Pull ASINs out of messy pasted text (blank lines, commas, full URLs...)."""
    seen, out = set(), []
    for tok in ASIN_RE.findall(raw_text.upper()):
        # real ASINs here start with B0; also allow old 10-digit ISBN-style ids
        if not (tok.startswith("B0") or tok.isdigit()):
            continue
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def asin_from_url(url):
    m = PATH_ASIN_RE.search(urlparse(url).path)
    return m.group(1).upper() if m else None


def check_one(session, asin, domain, timeout=20, retries=2):
    start_url = f"https://www.{domain}/dp/{asin}"
    res = {"asin": asin, "start_url": start_url, "final_url": "", "final_asin": "",
           "status": ERROR, "http": "", "title": "", "note": ""}
    for attempt in range(retries + 1):
        try:
            r = session.get(start_url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        except requests.RequestException as e:
            res["note"] = f"{type(e).__name__}"
            time.sleep(2)
            continue

        res["http"] = r.status_code
        res["final_url"] = r.url
        body = r.text or ""
        low = body.lower()

        # Amazon bot wall / throttling
        if (r.status_code in (503, 429) or "captcha" in low
                or "api-services-support@amazon" in low or "/errors/validatecaptcha" in low):
            res["status"], res["note"] = BLOCKED, "Amazon showed captcha/throttle - retry later or slow down"
            time.sleep(4 * (attempt + 1))
            continue

        if r.status_code == 404 or "page not found" in low[:6000] or "looking for something?" in low:
            res["status"], res["note"] = NOT_FOUND, "Amazon has no page for this ID"
            return res

        m = TITLE_RE.search(body)
        if m:
            res["title"] = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()[:140]

        final_asin = asin_from_url(r.url)
        canon = CANON_RE.search(body)
        canon_asin = asin_from_url(canon.group(1)) if canon else None
        res["final_asin"] = final_asin or canon_asin or ""

        if r.status_code >= 400:
            res["status"], res["note"] = ERROR, f"HTTP {r.status_code}"
            return res

        if final_asin and final_asin != asin:
            res["status"] = REDIRECTED
            res["note"] = f"URL redirected {asin} -> {final_asin}"
        elif canon_asin and canon_asin != asin:
            res["status"] = REDIRECTED
            res["note"] = f"Page canonical is a different product ({canon_asin})"
            res["final_asin"] = canon_asin
        elif final_asin is None and canon_asin is None:
            res["status"] = REDIRECTED
            res["note"] = "Did not land on a product page (sent to search/home?)"
        else:
            res["status"] = OK
        return res
    return res


def write_csv(rows, path):
    cols = ["asin", "status", "start_url", "final_url", "final_asin", "http", "title", "note"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_html(rows, path):
    colors = {OK: "#1a7f37", REDIRECTED: "#b35900", NOT_FOUND: "#cf222e",
              BLOCKED: "#6e40c9", ERROR: "#6e7781"}
    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    summary = " &middot; ".join(f"{k}: <b>{v}</b>" for k, v in counts.items())
    tr = []
    for r in rows:
        c = colors.get(r["status"], "#000")
        fin = (f'<a href="{html.escape(r["final_url"])}" target="_blank">{html.escape(r["final_asin"] or "-")}</a>'
               if r["final_url"] else "-")
        tr.append(
            f'<tr><td><a href="{html.escape(r["start_url"])}" target="_blank">{r["asin"]}</a></td>'
            f'<td style="color:{c};font-weight:600">{r["status"]}</td><td>{fin}</td>'
            f'<td>{html.escape(r["title"])}</td><td>{html.escape(r["note"])}</td></tr>'
        )
    doc = f"""<!doctype html><meta charset="utf-8"><title>ASIN check</title>
<style>body{{font:14px system-ui;margin:24px}}table{{border-collapse:collapse;width:100%}}
td,th{{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}}
th{{background:#f6f8fa}}</style>
<h2>ASIN link check</h2><p>{summary}</p>
<table><tr><th>Link (your ID)</th><th>Status</th><th>Landed on</th><th>Title</th><th>Note</th></tr>
{''.join(tr)}</table>"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(doc)


def main():
    ap = argparse.ArgumentParser(description="Bulk Amazon ASIN redirect checker")
    ap.add_argument("inputs", nargs="*", help="file path(s), '-' for stdin, or ASINs directly")
    ap.add_argument("--domain", default="amazon.in")
    ap.add_argument("--delay", type=float, default=2.0, help="avg seconds between requests")
    ap.add_argument("--out", default="results", help="output file prefix")
    args = ap.parse_args()

    raw = ""
    for item in args.inputs:
        if item == "-":
            raw += sys.stdin.read() + "\n"
        else:
            try:
                with open(item, encoding="utf-8") as f:
                    raw += f.read() + "\n"
            except (FileNotFoundError, OSError):
                raw += item + "\n"  # treat as a raw ASIN
    if not args.inputs:
        print("Paste IDs, then press Ctrl-D (Ctrl-Z + Enter on Windows):")
        raw = sys.stdin.read()

    ids = parse_ids(raw)
    if not ids:
        sys.exit("No valid IDs found.")
    print(f"Checking {len(ids)} IDs on {args.domain} ...\n")

    session = requests.Session()
    rows = []
    for i, asin in enumerate(ids, 1):
        r = check_one(session, asin, args.domain)
        rows.append(r)
        extra = f"  -> {r['final_asin']}" if r["status"] == REDIRECTED else ""
        print(f"[{i}/{len(ids)}] {asin}  {r['status']}{extra}  {r['note'] if r['status'] in (BLOCKED, ERROR) else ''}")
        if i < len(ids):
            time.sleep(max(0.3, random.uniform(args.delay * 0.6, args.delay * 1.4)))

    write_csv(rows, f"{args.out}.csv")
    write_html(rows, f"{args.out}.html")

    bad = [r for r in rows if r["status"] != OK]
    print(f"\nDone. OK: {len(rows) - len(bad)}   Problems: {len(bad)}")
    for r in bad:
        print(f"  {r['status']:<10} {r['asin']}  {r['note']}")
    print(f"\nSaved {args.out}.csv and {args.out}.html")


if __name__ == "__main__":
    main()
