#!/usr/bin/env python3
"""Build data/catalog.json for the مكتبة app from one or more crawl outputs.

Usage: python build_catalog.py out.json crawl1.json [crawl2.json ...]

Merges raw crawl trees into:
  {generated, collections:[{id,name,tree,counts}], items:{id:item}, total}
Item fields: id,name,ext,kind,modified,thumb,path[],collection
"""
import json, sys, os, re, time, unicodedata

# file kinds by extension
# الأنواع التي تُعدّ محتوى المكتبة (بقية الملفات = بقايا واجهات/صور صفحات)
KEEP_KINDS = {'pdf', 'epub', 'doc', 'audio', 'video', 'archive'}

# ---------- تنظيم المكتبة ----------
# لكل مجموعة: قسمها ووصفها (يظهران في الرئيسية والقائمة الجانبية)
GROUPS_ORDER = ['الأدب والتراث العربي', 'الفكر والفلسفة', 'الترجمة والعلوم',
                'المعاجم والموسوعات', 'السلاسل والدوريات', 'مجموعات أخرى']

COLLECTIONS_META = {
    '18f1hsMkB9zouUOiaZJTchk5JlarKqRzv': {'group': 'الأدب والتراث العربي',
                                          'desc': 'أعمال كاملة ودواوين وكتب عربية'},
    '1297LLdMmIXRWqljt4op8L3_7M3xdf1L9': {'group': 'الأدب والتراث العربي',
                                          'desc': 'القسم الأول: أدب وتراث وروايات'},
    '1sICW4Ecqu8NjJ919SNsz5B0WfZBkGuT6': {'group': 'الفكر والفلسفة',
                                          'desc': 'فكر وفلسفة ومعارف عامة'},
    '1VMtjIiWopE49128vh_vFpJtT4iie_voT': {'group': 'الفكر والفلسفة',
                                          'desc': 'أعمال كاملة لكتّاب عالميين'},
    '1mfwn5XeRDFuCI9tg5Zes7_j4noQ0Nr0C': {'group': 'الترجمة والعلوم',
                                          'desc': 'كتب مترجمة — المنظمة العربية للترجمة'},
    '1Nw1HBQEE3XADAhYLv7QEKsu2w2yTVWsz': {'group': 'المعاجم والموسوعات',
                                          'desc': 'موسوعات ومعاجم وقواميس ومجلات'},
    '1mDsWkjg3zKl8cagUX0yCANjrW0sv3Sa2': {'group': 'السلاسل والدوريات',
                                          'desc': 'أعداد سلسلة عالم المعرفة (الكويت)'},
    '18WDjRKMrQL4gwDEHmFo7AVy3_DJ7TAJb': {'group': 'الفكر والفلسفة',
                                          'desc': 'كتب الدكتور فريد الأنصاري في العلوم الروحانية'},
    '1aJtOWOZWVzXLlsllAfsGCdXyr1uAwpBk': {'group': 'السلاسل والدوريات',
                                          'desc': 'كتب صادرة عن دور النشر العربية'},
    '17Lj8wPsFK4k3XxBlHfN7lPIWbDkYVYux': {'group': 'السلاسل والدوريات',
                                          'desc': 'إصدارات الشبكة العربية للأبحاث والنشر'},
}

# سلاسل تُسمّى ملفاتها بأرقام فقط (001.pdf) → نعرضها باسم السلسلة ورقم العدد
SERIES = {'1mDsWkjg3zKl8cagUX0yCANjrW0sv3Sa2': 'عالم المعرفة'}
NUMERIC_RE = re.compile(r'^(\d{1,4})\s*\.pdf$', re.I)

# أسماء مجموعة صحيحة عندما يأتي اسم الجذر كمعرّف درايف (زحف بلا تسمية)
NAME_OVERRIDE = {
    '1mDsWkjg3zKl8cagUX0yCANjrW0sv3Sa2': 'سلسلة عالم المعرفة',
    '1mfwn5XeRDFuCI9tg5Zes7_j4noQ0Nr0C': 'المنظمة العربية للترجمة',
    '18WDjRKMrQL4gwDEHmFo7AVy3_DJ7TAJb': 'مؤلفات فريد الأنصاري',
    '1aJtOWOZWVzXLlsllAfsGCdXyr1uAwpBk': 'دور نشر',
    '17Lj8wPsFK4k3XxBlHfN7lPIWbDkYVYux': 'الشبكة العربية للأبحاث والنشر',
}


KIND = {
    'pdf': 'pdf', 'epub': 'epub', 'mobi': 'epub', 'djvu': 'pdf', 'doc': 'doc',
    'docx': 'doc', 'txt': 'doc', 'rtf': 'doc', 'ppt': 'doc', 'pptx': 'doc',
    'xls': 'doc', 'xlsx': 'doc', 'csv': 'doc',
    'mp3': 'audio', 'm4a': 'audio', 'wav': 'audio', 'ogg': 'audio', 'wma': 'audio',
    'mp4': 'video', 'mkv': 'video', 'avi': 'video', 'flv': 'video', 'webm': 'video',
    'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 'gz': 'archive',
    'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image',
    'bmp': 'image', 'tif': 'image', 'tiff': 'image', 'svg': 'image',
}


# ---------- تجميع المجلدات: «الإشارات والتنبيهات 1/2/3» = عمل واحد ----------
VOL_TAIL_RE = re.compile(r'^(?P<base>.+?)[\s\-_.]*(?:الجزء|المجلد|جزء|مجلد|ج|م)?[\s\-_.]*(?P<vol>\d{1,3})\s*$')
AR_LETTER_RE = re.compile(r'[\u0621-\u064A]')


def split_volume(name):
    """يعيد (الأساس, رقم المجلد) إن كان الاسم مجلدًا مرقّمًا، وإلا ('', None)"""
    e = ext_of(name)
    base_name = name[:-(len(e) + 1)] if e else name
    m = VOL_TAIL_RE.match(base_name.strip())
    if not m:
        return '', None
    base, vol = m.group('base').strip(' .-_:'), int(m.group('vol'))
    if len(base) < 4 or len(AR_LETTER_RE.findall(base)) < 2 or not (1 <= vol <= 300):
        return '', None
    return base, vol


def normalize_ar(s):
    """تطبيع عربي للبحث: بلا تشكيل/تطويل، توحيد الهمزات والألف والياء والتاء المربوطة."""
    import re as _re
    s = unicodedata.normalize('NFC', s or '')
    s = _re.sub(r'[\u064B-\u0652\u0670\u0640\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', s)
    s = _re.sub(r'[\u0622\u0623\u0625\u0671]', '\u0627', s)
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    s = s.replace('\u0624', '\u0648').replace('\u0626', '\u064A')
    s = _re.sub(r'[^\w\s]+', ' ', s, flags=_re.UNICODE)
    return _re.sub(r'\s+', ' ', s).strip().lower()


def count_nodes(node):
    """عدد العُقد الكلي (لتفضيل الزحف الأعمق عند تكرار نفس الجذر)."""
    return 1 + sum(count_nodes(c) for c in node.get('children', []))


def prune_subroots(node, root_ids):
    """Retire les sous-dossiers dont l'id est lui-même la racine d'une autre
    collection : évite de compter deux fois les mêmes fichiers Drive quand un
    dossier apparaît à la fois en racine dédiée et en sous-dossier d'un autre
    (ex. المنظمة العربية للترجمة = collection propre ET sous-dossier de دور نشر)."""
    kept = []
    for c in node.get('children', []):
        if c.get('type') == 'folder' and c.get('id') in root_ids:
            continue
        prune_subroots(c, root_ids)
        kept.append(c)
    node['children'] = kept
    return node


def clean_name(n):
    n = unicodedata.normalize('NFC', n or '')
    # strip RTL/LTR marks and control chars that Drive sometimes embeds
    n = re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def ext_of(name):
    m = re.search(r'\.([A-Za-z0-9]{1,6})$', name)
    return m.group(1).lower() if m else ''


NOISE_RE = re.compile(
    r'^(image|img|scan|page|صورة|صفحه|صفحة)'
    r'[\s_\-]*'
    r'(image)?'
    r'[\s_\-]*'
    r'[\d\s_()\-]*'
    r'\.(png|jpe?g|gif|bmp|webp)$', re.I)

# بقايا صفحات محفوظة/أدوات قارئ PDF مقفول — لا علاقة لها بالكتب
JUNK_NAMES = {'metadatainfo', 'obtainlock', 'technicalinfo', 'validateaccess',
              'saved_resource.html', 'sm1.html', 'core.js', 'blank.html'}
JUNK_RE = re.compile(r'(\.تنزيل$)|(^jquery)|(^test\.js)|(^menu\.js)'
                     r'|(^saved_resource)|(^sm1\.html$)', re.I)
# امتدادات لا تُعرض ككتب
EXCLUDE_EXT = {'css', 'js', 'jsf', 'ini', 'ico', 'xml', 'json', 'webmanifest', 'map'}

# أيقونات واجهات قارئات PDF القديمة المرفوعة مع بعض «الكتب»
UI_ASSET_RE = re.compile(
    r'^(zoom[_-]?(in|out)?|arrow|bullet|spacer|blank|bg|button|icon|thumb|sticky'
    r'|related|share|rss|search[_-]?list|selected|next|prev|previous|last|first'
    r'|info|single[_-]?page|text[_-]?underline|markup[_-]?tools\w*|myAOL\w*'
    r'|close|menu|expand|collapse|loading|logo|print|mail|facebook|twitter'
    r'|pixel|dot|line|corner|shadow|gradient|title|footer|header'
    r'|percent|banner|sprite|advert?\w*|watermark|favicon|avatar|placeholder'
    r'|border|top|bottom|left|right|arrow\w*|bullet\w*)\b', re.I)
UI_ASSET_EXACT = {'core.js', 'test.js', 'blank.html', 'thumbs.db', 'desktop.ini'}


def is_junk_file(name):
    """True لملفات لا تمثّل كتابًا: صور صفحات PDF، بقايا صفحات محفوظة، ملفات أدوات."""
    n = (name or '').strip().lower()
    if not n or n in JUNK_NAMES:
        return True
    if n.startswith('~$') or n.startswith('.~lock.'):
        return True        # ملفات قفل مؤقتة من Word/Office
    if ext_of(n) in EXCLUDE_EXT:
        return True
    if NOISE_RE.match(n):
        return True
    if JUNK_RE.search(n):
        return True
    if n in UI_ASSET_EXACT:
        return True
    # أيقونات واجهة القارئ (بلا مسافات، لاتينية غالبًا) داخل مجلدات الكتب
    base = re.sub(r'\.(png|jpe?g|gif|bmp|webp)$', '', n)
    if ' ' not in base and UI_ASSET_RE.match(base):
        return True
    return False


# ---------- استخراج المؤلف ----------
# المصدر الأول: اسم الملف «الكتاب - المؤلف.pdf» (72% من المكتبة)
# المصدر الثاني: اسم المجلد الذي يحوي الكتاب (مجلدات مرتّبة بالمؤلف: «أجاثا كريستي»، «طه حسين»)
AR_DASH_RE = re.compile(r'\s[-–—]\s')
AR_NAME_RE = re.compile(r"^[\u0621-\u064A\u0670\u0671\u0640\s\.\u2019']{2,42}$")
# أرقام الأجزاء في نهاية الاسم ليست جزءًا من اسم المؤلف
VOLUME_RE = re.compile(r'\s*(?:الجزء|المجلد|ج|م|book|vol)?\.?\s*\d{1,3}\s*$', re.I)
# كلمات كاملة تدلّ على أن المجلد تصنيف/ناشر لا مؤلف (بحدود الكلمة: «الدين» لا تطابق «دين»)
NOT_AUTHOR_WORD_RE = re.compile(
    r'\b(?:فكر|فلسفة|معارف|روايات|أدب|مجلة|كتب|مشروع|الهيئة|المركز|المنظمة|مؤسسة|جامعة|وزارة'
    r'|قسم|القسم|أفضل|موسوعة|معجم|سلسلة|ديوان|شعر|مسرح|قصة|قصص|تراث|أعمال|مجموعة|عامة|عالم'
    r'|وجهات|مجلد|الجزء|مقدمة|دراسات|تاريخ|علوم|لغة|نقد|تقارير|أبحاث|سياسة|اقتصاد|اجتماع|دين'
    r'|إسلام|تصوف|خرافات|أساطير|رحلات|سير|مذكرات|مختارات|رسائل|مقالات|حوارات|مسرحية|رواية'
    r'|قانون|طب|هندسة|رياضيات|فلك|جغرافيا|بيئة|إدارة|تعليم|مناهج|جامعات|مكتبات|عدد|سلسلة)\b', re.I)
# بدايات تدلّ على تصنيف لا اسم شخص
NOT_AUTHOR_PREFIX_RE = re.compile(r'^(?:فكر|فلسف|معارف|موسوع|مجل|روايت|سلسل|دار |الهيئة|المركز|المنظمة|مشروع|مجموع|أعمال|كتب)', re.I)


def clean_candidate(name):
    n = (name or '').strip(' .«»_:;,،؛-\u200e\u200f\u2019\'')
    n = VOLUME_RE.sub('', n).strip(' ._:،-\u200e\u200f')
    return n


def looks_like_person(name):
    n = clean_candidate(name)
    if not (2 <= len(n) <= 42) or not AR_NAME_RE.match(n):
        return False
    words = n.split()
    if not (1 <= len(words) <= 5) or any(w.isdigit() for w in words):
        return False
    return not (NOT_AUTHOR_WORD_RE.search(n) or NOT_AUTHOR_PREFIX_RE.match(n))


def author_of(name, path):
    """يعيد (المؤلف, المصدر) أو ('', '') إن لم يتيسّر"""
    e = ext_of(name)
    base = name[:-(len(e) + 1)] if e else name
    if AR_DASH_RE.search(base):
        tail = AR_DASH_RE.split(base)[-1].strip()
        if looks_like_person(tail):
            return clean_candidate(tail), 'name'
    # مجلد الكتاب: path[0] = جذر المجموعة، path[1] = مجلد المؤلف أو التصنيف
    if len(path) > 1 and looks_like_person(path[1]):
        return clean_candidate(path[1]), 'folder'
    return '', ''


def walk(node, collection, path, items, counters):
    ch = node.get('children', [])
    if node['type'] == 'file':
        name = clean_name(node.get('name', ''))
        ext = ext_of(name)
        if is_junk_file(name):
            counters['junk'] += 1
            e = ext or 'بلا امتداد'
            counters.setdefault('junk_ext', {})
            counters['junk_ext'][e] = counters['junk_ext'].get(e, 0) + 1
            return None
        clean_path = [p for p in path if p]
        author, author_src = author_of(name, clean_path)
        it = {
            'id': node['id'],
            'name': name,
            'norm': normalize_ar(name),      # داخلي: لبناء المكرّرات فقط (لا يُكتب في الفهرس)
            'ext': ext,
            'kind': KIND.get(ext, 'other'),
            'modified': node.get('modified', ''),
            'path': clean_path,
            'collection': collection,
        }
        if author:
            it['author'] = author
            it['author_src'] = author_src
        wbase, wvol = split_volume(name)
        if wbase:
            it['work'] = normalize_ar(wbase)
            it['work_name'] = clean_name(wbase)
            it['vol'] = wvol
        # سلاسل بأرقام (001.pdf) → «عالم المعرفة — العدد 001»
        sm = NUMERIC_RE.match(name)
        if sm and collection in SERIES:
            it['series'] = SERIES[collection]
            it['issue'] = int(sm.group(1))
            it['name'] = f"{it['series']} — العدد {it['issue']:03d}.pdf"
            it['norm'] = normalize_ar(it['name'])
            it.pop('author', None)          # اسم السلسلة ليس مؤلفًا
            it.pop('author_src', None)
            it.pop('work', None)            # أعداد السلسلة ليست مجلدات عمل واحد
            it.pop('work_name', None)
            it.pop('vol', None)
        if it['kind'] not in KEEP_KINDS:
            counters['nonbook'] = counters.get('nonbook', 0) + 1
            return None
        items[node['id']] = it
        counters['files'] += 1
        return {'t': 'f', 'id': node['id']}
    out = {'t': 'd', 'id': node['id'], 'n': clean_name(node.get('name', '')),
           'c': [], 'n_files': 0, 'n_subs': 0, 'cover': ''}
    for c in ch:
        r = walk(c, collection, path + [clean_name(node.get('name', ''))], items, counters)
        if r:
            out['c'].append(r)
            if r['t'] == 'f':
                out['n_files'] += 1
                if not out.get('cover') and r.get('thumb'):
                    out['cover'] = r['thumb']
            else:
                out['n_files'] += r.get('n_files', 0)
                out['n_subs'] += 1 + r.get('n_subs', 0)
    # drop folders that only held page-image noise
    if not out['c']:
        counters['empty_folders'] += 1
        return None
    return out


def main():
    out_path = sys.argv[1]
    collections, items, counters = [], {}, {'files': 0, 'junk': 0, 'empty_folders': 0}
    # اجمع الجذور من كل ملفات الزحف، وأبقِ الأعمق لكل معرّف (الأكبر عددًا)
    roots = {}
    for src in sys.argv[2:]:
        data = json.load(open(src, encoding='utf-8'))
        for root in data.get('roots', []):
            cid = root['id']
            prev = roots.get(cid)
            if prev is None or count_nodes(root) > count_nodes(prev):
                roots[cid] = root
    for cid, root in roots.items():
        name = NAME_OVERRIDE.get(cid) or clean_name(root.get('name', 'مقتنيات'))
        # jamais deux fois les mêmes fichiers : les sous-dossiers qui sont
        # une racine de collection à part entière sont retirés de l'arbre
        prune_subroots(root, set(roots.keys()))
        tree = walk(root, cid, [], items, counters)
        if not tree:
            continue
        collections.append({
            'id': cid,
            'name': name,
            'count': tree.get('n_files', 0),
            'tree': tree,
        })
    # ضمّ أحجام الملفات إن وُجدت (data/sizes.json)
    sizes_path = os.path.join(os.path.dirname(out_path) or '.', 'sizes.json')
    if os.path.exists(sizes_path):
        try:
            sizes = json.load(open(sizes_path, encoding='utf-8'))
            for fid, it in items.items():
                s = sizes.get(fid)
                if s:
                    it['size'] = s
        except Exception:
            pass
    # ---------- تنظيم: المكرّرات + وصف كل مجموعة + الأقسام ----------
    # أسماء ومعرّفات كانت مفهرسة سابقًا (كتالوج قديم) لمنع تكرار الملفات بين الإضافات
    prev_ids, prev_norms, prev_colls = set(), set(), set()
    prev_path = os.path.join(os.path.dirname(out_path) or '.', 'catalog.prev.json')
    if os.path.exists(prev_path):
        try:
            prev = json.load(open(prev_path, encoding='utf-8'))
            for fid, it in prev.get('items', {}).items():
                prev_ids.add(fid)
                pn = it.get('norm')
                if not pn:
                    pn = normalize_ar(it.get('name', ''))
                if pn:
                    prev_norms.add(pn)
            prev_colls = {c['id'] for c in prev.get('collections', [])}
        except Exception:
            pass

    seen_names = {}
    for it in items.values():
        seen_names.setdefault(it['norm'], set()).add(it['collection'])
    dups = 0
    for fid, obj in items.items():
        # تكرار داخل الكتالوج: نفس الاسم في مجموعتين
        if len(seen_names.get(obj['norm'], ())) > 1:
            obj['dup'] = True
            dups += 1
        # تكرار مع كتالوج سابق: فقط للمجموعات الجديدة (القديمة كانت هي المرجع نفسه)
        elif obj['collection'] not in prev_colls and (fid in prev_ids or obj['norm'] in prev_norms):
            obj['dup'] = True
            dups += 1
    counters['duplicates'] = dups

    for c in collections:
        ids = [fid for fid, it in items.items() if it['collection'] == c['id']]
        c['ids'] = ids
        c['bytes'] = sum((items[f].get('size') or 0) for f in ids)
        c['sample'] = ids[:6]          # 6 أغلفة لكل مجموعة: صناديق الرئيسية تعرض ستة أغلفة في كل قسم
        meta = COLLECTIONS_META.get(c['id'], {})
        c['group'] = meta.get('group', 'مجموعات أخرى')
        c['desc'] = meta.get('desc', '')

    # الأقسام (تجميع المجموعات) بترتيب ثابت
    groups = []
    for gname in GROUPS_ORDER:
        gcols = [c for c in collections if c['group'] == gname]
        if not gcols:
            continue
        groups.append({
            'name': gname,
            'collections': [c['id'] for c in gcols],
            'count': sum(c['count'] for c in gcols),
            'bytes': sum(c['bytes'] for c in gcols),
        })

    # stable order: biggest collections first
    collections.sort(key=lambda c: -c['count'])
    cat = {
        'generated': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
        'counters': counters,
        'groups': groups,
        'collections': collections,
        'items': items,
        'total': len(items),
        'total_bytes': sum((it.get('size') or 0) for it in items.values()),
    }
    # المجلد المفرد ليس مجموعة: نُبقي work فقط إذا كان للعمل مجلدان أو أكثر في المجموعة نفسها
    groups = {}
    for it in items.values():
        if it.get('work'):
            groups.setdefault((it['collection'], it['work']), []).append(it)
    lone = [k for k, v in groups.items() if len(v) < 2]
    works = 0
    for it in items.values():
        if it.get('work') and (it['collection'], it['work']) in lone:
            it.pop('work', None)
            it.pop('work_name', None)
            it.pop('vol', None)
    works = len(groups) - len(lone)
    counters['works'] = works
    counters['volumes_in_works'] = sum(len(v) for k, v in groups.items() if k not in lone)

    # الحقول التي يعيد المتصفح بناءها لا تُكتب: الفهرس يصغر إلى خُمس حجمه المضغوط
    for it in items.values():
        it.pop('norm', None)
        it.pop('thumb', None)
        it.pop('path_norm', None)
    authors = {it['author'] for it in items.values() if it.get('author')}
    counters['authors'] = len(authors)
    counters['with_author'] = sum(1 for it in items.values() if it.get('author'))
    counters['authors_from_folder'] = sum(1 for it in items.values() if it.get('author_src') == 'folder')

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(cat, f, ensure_ascii=False, separators=(',', ':'))
    print(json.dumps({'out': out_path, 'total': len(items),
                      'collections': [(c['name'], c['count']) for c in collections],
                      'counters': counters}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()