/* المفضلة وآخر ما قرأت — تُحفظ في الجهاز (localStorage) ولا تُرسل للسيرفر */

const FAV_KEY = 'mk.favs';
const RECENT_KEY = 'mk.recent';
const RECENT_MAX = 24;

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
  } catch { return []; }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* المخزن ممتلئ أو معطّل */ }
}

/* ---------- المفضلة ---------- */
export const favIds = () => readList(FAV_KEY);
export const isFav = (id) => readList(FAV_KEY).includes(id);
export const favCount = () => readList(FAV_KEY).length;

/** يضيف/يزيل كتابًا من المفضلة ويعيد الحالة الجديدة */
export function toggleFav(id) {
  const list = readList(FAV_KEY);
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.unshift(id);   // الأحدث أولًا
  writeList(FAV_KEY, list);
  return i < 0;
}

/* ---------- آخر ما قرأت ---------- */
export const recentIds = () => readList(RECENT_KEY);

export function pushRecent(id) {
  if (!id) return;
  const list = readList(RECENT_KEY).filter((x) => x !== id);
  list.unshift(id);
  writeList(RECENT_KEY, list.slice(0, RECENT_MAX));
}

/* ---------- تفضيل نسخة من كتاب مكرّر ---------- */
const PREF_KEY = 'mk.pref';

export function prefs() {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return (v && typeof v === 'object') ? v : {};
  } catch { return {}; }
}

export const preferredCopy = (groupKey) => prefs()[groupKey] || '';

export function setPreferred(groupKey, id) {
  const p = prefs();
  if (id) p[groupKey] = id; else delete p[groupKey];
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* مخزن ممتلئ */ }
}

/* ---------- حالة القراءة: قيد القراءة / تمّت قراءته ---------- */
const STATUS_KEY = 'mk.status';

function readMap(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}

export const statusMap = () => readMap(STATUS_KEY);

/** '' | 'reading' | 'done' */
export const statusOf = (id) => readMap(STATUS_KEY)[id] || '';

export function setStatus(id, s) {
  if (!id) return '';
  const m = readMap(STATUS_KEY);
  if (!s || s === 'none') delete m[id]; else m[id] = s;
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(m)); } catch { /* مخزن ممتلئ */ }
  return m[id] || '';
}

/** يقلب الحالة بين «قيد القراءة» و«تمّت قراءته» ويعيد الحالة الجديدة */
export function toggleDone(id) {
  return setStatus(id, statusOf(id) === 'done' ? 'reading' : 'done');
}

export const readingIds = () => Object.entries(readMap(STATUS_KEY))
  .filter(([, v]) => v === 'reading').map(([k]) => k);

export const doneIds = () => Object.entries(readMap(STATUS_KEY))
  .filter(([, v]) => v === 'done').map(([k]) => k);

/* ---------- آخر زيارة (لشريط «جديد منذ آخر زيارة») ---------- */
const VISIT_KEY = 'mk.lastVisit';

export function lastVisit() {
  const n = Number(localStorage.getItem(VISIT_KEY) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setLastVisit(ts = Date.now()) {
  try { localStorage.setItem(VISIT_KEY, String(ts)); } catch { /* مخزن ممتلئ */ }
}
