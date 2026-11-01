#!/usr/bin/env python3
"""يجلب عناوين أعداد «عالم المعرفة» من قوائم ويكيبيديا العربية ويكتبها JSON.

    python scripts/series_titles.py            # يكتب data/series_titles.json
    python scripts/series_titles.py --offline  # من الملفات المحفوظة ~/aw_a.json ... (بلا شبكة)

القوائم المصدر (ثلاثة جداول: 1-250، 251-500، 501-750):
    قائمة إصدارات عالم المعرفة (1-250) / (251-500) / (501-750)

الملف الناتج:
    {"series": "عالم المعرفة", "source": "...", "fetched": "YYYY-MM-DD",
     "issues": {"1": {"title": "...", "author": "...", "date": "..."}, ...}}
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date

PAGES = [
    "قائمة إصدارات عالم المعرفة (1-250)",
    "قائمة إصدارات عالم المعرفة (251-500)",
    "قائمة إصدارات عالم المعرفة (501-750)",
]
UA = "Mozilla/5.0 (compatible; maktaba-series-titles/1.0)"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "series_titles.json")
CACHE = [os.path.expanduser("~/aw_a.json"), os.path.expanduser("~/aw_b.json"), os.path.expanduser("~/aw_c.json")]


def fetch(page):
    q = urllib.parse.quote(page)
    url = ("https://ar.wikipedia.org/w/api.php?action=parse&page=" + q +
           "&prop=wikitext&format=json&formatversion=2")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    return data["parse"]["wikitext"]


def strip_wiki(s):
    """تنظيف خلية ويكي: قوالب، مراجع، وصلات، وسوم."""
    s = re.sub(r"\[\[\s*(?:ملف|File|Image|صورة):[^\]]*\]\]", "", s)   # صور مضمّنة
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{\s*(?:وإو|وصلة إنترويكي)\s*\|([^|}]*)[^}]*\}\}", r"\1", s)  # {{وإو|عربي|en}}
    s = re.sub(r"\{\{\s*اللغة\s*\|[^}]*\}\}", "", s)                            # وسم لغة
    for _ in range(6):                       # القوالب قد تتداخل
        new = re.sub(r"\{\{[^{}]*\}\}", "", s)
        if new == s:
            break
        s = new
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", s)   # [[أ|ب]] → ب
    s = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", s)      # [url نص]
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = re.sub(r"'{2,}", "", s)                               # ''مائل''
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&quot;", '"').replace("&amp;", "&")
    s = re.sub(r"\(\s*\)", "", s)                                    # أقواس فارغة بعد حذف قالب
    s = re.sub(r"\s+", " ", s)
    return s.strip(" |-\n\t")


MONTHS = r"يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر"


def parse_page(wt):
    """يقرأ صفوف الجدول: الرقم || صورة || العنوان || المؤلف || التاريخ || الترجمة || ISBN."""
    out = {}
    for block in re.split(r"\n\|-", wt):
        cells = [strip_wiki(c) for c in re.split(r"\|\||\n\|", block)]
        cells = [c for c in cells if c]
        if not cells:
            continue
        num = None
        for c in cells[:2]:
            m = re.match(r"^(\d{1,3})\b", c)
            if m:
                num = int(m.group(1))
                break
        if not num:
            continue
        idx = next((i for i, c in enumerate(cells) if re.match(rf"^{num}\b", c)), None)
        if idx is None:
            continue
        rest = cells[idx + 1:]
        if not rest:
            continue
        title = rest[0]
        if len(title) < 2:
            continue
        # التاريخ = أول خلية فيها شهر أو سنة؛ ما قبلها مؤلفون
        date_i = None
        for i, c in enumerate(rest[1:], 1):
            if re.search(MONTHS, c) or re.search(r"\b(19|20)\d{2}\b", c):
                date_i = i
                break
        author = " / ".join(x for x in rest[1:date_i or len(rest)] if x)
        date = rest[date_i] if date_i is not None else ""
        out[str(num)] = {"title": title, "author": author, "date": date}
    return out


def main():
    offline = "--offline" in sys.argv
    issues = {}
    for i, page in enumerate(PAGES):
        try:
            wt = open(CACHE[i], encoding="utf-8").read()
            wt = json.loads(wt)["parse"]["wikitext"]
        except Exception:
            if offline:
                print("skip (no cache):", page)
                continue
            wt = fetch(page)
        got = parse_page(wt)
        dup = len(set(got) & set(issues))
        issues.update(got)
        print(f"{page}: {len(got)} rows" + (f" ({dup} already known)" if dup else ""))

    issues = {k: v for k, v in sorted(issues.items(), key=lambda kv: int(kv[0]))}
    data = {
        "series": "عالم المعرفة",
        "source": "https://ar.wikipedia.org/wiki/قائمة_إصدارات_عالم_المعرفة",
        "fetched": date.today().isoformat(),
        "count": len(issues),
        "issues": issues,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("wrote", OUT, "→", len(issues), "issues",
          f"({min(int(k) for k in issues)}..{max(int(k) for k in issues)})")


if __name__ == "__main__":
    main()