#!/usr/bin/env python3
"""link_check.py — يفحص كل ملفات الفهرس: هل الرابط الحقيقي ما زال يعمل؟

Usage: python scripts/link_check.py [--workers 8] [--limit N] [--out data/link_check.json]

لكل معرّف يطلب أول بايتين من رابط التحميل (درايف يدعم النطاقات: 206) ويسجّل رمز الحالة.
النتيجة: {generated, stats{ok, dead, other}, results{id: code}}
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
DL = 'https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t'
_lock = threading.Lock()


def one(fid, timeout=75):
    p = subprocess.run(['curl', '-s', '-o', '/dev/null', '-r', '0-1', '-w', '%{http_code}',
                        '--max-time', str(timeout), '-L', '-A', UA, DL.format(id=fid)],
                       capture_output=True, text=True)
    try:
        return int(p.stdout.strip() or 0)
    except ValueError:
        return 0


def check(fid, attempts=3):
    """206 = الملف يُخدَم، 200 = صفحة بديلة، 404/403 = رابط معطّل، 0 = تعذّر الوصول.

    مهم: درايف يرفض جزءًا من الطلبات إذا طُلبت بعشرات المتزامنة، فيرجع curl بلا رد
    (0). الرمز 0 ليس «ملف مفقود» — نعيد المحاولة بهدوء قبل تسجيله.
    """
    code = one(fid)
    tries = 1
    while code == 0 and tries < attempts:
        time.sleep(2.0 * tries)      # تراجع تدريجي: يمنع تحويل الخنق إلى «معطّل»
        code = one(fid, timeout=90)
        tries += 1
    return code


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--catalog', default=os.path.join(ROOT, 'data', 'catalog.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'data', 'link_check.json'))
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--sleep', type=float, default=0.05)
    args = ap.parse_args()

    cat = json.load(open(args.catalog, encoding='utf-8'))
    ids = sorted(cat['items'].keys())
    if args.limit:
        ids = ids[:args.limit]
    results = {}
    if os.path.exists(args.out):
        try:
            results = json.load(open(args.out, encoding='utf-8')).get('results', {})
        except Exception:
            results = {}
    todo = [i for i in ids if not results.get(i)]      # أعد فحص ما سُجّل 0 (لم يرد درايف)
    print(f'فحص {len(todo)} رابط | مفحوص سابقًا: {len(results)}', flush=True)

    q = list(todo)
    ql = threading.Lock()
    done = {'n': 0}

    def worker():
        while True:
            with ql:
                if not q:
                    return
                fid = q.pop(0)
            code = check(fid)
            with _lock:
                results[fid] = code
                done['n'] += 1
                if done['n'] % 50 == 0:
                    _save(args.out, results, ids)
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
    stats = _save(args.out, results, ids)
    print(json.dumps(stats, ensure_ascii=False))


def _save(path, results, ids):
    ok = sum(1 for i in ids if results.get(i) == 206)
    warn = sum(1 for i in ids if results.get(i) == 200)
    unreach = sum(1 for i in ids if i in results and results[i] == 0)
    dead = sum(1 for i in ids if i in results and results[i] not in (200, 206, 0))
    stats = {'checked': sum(1 for i in ids if i in results), 'total': len(ids),
             'ok_206': ok, 'warning_200': warn, 'dead': dead, 'unreachable': unreach}
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({'generated': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
                   'stats': stats, 'results': results}, f, ensure_ascii=False)
    os.replace(tmp, path)
    return stats


if __name__ == '__main__':
    main()
