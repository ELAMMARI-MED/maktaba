#!/usr/bin/env python3
"""يدمج عناوين «عالم المعرفة» (data/series_titles.json) في data/catalog.json.

    python scripts/apply_series_titles.py [--dry]

لكل عنصر في الفهرس له `series` و`issue`:
    display       = عنوان العدد كما هو على الغلاف (من قوائم ويكيبيديا)
    title_author  = مؤلف العدد (يُملأ فقط إذا كان حقل author فارغًا)
الاسم الأصلي `name` يبقى كما هو (اسم ملف درايف) لأنه يُستعمل للتحميل.
السكربت idempotent: تشغيله مرّتين لا يغيّر شيئًا.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT = os.path.join(ROOT, "data", "catalog.json")
TITLES = os.path.join(ROOT, "data", "series_titles.json")


def main():
    dry = "--dry" in sys.argv
    titles = json.load(open(TITLES, encoding="utf-8"))["issues"]
    cat = json.load(open(CAT, encoding="utf-8"))
    items = cat.get("items", {})

    matched = missing = 0
    changed = 0
    for it in items.values():
        if not it.get("issue"):
            continue
        rec = titles.get(str(it["issue"]))
        if not rec:
            missing += 1
            continue
        matched += 1
        before = (it.get("display"), it.get("title_author"))
        it["display"] = rec["title"]
        if not it.get("author") and rec.get("author"):
            it["title_author"] = rec["author"]
        if (it.get("display"), it.get("title_author")) != before:
            changed += 1

    # عدّاد المؤلفين في الفهرس يخصّ السلاسل أيضًا الآن (author أو title_author)
    names = set()
    for it in items.values():
        a = it.get("author") or it.get("title_author")
        if a:
            names.add(a)
    cat.setdefault("counters", {})["authors"] = len(names)

    if not dry:
        with open(CAT, "w", encoding="utf-8") as f:
            json.dump(cat, f, ensure_ascii=False, separators=(",", ":"))
    print(f"series items: {matched} matched, {missing} without a title, {changed} updated"
          + (" (dry run)" if dry else ""))


if __name__ == "__main__":
    main()
