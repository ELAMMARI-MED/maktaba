#!/usr/bin/env python3
"""size_probe.py — يسجّل أحجام ملفات المكتبة في data/sizes.json (بالتوازي).

Usage: python scripts/size_probe.py [--limit N] [--workers 6] [--catalog ...] [--out ...]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
DL = 'https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t'
_lock = threading.Lock()


def head_size(fid):
    """حجم الملف بالبايت: ترويسة HEAD، وإن لم تُعطِ درايف الطول، فطلب جزئي (Content-Range).

    بعض ملفات درايف لا تُرجع Content-Length في HEAD (200/206 بلا طول)، لكنها تُصرّح
    بالحجم الكلي في Content-Range لطلب من بايتين — بدون هذه الخطوة تبقى أحجام كثيرة None.
    """
    p = subprocess.run(['curl', '-sIL', '--max-time', '40', '-A', UA, DL.format(id=fid)],
                       capture_output=True, text=True)
    sizes = []
    for line in p.stdout.splitlines():
        if line.lower().startswith('content-length:'):
            try:
                sizes.append(int(line.split(':', 1)[1].strip()))
            except ValueError:
                pass
    if sizes:
        return max(sizes)
    q = subprocess.run(['curl', '-s', '-o', '/dev/null', '-r', '0-1', '-D', '-',
                        '--max-time', '40', '-A', UA, DL.format(id=fid)],
                       capture_output=True, text=True)
    m = re.search(r'content-range:\s*bytes\s+\d+-\d+/(\d+)', q.stdout, re.I)
    return int(m.group(1)) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--catalog', default=os.path.join(ROOT, 'data', 'catalog.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'sizes.json'))
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--sleep', type=float, default=0.1)
    args = ap.parse_args()

    cat = json.load(open(args.catalog, encoding='utf-8'))
    # كل عناصر الفهرس لا ملفات PDF فقط (المكتبة فيها مستندات docx أيضًا)
    ids = [i['id'] for i in cat['items'].values()]
    sizes = {}
    if os.path.exists(args.out):
        try:
            sizes = json.load(open(args.out, encoding='utf-8'))
        except Exception:
            sizes = {}
    # أعِد فحص ما سُجّل سابقًا بلا قيمة (None) لا المفقود فقط
    todo = [i for i in ids if not sizes.get(i)]
    if args.limit:
        todo = todo[:args.limit]
    print(f'فحص {len(todo)} ملف | معروف: {len(sizes)}', flush=True)

    q = list(todo)
    ql = threading.Lock()
    done = {'n': 0}

    def worker():
        while True:
            with ql:
                if not q:
                    return
                fid = q.pop(0)
            s = head_size(fid)
            with _lock:
                if s:
                    sizes[fid] = s        # لا نكتب None حتى يُعاد الفحص في المرة القادمة
                done['n'] += 1
                if done['n'] % 25 == 0:
                    _save(args.out, sizes)
                    print(f'  {done["n"]}/{len(todo)}', flush=True)
            time.sleep(args.sleep)

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(args.workers)]
    for t in threads:
        t.start()
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print('\nمقاطعة — حفظ ما تم', flush=True)
    _save(args.out, sizes)
    known = [v for v in sizes.values() if v]
    missing = [i for i in ids if not sizes.get(i)]
    print(json.dumps({'probed': len(todo), 'known': len(known), 'still_missing': len(missing),
                      'total_bytes': sum(known),
                      'avg_mb': round(sum(known) / len(known) / 1048576, 1) if known else 0},
                     ensure_ascii=False))


def _save(path, sizes):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(sizes, f, ensure_ascii=False)
    os.replace(tmp, path)


if __name__ == '__main__':
    main()