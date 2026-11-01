#!/usr/bin/env python3
"""يبني مجلّد docs/ المنشور على GitHub Pages (استضافة ثابتة بلا خادم).

    python scripts/build_pages.py

ينسخ web/ كما هو، ويضع الفهرس في docs/data/catalog.json ليجده المتصفّح
عبر loadCatalog() حين لا يوجد /api/catalog.
"""
import json
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
DOCS = os.path.join(ROOT, "docs")
CAT = os.path.join(ROOT, "data", "catalog.json")


def main():
    if not os.path.isfile(CAT):
        raise SystemExit("data/catalog.json مفقود — شغّل scripts/build_catalog.py أولًا")
    shutil.rmtree(DOCS, ignore_errors=True)
    shutil.copytree(WEB, DOCS)
    os.makedirs(os.path.join(DOCS, "data"), exist_ok=True)
    shutil.copy2(CAT, os.path.join(DOCS, "data", "catalog.json"))
    # Pages لا يخدم ملفات تبدأ بشرطة سفلية؛ لا شيء هنا يحتاج ذلك
    total = 0
    for dirpath, _, names in os.walk(DOCS):
        for n in names:
            total += os.path.getsize(os.path.join(dirpath, n))
    cat = json.load(open(CAT, encoding="utf-8"))
    print(f"docs/: {total/1048576:.1f} MB | catalog items: {len(cat.get('items', {}))} "
          f"| collections: {len(cat.get('collections', []))}")


if __name__ == "__main__":
    main()
