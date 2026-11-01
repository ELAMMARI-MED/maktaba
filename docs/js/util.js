/* أدوات مساعدة عامة */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export const debounce = (fn, ms = 160) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

/** يزيل التشكيل والتطويل ويوحّد الألف/الياء/الهاء لبحث عربي متسامح */
export function normalizeAr(s) {
  return (s || '')
    .toString()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')     // تشكيل وتطويل
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // آ أ إ ٱ → ا
    .replace(/\u0649/g, '\u064A')                     // ى → ي
    .replace(/\u0629/g, '\u0647')                     // ة → ه
    .replace(/\u0624/g, '\u0648')                     // ؤ → و
    .replace(/\u0626/g, '\u064A')                     // ئ → ي
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** رقم بصيغة لاتينية دائمًا (1234567890) مع فواصل الآلاف — لا أرقام عربية-هندية (١٢٣) */
export function num(n, fallback = '0') {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return fallback;
  return Math.round(Number(n)).toLocaleString('en-US');
}

export function fmtDate(d) {
  if (!d) return '';
  // Drive يعطي تواريخ مثل 1/27/19 أو 6/7/22
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return d;
  let [, mo, da, yr] = m;
  if (yr.length === 2) yr = '20' + yr;
  return `${yr}/${String(mo).padStart(2, '0')}/${String(da).padStart(2, '0')}`;
}

export function fmtBytes(n) {
  if (!n || n < 0) return '';
  const u = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  const v = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v} ${u[i]}`;
}

export function fmtSize(kind) {
  const map = { pdf: 'PDF', epub: 'EPUB', doc: 'مستند', audio: 'صوتي', video: 'مرئي', archive: 'أرشيف', image: 'صورة', folder: 'مجلد', other: 'ملف' };
  return map[kind] || 'ملف';
}

export function toast(msg, ms = 2200) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.style.setProperty('--toast-ms', `${ms}ms`);   // شريط العدّ التنازلي في CSS
  t.hidden = false;
  // إعادة تشغيل الحركة عند ظهور تنبيه جديد فوق تنبيه سابق
  t.classList.remove('in');
  void t.offsetWidth;
  t.classList.add('in');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; t.classList.remove('in'); }, ms);
}

export function copy(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = el('textarea', { style: 'position:fixed;opacity:0' }, text);
  document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}

export const arabicCollator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

/* ---------- أيقونات SVG حديثة (خطوط 24×24 بأسلوب lucide) ---------- */
const NS = 'http://www.w3.org/2000/svg';
export const ICONS = {
  search: ['M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6', 'M16 16 20.5 20.5'],
  home: ['M3.5 10.6 12 3.5l8.5 7.1', 'M5.7 9.6V19a1.5 1.5 0 0 0 1.5 1.5h9.6A1.5 1.5 0 0 0 18.3 19V9.6'],
  moon: ['M20.4 13.4A8.4 8.4 0 1 1 10.6 3.6a6.6 6.6 0 0 0 9.8 9.8'],
  sun: ['M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8', 'M12 2.6v1.8', 'M12 19.6v1.8',
        'M2.6 12h1.8', 'M19.6 12h1.8', 'M5.3 5.3l1.3 1.3', 'M17.4 17.4l1.3 1.3',
        'M18.7 5.3l-1.3 1.3', 'M6.6 17.4l-1.3 1.3'],
  download: ['M12 3.6v10.6', 'm7.6 10.2 4.4 4.4 4.4-4.4', 'M4.6 20.4h14.8'],
  external: ['M14 4.6h5.4V10', 'M19.4 4.6 11 13', 'M17.6 14v5.4a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1V8.6a1 1 0 0 1 1-1H11'],
  x: ['M6.6 6.6 17.4 17.4', 'M17.4 6.6 6.6 17.4'],
  chevronRight: ['m10 6.6 5.4 5.4-5.4 5.4'],
  chevronLeft: ['m14 6.6-5.4 5.4 5.4 5.4'],
  chart: ['M5 20V11.5', 'M11 20V4.6', 'M17 20v-5.6', 'M3.4 20h17.2'],
  info: ['M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8', 'M12 11.2v5.2', 'M12 8.1h.01'],
  shuffle: ['M2.6 17.8h1.5c1.4 0 2.7-.7 3.5-1.8l5.8-8.1c.8-1.1 2.1-1.8 3.5-1.8h2.9',
            'm18.2 2.6 3.6 3.6-3.6 3.6', 'M2.6 6h1.9c1.5 0 2.9.8 3.7 2.1',
            'M20.4 17.8h-5.6c-1.4 0-2.7-.7-3.5-1.8l-.5-.7', 'm18.2 13.4 3.6 3.6-3.6 3.6'],
  library: ['m15.6 3.4 3.2 17', 'M9.4 3.4v17', 'M13.4 3.6v16.8', 'M4.6 3.4v17'],
  book: ['M4.4 19.4A2.4 2.4 0 0 1 6.8 17h12.8', 'M6.8 2.8h12.8v18.4H6.8A2.4 2.4 0 0 1 4.4 18.8V5.2a2.4 2.4 0 0 1 2.4-2.4z'],
  bookOpen: ['M12 7.2C10.2 5.7 8.3 5 4.8 5v13.2c3.5 0 5.4.7 7.2 2.2 1.8-1.5 3.7-2.2 7.2-2.2V5c-3.5 0-5.4.7-7.2 2.2z', 'M12 7.2v13.2'],
  folder: ['M3.6 7.2a1.7 1.7 0 0 1 1.7-1.7h3.3l2 2h8.1a1.7 1.7 0 0 1 1.7 1.7v9a1.7 1.7 0 0 1-1.7 1.7H5.3a1.7 1.7 0 0 1-1.7-1.7z'],
  fileText: ['M14 3.6H7.6a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V8z',
             'M14 3.6V8h4.4', 'M9 12.6h6', 'M9 16h6'],
  headphones: ['M4.6 15.2v-3a7.4 7.4 0 0 1 14.8 0v3',
               'M4.6 14h2.2a1 1 0 0 1 1 1v4.4H6a1.4 1.4 0 0 1-1.4-1.4z',
               'M19.4 14h-2.2a1 1 0 0 0-1 1v4.4H18a1.4 1.4 0 0 0 1.4-1.4z'],
  video: ['M3.6 8.3A2.3 2.3 0 0 1 5.9 6h7.4a2.3 2.3 0 0 1 2.3 2.3v7.4A2.3 2.3 0 0 1 13.3 18H5.9a2.3 2.3 0 0 1-2.3-2.3z',
          'm15.6 11.2 4.8-2.6v6.8l-4.8-2.6z'],
  image: ['M5.6 4.6h12.8a1 1 0 0 1 1 1v12.8a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1V5.6a1 1 0 0 1 1-1z',
          'M8.6 10.2a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8',
          'm4.6 17.2 4.6-4.6 3.6 3.6 2.4-2.4 4.6 4.6'],
  archive: ['M4 7.6h16', 'M5.6 7.6V19a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1V7.6',
            'm6.6 4.6 1-2h8.8l1 2', 'M10 12.2h4'],
  file: ['M14 3.6H7.6a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V8z', 'M14 3.6V8h4.4'],
  copy: ['M9.6 9.6h8.4a1 1 0 0 1 1 1v8.4a1 1 0 0 1-1 1H9.6a1 1 0 0 1-1-1v-8.4a1 1 0 0 1 1-1z',
         'M6.4 14.4H5.6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h8.4a1 1 0 0 1 1 1v.8'],
  layers: ['m12 3.6 9 4.8-9 4.8-9-4.8z', 'm3.4 13.4 8.6 4.6 8.6-4.6'],
  warning: ['M12 4.4 21 19.6H3z', 'M12 10.2v4', 'M12 16.4h.01'],
  play: ['m9.4 7 8.6 5-8.6 5', 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8'],
  heart: ['M19 13.9c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 2.9c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.4c0 2.3 1.5 4 3 5.5l7 7z'],
  clock: ['M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8', 'M12 7.6V12l3.4 2'],
  chevronDown: ['m6.6 9.6 5.4 5.4 5.4-5.4'],
  chevronUp: ['m6.6 14.4 5.4-5.4 5.4 5.4'],
  share: ['M12 15.6V4.4', 'm8.2 8.2 3.8-3.8 3.8 3.8', 'M6 13.4v4.2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.2'],
  check: ['m6.4 12.4 3.8 3.8 7.6-8.6'],
  user: ['M12 12.4a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2', 'M4.9 20.3c0-3.3 3.2-5.4 7.1-5.4s7.1 2.1 7.1 5.4'],
  grid: ['M4.4 4.4h6.2v6.2H4.4z', 'M13.4 4.4h6.2v6.2h-6.2z', 'M4.4 13.4h6.2v6.2H4.4z', 'M13.4 13.4h6.2v6.2h-6.2z'],
  list: ['M8.4 6.2h11.2', 'M8.4 12h11.2', 'M8.4 17.8h11.2', 'M4.4 6.2h.01', 'M4.4 12h.01', 'M4.4 17.8h.01'],
  copy2: ['M7.4 4.6h9.2a1 1 0 0 1 1 1v9.2', 'M4.4 9.4h9.2a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1v-8.6a1 1 0 0 1 1-1z'],
  expand: ['M9 4.4H4.4V9', 'M15 4.4h4.6V9', 'M15 19.6h4.6V15', 'M9 19.6H4.4V15'],
  more: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
  keyboard: ['M3.6 7.4h16.8a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V8.4a1 1 0 0 1 1-1z',
             'M6.4 10.6h.01', 'M9.6 10.6h.01', 'M12.8 10.6h.01', 'M16 10.6h.01',
             'M6.4 13.4h.01', 'M9.6 13.4h.01', 'M12.8 13.4h.01', 'M16 13.4h.01',
             'M8.4 16h7.2'],
};

/** يبني عنصر <svg> للرمز المطلوب (يرث لون النص عبر currentColor) */
export function icon(name, size = 20, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', ('ico ' + cls).trim());
  svg.setAttribute('aria-hidden', 'true');
  for (const d of (ICONS[name] || ICONS.file)) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** اسم الأيقونة المناسبة لكل نوع ملف */
export const KIND_ICON = { pdf: 'bookOpen', epub: 'book', doc: 'fileText', audio: 'headphones',
                           video: 'video', image: 'image', archive: 'archive', folder: 'folder', other: 'file' };
export const kindIcon = (kind, size = 22) => icon(KIND_ICON[kind] || 'file', size);
/** يحبس التركيز داخل عنصر مفتوح (عارض/نافذة) */
export function trapFocus(box, onEscape) {
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { onEscape(); return; }
    if (e.key !== 'Tab') return;
    const items = Array.from(box.querySelectorAll('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])'))
      .filter((n) => !n.hidden && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/** يُنزّل نصًّا كملف على الجهاز (بلا سيرفر) */
export function downloadText(filename, text) {
  let url;
  try {
    url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  } catch {
    url = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);   // بديل حين لا يتوفر Blob
  }
  const a = el('a', { href: url, download: filename, style: 'display:none' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
}
