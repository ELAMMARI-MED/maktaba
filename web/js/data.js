/* تحميل الفهرس + البحث + فهارس المؤلفين والمكرّرات والسلاسل */

import { normalizeAr } from './util.js';

const API = (path) =>
  (typeof document !== 'undefined' && document.baseURI)
    ? new URL(path, document.baseURI).href
    : path;

let CATALOG = null;
let IDX = null;          // فهرس بحث مسطّح
export let SEARCHABLE = true;

export async function loadCatalog() {
  if (CATALOG) return CATALOG;
  // خادم بايثون يوفّر /api/catalog، وأي استضافة ثابتة (GitHub Pages) توفّر
  // data/catalog.json بجانب الصفحة — نجرّب الأول ثم نرتدّ إلى الثاني.
  let res = null;
  try { res = await fetch(API('api/catalog')); } catch (e) { res = null; }
  if (!res || !res.ok || !(res.headers.get('content-type') || '').includes('json')) {
    res = await fetch(API('data/catalog.json'));
  }
  if (!res || !res.ok) throw new Error('تعذّر تحميل الفهرس');
  CATALOG = await res.json();
  buildIndex();
  return CATALOG;
}

export const catalog = () => CATALOG;
export const items = () => CATALOG.items || {};
export const item = (id) => (CATALOG?.items || {})[id];
/** الأقسام (تجميع المجموعات) كما بنّاها build_catalog */
export const groups = () => CATALOG?.groups || [];
export const collectionById = (id) => (CATALOG?.collections || []).find((c) => c.id === id) || null;

/** يبني فهرسًا مسطّحًا: كل ملف مع مساره داخل شجرته */
function buildIndex() {
  const rows = [];
  const byId = new Map();      // id → tree node (للمجلدات)
  const parents = new Map();   // childId → parentId
  const names = new Map();     // id → الاسم المعروض
  const rowsById = new Map();

  const visit = (node, coll, trail, parentId) => {
    if (!node) return;
    byId.set(node.id, node);
    if (parentId) parents.set(node.id, parentId);
    if (node.t === 'f') {
      const it = CATALOG.items[node.id];
      if (!it) return;
      names.set(node.id, it.name);
      const norm = it.norm || normalizeAr(it.name);
      // عنوان الغلاف (لسلاسل مثل عالم المعرفة) بدل «عالم المعرفة — العدد NN»
      const display = it.display || '';
      const dispNorm = display ? normalizeAr(display) : '';
      const pathN = it.path_norm || normalizeAr((it.path || []).join(' ') + ' ' + coll.name);
      const author = it.author || it.title_author || '';
      const row = {
        id: node.id,
        name: it.name,
        display,
        dispNorm,
        norm,
        hay: norm + ' ' + dispNorm + ' ' + pathN + ' ' + it.ext + ' ' + normalizeAr(author),
        kind: it.kind,
        ext: it.ext,
        modified: it.modified,
        collection: coll.id,
        collName: coll.name,
        path: it.path,
        normPath: pathN,
        dup: !!it.dup,
        size: it.size || 0,
        author,
        authorNorm: author ? normalizeAr(author) : '',
        issue: it.issue || 0,
        series: it.series || '',
        work: it.work || '',
        workName: it.work_name || '',
        vol: it.vol || 0,
      };
      rows.push(row);
      rowsById.set(row.id, row);
    } else if (node.c) {
      const nm = node.n || '';
      if (nm) names.set(node.id, nm);
      for (const kid of node.c) visit(kid, coll, nm ? trail.concat(nm) : trail, node.id);
    }
  };

  for (const coll of CATALOG.collections || []) {
    visit(coll.tree, coll, [], null);
  }
  IDX = { rows, byId, parents, names, rowsById };
}

/** سلسلة المجلدات من الجذر إلى المعرّف المعطى */
export function ancestors(id) {
  if (!IDX) return [];
  const out = [];
  let cur = id;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const p = IDX.parents.get(cur);
    if (!p) break;
    out.unshift({ id: p, name: IDX.names.get(p) || '' });
    cur = p;
  }
  return out;
}

export function nameOf(id) {
  return IDX?.names.get(id) || '';
}

export function getTree(id) {
  if (!IDX) return null;
  if (id) return IDX.byId.get(id) || null;
  return null;
}

export const rowById = (id) => IDX?.rowsById.get(id) || null;

/** البحث: يحترم التشكيل والهمزات، ويرجّح اسم المؤلف وبداية الاسم.
    بلا سقف صامت: يعيد كل النتائج والمكوّن يعرضها على دفعات. */
export function search(q, { kind = 'all', collection = null, limit = 100000 } = {}) {
  if (!IDX) return [];
  const nq = normalizeAr(q);
  if (!nq) return [];
  const terms = nq.split(' ').filter(Boolean);
  const out = [];
  for (const r of IDX.rows) {
    if (collection && r.collection !== collection) continue;
    if (kind !== 'all' && r.kind !== kind) continue;
    const hay = r.hay || (r.norm + ' ' + r.normPath);
    let ok = true;
    for (const t of terms) { if (!hay.includes(t)) { ok = false; break; } }
    if (!ok) continue;
    let score = 0;
    if (r.norm.startsWith(terms[0])) score += 6;
    else if (r.norm.includes(terms[0])) score += 4;
    if (r.norm.includes(nq)) score += 3;
    if (r.dispNorm) {                       // البحث بعنوان الغلاف أيضًا
      if (r.dispNorm.startsWith(terms[0])) score += 6;
      else if (r.dispNorm.includes(terms[0])) score += 4;
      if (r.dispNorm.includes(nq)) score += 3;
    }
    // المؤلف: مطابقة تامة للمؤلف تسبق مطابقة العنوان
    if (r.authorNorm) {
      if (r.authorNorm === nq) score += 9;
      else if (r.authorNorm.includes(nq)) score += 7;
      else if (terms.every((t) => r.authorNorm.includes(t))) score += 5;
    }
    if (r.kind === 'pdf') score += 1;
    out.push({ r, score });
  }
  out.sort((a, b) => b.score - a.score || (a.r.name.length - b.r.name.length));
  return out.slice(0, limit).map((x) => x.r);
}

export function allRows() {
  return IDX?.rows || [];
}

export function kindCounts() {
  const c = {};
  for (const r of IDX?.rows || []) c[r.kind] = (c[r.kind] || 0) + 1;
  return c;
}

export function collectionCounts() {
  const c = {};
  for (const r of IDX?.rows || []) c[r.collection] = (c[r.collection] || 0) + 1;
  return c;
}

export function randomPick(n = 1, kind = 'pdf') {
  if (!IDX) return [];
  const pool = IDX.rows.filter((r) => kind === 'all' || r.kind === kind);
  // خلط جزئي (Fisher–Yates) حتى لا تتكرر البطاقة نفسها في «اختيارات عشوائية»
  const take = Math.min(n, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

/* ---------------- المؤلفون (كتّاب) ---------------- */
/* نفس المؤلف قد يُكتب بأشكال مختلفة: «هرمان هيسة/هيسه»، «برنارد شو/برناردشو»،
   «آلفرد آدلر/الفرد أدلر». ندمج الأشكال المتقاربة في صفحة واحدة ونحفظ الأسماء البديلة. */
const tightKey = (k) => k.replace(/\s+/g, '');

function sameAuthor(a, b) {
  if (a === b || tightKey(a) === tightKey(b)) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 6 && l.includes(s)) return true;     // «برنارد شو» داخل «برنارد شو - مؤلف» مثلًا
  return false;
}

export function authorIndex() {
  if (!IDX) return [];
  if (!IDX.authors) {
    const raw = new Map();
    for (const r of IDX.rows) {
      if (!r.authorNorm) continue;
      let e = raw.get(r.authorNorm);
      if (!e) { e = { key: r.authorNorm, name: r.author, count: 0, ids: [], aliases: [] }; raw.set(r.authorNorm, e); }
      e.count += 1;
      e.ids.push(r.id);
    }
    // دمج
    const merged = [];
    for (const e of raw.values()) {
      const hit = merged.find((m) => sameAuthor(m.key, e.key));
      if (!hit) { merged.push(e); continue; }
      hit.count += e.count;
      hit.ids.push(...e.ids);
      if (e.name !== hit.name) hit.aliases.push(e.name);
      if (e.count > hit.count) {              // الاسم الأكثر كتبًا يصبح المعروض
        hit.aliases.push(hit.name);
        hit.name = e.name;
        hit.key = e.key;
      }
    }
    for (const m of merged) m.aliases = Array.from(new Set(m.aliases)).filter((a) => a !== m.name).sort();
    IDX.authors = merged.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
    IDX.authorsByKey = new Map();
    for (const a of IDX.authors) {
      IDX.authorsByKey.set(a.key, a);
      for (const al of a.aliases) IDX.authorsByKey.set(normalizeAr(al), a);
    }
  }
  return IDX.authors;
}

export const authorByName = (key) => IDX?.authorsByKey?.get(key) || null;

export const booksByAuthor = (key) => {
  const a = authorByName(key);
  if (!a) return [];
  const ids = new Set(a.ids);
  return (IDX?.rows || []).filter((r) => ids.has(r.id));
};

/* ---------------- المجلدات: عمل واحد له عدة أجزاء ---------------- */
/** ملفات تنتمي لعمل واحد (نفس الأساس في المجموعة نفسها) */
export function workKeyOf(row) {
  return row && row.work ? `${row.collection}|${row.work}` : '';
}

export function volumesOf(key) {
  return (IDX?.rows || []).filter((r) => workKeyOf(r) === key).sort((a, b) => a.vol - b.vol);
}

/* ---------------- التواريخ: «جديد المكتبة» ---------------- */
export function dateNum(d) {
  const m = (d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return 0;
  let [, mo, da, yr] = m;
  if (yr.length === 2) yr = '20' + yr;
  return Date.UTC(+yr, +mo - 1, +da);
}

export const yearOf = (row) => {
  const m = (row?.modified || '').match(/^\d{1,2}\/\d{1,2}\/(\d{2,4})$/);
  if (!m) return 0;
  return +((m[1].length === 2 ? '20' + m[1] : m[1]));
};

/** أحدث ما أُضيف للمكتبة (تاريخ التعديل كما يعطيه درايف) */
export function newRows({ year = 0, limit = 100000 } = {}) {
  return (IDX?.rows || [])
    .filter((r) => (year ? yearOf(r) === year : true))
    .sort((a, b) => dateNum(b.modified) - dateNum(a.modified) || a.name.localeCompare(b.name, 'ar'))
    .slice(0, limit);
}

export function yearCounts() {
  const c = new Map();
  for (const r of IDX?.rows || []) {
    const y = yearOf(r);
    if (y) c.set(y, (c.get(y) || 0) + 1);
  }
  return Array.from(c.entries()).sort((a, b) => b[0] - a[0]);
}

/* ---------------- السلاسل: السابق/التالي برقم العدد ---------------- */
export function seriesInfo(id) {
  const r = rowById(id);
  if (!r || !r.issue) return null;
  const list = (IDX?.rows || []).filter((x) => x.issue && x.series === r.series)
    .sort((a, b) => a.issue - b.issue);
  const i = list.findIndex((x) => x.id === id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  return { series: r.series, issue: r.issue, index: i + 1, total: list.length, prev, next,
           ids: list.map((x) => x.id) };
}

/* ---------------- اقتراحات البحث ---------------- */
export function suggest(q, { authors = 6, titles = 8 } = {}) {
  const nq = normalizeAr(q);
  if (!nq || !IDX) return { authors: [], titles: [] };
  const au = authorIndex().filter((a) => a.key.includes(nq) || tightKey(a.key).includes(tightKey(nq))).slice(0, authors);
  const ti = IDX.rows
    .filter((r) => r.norm.startsWith(nq) || r.norm.includes(nq)
      || (r.dispNorm && (r.dispNorm.startsWith(nq) || r.dispNorm.includes(nq))))
    .sort((a, b) => (b.norm.startsWith(nq)) - (a.norm.startsWith(nq)) || a.name.length - b.name.length)
    .slice(0, titles);
  return { authors: au, titles: ti };
}

/** مؤلفون يبدأ اسمهم أو يحتوي ما كُتب (لتصفية قائمة المؤلفين) */
export function findAuthors(q, limit = 100000) {
  const nq = normalizeAr(q);
  if (!nq) return authorIndex().slice(0, limit);
  return authorIndex().filter((a) => a.key.includes(nq)).slice(0, limit);
}

/* ---------------- المكرّرات ---------------- */
/** الملفات التي تتكرّر أسماؤها في أكثر من مجموعة: norm → صفوف */
export function dupGroups() {
  if (!IDX) return new Map();
  if (!IDX.dups) {
    const m = new Map();
    for (const r of IDX.rows) {
      if (!m.has(r.norm)) m.set(r.norm, []);
      m.get(r.norm).push(r);
    }
    for (const k of Array.from(m.keys())) if (m.get(k).length < 2) m.delete(k);
    IDX.dups = m;
  }
  return IDX.dups;
}

/** النسخ الأخرى من الكتاب نفسه (في مجموعات أخرى) */
export function otherCopies(id) {
  const r = rowById(id);
  if (!r) return [];
  return (dupGroups().get(r.norm) || []).filter((x) => x.id !== id);
}

/* ---------------- السلاسل المرقّمة ---------------- */
export const seriesRows = () => (IDX?.rows || []).filter((r) => r.issue).sort((a, b) => a.issue - b.issue);
