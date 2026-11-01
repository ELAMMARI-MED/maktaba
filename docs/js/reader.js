/* عارض الكتب: PDF في إطار داخلي، وروابط للتحميل والفتح في درايف */

import { $, el, toast, fmtSize, fmtBytes, fmtDate, num, normalizeAr, trapFocus, icon, kindIcon, KIND_ICON, copy } from './util.js';
import { item, otherCopies, seriesInfo } from './data.js';
import { isFav, toggleFav, pushRecent, statusOf, setStatus, toggleDone } from './user.js';

let READY = false;

export const driveView = (id) => `https://drive.google.com/file/d/${id}/view`;
export const drivePreview = (id) => `https://drive.google.com/file/d/${id}/preview`;
export const driveDownload = (id) =>
  `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

function init() {
  if (READY) return;
  READY = true;
  $('#readerClose').addEventListener('click', closeReader);
  // نسخ رابط الكتاب
  $('#readerCopy').addEventListener('click', () => {
    const it = item($('#reader').dataset.id);
    if (!it) return;
    copy(`${it.name}\n${driveView(it.id)}`);
    toast('تم نسخ الرابط');
  });
  // مشاركة الكتاب (واتساب/تلغرام على الجوال) مع نسخ الرابط كبديل
  $('#readerShare').addEventListener('click', async () => {
    const it = item($('#reader').dataset.id);
    if (!it) return;
    const url = driveView(it.id);
    const text = it.author ? `${it.name} — ${it.author}` : it.name;
    if (navigator.share) {
      try { await navigator.share({ title: it.name, text, url }); return; }
      catch { return; }                       // أُغلقت نافذة المشاركة
    }
    copy(`${text}\n${url}`);
    toast('تم نسخ الرابط');
  });
  // المفضلة من داخل العارض
  $('#readerFav').addEventListener('click', () => {
    const id = $('#reader').dataset.id;
    if (!id) return;
    toast(toggleFav(id) ? 'أُضيف إلى المفضلة' : 'أُزيل من المفضلة');
    paintFav();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#readerMenu')?.hidden) { closeMenu(); return; }
      if (!$('#reader').hidden) closeReader();
      return;
    }
    if ($('#reader').hidden) return;
    if (e.key === 'f' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault(); toggleFull();
    }
  });

  /* «المزيد»: قائمة ثانوية بدل شريط مزدحم */
  $('#readerMore').addEventListener('click', () => {
    const m = $('#readerMenu');
    const open = m.hidden;
    m.hidden = !open;
    $('#readerMore').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('#readerMenu') || e.target.closest('#readerMore')) return;
    closeMenu();
  });

  /* ملء الشاشة */
  $('#readerFull').addEventListener('click', toggleFull);

  /* تمّت قراءته */
  $('#readerDone').addEventListener('click', () => {
    const id = $('#reader').dataset.id;
    if (!id) return;
    toggleDone(id);
    paintStatus();
    toast(statusOf(id) === 'done' ? 'عُلِّم الكتاب كتمّت قراءته' : 'أُعيد إلى «قيد القراءة»');
    closeMenu();
  });

  /* اختصارات لوحة المفاتيح (تفتحها نافذة app.js) */
  $('#readerKeys').addEventListener('click', () => {
    closeMenu();
    document.dispatchEvent(new CustomEvent('mk-keys'));
  });
}

function closeMenu() {
  const m = $('#readerMenu');
  if (!m) return;
  m.hidden = true;
  $('#readerMore')?.setAttribute('aria-expanded', 'false');
}

function toggleFull() {
  const r = $('#reader');
  if (!r) return;
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (r.requestFullscreen) r.requestFullscreen().catch(() => {});
}

/** زر «تمّت قراءته» في القائمة الثانوية */
function paintStatus() {
  const id = $('#reader').dataset.id;
  const st = id ? statusOf(id) : '';
  const btn = $('#readerDone');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(st === 'done'));
  btn.classList.toggle('on', st === 'done');
  btn.title = st === 'done' ? 'إلغاء علامة «تمّت قراءته»' : 'علّم الكتاب كتمّت قراءته';
}

/** يضبط زر القلب في شريط العارض على حالة الكتاب المعروض */
function paintFav() {
  const btn = $('#readerFav');
  if (!btn) return;
  if (!btn.querySelector('svg')) btn.append(icon('heart', 17));
  const on = !!$('#reader').dataset.id && isFav($('#reader').dataset.id);
  btn.classList.toggle('on', on);
  btn.title = on ? 'إزالة من المفضلة' : 'أضف إلى المفضلة';
  btn.setAttribute('aria-pressed', String(on));
}

/** شريط تحت العنوان: المؤلف + موضع الكتاب + النسخ الأخرى في المكتبة */
function paintSub(it, id) {
  const box = $('#readerSub');
  if (!box) return;
  box.innerHTML = '';
  const bits = [];
  const author = it.author || it.title_author || '';
  if (author) {
    bits.push(el('button', {
      class: 'linklike', type: 'button', title: `كل كتب ${author}`,
      onclick: () => document.dispatchEvent(new CustomEvent('mk-author', { detail: normalizeAr(author) })),
    }, icon('user', 14), el('span', { text: author })));
  }
  if (it.issue && !seriesInfo(id)?.total) bits.push(el('span', { class: 'muted', text: `العدد ${it.issue}` }));
  if (it.path && it.path.length) bits.push(el('span', { class: 'muted', text: it.path.slice(-2).join(' › ') }));
  const si = seriesInfo(id);
  if (si && si.total > 1) {
    bits.push(el('span', { class: 'muted', text: `العدد ${si.issue} من ${num(si.total)} — ${si.series}` }));
  }
  const others = otherCopies(id);
  for (const o of others) {
    bits.push(el('button', {
      class: 'linklike copy', type: 'button', title: 'افتح النسخة الأخرى',
      onclick: () => openReader(o.id, [o.id, id]),
    }, icon('copy2', 14), el('span', {
      text: `نسخة أخرى في «${o.collName}» — ${o.size ? fmtBytes(o.size) : 'بلا حجم'}`
        + (o.modified ? ` · ${fmtDate(o.modified)}` : ''),
    })));
  }
  box.hidden = bits.length === 0;
  for (const b of bits) box.append(b);
}

export function closeReader() {
  const r = $('#reader');
  const wasOpen = r && !r.hidden;
  r.hidden = true;
  $('#readerBody').innerHTML = '';
  const sub = $('#readerSub');
  if (sub) { sub.hidden = true; sub.innerHTML = ''; }
  // لا نترك #read=… في التاريخ: زر الرجوع يعود إلى الصفحة نفسها لا إلى نسخة العارض
  if (wasOpen && history.state && history.state.reader) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  }
}

/** يعرض عارضًا للملف المعطى. neighbors = قائمة معرّفات للتنقل */
export function openReader(id, neighbors = []) {
  init();
  const it = item(id);
  if (!it) return;
  const r = $('#reader');
  const wasOpen = !r.hidden;
  r.hidden = false;
  r.setAttribute('role', 'dialog');
  r.setAttribute('aria-modal', 'true');
  if (!r.dataset.trapped) {
    r.dataset.trapped = '1';
    trapFocus(r, closeReader);          // التاب لا يخرج من العارض
  }
  $('#readerTitle').textContent = it.display || it.name;

  const si = seriesInfo(id);
  if (si && si.ids && si.ids.length > 1) neighbors = si.ids;   // التنقل في السلسلة بترتيب الأعداد
  const down = driveDownload(id);
  const open = driveView(id);
  const aOpen = $('#readerOpen'); aOpen.href = open;
  const aDown = $('#readerDown');
  aDown.href = down;
  aDown.setAttribute('download', it.name);
  aDown.textContent = '';
  aDown.append(el('span', { text: 'تحميل' }), icon('download', 16));
  $('#readerPrev').hidden = neighbors.length < 2;
  $('#readerNext').hidden = neighbors.length < 2;
  $('#reader').dataset.id = id;
  if (!statusOf(id)) setStatus(id, 'reading');   // أول فتح = قيد القراءة
  pushRecent(id);        // «آخر ما قرأت» في الصفحة الرئيسية
  paintFav();
  paintStatus();
  closeMenu();
  paintSub(it, id);      // المؤلف + النسخ الأخرى
  $('#reader').dataset.list = JSON.stringify(neighbors.slice(0, 2000));

  const body = $('#readerBody');
  body.innerHTML = '';

  if (it.kind === 'pdf' || it.kind === 'doc' || it.kind === 'epub') {
    if (it.kind === 'epub') {
      // ePub لا يعرضه درايف؛ نعطيه واجهة تحميل بدلًا من إطار فارغ
      body.append(noteCard(it, 'book', 'ملف EPUB — التحميل ثم القراءة في أي تطبيق كتب',
        [['تحميل الآن', down, 'primary', 'download'], ['فتح في درايف', open, '', 'external']]));
    } else {
      const f = el('iframe', { src: drivePreview(id), title: it.name });
      f.setAttribute('allow', 'autoplay');
      body.append(f);
    }
  } else if (it.kind === 'audio') {
    const dl = driveDownload(id);
    body.append(noteCard(it, 'headphones', 'ملف صوتي — شغّله هنا مباشرة', [
      ['تشغيل', dl, 'primary', 'play'],
      ['تحميل', dl, '', 'download'],
    ], `<audio controls preload="none" src="${dl}"></audio>`));
  } else if (it.kind === 'video') {
    const dl = driveDownload(id);
    body.append(noteCard(it, 'video', 'ملف مرئي — شغّله هنا مباشرة', [
      ['تحميل', dl, 'primary', 'download'], ['فتح في درايف', open, '', 'external'],
    ], `<video controls preload="none" src="${dl}"></video>`));
  } else if (it.kind === 'image') {
    body.append(noteCard(it, 'image', 'صورة من المكتبة', [
      ['تحميل', down, 'primary', 'download'],
    ], `<img style="max-width:100%;max-height:80vh;display:block;margin:10px auto" referrerpolicy="no-referrer" src="https://lh3.googleusercontent.com/d/${id}=w1200" alt="">`));
  } else {
    body.append(noteCard(it, KIND_ICON[it.kind] || 'file',
      `ملف من نوع ${fmtSize(it.kind)} (${it.ext || '—'}) — التحميل للاستخدام`,
      [['تحميل الآن', down, 'primary', 'download'], ['فتح في درايف', open, '', 'external']]));
  }

  wireNav(neighbors);
  // أول فتح = إدخال جديد (زر رجوع المتصفّح يغلق العارض)،
  // والتنقّل بين الكتب (السابق/التالي) يستبدل الإدخال نفسه بدل تكديس عشرات الإدخالات
  // التي كانت تُخرج الزائر من الموقع عند الرجوع.
  if (wasOpen) history.replaceState({ reader: id }, '', '#read=' + id);
  else history.pushState({ reader: id }, '', '#read=' + id);
}

function noteCard(it, iconName, msg, buttons, extraHtml = '') {
  const label = it.display || it.name;
  const acts = el('div', { class: 'acts' });
  for (const [label, href, cls, btnIcon] of buttons) {
    acts.append(el('a', { class: 'btn ' + cls, href, target: '_blank', rel: 'noopener', download: '' },
      el('span', { text: label }), btnIcon ? icon(btnIcon, 16) : null));
  }
  const copyBtn = el('button', { class: 'btn', onclick: () => { copy(`${it.name}\n${driveView(it.id)}`); toast('تم نسخ الرابط'); } },
    icon('copy', 16), el('span', { text: 'نسخ الرابط' }));
  acts.append(copyBtn);
  return el('div', { class: 'reader-note' },
    el('span', { class: 'big' }, icon(iconName, 46)),
    el('div', { html: `<strong>${escapeHtml(label)}</strong>` }),
    el('p', { text: msg }),
    extraHtml ? el('div', { html: extraHtml }) : null,
    acts);
}

function wireNav(neighbors) {
  const cur = () => $('#reader').dataset.id;
  const go = (step) => {
    const i = neighbors.indexOf(cur());
    if (i < 0) return;
    const j = (i + step + neighbors.length) % neighbors.length;
    openReader(neighbors[j], neighbors);
  };
  $('#readerPrev').onclick = () => go(-1);
  $('#readerNext').onclick = () => go(1);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}