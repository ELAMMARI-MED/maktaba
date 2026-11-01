/* مكتبة — التطبيق الرئيسي: التصفّح، البحث، العارض، المظهر */

import { $, $$, el, debounce, toast, fmtDate, fmtSize, fmtBytes, num, normalizeAr, trapFocus, downloadText, KIND_ICON, icon, kindIcon, arabicCollator, copy } from './util.js';
import { loadCatalog, catalog, search, item, getTree, ancestors, nameOf, collectionCounts, kindCounts, randomPick, allRows, groups, collectionById, authorIndex, findAuthors, authorByName, booksByAuthor, otherCopies, newRows, yearCounts, yearOf, dupGroups, workKeyOf, volumesOf, suggest, seriesRows, seriesInfo, dateNum } from './data.js';
import { openReader, closeReader, drivePreview, driveView, driveDownload } from './reader.js';
import { favIds, isFav, toggleFav, favCount, recentIds, preferredCopy, setPreferred, statusOf, setStatus, toggleDone, lastVisit, setLastVisit } from './user.js';

const state = {
  view: 'home',       // home | browse | search
  collectionId: null,
  folderId: null,
  query: '',
  kind: 'all',
  sort: 'name',
  foldersFirst: true,
  hideDup: false,     // إخفاء الكتب الموجودة في أكثر من مجموعة
  scope: 'all',       // all | current (نطاق البحث)
  author: null,       // view: author — مفتاح المؤلف
  listView: false,    // بطاقات أم صفوف قائمة
  groupVols: true,    // تجميع مجلدات العمل الواحد في بطاقة واحدة
  letter: '',         // تصفية قائمة المؤلفين بالحرف
  year: 0,            // «جديد المكتبة»: سنة الإضافة (0 = الكل)
  density: 'md',      // حجم البطاقات: sm | md | lg
  jumpLetter: '',     // شريط الحروف في الشبكة (فارغ = الكل)
  series: null,       // السلسلة المفتوحة (view: seriesOne)
  selecting: false,   // وضع «تحديد» لعدة كتب
}

/* الكتب المحدَّدة في وضع «تحديد» (لا تُحفظ بين الجلسات) */
const SELECTED = new Set();

/* الحروف العربية لشريط القفز */
const AR_LETTERS = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];

/* الأعمال التي عُرضت مجلداتها (لا تُحفظ بين الجلسات) */
const EXPANDED = new Set();;

const KIND_ORDER = ['pdf', 'epub', 'doc', 'audio', 'video', 'image', 'archive', 'other'];

/* عدد البطاقات في كل دفعة عرض (العرض تدريجي: لا نرسم آلاف البطاقات مرّة واحدة) */
const PAGE_SIZE = 60;
/* عدد أغلفة الكتب في كل صندوق قسم بالصفحة الرئيسية */
const COVERS_PER_BOX = 6;

/* ---------------- المظهر ---------------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('mk.theme', t);
  const btn = $('#themeBtn');
  btn.textContent = '';
  btn.append(icon(t === 'dark' ? 'sun' : 'moon', 19));
  btn.title = t === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
}

/** أيقونات العناصر الثابتة في الصفحة (تُرسم مرة واحدة) */
function paintStaticIcons() {
  const put = (sel, name, size) => {
    const node = $(sel);
    if (!node) return;
    node.append(icon(name, size));
  };
  put('#searchGo', 'search', 19);
  put('#clearQ', 'x', 17);
  put('#collectionsBtn .nav-ico', 'library', 18);
  put('#readerOpen', 'external', 16);
  put('#readerDown', 'download', 16);
  put('#readerFav', 'heart', 17);
  put('#readerShare', 'share', 17);
  put('#readerCopy', 'copy', 17);
  put('#readerPrev', 'chevronRight', 20);
  put('#readerNext', 'chevronLeft', 20);
  put('#readerClose', 'x', 18);
  put('#readerFull', 'expand', 18);
  put('#readerMore', 'more', 18);
  put('#readerDone', 'check', 16);
  put('#readerKeys', 'keyboard', 16);
  put('#modalClose', 'x', 18);
  put('#collClose', 'x', 18);
  put('#filtersClose', 'x', 18);
  put('#footerMark', 'bookOpen', 17);
  put('#filtersBtn', 'grid', 15);
  put('#selectBtn', 'check', 15);
}
function initTheme() {
  const saved = localStorage.getItem('mk.theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  $('#themeBtn').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

/* ---------------- الحالة والتنقل ---------------- */
function saveState() {
  localStorage.setItem('mk.state', JSON.stringify({
    view: state.view, collectionId: state.collectionId, folderId: state.folderId,
    kind: state.kind, sort: state.sort, foldersFirst: state.foldersFirst,
    scope: state.scope, hideDup: state.hideDup, author: state.author, listView: state.listView,
    groupVols: state.groupVols, year: state.year, letter: state.letter, density: state.density,
  }));
}
function restoreState() {
  try {
    const s = JSON.parse(localStorage.getItem('mk.state') || '{}');
    Object.assign(state, s, { query: '' });
  } catch { /* ignore */ }
}

function go({ view = 'home', collectionId = null, folderId = null, query = '', author = null, series = null } = {}) {
  state.view = view; state.collectionId = collectionId; state.folderId = folderId;
  state.query = query; state.author = author; state.series = series;
  state.jumpLetter = '';        // ترشيح الحرف يخصّ القائمة الحالية فقط — التنقّل يمسحه
  if (view !== 'authors' && view !== 'author') state.letter = '';
  EXPANDED.clear();
  if (query) $('#q').value = query;
  saveState();
  render();
  $('#content').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeReader();
  closeSheet();
}

/** الفئة اللونية للقسم الذي تنتمي إليه مجموعة (لتمييزها في الشريط والترويسة) */
function sectionClassOf(collId) {
  const i = groups().findIndex((g) => (g.collections || []).includes(collId));
  return i < 0 ? '' : `sec-tag sec-${(i % 5) + 1}`;
}

/* ---------------- شريط الأقسام العلوي ---------------- */
function renderCatbar() {
  const bar = $('#catbar');
  if (!bar) return;
  bar.innerHTML = '';
  const counts = collectionCounts();
  const gs = groups();
  const cols = catalog().collections || [];
  const pill = (label, count, active, onclick, iconName, extraClass = '') => el('button', {
    class: `cat-pill${active ? ' active' : ''}${extraClass ? ' ' + extraClass : ''}`, title: label, onclick,
    'aria-current': active ? 'page' : null,
  }, iconName ? icon(iconName, 16) : null, el('span', { text: label }), count != null ? el('span', { class: 'n', text: String(count) }) : null);

  bar.append(pill('الرئيسية', null, state.view === 'home', () => go({ view: 'home' }), 'home'));
  bar.append(pill('المفضلة', favCount() || null, state.view === 'favs', () => go({ view: 'favs' }), 'heart'));
  bar.append(pill('المؤلفون', null, state.view === 'authors' || state.view === 'author', () => go({ view: 'authors' }), 'user'));
  bar.append(pill('السلاسل', seriesGroups().length || null, state.view === 'series' || state.view === 'seriesOne', () => go({ view: 'series' }), 'layers'));
  const sections = gs.length ? gs.map((g) => ({ name: g.name, list: g.collections.map(collectionById).filter(Boolean) }))
                             : [{ name: 'المجموعات', list: cols }];
  for (const sec of sections) {
    if (!sec.list.length) continue;
    bar.append(el('span', { class: 'cat-sep', title: sec.name }));
    for (const c of sec.list) {
      bar.append(pill(c.name, counts[c.id] ?? c.count ?? 0,
        state.collectionId === c.id && state.view === 'browse',
        () => go({ view: 'browse', collectionId: c.id, folderId: c.tree?.id || c.id }),
        null, sectionClassOf(c.id)));
    }
  }
  updateCatbarScroll(bar);
}

/* 3. ombres de débordement du catbar + 11. pilule active visible */
function updateCatbarScroll(bar) {
  if (!bar) return;
  const update = () => {
    const max = bar.scrollWidth - bar.clientWidth;
    bar.classList.toggle('scroll-start', bar.scrollLeft > 4);
    bar.classList.toggle('scroll-end', bar.scrollLeft < max - 4);
  };
  if (!bar._scrollWired) {
    bar._scrollWired = true;
    bar.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', () => update(), { passive: true });
  }
  update();
  // 11. la pilule active doit toujours être visible après navigation.
  // On déplace UNIQUEMENT le scroll horizontal de la barre (scrollIntoView ferait
  // aussi défiler la page, et jsdom ne l'implémente pas).
  const active = bar.querySelector('.cat-pill.active');
  if (active && bar.scrollWidth > bar.clientWidth + 4) {
    const target = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
    bar.scrollLeft = Math.max(0, Math.min(target, bar.scrollWidth - bar.clientWidth));
  }
}

/* ---------------- درج المجموعات ---------------- */
function openSheet() { $('#collSheet').hidden = false; $('#collectionsBtn')?.setAttribute('aria-expanded', 'true'); }
function closeSheet() {
  const s = $('#collSheet');
  if (s) s.hidden = true;
  $('#collectionsBtn')?.setAttribute('aria-expanded', 'false');
}

/* ---------------- الشريط الجانبي ---------------- */
function colButton(c, counts) {
  return el('button', {
    class: 'col-item' + (state.collectionId === c.id && state.view === 'browse' ? ' active' : ''),
    title: c.desc ? `${c.name} — ${c.desc}` : c.name,
    onclick: () => go({ view: 'browse', collectionId: c.id, folderId: c.tree?.id || c.id }),
  }, icon('book', 18), el('span', { class: 'cname', text: c.name }), el('span', { class: 'cnum', text: String(counts[c.id] ?? c.count ?? 0) }));
}

function renderCollections() {
  const box = $('#collections');
  box.innerHTML = '';
  const counts = collectionCounts();
  const cols = catalog().collections || [];
  const gs = groups();
  if (!cols.length) {
    box.append(el('p', { class: 'hint', text: 'لا توجد مجموعات بعد — شغّل سكربت الفهرسة.' }));
    return;
  }
  box.append(el('button', {
    class: 'col-item' + (state.view === 'home' ? ' active' : ''),
    onclick: () => go({ view: 'home' }),
  }, icon('home', 18), el('span', { class: 'cname', text: 'الصفحة الرئيسية' })));
  box.append(el('button', {
    class: 'col-item' + (state.view === 'favs' ? ' active' : ''),
    onclick: () => go({ view: 'favs' }),
  }, icon('heart', 18), el('span', { class: 'cname', text: 'المفضلة' }), el('span', { class: 'cnum', text: String(favCount()) })));
  box.append(el('button', {
    class: 'col-item' + (state.view === 'authors' ? ' active' : ''),
    onclick: () => go({ view: 'authors' }),
  }, icon('user', 18), el('span', { class: 'cname', text: 'المؤلفون' }), el('span', { class: 'cnum', text: num(authorIndex().length) })));
  box.append(el('button', {
    class: 'col-item' + (state.view === 'new' ? ' active' : ''),
    onclick: () => go({ view: 'new' }),
  }, icon('clock', 18), el('span', { class: 'cname', text: 'جديد المكتبة' })));
  box.append(el('button', {
    class: 'col-item' + (state.view === 'series' || state.view === 'seriesOne' ? ' active' : ''),
    onclick: () => go({ view: 'series' }),
    'aria-current': (state.view === 'series' || state.view === 'seriesOne') ? 'page' : null,
  }, icon('layers', 18), el('span', { class: 'cname', text: 'السلاسل' }),
     el('span', { class: 'cnum', text: num(seriesGroups().length) })));
  box.append(el('button', {
    class: 'col-item' + (state.view === 'dups' ? ' active' : ''),
    onclick: () => go({ view: 'dups' }),
  }, icon('copy', 18), el('span', { class: 'cname', text: 'الكتب المكرّرة' }), el('span', { class: 'cnum', text: num(dupGroups().size) })));

  // المجموعات مرتّبة داخل أقسامها
  if (gs.length) {
    for (const g of gs) {
      const list = g.collections.map(collectionById).filter(Boolean);
      if (!list.length) continue;
      box.append(el('div', { class: 'side-group', text: g.name }));
      for (const c of list) box.append(colButton(c, counts));
    }
  } else {
    for (const c of cols) box.append(colButton(c, counts));
  }
  // 11. la collection active doit rester visible dans le tiroir (on ne fait
  // défiler que le panneau, jamais la page)
  const act = box.querySelector('.col-item.active');
  const panel = act && act.closest('.sheet-card');
  if (act && panel && panel.scrollHeight > panel.clientHeight + 4) {
    const r = act.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    if (r.top < pr.top) panel.scrollTop += r.top - pr.top - 8;
    else if (r.bottom > pr.bottom) panel.scrollTop += r.bottom - pr.bottom + 8;
  }
}

/* ---------------- البطاقات ---------------- */
/* الأغلفة: نستخدم نقطة درايف الثابتة — روابط lh3 المخزّنة في الفهرس تنتهي صلاحيتها (403) */
function thumbUrl(it) {
  return `https://drive.google.com/thumbnail?id=${it.id}&sz=w600`;
}

/* توزيع طلبات الأغلفة: ستّة طلبات فورًا ثم واحدة كل 60ms — بدل إطلاق 60 طلبًا في اللحظة
   نفسها فترفض درايف بعضها. العدّاد يُصفَّر مع كل رسم (view جديد = دفعة جديدة). */
const COVER_BURST = 6;
let coverStarted = 0;

function scheduleCover(start) {
  const n = coverStarted++;
  if (n < COVER_BURST) { start(); return; }
  setTimeout(start, 60 * (n - COVER_BURST + 1));
}

/** صورة غلاف بنقطة درايف الثابتة + إعادة محاولة قبل الاستغناء عنها */
function coverImg(id, { remove = false, badge = null, alt = '', onFail = null } = {}) {
  // referrerpolicy=no-referrer إلزامي: درايف يردّ 429 على طلب الصورة إذا جاء ومعه
  // Referer من localhost — فيظهر الغلاف فارغًا في المتصفّح بينما curl يعمل.
  const img = el('img', { alt, decoding: 'async', referrerpolicy: 'no-referrer' });
  const base = `https://drive.google.com/thumbnail?id=${id}&sz=w600`;
  // ثلاث محاولات: نفس النقطة، ثم إعادة طلب، ثم مضيف آخر يخدم الصورة مباشرة
  const urls = [base, `${base}&r=1`, `https://lh3.googleusercontent.com/d/${id}=w600`];
  img.dataset.thumb = urls[0];                // الرابط المقصود (يبقى معروفًا حتى قبل التحميل)
  let tries = 0;
  const request = () => { img.src = urls[Math.min(tries, urls.length - 1)]; };
  img.addEventListener('error', () => {
    if (tries < urls.length - 1) {
      tries += 1;
      img.dataset.thumb = urls[tries];
      setTimeout(request, 400 * tries);
      return;
    }
    if (onFail) onFail(img);
    else if (remove) img.remove();
    else if (badge) img.replaceWith(badge);
  });
  scheduleCover(request);
  return img;
}

/** غلاف بديل للكتب التي لا تُعرض صورتها: صفحة عنوان مصغّرة (اسم الكتاب + المؤلف) */
function fallbackCover(it, variant = '') {
  const raw = it.workName || it.name || '';
  const title = raw.replace(/\.[a-z0-9]{1,6}$/i, '').replace(/\s*[-–—]\s*\d+$/, '').trim() || raw;
  const initial = (title.match(/[\p{L}\p{N}]/u) || ['م'])[0];
  return el('div', { class: `cover-fallback ${variant} ${it.kind || 'other'}`.replace(/\s+/g, ' ').trim(), 'aria-hidden': 'true' },
    el('span', { class: 'cf-spine' }),
    el('span', { class: 'cf-initial', text: initial }),
    el('span', { class: 'cf-title', text: title }),
    it.author ? el('span', { class: 'cf-author', text: it.author }) : null);
}

/* شريط أغلفة متحرّك بلا نهاية: نسختان متطابقتان من نفس القائمة = حزام متّصل.
   الحركة تُدار بـ requestAnimationFrame لا بـ CSS animation: لا تتوقّف عند hover،
   ولا تتأثّر بإعدادات تقليل الحركة، وتستمرّ ما دام الحزام معروضًا. */
const BELT_SPEED = 42;                   // بكسل/ثانية (يمين ← يسار)

function startBelt(track) {
  /* مؤقّت ثابت بدل requestAnimationFrame: بعض المتصفّحات/الـWebView توقف rAF
     أو تبطّئه بشدّة فتتجمّد الحركة. 33ms (~30 إطارًا/ث) ناعم بما يكفي لحزام بطيء. */
  let pos = 0;
  let half = 0;
  let prev = 0;
  let timer = 0;
  /* في RTL يبدأ الصف من اليمين ويمتدّ يسارًا: تحريك سالب يُفرغ الحافة اليمنى
     فيبدو الحزام كأنه «مرّ ثلاثة ثم توقّف». لذلك نحرّك موجبًا في RTL. */
  const sign = () => {
    try { return (window.getComputedStyle(track).direction === 'rtl') ? 1 : -1; }
    catch { return 1; }
  };

  /* العرض يُحسب من غلاف واحد × العدد: scrollWidth قد يُقرأ ناقصًا على بعض
     متصفّحات أندرويد فيبدو الحزام قصيرًا (يمرّ ثلاثة ثم يعود). */
  const measure = () => {
    const n = track.children.length;
    const first = track.firstElementChild;
    let cw = 0;
    let gap = 0;
    if (first) {
      const r = first.getBoundingClientRect?.();
      cw = Math.round((r && r.width) || first.offsetWidth || 0);
      try {
        const cs = window.getComputedStyle(first);
        const g = parseFloat(cs.marginInlineEnd || cs.marginRight || '');
        gap = Number.isFinite(g) ? Math.round(g) : 10;
      } catch { gap = 10; }
    }
    if (cw > 0 && n > 1) {
      const total = n * (cw + gap);
      track.style.width = `${total}px`;          // عرض صريح بدل max-content
      half = Math.round(total / 2);
    } else {
      half = Math.round(track.scrollWidth / 2);  // بديل
    }
  };

  let ticks = 0;
  let sent = 0;
  /* تشخيص صامت: كل ~5 ثوانٍ يرسل حالة الحزام إلى سجل السيرفر (لا شيء على الشاشة) */
  const report = () => {
    if (sent >= 6) return;
    sent += 1;
    try {
      fetch('/api/diag?m=' + encodeURIComponent(
        `belt pos=${pos.toFixed(0)} half=${half} covers=${track.children.length} ` +
        `w=${track.style.width} ow=${track.offsetWidth} dir=${window.getComputedStyle(track).direction} vis=${document.visibilityState}`));
    } catch (e) { /* بلا شبكة */ }
  };

  const tick = () => {
    if (!track.isConnected) { clearInterval(timer); timer = 0; return; }
    if (++ticks % 150 === 0) report();
    const now = Date.now();
    if (!prev) prev = now;
    const dt = Math.min((now - prev) / 1000, 0.25);   // لا قفزة بعد تجميد التبويب
    prev = now;
    if (half > 0) {
      pos = (pos + BELT_SPEED * dt) % half;           // الْتفاف سلس عند نصف العرض
      track.style.transform = `translate3d(${(sign() * pos).toFixed(2)}px, 0, 0)`;
    }
  };

  const start = () => {
    measure();
    if (timer || !half || !track.offsetWidth) return;  // jsdom: تخطيط صفري → بلا حركة
    prev = 0;
    timer = setInterval(tick, 33);
    timer.unref?.();
  };

  start();

  /* مراقب: لو توقّف المؤقّت لأي سبب أعِده؛ ولو غادرنا الرئيسية نظّف كل شيء */
  const dog = setInterval(() => {
    if (!track.isConnected) { clearInterval(dog); if (timer) clearInterval(timer); timer = 0; return; }
    measure();
    if (!timer) start();
  }, 1500);
  dog.unref?.();

  window.addEventListener('resize', measure, { passive: true });
}

/** الحزام: نفس الأغلفة مرّتين متتاليتين حتى يلتفّ بلا فجوة */
function heroBelt(ids) {
  const box = el('div', { class: 'hero-mosaic hero-belt', 'aria-hidden': 'true' });
  const track = el('div', { class: 'hero-track' });
  for (const id of [...ids, ...ids]) track.append(heroCover(id));
  box.append(track);
  startBelt(track);
  return box;
}

/** غلاف في واجهة المكتبة: صورة بحجم ثابت، وعند فشلها صفحة عنوان — لا يختفي شيء */
function heroCover(id) {
  const box = el('div', { class: 'hero-cover' });
  const img = el('img', { alt: '', decoding: 'async', referrerpolicy: 'no-referrer' });
  const urls = [
    `https://drive.google.com/thumbnail?id=${id}&sz=w600`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w600&r=1`,
    `https://lh3.googleusercontent.com/d/${id}=w600`,
  ];
  let tries = 0;
  const paint = () => { img.src = urls[Math.min(tries, urls.length - 1)]; };
  img.addEventListener('error', () => {
    if (tries < urls.length - 1) { tries += 1; paint(); return; }
    img.replaceWith(fallbackCover(item(id) || { id, name: '' }, 'inline'));
  });
  paint();
  box.append(img);
  return box;
}

function fileCard(r) {
  const it = item(r.id);
  const label = it.display || it.name;      // عنوان الغلاف إن وُجد، وإلا اسم الملف
  const author = it.author || it.title_author || '';
  // فشل تحميل الغلاف: درايف يرفض بعض الطلبات إذا طُلبت عشرات الصور في اللحظة نفسها،
  // فيُعاد الطلب مرّتين قبل استبدال الصورة بشارة النوع (وإلا بقيت البطاقة رمادية دائمًا).
  const img = coverImg(it.id, { onFail: (node) => node.replaceWith(fallbackCover(it)) });
  const cover = el('div', { class: 'cover' },
    el('span', { class: 'fmt', text: it.ext ? it.ext.toUpperCase() : fmtSize(it.kind) }),
    img);
  // 1. cascade : les 12 premières cartes seulement reçoivent un retard (0, 30, 60 … 330 ms)
  const idx = fileCard._i || 0;
  fileCard._i = idx + 1;
  const card = el('article', {
    class: 'card', tabindex: '0', title: it.path?.length ? `${it.path.join(' › ')}\n${label}` : label,
    style: idx < 12 ? `--i:${idx}` : null,
    onclick: () => { if (state.selecting) { togglePick(it.id, card); return; } openReader(it.id, listIds()); },
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (state.selecting) { togglePick(it.id, card); return; }
        openReader(it.id, listIds());
      }
    },
  }, cover,
    el('div', { class: 'title', text: label }),
    author ? el('button', {
      class: 'author-line', type: 'button', title: `كل كتب ${author}`,
      onclick: (e) => { e.stopPropagation(); go({ view: 'author', author: normalizeAr(author) }); },
    }, icon('user', 13), el('span', { text: author })) : null,
    el('div', { class: 'meta' },
      el('span', { text: (it.size ? fmtBytes(it.size) : fmtSize(it.kind)) }),
      it.issue ? el('span', { class: 'issue', text: `العدد ${num(it.issue)}` }) : el('span', { text: fmtDate(it.modified) })));
  if (it.dup) card.append(el('div', { class: 'badge-dup', text: 'مكرر' }));
  if (isNew(it)) card.append(el('div', { class: 'badge-new', text: 'جديد' }));
  if (isFav(it.id)) card.append(el('div', { class: 'badge-fav', title: 'في المفضلة' }, icon('heart', 14)));
  if (author) card.dataset.author = author;
  // حالة القراءة: نقطة على الغلاف (قيد القراءة / تمّت قراءته)
  const st = statusOf(it.id);
  if (st) cover.append(el('span', { class: 'status-dot ' + st, title: st === 'done' ? 'تمّت قراءته' : 'قيد القراءة' }));
  // وضع التحديد: مربّع اختيار على البطاقة
  if (state.selecting) {
    card.classList.add('selectable');
    if (SELECTED.has(it.id)) card.classList.add('picked');
    cover.append(el('span', { class: 'pick' }, icon('check', 14)));
  }
  // أزرار سريعة: مفضلة + تحميل + فتح في درايف
  const favBtn = el('button', {
    class: 'qbtn fav' + (isFav(it.id) ? ' on' : ''), title: isFav(it.id) ? 'إزالة من المفضلة' : 'أضف إلى المفضلة',
    onclick: (e) => {
      e.stopPropagation();
      const added = toggleFav(it.id);
      favBtn.classList.toggle('on', added);
      favBtn.title = added ? 'إزالة من المفضلة' : 'أضف إلى المفضلة';
      toast(added ? 'أُضيف إلى المفضلة' : 'أُزيل من المفضلة');
      renderCatbar();
      if (state.view === 'favs') render();
    },
  }, icon('heart', 17));
  const quick = el('div', { class: 'quick' },
    favBtn,
    el('a', { class: 'qbtn', href: driveDownload(it.id), download: it.name, title: 'تحميل', onclick: (e) => e.stopPropagation() }, icon('download', 17)),
    el('a', { class: 'qbtn', href: driveView(it.id), target: '_blank', rel: 'noopener', title: 'فتح في درايف', onclick: (e) => e.stopPropagation() }, icon('external', 17)));
  cover.append(quick);
  return card;
}

/** بطاقة عمل له عدة مجلدات: غلاف المجلد الأول + عدد المجلدات + فتح/إخفاء القائمة */
function workCard(rows) {
  const first = rows[0];
  const key = workKeyOf(first);
  const open = EXPANDED.has(key);
  const it = item(first.id);
  const img = coverImg(first.id, { onFail: (node) => node.replaceWith(fallbackCover({ ...it, workName: first.workName || it.name })) });
  const cover = el('div', { class: 'cover' },
    el('span', { class: 'fmt', text: `${num(rows.length)} مجلدات` }),
    img);
  const vols = rows.map((r) => r.vol).filter(Boolean);
  const label = it.display || first.workName || it.name;
  return el('article', {
    class: 'card work-card', tabindex: '0',
    title: `${label} — ${rows.length} مجلدات`,
    onclick: () => openReader(first.id, rows.map((r) => r.id)),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReader(first.id, rows.map((r) => r.id)); } },
  }, cover,
    el('div', { class: 'title', text: label }),
    el('div', { class: 'meta' },
      el('span', { text: `${num(rows.length)} مجلدات` }),
      el('span', { text: vols.length ? `المجلدات ${vols[0]}–${vols[vols.length - 1]}` : '' })),
    el('button', {
      class: 'work-toggle', type: 'button',
      onclick: (e) => {
        e.stopPropagation();
        if (open) EXPANDED.delete(key); else EXPANDED.add(key);
        render();
      },
    }, icon(open ? 'chevronUp' : 'chevronDown', 15),
       el('span', { text: open ? 'إخفاء المجلدات' : 'عرض المجلدات' })));
}

function folderCard(node) {
  const card = el('article', {
    class: 'card badge-folder', tabindex: '0', title: node.n,
    onclick: () => go({ view: 'browse', collectionId: state.collectionId, folderId: node.id }),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go({ view: 'browse', collectionId: state.collectionId, folderId: node.id }); } },
  },
    el('div', { class: 'cover' }, el('span', { class: 'noimg' }, icon('folder', 44))),
    el('div', { class: 'count', text: String(node.n_files ?? countFiles(node)) }),
    el('div', { class: 'title', text: node.n }),
    el('div', { class: 'meta' },
      el('span', { text: node.n_subs ? `${node.n_subs} مجلد فرعي` : 'مجلد' }),
      el('span', { text: `${node.n_files ?? countFiles(node)} ملف` })));
  return card;
}

function countFiles(node) {
  let n = 0;
  for (const c of node.c || []) n += c.t === 'f' ? 1 : countFiles(c);
  return n;
}

/* ---------------- الترتيب والتصفية ---------------- */
const labelOf = (r) => (r && (r.display || r.name)) || '';   // عنوان العرض للترتيب

function sortFiles(rows) {
  const s = state.sort;
  const arr = rows.slice();
  if (s === 'modified') {
    arr.sort((a, b) => (parseDriveDate(b.modified) || 0) - (parseDriveDate(a.modified) || 0));
  } else if (s === 'kind') {
    arr.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || arabicCollator.compare(labelOf(a), labelOf(b)));
  } else if (s === 'size') {
    arr.sort((a, b) => {
      const A = item(a.id).size || Infinity, B = item(b.id).size || Infinity;
      return A - B || arabicCollator.compare(labelOf(a), labelOf(b));
    });
  } else if (s === 'size-desc') {
    arr.sort((a, b) => (item(b.id).size || 0) - (item(a.id).size || 0) || arabicCollator.compare(labelOf(a), labelOf(b)));
  } else if (s === 'issue') {
    arr.sort((a, b) => (a.issue || 99999) - (b.issue || 99999) || arabicCollator.compare(labelOf(a), labelOf(b)));
  } else if (s === 'name-desc') {
    arr.sort((a, b) => arabicCollator.compare(labelOf(b), labelOf(a)));
  } else {
    arr.sort((a, b) => arabicCollator.compare(labelOf(a), labelOf(b)));
  }
  return arr;
}
function parseDriveDate(d) {
  const m = (d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return 0;
  let [, mo, da, yr] = m; if (yr.length === 2) yr = '20' + yr;
  return Date.UTC(+yr, +mo - 1, +da);
}

/* ---------------- العرض ---------------- */
let CURRENT_LIST = [];
function listIds() { return CURRENT_LIST; }

/** يرسم البطاقات على دفعات (PAGE_SIZE) مع زر «عرض المزيد» */
function pagedList(box, rows, makeNode) {
  let i = 0;
  const step = () => {
    const end = Math.min(i + PAGE_SIZE, rows.length);
    for (; i < end; i++) box.append(makeNode(rows[i], i));
    const old = box.querySelector('#moreWrap');
    if (old) old.remove();
    const left = rows.length - i;
    if (left > 0) {
      box.append(el('div', { class: 'more-wrap', id: 'moreWrap' },
        el('button', { class: 'btn more-btn', onclick: step },
          icon('chevronDown', 18),
          el('span', { text: `عرض المزيد — ${num(left)} متبقٍ` }))));
    }
  };
  step();
}

function render() {
  coverStarted = 0;          // كل رسم = دفعة أغلفة جديدة
  fileCard._i = 0;           // сброс счётчика каскадной анимации карточек
  renderCollections();
  renderCatbar();
  renderCrumbs();
  const grid = $('#grid');
  grid.innerHTML = '';
  const toolbar = $('#toolbar');
  $('#empty').hidden = true;

  toolbar.hidden = true;
  grid.dataset.density = state.density || 'md';
  syncFiltersPanel();
  renderLetterJump(false);
  $('#filtersBtn').hidden = state.view === 'home';
  const canSelect = ['browse', 'search', 'author', 'favs', 'new', 'seriesOne'].includes(state.view);
  $('#selectBtn').hidden = !canSelect;
  if ((!canSelect || state.view === 'home') && state.selecting) {
    state.selecting = false;
    SELECTED.clear();
    $('#selectBtn').setAttribute('aria-pressed', 'false');
    updateSelectBar();
  }
  grid.classList.toggle('home', state.view === 'home');
  grid.classList.toggle('list', !!state.listView && state.view !== 'home');

  if (state.view === 'home') {
    renderHome(grid);
    return;
  }

  if (state.view === 'authors') {
    const q = (state.query || '').trim();
    let list = findAuthors(q, 100000);        // بلا سقف: العرض على دفعات أسفل الصفحة
    if (state.letter) list = list.filter((au) => au.key.startsWith(state.letter));
    toolbar.hidden = false;
    renderLetterBar();
    $('#crumbs').append(el('span', {
      text: q ? `المؤلفون — نتائج «${q}»: ${num(list.length)}`
              : `المؤلفون — ${num(list.length)} مؤلفًا (اضغط اسمًا لعرض كتبه)`,
    }));
    if (!list.length) return showEmpty('لا مؤلفين', 'جرّب جزءًا من الاسم أو حرفًا آخر.',
      [['كل المؤلفين', () => { $('#q').value = ''; state.query = ''; state.letter = ''; render(); }, true]]);
    const box = el('div', { class: 'author-grid' });
    pagedList(box, list, (au) => el('button', {
      class: 'author-chip', type: 'button', title: `كتب ${au.name}`,
      onclick: () => go({ view: 'author', author: au.key }),
    }, icon('user', 15), el('span', { class: 'aname', text: au.name }), el('span', { class: 'acount', text: num(au.count) })));
    grid.append(box);
    return;
  }

  if (state.view === 'author') {
    const au = authorByName(state.author);
    const rows = applyJump(sortFiles(booksByAuthor(state.author).map((r) => r)));
    CURRENT_LIST = rows.map((r) => r.id);
    toolbar.hidden = false;
    renderChips();
    renderLetterJump(true);
    $('#crumbs').append(el('span', { text: `المؤلف: ${au ? au.name : '—'} — ${num(rows.length)} كتاب` }));
    if (!rows.length) return showEmpty('لا كتب', 'لا كتب لهذا المؤلف.',
      [['كل المؤلفين', () => go({ view: 'authors' }), true]]);
    pagedList(grid, rows, fileCard);
    return;
  }

  if (state.view === 'new') {
    toolbar.hidden = false;
    renderYearChips();
    const rows = applyJump(newRows({ year: state.year }));
    CURRENT_LIST = rows.map((r) => r.id);
    renderLetterJump(true);
    $('#crumbs').append(el('span', {
      text: state.year ? `جديد المكتبة — أُضيف في ${state.year}: ${num(rows.length)} كتاب`
                       : `جديد المكتبة — ${num(rows.length)} كتاب (الأحدث تعديلًا أولًا)`,
    }));
    if (!rows.length) return showEmpty('لا شيء هنا', 'اختر سنة أخرى أو أزل ترشيح الحرف.',
      [['كل السنوات', () => { state.year = 0; state.jumpLetter = ''; saveState(); render(); }, true]]);
    pagedList(grid, rows, fileCard);
    return;
  }

  if (state.view === 'dups') {
    const groups = Array.from(dupGroups().entries());
    $('#crumbs').append(el('span', { text: `الكتب المكرّرة — ${num(groups.length)} عملًا في أكثر من مجموعة` }));
    if (!groups.length) return showEmpty('لا تكرار', 'كل كتاب موجود في مجموعة واحدة.',
      [['تصفّح المكتبة', () => go({ view: 'home' }), true]]);
    const wrap = el('div', { class: 'dup-list' });
    pagedList(wrap, groups, ([nm, rows]) => dupGroupCard(nm, rows));
    grid.append(wrap);
    return;
  }

  if (state.view === 'favs') {
    const favSet = new Set(favIds());
    const rows = applyJump(sortFiles(allRows().filter((r) => favSet.has(r.id))));
    CURRENT_LIST = rows.map((r) => r.id);
    toolbar.hidden = false;
    renderLetterJump(true);
    $('#crumbs').append(el('span', { text: `المفضلة — ${num(rows.length)} كتاب` }));
    if (!rows.length) return showEmpty('لا مفضلة بعد', 'اضغط القلب على أي كتاب ليُحفظ هنا في جهازك.',
      [['تصفّح المكتبة', () => go({ view: 'home' }), true]]);
    pagedList(grid, rows, fileCard);
    return;
  }

  if (state.view === 'search') {
    let res = search(state.query, { kind: state.kind, collection: state.scope === 'current' ? state.collectionId : null });
    if (state.hideDup) res = res.filter((r) => !r.dup);
    const rows = applyJump(sortFiles(res));
    CURRENT_LIST = rows.map((r) => r.id);
    toolbar.hidden = false;
    renderChips();
    renderLetterJump(true);
    $('#crumbs').append(el('span', { role: 'status', text: `نتائج البحث عن «${state.query}» — ${num(rows.length)} ملف` }));
    if (!rows.length) return showEmpty('لا نتائج', 'جرّب كلمات أقل أو أزل المرشّحات.',
      [['امسح البحث', () => { $('#q').value = ''; go({ view: 'home' }); }, true],
       ['ابحث في كل المكتبة', () => { state.scope = 'all'; saveState(); render(); }, false]]);
    pagedList(grid, rows, fileCard);
    return;
  }

  if (state.view === 'series') {
    const list = seriesGroups();
    toolbar.hidden = false;
    $('#crumbs').append(el('span', { text: `السلاسل المرقّمة — ${num(list.length)} سلسلة` }));
    if (!list.length) return showEmpty('لا سلاسل', 'لم يُعثر على كتب مرقّمة بأعداد.',
      [['تصفّح المكتبة', () => go({ view: 'home' }), true]]);
    const box = el('div', { class: 'series-grid' });
    pagedList(box, list, (g) => el('button', {
      class: 'series-card', type: 'button', title: `فتح سلسلة ${g.name}`,
      onclick: () => go({ view: 'seriesOne', series: g.name }),
    },
      el('span', { class: 'sc-covers' }, g.ids.map((id) => coverImg(id, { remove: true }))),
      el('span', { class: 'sc-name' }, icon('layers', 16), el('span', { text: g.name })),
      el('span', { class: 'sc-meta' },
        el('span', { text: `${num(g.count)} عددًا` }),
        el('span', { class: 'dot', text: '·' }),
        el('span', { text: `الأعداد ${num(g.min)}–${num(g.max)}` }))));
    grid.append(box);
    return;
  }

  if (state.view === 'seriesOne') {
    const all = seriesRows().filter((r) => r.series === state.series);
    const rows = applyJump(sortFiles(all));
    CURRENT_LIST = rows.map((r) => r.id);
    toolbar.hidden = false;
    renderChips();
    renderLetterJump(true);
    $('#crumbs').append(el('span', { text: `السلسلة: ${state.series} — ${num(rows.length)} عددًا` }));
    if (!rows.length) {
      if (state.jumpLetter) {
        return showEmpty('لا أعداد بهذا الحرف', `لا عنوان في هذه السلسلة يبدأ بالحرف «${state.jumpLetter}».`,
          [['امسح الحرف', () => { state.jumpLetter = ''; render(); }, true],
           ['كل السلاسل', () => go({ view: 'series' }), false]]);
      }
      return showEmpty('لا أعداد', 'اختر سلسلة أخرى من القائمة.',
        [['كل السلاسل', () => go({ view: 'series' }), true]]);
    }
    pagedList(grid, rows, fileCard);
    return;
  }

  // browse
  const node = getTree(state.folderId) || catalog().collections.find((c) => c.id === state.collectionId)?.tree;
  if (!node) return showEmpty('مجلد فارغ', 'اختر مجموعة أخرى من القائمة.',
    [['المجموعات', openSheet, true]]);
  toolbar.hidden = false;
  renderChips();
  renderLetterJump(true);

  // ترويسة المجموعة عند جذرها (اسم + وصف + عدد + حجم)
  const coll = state.collectionId ? collectionById(state.collectionId) : null;
  if (coll && state.folderId === (coll.tree?.id || coll.id)) grid.append(collectionHead(coll));

  const subs = (node.c || []).filter((c) => c.t === 'd');
  let fileRows = (node.c || [])
    .filter((c) => c.t === 'f' && item(c.id))
    .map((c) => item(c.id));
  if (state.hideDup) fileRows = fileRows.filter((f) => !f.dup);
  const files = applyJump(sortFiles(fileRows));
  CURRENT_LIST = files.map((f) => f.id);

  // الملفات: تُجمع مجلدات العمل الواحد في بطاقة واحدة عند تفعيل «تجميع المجلدات»
  const fileEntries = [];
  if (state.groupVols) {
    const byWork = new Map();
    for (const f of files) {
      const k = workKeyOf(f);
      if (k) { if (!byWork.has(k)) byWork.set(k, []); byWork.get(k).push(f); }
    }
    // نحافظ على الترتيب الذي اختاره المستخدم (اسم/حجم/تاريخ/رقم العدد):
    // بطاقة العمل تظهر في موضع أول مجلد منه، وبقية المجلدات تحتها لا في مكان آخر.
    const placed = new Set();
    for (const f of files) {
      const k = workKeyOf(f);
      if (!k) { fileEntries.push({ t: 'f', ref: f, n: f.name }); continue; }
      if (placed.has(k)) continue;
      placed.add(k);
      const list = byWork.get(k).slice().sort((x, y) => x.vol - y.vol);
      fileEntries.push({ t: 'w', key: k, rows: list, n: list[0].workName || list[0].name });
      if (EXPANDED.has(k)) {
        for (const r of list) fileEntries.push({ t: 'f', ref: r, sub: true, n: r.name });
      }
    }
  } else {
    for (const f of files) fileEntries.push({ t: 'f', ref: f, n: f.name });
  }

  // الترتيب: المجلدات أوّلًا ثم الملفات — أو مختلط بالاسم — والرسم تدريجي
  let entries;
  if (state.foldersFirst) {
    entries = [...subs.map((s) => ({ t: 'd', ref: s })), ...fileEntries];
  } else {
    const mix = [...subs.map((s) => ({ t: 'd', ref: s, n: s.n })), ...fileEntries];
    mix.sort((a, b) => arabicCollator.compare(a.n || '', b.n || ''));
    entries = mix;
  }
  pagedList(grid, entries, (e) => {
    if (e.t === 'd') return folderCard(e.ref);
    if (e.t === 'w') return workCard(e.rows);
    const card = fileCard(e.ref);
    if (e.sub) card.classList.add('vol-child');
    return card;
  });
  if (!entries.length) {
    if (state.jumpLetter) {
      return showEmpty('لا كتب بهذا الحرف', `لا ملفات تبدأ بالحرف «${state.jumpLetter}» في هذا المجلد.`,
        [['امسح الحرف', () => { state.jumpLetter = ''; render(); }, true],
         ['كل المجموعات', openSheet, false]]);
    }
    return showEmpty('مجلد فارغ', 'لا ملفات ولا مجلدات هنا.', [['المجموعات', openSheet, true]]);
  }
}

function renderHome(grid) {
  const cat = catalog();
  const total = cat.total || 0;
  const cols = cat.collections || [];
  const gs = groups();
  const picks = randomPick(12, 'pdf');

  grid.classList.add('home');
  // فسيفساء أغلفة حقيقية خلف العنوان — الصفحة تُقرأ كمكتبة من النظرة الأولى
  // 14 غلافًا مختلفًا تتكرّر مرّتين → حزام طويل لا ينقطع
  const mosaicIds = [...new Set(picks.concat(randomPick(20, 'pdf')).map((p) => p.id))].slice(0, 14);
  grid.append(el('div', { class: 'hero' },
    heroBelt(mosaicIds),
    el('h1', { text: 'مكتبة محمد العماري' }),
    el('p', { text: 'مكتبة رقمية عربية — تصفّح، اقرأ داخل الموقع، وحمّل ما تشاء.' }),
    el('div', { class: 'hero-actions' },
      el('button', { class: 'btn primary', onclick: () => $('#q').focus() }, icon('search', 18), el('span', { text: 'ابحث في المكتبة' })),
      el('button', { class: 'btn', onclick: () => { state.scope = 'all'; shuffle(); } }, icon('shuffle', 18), el('span', { text: 'كتاب عشوائي' })),
      el('button', { class: 'btn', onclick: () => go({ view: 'favs' }) }, icon('heart', 18), el('span', { text: 'المفضلة' })),
      el('button', { class: 'btn', onclick: showStats }, icon('chart', 18), el('span', { text: 'إحصاء المكتبة' }))),
    el('div', { class: 'hero-stats' },
      stat('كتاب', total),
      stat('مجموعة', cols.length),
      el('div', { class: 'stat' }, el('b', { text: cat.total_bytes ? fmtBytes(cat.total_bytes) : '—' }), el('span', { text: 'الحجم' })),
      stat('أقسام', gs.length))));

  // الأقسام في صناديق: اثنان في الصف على الجوال وثلاثة على الشاشات الأوسع
  const counts = collectionCounts();
  const sections = gs.length
    ? gs.map((g) => ({ name: g.name, count: g.count, bytes: g.bytes, list: g.collections.map(collectionById).filter(Boolean) }))
    : [{ name: 'كل المجموعات', count: total, bytes: cat.total_bytes, list: cols }];
  const secGrid = el('div', { class: 'sec-grid' });
  sections.forEach((sec, i) => { if (sec.list.length) secGrid.append(sectionBox(sec, counts, i)); });
  if (secGrid.children.length) grid.append(secGrid);

  // جديد منذ آخر زيارة (مقارنة بتاريخ تعديل الملف بآخر فتح للتطبيق)
  const lv = lastVisit();
  if (lv) {
    const fresh = allRows().filter((r) => dateNum(r.modified) > lv);
    if (fresh.length) {
      grid.append(el('div', { class: 'whatsnew' },
        el('span', { class: 'wn-ico' }, icon('clock', 17)),
        el('span', { class: 'wn-text', text: `جديد منذ آخر زيارة — ${num(fresh.length)} كتاب` }),
        el('button', { class: 'btn small', onclick: () => go({ view: 'new' }) },
          el('span', { text: 'استعرض' }))));
    }
  }

  // آخر ما قرأت — «قيد القراءة» يتقدّم الصف ويُعدّ في الشارة
  const recent = recentIds().map(item).filter(Boolean).slice(0, 12);
  if (recent.length) {
    const isReading = (r) => statusOf(r.id) === 'reading';
    const readingN = recent.filter(isReading).length;
    const stripRows = recent.slice().sort((a, b) => (isReading(b) - isReading(a)));
    grid.append(el('h2', { class: 'sec-title' },
      el('span', { text: 'آخر ما قرأت' }),
      el('span', { class: 'sec-count', text: `${num(stripRows.length)} كتاب` }),
      readingN ? el('span', { class: 'sec-note', text: `قيد القراءة: ${num(readingN)}` }) : null));
    const strip = el('div', { class: 'strip' });
    for (const r of stripRows) strip.append(fileCard(r));
    grid.append(strip);
  }

  if (picks.length) {
    grid.append(el('h2', { class: 'sec-title', text: 'اختيارات عشوائية' }));
    const wrap = el('div', { class: 'grid-inner' });
    // صفّان فقط: عدد البطاقات = 2 × عدد الأعمدة التي تتّسع للعرض الحالي
    const avail = grid.clientWidth || window.innerWidth || 1200;
    const cols = Math.max(2, Math.min(6, Math.floor((avail + 16) / 206)));
    for (const p of picks.slice(0, Math.min(cols * 2, picks.length))) {
      wrap.append(fileCard({ id: p.id, name: p.name }));
    }
    wrap.style.gridTemplateRows = 'repeat(2, auto)';
    grid.append(wrap);
  }

  // 2. comptage animé des stats du héros (une fois, ~500 ms)
  countUp('.hero-stats .stat b[data-count]');
}

/** Stat avec valeur animée (count-up) — chiffres latins uniquement */
function stat(label, value) {
  return el('div', { class: 'stat' },
    el('b', { text: num(value), 'data-count': String(value) }),
    el('span', { text: label }));
}

/** Anime les éléments [data-count] : 0 → valeur en ~500ms (chiffres latins) */
function countUp(selector) {
  const nodes = document.querySelectorAll(selector);
  if (!nodes.length) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  for (const node of nodes) {
    const target = parseInt(node.dataset.count, 10);
    if (Number.isNaN(target) || target <= 0) continue;
    const dur = 500;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/** صندوق قسم: العنوان + العدد والحجم + أغلفة كاملة + مجموعاته (نقرة لكل مجموعة) */
function sectionBox(sec, counts, index = 0) {
  // ستة أغلفة في كل قسم: تُوزَّع بالتناوب على مجموعات القسم (3+3 عند وجود مجموعتين)
  const samples = [];
  const pools = sec.list.map((c) => (c.sample || []).map((fid) => ({ id: fid, coll: c.name })));
  for (let round = 0; round < COVERS_PER_BOX && samples.length < COVERS_PER_BOX; round++) {
    for (const pool of pools) {
      const s = pool[round];
      if (s && samples.length < COVERS_PER_BOX && !samples.some((x) => x.id === s.id)) samples.push(s);
    }
  }
  const ids = samples.map((s) => s.id);
  const covers = samples.length
    ? el('div', { class: 'sec-covers' }, samples.map((s) => {
        const btn = el('button', { class: 'sec-cover', type: 'button', title: `اقرأ: ${s.coll}` });
        btn.append(coverImg(s.id, { onFail: (img) => img.replaceWith(fallbackCover(item(s.id) || { id: s.id, name: s.coll })) }));
        btn.addEventListener('click', () => openReader(s.id, ids));
        return btn;
      }))
    : null;
  const rows = el('div', { class: 'sec-cols' });
  for (const c of sec.list) {
    rows.append(el('button', {
      class: 'sec-col', type: 'button',
      title: c.desc ? `${c.name} — ${c.desc}` : c.name,
      onclick: () => go({ view: 'browse', collectionId: c.id, folderId: c.tree?.id || c.id }),
    },
      icon('book', 15),
      el('span', { class: 'cname', text: c.name }),
      el('span', { class: 'cnum', text: num(counts[c.id] ?? c.count ?? 0) })));
  }
  return el('section', { class: `sec-box sec-${(index % 5) + 1}` },
    el('div', { class: 'sec-box-head' },
      el('h3', { text: sec.name }),
      el('div', { class: 'sec-box-meta' },
        el('span', { class: 'n', text: `${num(sec.count)} كتاب` }),
        sec.bytes ? el('span', { class: 's', text: fmtBytes(sec.bytes) }) : null)),
    covers,
    rows);
}

/** ترويسة المجموعة داخل صفحة التصفّح */
function collectionHead(c) {
  return el('div', { class: `coll-head ${sectionClassOf(c.id)}` },
    el('h2', { text: c.name }),
    c.desc ? el('p', { class: 'cdesc', text: c.desc }) : null,
    el('div', { class: 'meta' },
      el('span', { text: `${num(c.count)} كتاب` }),
      c.bytes ? el('span', { text: fmtBytes(c.bytes) }) : null,
      el('span', { text: `المجموعة: ${c.group || '—'}` })));
}

function shuffle() {
  const p = randomPick(1, 'all')[0];
  if (!p) return toast('لا ملفات متاحة');
  go({ view: 'browse', collectionId: p.collection, folderId: null });
  const anc = ancestors(p.id);
  if (anc.length > 1) go({ view: 'browse', collectionId: p.collection, folderId: anc[anc.length - 1].id });
  const list = CURRENT_LIST.length ? CURRENT_LIST : [p.id];
  openReader(p.id, list.includes(p.id) ? list : [p.id, ...list]);
}

function renderCrumbs() {
  const c = $('#crumbs');
  c.innerHTML = '';
  if (state.view === 'home') return;
  c.append(el('button', { onclick: () => go({ view: 'home' }) }, icon('home', 15), el('span', { text: 'الرئيسية' })));

  if (state.collectionId) {
    const coll = (catalog().collections || []).find((x) => x.id === state.collectionId);
    if (coll) {
      c.append(el('span', { class: 'sep', text: '›' }));
      c.append(el('button', { onclick: () => go({ view: 'browse', collectionId: coll.id, folderId: coll.tree?.id || coll.id }) }, coll.name));
    }
  }
  if (state.view === 'browse' && state.folderId) {
    for (const a of ancestors(state.folderId)) {
      if (a.id === state.collectionId) continue;   // جذر المجموعة معروض أعلاه
      c.append(el('span', { class: 'sep', text: '›' }));
      c.append(el('button', { onclick: () => go({ view: 'browse', collectionId: state.collectionId, folderId: a.id }) }, truncate(a.name, 42)));
    }
  }
  if (state.view === 'search') {
    c.append(el('span', { class: 'sep', text: '›' }));
    c.append(el('span', { text: `بحث: ${state.query}` }));
  }
  if (state.view === 'series') {
    c.append(el('span', { class: 'sep', text: '›' }));
    c.append(el('span', { text: 'السلاسل' }));
  }
  if (state.view === 'seriesOne') {
    c.append(el('span', { class: 'sep', text: '›' }));
    c.append(el('button', { onclick: () => go({ view: 'series' }) }, 'السلاسل'));
    c.append(el('span', { class: 'sep', text: '›' }));
    c.append(el('span', { text: truncate(state.series || '', 42) }));
  }
  // ترشيح الحرف ظاهر في المسار: يوضّح سبب قِلّة النتائج ويمسحه بنقرة
  if (state.jumpLetter) {
    c.append(el('span', { class: 'sep', text: '›' }));
    c.append(el('button', {
      class: 'crumb-letter', title: 'امسح ترشيح الحرف',
      onclick: () => { state.jumpLetter = ''; render(); },
    }, el('span', { text: `الحرف: ${state.jumpLetter}` }), icon('x', 12)));
  }
}
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);

function renderChips() {
  const box = $('#kindChips');
  box.innerHTML = '';
  const counts = kindCounts();
  const mk = (key, label, iconName) => el('button', {
    class: 'chip' + (state.kind === key ? ' on' : ''),
    onclick: () => { state.kind = key; saveState(); render(); },
  }, iconName ? icon(iconName, 15) : null, el('span', { text: label }));
  box.append(mk('all', `الكل (${Object.values(counts).reduce((a, b) => a + b, 0)})`, 'layers'));
  for (const k of KIND_ORDER) {
    if (!counts[k]) continue;
    box.append(mk(k, `${fmtSize(k)} (${counts[k]})`, KIND_ICON[k]));
  }
  // نطاق البحث: كل المكتبة أم المجموعة الحالية
  if (state.view === 'search' && state.collectionId) {
    const coll = collectionById(state.collectionId);
    box.append(el('button', {
      class: 'chip' + (state.scope === 'current' ? ' on' : ''),
      title: 'اقصر البحث على المجموعة الحالية فقط',
      onclick: () => { state.scope = state.scope === 'current' ? 'all' : 'current'; saveState(); render(); },
    }, icon('book', 15), el('span', { text: `داخل «${coll ? coll.name : 'المجموعة'}»` })));
  }
  if (state.view === 'browse' || state.view === 'search') {
    box.append(el('button', {
      class: 'chip', title: 'أنزل ملفًا يحوي روابط هذا المجلد',
      onclick: exportCurrentLinks,
    }, icon('download', 15), el('span', { text: 'تصدير الروابط' })));
  }
  const dupCount = allRows().filter((r) => r.dup).length;
  if (dupCount) {
    box.append(el('button', {
      class: 'chip' + (state.hideDup ? ' on' : ''),
      title: 'كتب موجودة في أكثر من مجموعة',
      onclick: () => { state.hideDup = !state.hideDup; saveState(); render(); },
    }, icon('copy', 15), el('span', { text: `إخفاء المكرر (${dupCount})` })));
  }
  $('#sortSel').value = state.sort;
  $('#foldersFirst').checked = state.foldersFirst;
  $('#listView').checked = !!state.listView;
  const gv = $('#groupVols');
  if (gv) {
    gv.checked = !!state.groupVols;
    const wrap = $('#groupVolsWrap');
    if (wrap) wrap.hidden = state.view !== 'browse';
  }
}

/** شريط الحروف لقائمة المؤلفين (2,170 اسمًا) */
function renderLetterBar() {
  const box = $('#kindChips');
  box.innerHTML = '';
  const letters = AR_LETTERS;
  box.append(el('button', {
    class: 'chip' + (state.letter ? '' : ' on'),
    onclick: () => { state.letter = ''; saveState(); render(); },
  }, el('span', { text: 'كل الحروف' })));
  for (const L of letters) {
    box.append(el('button', {
      class: 'chip' + (state.letter === L ? ' on' : ''),
      onclick: () => { state.letter = state.letter === L ? '' : L; saveState(); render(); },
    }, el('span', { text: L })));
  }
  $('#sortSel').value = state.sort;
  $('#listView').checked = !!state.listView;
  $('#foldersFirst').checked = state.foldersFirst;
}

/** الحرف الأول للاسم بعد إزالة «ال» التعريف — للقفز بالحروف */
function letterOf(name) {
  let s = normalizeAr(name || '').trim();
  while (s.startsWith('ال')) s = s.slice(2);
  return s.charAt(0) || '#';
}

/** يرشّح الصفوف بالحرف المختار في شريط القفز (فارغ = بلا ترشيح).
    الحرف يُؤخذ من عنوان الغلاف إن وُجد — أسماء ملفات السلاسل كلها تبدأ بـ«عالم المعرفة»،
    فكان الشريط لا يرشّح شيئًا في صفحات السلاسل. */
function applyJump(rows) {
  if (!state.jumpLetter) return rows;
  return rows.filter((r) => letterOf(r.display || r.name) === state.jumpLetter);
}

/** شريط الحروف في الشبكة: نقرة على حرف = عرض كتب ذلك الحرف فقط */
function renderLetterJump(show) {
  const box = $('#letterJump');
  if (!box) return;
  box.hidden = !show;
  box.innerHTML = '';
  if (!show) return;
  box.append(el('button', {
    class: 'chip tiny' + (state.jumpLetter ? '' : ' on'),
    title: 'عرض كل الحروف',
    onclick: () => { state.jumpLetter = ''; render(); },
  }, el('span', { text: 'الكل' })));
  for (const L of AR_LETTERS) {
    box.append(el('button', {
      class: 'chip tiny' + (state.jumpLetter === L ? ' on' : ''),
      onclick: () => { state.jumpLetter = state.jumpLetter === L ? '' : L; render(); },
    }, el('span', { text: L })));
  }
}

/** السلاسل المرقّمة مجمّعة: الاسم + عدد الأعداد + مداها */
let SERIES_CACHE = null;
function seriesGroups() {
  if (SERIES_CACHE) return SERIES_CACHE;
  const m = new Map();
  for (const r of allRows()) {
    if (!r.issue || !r.series) continue;
    let g = m.get(r.series);
    if (!g) { g = { name: r.series, count: 0, min: r.issue, max: r.issue, ids: [] }; m.set(r.series, g); }
    g.count += 1;
    if (g.ids.length < 4) g.ids.push(r.id);
    if (r.issue < g.min) g.min = r.issue;
    if (r.issue > g.max) g.max = r.issue;
  }
  SERIES_CACHE = Array.from(m.values()).sort((a, b) => b.count - a.count || arabicCollator.compare(a.name, b.name));
  return SERIES_CACHE;
}

/** «جديد»: كُتب عُدّل ملفها في آخر 30 يومًا */
const NEW_WINDOW = 30 * 24 * 60 * 60 * 1000;
function isNew(it) {
  const t = dateNum(it && it.modified);
  return t > 0 && Date.now() - t < NEW_WINDOW;
}

/* ---------------- وضع «تحديد» ---------------- */
function setSelecting(on) {
  state.selecting = !!on;
  if (!on) SELECTED.clear();
  const btn = $('#selectBtn');
  if (btn) { btn.setAttribute('aria-pressed', String(state.selecting)); btn.classList.toggle('on', state.selecting); }
  updateSelectBar();
  render();
}

function togglePick(id, card) {
  if (SELECTED.has(id)) SELECTED.delete(id); else SELECTED.add(id);
  if (card) card.classList.toggle('picked', SELECTED.has(id));
  updateSelectBar();
}

function updateSelectBar() {
  const bar = $('#bulkbar');
  if (!bar) return;
  const show = state.selecting;
  bar.hidden = !show;
  if (!show) return;
  $('#bulkCount').textContent = `${num(SELECTED.size)} محدَّد`;
  $('#bulkFav').disabled = !SELECTED.size;
  $('#bulkExport').disabled = !SELECTED.size;
}

/** مرشّحات السنوات في «جديد المكتبة» */
function renderYearChips() {
  const box = $('#kindChips');
  box.innerHTML = '';
  const years = yearCounts();
  box.append(el('button', {
    class: 'chip' + (state.year ? '' : ' on'),
    onclick: () => { state.year = 0; saveState(); render(); },
  }, el('span', { text: `الكل (${num(years.reduce((s, [, n]) => s + n, 0))})` })));
  for (const [y, n] of years) {
    box.append(el('button', {
      class: 'chip' + (state.year === y ? ' on' : ''),
      onclick: () => { state.year = state.year === y ? 0 : y; saveState(); render(); },
    }, el('span', { text: `${y} (${num(n)})` })));
  }
  $('#sortSel').value = state.sort;
  $('#listView').checked = !!state.listView;
  $('#foldersFirst').checked = state.foldersFirst;
}

/** بطاقة عمل مكرّر: النسخ في المجموعات مع «فضّل هذه» */
function dupGroupCard(normKey, rows) {
  const pref = preferredCopy(normKey);
  const ordered = rows.slice().sort((a, b) => (b.id === pref) - (a.id === pref));
  const copies = el('div', { class: 'dup-copies' });
  for (const r of ordered) {
    const isPref = r.id === pref;
    copies.append(el('div', { class: 'dup-copy' + (isPref ? ' pref' : '') },
      el('button', {
        class: 'dup-open', type: 'button', title: 'افتح هذه النسخة',
        onclick: () => openReader(r.id, rows.map((x) => x.id)),
      }, icon('book', 15), el('span', { class: 'cname', text: r.collName }),
        el('span', { class: 'cnum', text: r.size ? fmtBytes(r.size) : 'بلا حجم' }),
        el('span', { class: 'cdate', text: fmtDate(r.modified) })),
      el('button', {
        class: 'linklike' + (isPref ? ' on' : ''), type: 'button',
        title: isPref ? 'إلغاء التفضيل' : 'فضّل هذه النسخة (تبقى في الأعلى)',
        onclick: () => { setPreferred(normKey, isPref ? '' : r.id); toast(isPref ? 'أُلغي التفضيل' : 'فُضّلت هذه النسخة'); render(); },
      }, icon('check', 14), el('span', { text: isPref ? 'المفضّلة' : 'فضّل هذه' }))));
  }
  return el('section', { class: 'dup-group' },
    el('div', { class: 'dup-head' },
      el('b', { text: rows[0].name }),
      el('span', { class: 'dup-count', text: `${num(rows.length)} نسخ` })),
    copies);
}

/* ---------------- اقتراحات البحث ---------------- */
function hideSuggest() {
  const box = $('#suggest');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}

function showSuggest() {
  const box = $('#suggest');
  if (!box) return;
  const q = $('#q').value.trim();
  if (q.length < 2) return hideSuggest();
  const { authors, titles } = suggest(q);
  if (!authors.length && !titles.length) return hideSuggest();
  box.innerHTML = '';
  if (authors.length) {
    box.append(el('div', { class: 'sug-head', text: 'مؤلفون' }));
    for (const au of authors) {
      box.append(el('button', {
        class: 'sug', type: 'button',
        onclick: () => { hideSuggest(); $('#q').value = ''; go({ view: 'author', author: au.key }); },
      }, icon('user', 15), el('span', { class: 'sname', text: au.name }), el('span', { class: 'sn', text: num(au.count) })));
    }
  }
  if (titles.length) {
    box.append(el('div', { class: 'sug-head', text: 'كتب' }));
    for (const r of titles) {
      box.append(el('button', {
        class: 'sug', type: 'button',
        onclick: () => { hideSuggest(); openReader(r.id, titles.map((x) => x.id)); },
      }, icon(KIND_ICON[r.kind] || 'file', 15), el('span', { class: 'sname', text: r.name }),
        el('span', { class: 'sn', text: r.collName })));
    }
  }
  box.hidden = false;
}

/* ---------------- تصدير ---------------- */
function exportFavourites() {
  const ids = favIds();
  if (!ids.length) return toast('لا مفضلة بعد');
  const lines = ids.map((id) => {
    const it = item(id);
    if (!it) return '';
    return `${it.name}${it.author ? ' — ' + it.author : ''}\n${driveView(id)}`;
  }).filter(Boolean);
  downloadText('مفضلتي-مكتبة.txt', `مفضلتي من مكتبة محمد العماري (${lines.length})\n\n` + lines.join('\n\n') + '\n');
  toast('أُنزل ملف المفضلة');
}

function exportLinks(ids) {
  if (!ids.length) return toast('لا شيء للتصدير');
  const lines = ids.map((id) => {
    const it = item(id);
    return it ? `${it.name}\n${driveDownload(id)}` : '';
  }).filter(Boolean);
  downloadText(`روابط-${ids.length}.txt`, `روابط تحميل من مكتبة محمد العماري (${lines.length} ملف)\n\n` + lines.join('\n\n') + '\n');
  toast(`أُنزل ملف ${num(lines.length)} رابطًا`);
}

function exportCurrentLinks() {
  const ids = listIds();
  if (!ids.length) return toast('لا شيء للتصدير هنا');
  exportLinks(ids);
}

/** إزالة كل المرشّحات دفعة واحدة (من الحالة الفارغة أو من زر) */
function clearFilters() {
  state.kind = 'all';
  state.hideDup = false;
  state.jumpLetter = '';
  saveState();
  render();
  toast('أُزيلت المرشّحات');
}

/** مزامنة ورقة المرشّحات مع الحالة + شارة عدد المرشّحات المفعّلة */
function activeFilterCount() {
  let n = 0;
  if (state.sort !== 'name') n += 1;
  if (!state.foldersFirst) n += 1;
  if (state.listView) n += 1;
  if (!state.groupVols) n += 1;
  if ((state.density || 'md') !== 'md') n += 1;
  return n;
}

function syncFiltersPanel() {
  const sel = $('#sortSel');
  if (sel) sel.value = state.sort;
  const ff = $('#foldersFirst'); if (ff) ff.checked = !!state.foldersFirst;
  const lv = $('#listView'); if (lv) lv.checked = !!state.listView;
  const gv = $('#groupVols'); if (gv) gv.checked = !!state.groupVols;
  const gvw = $('#groupVolsWrap'); if (gvw) gvw.hidden = state.view !== 'browse';
  for (const b of $$('#densitySel .seg-btn')) {
    const on = b.dataset.density === (state.density || 'md');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  const n = activeFilterCount();
  const badge = $('#filtersCount');
  if (badge) { badge.hidden = !n; badge.textContent = String(n); }
}

/** نافذة اختصارات لوحة المفاتيح (يطلبها العارض) */
function showShortcuts() {
  const rows = [
    ['/', 'البحث السريع'],
    ['Esc', 'إغلاق العارض/النافذة'],
    ['←', 'الكتاب التالي داخل السلسلة'],
    ['→', 'الكتاب السابق داخل السلسلة'],
    ['f', 'ملء الشاشة في العارض'],
    ['?', 'هذه القائمة'],
  ];
  const t = el('table');
  for (const [k, d] of rows) t.append(el('tr', {}, el('td', {}, el('kbd', { text: k })), el('td', { text: d })));
  openModal('اختصارات لوحة المفاتيح', t);
}

function showEmpty(title, sub, actions = []) {
  const e = $('#empty');
  e.hidden = false;
  e.innerHTML = '';
  // layered book-stack SVG in the green palette instead of a lone icon
  const books = el('div', { class: 'big', 'aria-hidden': 'true' });
  books.innerHTML = `<svg width="72" height="56" viewBox="0 0 72 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="34" width="44" height="12" rx="2" fill="var(--green-400)" opacity=".35"/>
    <rect x="12" y="22" width="44" height="12" rx="2" fill="var(--green-400)" opacity=".6"/>
    <rect x="16" y="10" width="44" height="12" rx="2" fill="var(--green-400)"/>
    <rect x="22" y="14" width="24" height="4" rx="2" fill="var(--bg)" opacity=".7"/>
    <rect x="26" y="26" width="24" height="4" rx="2" fill="var(--bg)" opacity=".7"/>
    <rect x="18" y="38" width="24" height="4" rx="2" fill="var(--bg)" opacity=".7"/>
  </svg>`;
  e.append(books, el('div', { html: `<strong>${title}</strong>` }), el('p', { text: sub }));
  if (actions.length) {
    const acts = el('div', { class: 'empty-acts' });
    for (const [label, run, primary] of actions) {
      acts.append(el('button', {
        class: 'btn' + (primary ? ' primary' : ''), type: 'button', onclick: run,
      }, el('span', { text: label })));
    }
    e.append(acts);
  }
}

/* ---------------- النوافذ ---------------- */
function openModal(title, bodyNode) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = '';
  $('#modalBody').append(bodyNode);
  $('#modal').hidden = false;
  $('#modal').setAttribute('aria-modal', 'true');
  trapFocus($('.modal-card'), closeModal);
  $('#modalClose').focus();
}
function closeModal() { $('#modal').hidden = true; }

function showStats() {
  const cat = catalog();
  const counts = kindCounts();
  const cols = cat.collections || [];
  const colCounts = collectionCounts();
  const t = el('table');
  t.append(el('tr', {}, el('td', { text: 'إجمالي الملفات' }), el('td', { text: num(cat.total) })));
  for (const k of KIND_ORDER) if (counts[k]) t.append(el('tr', {}, el('td', { text: fmtSize(k) }), el('td', { text: num(counts[k]) })));
  t.append(el('tr', {}, el('td', { text: 'عدد المجموعات' }), el('td', { text: String(cols.length) })));
  const c = cat.counters || {};
  if (c.junk) t.append(el('tr', {}, el('td', { text: 'صور صفحات وملفات مُستبعدة' }), el('td', { text: num(c.junk) })));
  if (c.nonbook) t.append(el('tr', {}, el('td', { text: 'ملفات ليست كتبًا' }), el('td', { text: num(c.nonbook) })));
  if (c.duplicates) t.append(el('tr', {}, el('td', { text: 'مكرّر في أكثر من مجموعة' }), el('td', { text: num(c.duplicates) })));
  if (cat.total_bytes) t.append(el('tr', {}, el('td', { text: 'الحجم الإجمالي' }), el('td', { text: fmtBytes(cat.total_bytes) })));
  t.append(el('tr', {}, el('td', { text: 'كتب في المفضلة' }), el('td', { text: num(favCount()) })));
  const list = el('div', {});
  list.append(el('h4', { text: 'المجموعات' }));
  const t2 = el('table');
  for (const col of cols) t2.append(el('tr', {}, el('td', { text: col.name }), el('td', { text: num(colCounts[col.id] ?? col.count ?? 0) })));
  list.append(t2);
  list.append(el('p', { class: 'hint', text: 'وقت بناء الفهرس: ' + (cat.generated || '—') }));
  openModal('إحصاء المكتبة', el('div', {}, t, list));
}

function showAbout() {
  openModal('عن المكتبة', el('div', {},
    el('p', { html: 'مكتبة رقمية عربية للتصفّح والقراءة والتحميل. الملفات تُستضاف على Google Drive وتُعرض روابطها هنا دون نسخ.' }),
    el('p', { html: '<strong>القراءة:</strong> اضغط أي بطاقة كتاب لفتحه داخل العارض. ملفات PDF تُعرض في الإطار مباشرة؛ وإن منع المتصفح العرض فاستعمل زرّي «فتح في درايف» أو «تحميل».' }),
    el('p', { html: '<strong>البحث:</strong> يبحث في أسماء الملفات ومساراتها والمجموعات، ويتسامح مع التشكيل والهمزات (أ إ آ ← ا).' }),
    el('p', { html: '<strong>تنبيه:</strong> بعض ملفات المكتبة كتب قد تكون محمية بحقوق نشر؛ استعملها للاطّلاع الشخصي.' }),
    el('p', { html: 'اختصارات: <code>/</code> للبحث، <code>Esc</code> لإغلاق العارض، <code>←</code> <code>→</code> للتنقل داخل الكتاب.' })));
}

/* ---------------- التهيئة ---------------- */
function bindUI() {
  const doSearch = debounce(() => {
    const q = $('#q').value.trim();
    if (!q) { go({ view: 'home' }); return; }
    if (state.view === 'authors') { state.query = q; render(); return; }   // تصفية قائمة المؤلفين
    go({ view: 'search', query: q, collectionId: state.collectionId });
  }, 200);

  $('#q').addEventListener('input', () => { doSearch(); showSuggest(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) hideSuggest();
  });
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });
  $('#clearQ').addEventListener('click', () => { $('#q').value = ''; go({ view: 'home' }); });
  $('#sortSel').addEventListener('change', (e) => { state.sort = e.target.value; saveState(); render(); });
  $('#foldersFirst').addEventListener('change', (e) => { state.foldersFirst = e.target.checked; saveState(); render(); });
  $('#listView').addEventListener('change', (e) => { state.listView = e.target.checked; saveState(); render(); });
  $('#groupVols').addEventListener('change', (e) => { state.groupVols = e.target.checked; saveState(); render(); });

  /* ---------- ورقة المرشّحات ---------- */
  const filtersSheet = $('#filtersSheet');
  const setFiltersOpen = (open) => {
    filtersSheet.hidden = !open;
    $('#filtersBtn').setAttribute('aria-expanded', String(open));
  };
  $('#filtersBtn').addEventListener('click', () => setFiltersOpen(filtersSheet.hidden));
  $('#filtersClose').addEventListener('click', () => setFiltersOpen(false));
  filtersSheet.addEventListener('click', (e) => { if (e.target.id === 'filtersSheet') setFiltersOpen(false); });
  $('#filtersReset').addEventListener('click', () => {
    state.sort = 'name'; state.foldersFirst = true; state.listView = false;
    state.groupVols = true; state.density = 'md'; state.jumpLetter = '';
    saveState(); render(); toast('أُعيد الترتيب الافتراضي');
  });
  for (const b of $$('#densitySel .seg-btn')) {
    b.addEventListener('click', () => { state.density = b.dataset.density; saveState(); render(); });
  }

  /* ---------- وضع «تحديد» ---------- */
  $('#selectBtn').addEventListener('click', () => setSelecting(!state.selecting));
  $('#bulkClear').addEventListener('click', () => setSelecting(false));
  $('#bulkFav').addEventListener('click', () => {
    if (!SELECTED.size) return;
    let added = 0;
    for (const id of SELECTED) if (!isFav(id)) { toggleFav(id); added += 1; }
    toast(added ? `أُضيف ${num(added)} إلى المفضلة` : 'كلها في المفضلة أصلًا');
    setSelecting(false);
    renderCatbar();
  });
  $('#bulkExport').addEventListener('click', () => {
    if (!SELECTED.size) return;
    exportLinks(Array.from(SELECTED));
  });

  /* ---------- رأس مضغوط عند التمرير ---------- */
  let headerTick = false;
  window.addEventListener('scroll', () => {
    if (headerTick) return;
    headerTick = true;
    requestAnimationFrame(() => {
      headerTick = false;
      document.documentElement.classList.toggle('scrolled', (window.scrollY || 0) > 120);
    });
  }, { passive: true });

  /* العارض يطلب نافذة الاختصارات */
  document.addEventListener('mk-keys', showShortcuts);
  // العارض يطلب فتح صفحة مؤلف (لا يستورد app.js تجنّبًا للدوران)
  document.addEventListener('mk-author', (e) => { closeReader(); go({ view: 'author', author: e.detail }); });
  $('#collectionsBtn').addEventListener('click', openSheet);
  $('#collClose').addEventListener('click', closeSheet);
  $('#collSheet').addEventListener('click', (e) => { if (e.target.id === 'collSheet') closeSheet(); });
  $('#statsBtn').addEventListener('click', showStats);
  $('#exportFavs').addEventListener('click', exportFavourites);
  $('#aboutBtn').addEventListener('click', showAbout);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); go({ view: 'home' }); });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault(); $('#q').focus();
    }
    if (e.key === 'Escape') {
      closeModal(); closeSheet();
      const fs = $('#filtersSheet'); if (fs) fs.hidden = true;
      $('#filtersBtn').setAttribute('aria-expanded', 'false');
      if (state.selecting) setSelecting(false);
    }
    if (e.key === '?' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault(); showShortcuts();
    }
    if (!$('#reader').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // في واجهة RTL: السهم الأيسر = الكتاب التالي، والأيمن = السابق
      const btn = e.key === 'ArrowLeft' ? '#readerNext' : '#readerPrev';
      $(btn)?.click();
    }
  });

  // شريط تقدّم القراءة
  const bar = el('div', { class: 'progress' });
  document.body.append(bar);
  window.addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = h > 0 ? `${Math.min(100, (window.scrollY / h) * 100)}%` : '0';
  }, { passive: true });

  // الرجوع (زر المتصفّح/إيماءة الجوال): يُغلق العارض ويبقى داخل الموقع.
  // بعد كل رجوع نُثبّت إدخالًا أساسيًا حتى لا يُخرج الرجوع التالي الزائر من الموقع،
  // ثم من أي صفحة غير الرئيسية يعود إلى الرئيسية قبل أن يُسمح بالخروج.
  window.addEventListener('popstate', () => {
    const keep = () => { try { history.pushState({ app: 1 }, '', location.pathname + location.search); } catch (e) { /* ignore */ } };
    if (!$('#reader').hidden) { closeReader(); keep(); return; }
    if (state.view !== 'home') { go({ view: 'home' }); keep(); }
  });
}

/** هياكل رمادية أثناء تحميل الفهرس (بدل شبكة فارغة) */
function renderSkeleton(n = 12) {
  const grid = $('#grid');
  grid.classList.remove('list', 'home');
  grid.innerHTML = '';
  for (let i = 0; i < n; i++) {
    grid.append(el('div', { class: 'sk-card' },
      el('div', { class: 'sk-cover' }),
      el('div', { class: 'sk-line' }),
      el('div', { class: 'sk-line short' })));
  }
}

/** شاشة فشل تحميل الفهرس: رسالة واضحة + زر إعادة محاولة (بدل صندوق مسدود) */
function showBootError(err, tries) {
  const grid = $('#grid');
  grid.classList.remove('home');
  grid.innerHTML = '';
  $('#toolbar').hidden = true;
  $('#empty').hidden = true;
  grid.append(el('div', { class: 'empty' },
    el('span', { class: 'big' }, icon('warning', 46)),
    el('div', {}, el('strong', { text: 'تعذّر تحميل الفهرس' })),
    el('p', { text: 'تأكّد أن سيرفر المكتبة يعمل ثم أعد المحاولة.' }),
    el('p', { class: 'hint', text: String((err && err.message) || err || '') }),
    el('button', { class: 'btn primary', onclick: () => boot() }, '🔄 إعادة المحاولة')));
  if ((tries || 0) < 2) setTimeout(() => boot(tries + 1), 3000);   // محاولتان تلقائيتان
}

async function boot(tries = 0) {
  if (!boot.bound) { boot.bound = true; paintStaticIcons(); initTheme(); bindUI(); }   // لا تُكرَّر عند إعادة المحاولة
  restoreState();
  if (!catalog()) renderSkeleton();      // أول ما يُرسم: هياكل بدل فراغ
  try {
    await loadCatalog();
  } catch (err) {
    showBootError(err, tries);
    return;
  }
  const cat = catalog();
  SERIES_CACHE = null;
  if (state.view === 'search') state.view = 'home';
  render();
  setLastVisit();          // «جديد منذ آخر زيارة» يعتمد على الفتح التالي
}

boot();