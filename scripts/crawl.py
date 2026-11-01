#!/usr/bin/env python3
"""Crawl public Google Drive shared folders via the embeddedfolderview endpoint.

Usage:  python crawl.py <out.json> <depth> <root_id>[:Label] [<root_id>[:Label] ...]

Produces a nested JSON tree:
{ "generated": ..., "roots": [ {id,name,type,modified,thumb,children:[...]} ] }
"""
import re, sys, json, time, subprocess, html as htmlmod, os

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

ENTRY_RE = re.compile(r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)".*?'
                      r'<div class="flip-entry-title">(.*?)</div>.*?'
                      r'(?:(<div class="flip-entry-last-modified"><div>(.*?)</div></div>))?'
                      r'</div>', re.S)
FOLDER_RE = re.compile(r'drive-sprite-folder')
THUMB_RE = re.compile(r'<img src="(https://lh3\.googleusercontent\.com[^"]+)"')
TYPE_RE = re.compile(r'drive-thirdparty\.googleusercontent\.com/16/type/([^"]+)"')


def fetch(fid, retries=2):
    url = f'https://drive.google.com/embeddedfolderview?id={fid}#list'
    for attempt in range(retries + 1):
        p = subprocess.run(['curl', '-sL', '--max-time', '60', '-A', UA, url],
                           capture_output=True, text=True)
        if p.stdout and 'flip-entry' in p.stdout or 'flip-contents' in p.stdout:
            return p.stdout
        time.sleep(1.5 * (attempt + 1))
    return p.stdout or ''


def parse(h, fid=''):
    title = None
    m = re.search(r'<title>(.*?)</title>', h, re.S)
    if m:
        title = htmlmod.unescape(m.group(1).strip())
    out = []
    for m in re.finditer(r'<div class="flip-entry" id="entry-([A-Za-z0-9_-]+)"(.*?)(?=<div class="flip-entry" id="entry-|</div></div></body>)', h, re.S):
        blk, eid = m.group(2), m.group(1)
        tm = re.search(r'<div class="flip-entry-title">(.*?)</div>', blk, re.S)
        if not tm:
            continue
        name = htmlmod.unescape(re.sub(r'<[^>]+>', '', tm.group(1))).strip()
        is_folder = 'drive-sprite-folder' in blk
        lm = re.search(r'flip-entry-last-modified"><div>(.*?)</div>', blk)
        th = THUMB_RE.search(blk)
        ty = TYPE_RE.search(blk)
        out.append({
            'id': eid,
            'name': name,
            'type': 'folder' if is_folder else 'file',
            'modified': lm.group(1) if lm else '',
            'thumb': th.group(1) if th else '',
            'mime': ty.group(1) if ty else ('folder' if is_folder else ''),
        })
    return title, out


def crawl(fid, name, depth, max_depth, seen, stats, delay=0.25):
    node = {'id': fid, 'name': name, 'type': 'folder', 'children': []}
    if depth > max_depth or fid in seen:
        node['truncated'] = True
        return node
    seen.add(fid)
    h = fetch(fid)
    title, entries = parse(h, fid)
    if title and (not name or name.startswith('__')):
        node['name'] = title
    stats['folders'] += 1
    time.sleep(delay)
    for e in entries:
        if e['type'] == 'folder':
            node['children'].append(crawl(e['id'], e['name'], depth + 1, max_depth,
                                          seen, stats, delay))
        else:
            node['children'].append(e)
            stats['files'] += 1
    return node


def main():
    out_path, max_depth = sys.argv[1], int(sys.argv[2])
    roots = []
    for spec in sys.argv[3:]:
        fid, _, label = spec.partition(':')
        roots.append((fid.strip(), label.strip() or fid))
    seen, stats = set(), {'folders': 0, 'files': 0}
    tree = []
    for fid, label in roots:
        sys.stderr.write(f'>>> root {label} {fid}\n')
        sys.stderr.flush()
        t = crawl(fid, label, 0, max_depth, seen, stats)
        tree.append(t)
        sys.stderr.write(f'    ... folders={stats["folders"]} files={stats["files"]}\n')
        sys.stderr.flush()
    data = {'generated': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
            'stats': stats, 'roots': tree}
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    print(json.dumps({'out': out_path, 'stats': stats, 'roots': len(tree)},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()