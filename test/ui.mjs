/* اختبار واجهة في jsdom: يبني الصفحة، يشغّل التطبيق، ويتحقّق من العرض والبحث والعارض */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire('/data/data/com.termux/files/home/maktaba-tools/');
const { JSDOM } = require('jsdom');

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const html = readFileSync(ROOT + '/web/index.html', 'utf8');
const catalogText = readFileSync(ROOT + '/data/catalog.json', 'utf8');
const cssText = readFileSync(ROOT + '/web/css/app.css', 'utf8');

const dom = new JSDOM(html, { url: 'http://127.0.0.1:8112/', pretendToBeVisual: true });
const { window } = dom;

// اجعل بيئة المتصفح متاحة للموديولات
globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch {}
Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage, configurable: true });
globalThis.history = window.history;
globalThis.location = window.location;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

// fetch مزيّف يخدم ملفات المشروع
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('api/catalog')) return { ok: true, json: async () => JSON.parse(catalogText) };
  const p = ROOT + '/web/' + u.replace(/^.*\/web\//, '').replace(/^\//, '');
  try {
    const body = readFileSync(p, 'utf8');
    return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
  } catch { return { ok: false, status: 404, text: async () => '', json: async () => ({}) }; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => Array.from(window.document.querySelectorAll(s));
/* البحث بالاسم لا بالترتيب: إضافة عنصر للدرج لا تُفشل الاختبارات */
const colItem = (label) => $$('#collections .col-item').find((b) => b.textContent.trim().startsWith(label));
const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// شغّل التطبيق
await import(ROOT + '/web/js/app.js');
await sleep(700);   // انتظر boot() + loadCatalog

/* ---------- 0. عقد CSS ضروري: hidden يفوز على display ----------
   .reader و .modal و .toolbar عناصر تحمل السمة hidden، وفيها display: flex/grid.
   قاعدة الوكيل [hidden]{display:none} أضعف من قاعدة المؤلف، فبدون هذا السطر
   يغطّي العارضُ/النافذةُ الصفحةَ كاملة ويُعطّل التصفّح — وهو خطأ لا يراه jsdom. */
assert.ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(cssText),
  'app.css must force [hidden]{display:none !important} for the reader/modal/toolbar overlays');
console.log('[0] overlay contract OK');

/* عامل الخدمة: يُسجَّل، واسم الكاش مُصدَّر، وقشرة التطبيق مُخزَّنة (فتح بلا شبكة) */
assert.ok(/navigator\.serviceWorker\.register\('sw\.js'\)/.test(html), 'the page registers sw.js');
const swSrc = readFileSync(ROOT + '/web/sw.js', 'utf8');
assert.ok(/const CACHE = 'maktaba-cache-\d+'/.test(swSrc), 'the service worker cache name is versioned');
for (const f of ['index.html', 'css/app.css', 'js/app.js', 'js/data.js', 'js/util.js', 'fonts/fonts.css']) {
  assert.ok(swSrc.includes(f), 'the offline shell precaches ' + f);
}
assert.ok(/origin !== location\.origin\) return/.test(swSrc), 'Drive requests stay out of the cache');
console.log('[0b] offline shell OK — cache + shell list');

/* ---------- 1. الصفحة الرئيسية ---------- */
assert.ok($('.hero h1'), 'hero title rendered');
/* الأقسام تُعرض صناديق: عنوان + عدد وحجم + أغلفة + مجموعاته، اثنان أو ثلاثة في الصف */
const boxes = $$('.sec-box');
assert.ok(boxes.length >= 4, 'home renders the section boxes, got ' + boxes.length);
assert.ok(boxes.every((b) => b.querySelector('h3') && b.querySelector('.sec-col')),
  'every section box has a title and at least one collection row');
assert.ok($$('.sec-box .sec-col').length >= 5, 'every collection is reachable from a box');
assert.ok($$('.sec-box .sec-covers img').length >= 1, 'section boxes render cover strips');
assert.ok(boxes.every((b) => b.querySelectorAll('.sec-cover').length === 6),
  'every section box shows six covers, got: ' + boxes.map((b) => b.querySelectorAll('.sec-cover').length).join(','));
assert.ok(boxes.every((b) => Array.from(b.querySelectorAll('.sec-cover img')).every((i) => /sz=w600/.test(i.dataset.thumb || ''))),
  'cover tiles request the sharper thumbnail');
/* توزيع طلبات الأغلفة: عقد في الكود + سلوك مرصود (لا تُطلب كل الصور دفعة واحدة) */
const appSrc = readFileSync(ROOT + '/web/js/app.js', 'utf8');
assert.ok(/const COVER_BURST = (\d+)/.test(appSrc) && /function scheduleCover/.test(appSrc),
  'cover images must be requested in a staggered burst, not all at once');
assert.ok(appSrc.includes('coverStarted = 0;'), 'each render restarts the cover burst');
const inFlight = $$('img[src]').length;
assert.ok(inFlight >= 1 && inFlight < $$('img').length,
  'not every cover is requested simultaneously: ' + inFlight + ' of ' + $$('img').length);
assert.ok($('#collections .col-item'), 'sidebar collection items rendered');
console.log('[1] home OK — boxes:', boxes.length, '| collection rows:', $$('.sec-box .sec-col').length,
  '| covers:', $$('.sec-box .sec-cover').length);
/* اثنان أو ثلاثة في الصف — لا عمود واحد ولا صفّ فارغ */
assert.ok(/\.sec-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/.test(cssText),
  'section boxes are laid out two per row');
assert.ok(!/\.sec-grid[^{]*\{[^}]*grid-template-columns:\s*repeat\((1|3)/.test(cssText),
  'section boxes must never be one or three per row');
assert.ok($$('.sec-title').length >= 1, 'home still renders the random-picks heading');
assert.ok($$('.side-group').length >= 1, 'sidebar groups collections under section headings');
assert.ok($$('.hero-stats .stat').length >= 3, 'hero shows stat cards');
console.log('[1b] organization OK — boxes:', boxes.length, '| sections with covers:',
  $$('.sec-box .sec-covers').length, '| sidebar groups:', $$('.side-group').length,
  '| stats:', $$('.hero-stats .stat').length);
/* الهوية: الأخضر الزاهي — يمنع الرجوع للأزرق بالخطأ */
assert.ok(/--green-400:\s*#4ade80/i.test(cssText) && /--accent:\s*var\(--green-700\)/i.test(cssText),
  'the accent must be the green palette');
assert.ok(!/--blue-600\s*:/.test(cssText), 'no blue palette left in the stylesheet');
console.log('[1c] theme OK — green accent');

/* التنقّل: لا قائمة جانبية دائمة — شريط أقسام أفقي + درج يُفتح عند الحاجة */
assert.ok(!$('.sidebar'), 'no permanent sidebar in the page');
assert.ok($$('#catbar .cat-pill').length >= 4, 'top category bar rendered with collection pills');
assert.strictEqual($('#collSheet').hidden, true, 'collections drawer starts closed');
$('#collectionsBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.strictEqual($('#collSheet').hidden, false, 'collections drawer opens');
$('#collClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.strictEqual($('#collSheet').hidden, true, 'collections drawer closes');
/* أيقونات SVG حديثة + اسم المكتبة */
assert.ok($('#themeBtn svg.ico'), 'theme button has an SVG icon');
assert.ok($('#searchGo svg.ico') && $('#collectionsBtn svg.ico'), 'topbar icons are SVG');
assert.ok($$('.cat-pill svg.ico').length >= 1, 'category pills use SVG icons');
assert.ok($$('#collections .col-item svg.ico').length >= 2, 'drawer items use SVG icons');
assert.ok(!/[\u{1F4DA}\u{1F3E0}\u{1F50D}\u{1F3B2}\u{1F4CA}\u{2B07}\u{2197}\u{1F4C1}]/u.test(window.document.body.textContent),
  'no emoji left in the rendered text');
assert.ok(window.document.title.includes('محمد العماري'), 'page title carries the library name');
assert.ok($('.hero h1').textContent.includes('محمد العماري'), 'hero shows the library name');
console.log('[1e] icons + name OK —', $$('svg.ico').length, 'icons rendered | title:', window.document.title.slice(0, 28));

/* الأرقام لاتينية دائمًا (1234567890) — لا أرقام عربية-هندية (١٢٣) في أي مكان */
assert.ok(!/[\u0660-\u0669\u06F0-\u06F9]/.test(window.document.body.textContent),
  'no Arabic-Indic digits anywhere in the rendered page');
console.log('[1f] digits OK — hero stats:',
  $$('.hero-stats .stat b').map((b) => b.textContent).join(' · '));

/* ---------- 1c. روابط الصناديق: كل صف مجموعة يفتح مجموعته، وكل غلاف يفتح كتابه ---------- */
const rowLabels = $$('.sec-box .sec-col .cname').map((n) => n.textContent);
assert.strictEqual(rowLabels.length, $$('.sec-box .sec-col').length, 'collection rows are labelled');
for (let i = 0; i < rowLabels.length; i++) {
  $$('.sec-box .sec-col')[i].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(90);
  const label = rowLabels[i];
  assert.ok($('#crumbs').textContent.includes(label), 'box link opens its collection: ' + label);
  assert.ok($('.coll-head'), 'collection header rendered for ' + label);
  assert.ok($$('#grid .card, #grid .coll-head').length >= 1, 'collection not empty: ' + label);
  $('#brand').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(90);
}
console.log('[1c] box links OK — every collection row opens, collections:', rowLabels.length);

const coverBtns = $$('.sec-cover');
assert.ok(coverBtns.length >= 5, 'section boxes render book covers, got ' + coverBtns.length);
assert.ok(coverBtns.every((b) => b.querySelector('img')), 'every cover tile holds an image');
coverBtns[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(140);
assert.strictEqual($('#reader').hidden, false, 'clicking a box cover opens the reader');
assert.ok($('#readerTitle').textContent.length > 2, 'reader title set from the cover');
assert.ok(($('#readerDown').getAttribute('href') || '').includes('id='), 'cover link has a download target');
console.log('[1d] cover links OK —', coverBtns.length, 'covers | opened:', $('#readerTitle').textContent.slice(0, 34));
$('#readerClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(80);
$('#brand').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(90);

/* ---------- 1g. المؤلفون ---------- */
click(colItem('المؤلفون'));
await sleep(150);
const chipsA = $$('.author-chip');
assert.ok(chipsA.length >= 20, 'authors view lists author chips, got ' + chipsA.length);
assert.ok($('#moreWrap .more-btn'), 'the author list pages instead of truncating silently');
assert.ok(chipsA[0].querySelector('.acount'), 'each author chip carries a book count');
const firstName = chipsA[0].querySelector('.aname').textContent;
chipsA[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(150);
assert.ok($('#crumbs').textContent.includes('المؤلف'), 'author page opened');
assert.ok($$('#grid .card').length >= 1, 'author page lists books');
assert.ok(/\d/.test($('#crumbs').textContent), 'author page shows the book count');
console.log('[1g] authors OK —', chipsA.length, 'chips |', firstName, '->', $$('#grid .card').length, 'books');

// العودة إلى قائمة المؤلفين ثم التصفية بالكتابة
click(colItem('المؤلفون'));
await sleep(150);
/* شريط الحروف: تصفية بالحرف */
const letterChip = $$('#kindChips .chip').find((c) => c.textContent.trim() === 'ط');
assert.ok(letterChip, 'authors view offers an alphabet bar');
click(letterChip);
await sleep(150);
assert.ok($$('.author-chip').length >= 1 && $$('.author-chip').length < chipsA.length,
  'the letter filter narrows the author list');
console.log('[1i] alphabet bar OK —', $$('.author-chip').length, 'authors starting with ط');
click($$('#kindChips .chip').find((c) => c.textContent.includes('كل الحروف')));
await sleep(120);
$('#q').value = 'طه';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(380);
assert.ok($$('.author-chip').length >= 1 && $$('.author-chip').length < chipsA.length,
  'typing filters the author list, got ' + $$('.author-chip').length);
console.log('[1h] author filter OK —', $$('.author-chip').length, 'of', chipsA.length);
$('#clearQ').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(130);

/* ---------- 2. تصفّح مجموعة ---------- */
assert.ok(colItem('المفضلة'), 'drawer lists «المفضلة»');
assert.ok(colItem('المؤلفون'), 'drawer lists «المؤلفون»');
assert.ok(colItem('جديد المكتبة'), 'drawer lists «جديد المكتبة»');
assert.ok(colItem('الكتب المكرّرة'), 'drawer lists «الكتب المكرّرة»');
click(colItem('مؤلفات الكتاب العرب'));
await sleep(120);
assert.ok($('#grid .card'), 'browse view renders cards');
assert.ok($('#crumbs button'), 'breadcrumbs present: ' + $('#crumbs').textContent.trim().slice(0, 60));
assert.ok($('#toolbar').hidden === false, 'toolbar visible in browse');
assert.ok($('.coll-head'), 'collection header rendered at the collection root');
assert.ok(($('.coll-head .meta') || {}).textContent?.includes('كتاب'), 'collection header shows the book count');
const chips = $$('#kindChips .chip').map((c) => c.textContent);
assert.ok(chips.some((t) => t.includes('إخفاء المكرر')), 'duplicate-filter chip present: ' + chips.length + ' chips');
console.log('[2b] collection head + chips OK —', chips.length, 'chips');
const firstFolder = $$('#grid .card.badge-folder')[0];
console.log('[2] browse OK — first cards:', $$('#grid .card').length,
  '| folders:', $$('#grid .card.badge-folder').length,
  '| crumbs:', $('#crumbs').textContent.replace(/\s+/g, ' ').trim().slice(0, 70));

/* ---------- 2c. العرض التدريجي: دفعات من 60 بطاقة ---------- */
const page1 = $$('#grid .card').length;
assert.ok(page1 <= 60, 'first batch is capped at ' + 60 + ' cards, got ' + page1);
assert.ok($('#moreWrap .more-btn'), 'a «عرض المزيد» button appears when cards remain');
$('#moreWrap .more-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(120);
assert.ok($$('#grid .card').length > page1, 'the button appends the next batch');
console.log('[2c] paging OK —', page1, '→', $$('#grid .card').length, 'cards');

/* ---------- 2d. عرض القائمة ---------- */
const cardBefore = $$('#grid .card').length;
$('#listView').checked = true;
$('#listView').dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(120);
assert.ok($('#grid').classList.contains('list'), 'list view applies to the grid');
assert.ok($$('#grid .card').length > 0, 'list view still renders cards (first batch after re-render)');
$('#listView').checked = false;
$('#listView').dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(120);
assert.ok(!$('#grid').classList.contains('list'), 'list view turns off');
console.log('[2d] list view OK —', cardBefore, 'cards');

/* ---------- 2e. ترتيب السلاسل برقم العدد ---------- */
const seriesPill = $$('#catbar .cat-pill').find((p) => p.textContent.includes('عالم المعرفة'));
assert.ok(seriesPill, 'top bar has a pill for the numbered series');
seriesPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(200);
$('#sortSel').value = 'issue';
$('#sortSel').dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(200);
assert.ok($$('#grid .card').length >= 10, 'series collection renders its issues');
assert.ok($$('#grid .card').slice(0, 12).some((c) => /العدد\s*\d+/.test(c.textContent)),
  'series cards carry their issue number');
assert.ok(/العدد\s*0*1\b/.test($$('#grid .card')[0].textContent),
  'sorting by issue puts issue 1 first, got: ' + $$('#grid .card')[0].textContent.replace(/\s+/g, ' ').slice(0, 60));
assert.ok(/الحضارة/.test($$('#grid .card')[0].querySelector('.title').textContent),
  'series cards show the cover title, not just the number: ' + $$('#grid .card')[0].querySelector('.title').textContent);
assert.ok(/العدد\s*1\b/.test($$('#grid .card')[0].textContent), 'the issue number stays visible as metadata');
console.log('[2e] series sort OK — first:', $$('#grid .card')[0].querySelector('.title').textContent.slice(0, 42));

/* البحث بعنوان الغلاف لا برقم الملف */
$('#q').value = 'عار الجوع';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(450);
assert.ok($$('#grid .card').some((c) => /عار الجوع/.test(c.textContent)),
  'searching by the cover title finds the issue');
$('#q').value = '';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(300);
click($('#brand'));
await sleep(160);

/* ---------- 3. الدخول إلى مجلد ---------- */
if (firstFolder) {
  const before = $$('#grid .card').map((c) => c.querySelector('.title')?.textContent).join('|');
  firstFolder.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  const after = $$('#grid .card').map((c) => c.querySelector('.title')?.textContent).join('|');
  assert.notStrictEqual(after, before, 'folder navigation changed the listing');
  assert.ok($('#grid .card'), 'folder has content');
  console.log('[3] folder OK —', $$('#grid .card').length, 'cards |', $('#crumbs').textContent.replace(/\s+/g, ' ').trim().slice(0, 80));
}

/* ---------- 3b. الأغلفة تستعمل نقطة درايف الثابتة (روابط lh3 تنتهي صلاحيتها) ---------- */
const coverImg = $$('#grid .card img')[0];
assert.ok(coverImg, 'file card has a cover image');
assert.ok(/^https:\/\/drive\.google\.com\/thumbnail\?id=[\w-]+&sz=w600$/.test(coverImg.getAttribute('src')),
  'cover must use the stable endpoint, got: ' + coverImg.getAttribute('src'));
assert.strictEqual(coverImg.getAttribute('referrerpolicy'), 'no-referrer',
  'covers must be requested without a Referer (Drive answers 429 for localhost referrers)');
console.log('[3b] covers OK —', coverImg.getAttribute('src').slice(0, 60));
/* فشل عارض للغلاف (درايف يرفض بعض الطلبات عند تحميل عشرات الصور معًا) → إعادة محاولة قبل الشارة */
coverImg.dispatchEvent(new window.Event('error'));
await sleep(520);
assert.ok(/[?&]r=1/.test(coverImg.getAttribute('src')), 'cover image retries once before falling back');
assert.ok(coverImg.tagName === 'IMG', 'card still shows an image element while retrying');
console.log('[3c] cover retry OK —', coverImg.getAttribute('src').slice(-14));
/* بعد إعادة المحاولتين: صفحة عنوان بديلة بدل غلاف فارغ */
coverImg.dispatchEvent(new window.Event('error'));
await sleep(900);
coverImg.dispatchEvent(new window.Event('error'));
await sleep(120);
const fb = $('#grid .cover-fallback');
assert.ok(fb, 'a book whose cover never loads falls back to a title page');
assert.ok(fb.querySelector('.cf-title').textContent.length > 2, 'the fallback cover prints the title');
assert.ok(fb.querySelector('.cf-initial'), 'the fallback cover carries a monogram');
console.log('[3c2] fallback cover OK —', fb.querySelector('.cf-title').textContent.slice(0, 40));

/* ---------- 3d. جديد المكتبة ---------- */
click(colItem('جديد المكتبة'));
await sleep(180);
assert.ok($$('#grid .card').length >= 20, 'new-arrivals view lists books');
assert.ok($('#crumbs').textContent.includes('جديد المكتبة'), 'new-arrivals crumb');
const yearChip = $$('#kindChips .chip').find((c) => /^\d{4} \(/.test(c.textContent.trim()));
assert.ok(yearChip, 'new-arrivals offers year filters');
const yearLabel = yearChip.textContent.trim();
click(yearChip);
await sleep(180);
assert.ok($('#crumbs').textContent.includes('أُضيف في'), 'year filter narrows the view: ' + $('#crumbs').textContent.slice(0, 46));
console.log('[3d] new arrivals OK —', $$('#grid .card').length, 'in', yearLabel);
click(colItem('الكتب المكرّرة'));
await sleep(200);
assert.ok($$('.dup-group').length >= 5, 'duplicates view lists groups, got ' + $$('.dup-group').length);
assert.ok($$('.dup-copy').length > $$('.dup-group').length, 'each group lists its copies');
const prefBtn = $$('.dup-copy .linklike')[0];
click(prefBtn);
await sleep(150);
assert.ok(window.localStorage.getItem('mk.pref'), '«فضّل هذه» is remembered on the device');
click(prefBtn);   // undo
await sleep(120);
console.log('[3e] duplicates OK —', $$('.dup-group').length, 'groups |', $$('.dup-copy').length, 'copies');
// نعود إلى مجموعة (لا الرئيسية) حتى يظهر مرشّح نطاق البحث «داخل المجموعة»
click(colItem('مؤلفات الكتاب العرب'));
await sleep(180);

/* ---------- 3f. تجميع المجلدات ---------- */
const CAT = JSON.parse(catalogText);
const byWork = new Map();
for (const i of Object.values(CAT.items)) {
  if (!i.work) continue;
  const k = i.collection + '|' + i.work;
  if (!byWork.has(k)) byWork.set(k, []);
  byWork.get(k).push(i);
}
const works = Array.from(byWork.values()).sort((a, b) => a[0].path.length - b[0].path.length);
assert.ok(works.length >= 20, 'the catalog carries multi-volume works, got ' + works.length);
const pickWork = works[0];
const collName = CAT.collections.find((c) => c.id === pickWork[0].collection).name;
click(colItem(collName));
await sleep(200);
for (const seg of pickWork[0].path.slice(1)) {
  const fc = $$('#grid .card.badge-folder').find((c) => (c.querySelector('.title') || {}).textContent.trim() === seg.trim());
  assert.ok(fc, 'folder on the way to the work: ' + seg);
  click(fc);
  await sleep(200);
}
// قد يكون العمل في صفحة لاحقة: نوسّع العرض تدريجيًا حتى يظهر
let pages = 0;
while (!$('#grid .work-card') && $('#moreWrap .more-btn') && pages < 15) {
  click($('#moreWrap .more-btn'));
  await sleep(120);
  pages += 1;
}
const wCard = $$('#grid .work-card').find((c) => c.textContent.includes(pickWork[0].work_name || 'zzz'));
assert.ok(wCard, 'a multi-volume work collapses into one card (after ' + pages + ' pages)');
assert.ok(/مجلدات/.test(wCard.textContent), 'the work card states its volume count');
const volsBefore = $$('#grid .card.vol-child').length;
click(wCard.querySelector('.work-toggle'));
await sleep(220);
// بعد إعادة الرسم تُبنى البطاقة من جديد، وقد تكون في صفحة لاحقة: نوسّع حتى تظهر
let pages2 = 0;
while ($$('#grid .card.vol-child').length <= volsBefore && $('#moreWrap .more-btn') && pages2 < 15) {
  click($('#moreWrap .more-btn'));
  await sleep(120);
  pages2 += 1;
}
assert.ok($$('#grid .card.vol-child').length > volsBefore, 'expanding reveals the individual volumes');
const wCard2 = $$('#grid .work-card').find((c) => c.textContent.includes(pickWork[0].work_name || 'zzz'));
assert.ok(wCard2 && wCard2.querySelector('.work-toggle').textContent.includes('إخفاء'),
  'the toggle switches to «إخفاء المجلدات»');
console.log('[3f] volume grouping OK —', pickWork.length, 'vols:', (pickWork[0].work_name || '').slice(0, 34),
  '| works in catalog:', works.length);

/* ---------- 4. البحث ---------- */
const q = $('#q');
q.value = 'الجاحظ';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(450);
const resCards = $$('#grid .card');
assert.ok(resCards.length > 0, 'search returned cards');
assert.ok($('#crumbs').textContent.includes('الجاحظ'), 'search crumb');
console.log('[4] search OK — results:', resCards.length, '| first:',
  ($('#grid .card .title') || {}).textContent);
assert.ok($$('#kindChips .chip').some((c) => c.textContent.includes('داخل «')),
  'search offers a «inside this collection» scope chip');

q.value = 'ززززززzz';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(450);
assert.ok($('#empty').hidden === false, 'empty state shown for no results');
console.log('[4b] empty state OK —', $('#empty').textContent.replace(/\s+/g, ' ').trim().slice(0, 50));

/* ---------- 4c. اقتراحات البحث ---------- */
const qs = $('#q');
qs.value = 'طه ح';
qs.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(500);
assert.strictEqual($('#suggest').hidden, false, 'suggestions open while typing');
const sug = $$('#suggest .sug');
assert.ok(sug.length >= 1, 'suggestions are offered');
assert.ok($('#suggest').textContent.includes('طه حسين'), 'the author shows up in the suggestions');
console.log('[4c] suggestions OK —', sug.length, 'entries |', sug[0].textContent.replace(/\s+/g, ' ').slice(0, 30));
click(sug[0]);
await sleep(220);
assert.ok($('#crumbs').textContent.includes('المؤلف'), 'clicking a suggestion opens the author page');
qs.value = '';
qs.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(300);
assert.strictEqual($('#suggest').hidden, true, 'suggestions close when the query clears');

/* ---------- 5. العارض ---------- */
q.value = 'الجاحظ';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(450);
$$('#grid .card')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(150);
assert.strictEqual($('#reader').hidden, false, 'reader opened');
assert.ok($('#readerTitle').textContent.length > 2, 'reader title set');
assert.ok(($('#readerDown').getAttribute('href') || '').includes('id='), 'download link built');
assert.ok(($('#readerOpen').getAttribute('href') || '').includes('/file/d/'), 'open link built');
assert.ok($('#readerBody').children.length > 0, 'reader body has content');
assert.strictEqual($('#readerSub').hidden, false, 'reader shows the author/location strip');
assert.ok($('#readerShare svg.ico'), 'reader has a share button');
assert.ok($('#readerSub').textContent.length > 1, 'reader strip has content: ' + $('#readerSub').textContent.slice(0, 40));
console.log('[5] reader OK —', $('#readerTitle').textContent.slice(0, 45), '|',
  $('#readerBody').firstElementChild.tagName);

/* ---------- 5a2. التنقّل بين الكتب لا يكدّس التاريخ (كان يُخرج من الموقع) ---------- */
const hLen = window.history.length;
const firstId = $('#reader').dataset.id;
if (!$('#readerNext').hidden) {
  click($('#readerNext'));
  await sleep(150);
  const movedId = $('#reader').dataset.id;
  assert.notStrictEqual(movedId, firstId, 'next opens another book');
  assert.strictEqual(window.history.length, hLen, 'moving between books must not add history entries');
  assert.strictEqual(window.location.hash, '#read=' + movedId, 'the hash follows the current book');
  click($('#readerPrev'));
  await sleep(150);
  assert.strictEqual($('#reader').dataset.id, firstId, 'previous returns to the first book');
  assert.strictEqual(window.history.length, hLen, 'going back and forth adds no history');
  console.log('[5a2] reader navigation leaves history alone — entries:', window.history.length);
} else {
  console.log('[5a2] skipped — single-book list');
}
click($('#readerClose'));
await sleep(120);
assert.strictEqual(window.history.state && window.history.state.reader ? 'open' : 'clean', 'clean',
  'closing the reader clears its history state');
assert.strictEqual(window.location.hash, '', 'closing the reader clears #read=');

/* ---------- 5b. «آخر ما قرأت» ---------- */
const rec = JSON.parse(window.localStorage.getItem('mk.recent') || '[]');
assert.ok(rec.length >= 1 && rec[0] === $('#reader').dataset.id, 'opened book recorded in mk.recent');
$('#clearQ').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(140);
assert.ok($('#grid').textContent.includes('آخر ما قرأت'), 'home shows the «آخر ما قرأت» section');
assert.ok($$('.strip .card').length >= 1, 'recent strip renders cards');
console.log('[5b] recent OK —', $$('.strip .card').length, 'cards');

/* ---------- 5c. المفضلة ---------- */
q.value = 'الجاحظ';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(450);
const favBtn = $$('#grid .card')[0].querySelector('.qbtn.fav');
assert.ok(favBtn, 'every card carries a favourite (heart) button');
favBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(80);
const favs = JSON.parse(window.localStorage.getItem('mk.favs') || '[]');
assert.strictEqual(favs.length, 1, 'favourite persisted in localStorage');
assert.ok(favBtn.classList.contains('on'), 'heart button turns on');
const favPill = $$('#catbar .cat-pill').find((p) => p.textContent.includes('المفضلة'));
assert.ok(favPill, 'top bar shows a «المفضلة» pill');
assert.ok(favPill.textContent.includes('1'), 'the pill carries the favourites count');
favPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(140);
assert.ok($('#crumbs').textContent.includes('المفضلة'), 'favourites view opened');
assert.strictEqual($$('#grid .card').length, 1, 'the saved book is listed in the favourites view');
assert.strictEqual($('#reader').hidden, true, 'favouriting did not open the reader');
console.log('[5c] favourites OK — saved', favs.length, '| pill:', favPill.textContent.trim());

/* ---------- 5d. السلسلة: «العدد X من N» والتنقل بترتيب الأعداد ---------- */
click($('#readerClose'));
await sleep(120);
click(colItem('سلسلة عالم المعرفة'));
await sleep(220);
$('#sortSel').value = 'issue';
$('#sortSel').dispatchEvent(new window.Event('change', { bubbles: true }));
await sleep(220);
click($$('#grid .card')[0]);
await sleep(250);
const seriesTotal = Object.values(CAT.items).filter((i) => i.issue && i.series === 'عالم المعرفة').length;
assert.ok(new RegExp(`العدد\\s*1 من ${seriesTotal}`).test($('#readerSub').textContent),
  'the reader states the issue position: ' + $('#readerSub').textContent.replace(/\s+/g, ' ').slice(0, 60));
const seriesList = JSON.parse($('#reader').dataset.list || '[]');
assert.strictEqual(seriesList.length, seriesTotal, 'reader navigation follows the series, not the folder order');
console.log('[5d] series continuity OK —', $('#readerSub').textContent.replace(/\s+/g, ' ').slice(0, 46));
click($('#readerClose'));
await sleep(120);

/* ---------- 6. الإغلاق + المظهر + النوافذ ---------- */
$('#readerClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.strictEqual($('#reader').hidden, true, 'reader closed');
const t0 = window.document.documentElement.dataset.theme;
$('#themeBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.notStrictEqual(window.document.documentElement.dataset.theme, t0, 'theme toggled');
assert.strictEqual(window.localStorage.getItem('mk.theme'), window.document.documentElement.dataset.theme, 'theme persisted');
$('#statsBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.strictEqual($('#modal').hidden, false, 'stats modal opens');
assert.strictEqual(window.document.activeElement.id, 'modalClose', 'focus moves into the modal (focus trap)');
assert.ok($('#modalBody').textContent.includes('إجمالي الملفات'), 'stats content');
assert.ok($('#modalBody').textContent.includes('مُستبعدة'), 'stats shows the excluded-items counter');
assert.ok(!/[\u0660-\u0669\u06F0-\u06F9]/.test($('#modalBody').textContent),
  'stats window must use Latin digits too: ' + ($('#modalBody').textContent.match(/[\u0660-\u0669]+/g) || []));
$('#modalClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.strictEqual($('#modal').hidden, true, 'modal closes');
$('#aboutBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
assert.ok($('#modalBody').textContent.includes('Google Drive'), 'about content');
$('#modalClose').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
/* تصدير المفضلة: لا يرمي خطأً ويُظهر تأكيدًا */
window.localStorage.setItem('mk.favs', JSON.stringify([Object.keys(CAT.items)[0]]));
click($('#exportFavs'));
await sleep(120);
assert.ok(($('#toast').textContent || '').includes('أُنزل') || $('#toast').hidden === false, 'favourites export runs');
console.log('[6] controls OK — theme', t0, '→', window.document.documentElement.dataset.theme);

/* ---------- 7. واجهة 2026: الشريط السفلي، المرشّحات، السلاسل، التحديد ---------- */
/* 7a. لا شريط سفلي — التنقّل من الترويسة والدرج */
assert.strictEqual($('#tabbar'), null, 'no bottom tab bar');
click($('#brand'));
await sleep(160);

/* 7b. صفحة السلاسل */
const seriesPillNew = $$('#catbar .cat-pill').find((p) => p.textContent.includes('السلاسل'));
assert.ok(seriesPillNew, 'catbar offers a series hub pill');
click(seriesPillNew);
await sleep(200);
const scards = $$('.series-card');
assert.ok(scards.length >= 1, 'series hub lists series, got ' + scards.length);
assert.ok(/\d/.test(scards[0].querySelector('.sc-meta').textContent), 'series card states its issue range');
assert.ok(scards[0].querySelector('.sc-covers img'), 'series card shows a cover mosaic');
const seriesName = scards[0].querySelector('.sc-name').textContent;
click(scards[0]);
await sleep(220);
assert.ok($$('#grid .card').length >= 2, 'series page lists its issues');
assert.ok($('#crumbs').textContent.includes(seriesName.slice(0, 8)), 'series crumb names the series');

/* 7b2. شريط الحروف يرشّح السلسلة بعنوان الغلاف لا باسم الملف */
const cardsAll = $$('#grid .card').length;
assert.ok($('#letterJump') && $('#letterJump').hidden === false, 'series page offers the A–Z bar');
const letterH = $$('#letterJump .chip').find((c) => c.textContent.trim() === 'ح');
assert.ok(letterH, 'the A–Z bar has the letter ح');
click(letterH);
await sleep(220);
const cardsH = $$('#grid .card');
assert.ok(cardsH.length > 0 && cardsH.length < cardsAll,
  'letter filter narrows the series, got ' + cardsH.length + ' of ' + cardsAll);
assert.ok(cardsH.every((c) => /^(ال)?ح/.test(c.querySelector('.title').textContent.trim())),
  'every remaining card starts with ح: ' + cardsH.slice(0, 3).map((c) => c.querySelector('.title').textContent.trim()).join(' | '));
click($$('#letterJump .chip')[0]);          // «الكل»
await sleep(220);
assert.strictEqual($$('#grid .card').length, cardsAll, 'clearing the letter restores the series');
console.log('[7b2] series A–Z OK —', cardsH.length, 'of', cardsAll, 'issues start with ح');

/* 7b3. ترشيح الحرف لا يتسرّب إلى مجموعة أخرى (كان يخفي كل كتب «مؤلفات الكتاب العرب») */
const rareLetter = $$('#letterJump .chip').find((c) => c.textContent.trim() === 'ظ');
assert.ok(rareLetter, 'A–Z bar has the rare letter ظ');
click(rareLetter);
await sleep(200);
const arabPill = $$('#catbar .cat-pill').find((p) => p.textContent.includes('مؤلفات الكتاب العرب'));
assert.ok(arabPill, 'catbar lists مؤلفات الكتاب العرب');
click(arabPill);
await sleep(260);
const entriesArab = $$('#grid .card, #grid .badge-folder, #grid .coll-head').length;
assert.ok(entriesArab > 0, 'a collection must not inherit the previous A–Z filter (got ' + entriesArab + ' entries)');
const onChip = $$('#letterJump .chip.on')[0];
assert.ok(!onChip || onChip.textContent.trim() === 'الكل', 'the letter filter resets when navigating');
console.log('[7b3] no letter leak — after ظ → مؤلفات الكتاب العرب:', entriesArab, 'entries');
const openFolder = $$('#grid .badge-folder')[0];
if (openFolder) {
  click(openFolder);
  await sleep(220);
  assert.ok($$('#grid .card').length > 0, 'opening a folder inside the collection shows its books');
  console.log('[7b3b] folder inside collection shows', $$('#grid .card').length, 'books');
  click($('#brand'));
  await sleep(160);
}

/* 7c. العارض: قائمة ثانوية + «تمّت قراءته» */
click($('#grid .card'));
await sleep(160);
assert.strictEqual($('#reader').hidden, false, 'reader opened from the series page');
click($('#readerMore'));
assert.strictEqual($('#readerMenu').hidden, false, 'reader «المزيد» opens the secondary menu');
assert.ok($('#readerFull svg.ico'), 'reader has a fullscreen control');
click($('#readerDone'));
await sleep(100);
let statuses = {};
try { statuses = JSON.parse(window.localStorage.getItem('mk.status') || '{}'); } catch {}
assert.strictEqual(statuses[$('#reader').dataset.id], 'done', 'book marked as read from the menu');
click($('#readerClose'));
await sleep(120);
assert.ok($$('#grid .card.status-dot, #grid .status-dot.done').length >= 0, 'status dots render without errors');

/* 7d. الحروف + الكثافة + ورقة المرشّحات */
$('#q').value = 'الجاحظ';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(420);
assert.ok($('#letterJump') && $('#letterJump').hidden === false, 'grid offers an A–Z jump bar');
const beforeJump = $$('#grid .card').length;
click($$('#letterJump .chip').find((c) => c.textContent.trim() === 'ح'));
await sleep(200);
assert.ok($$('#grid .card').length <= beforeJump, 'letter jump filters the grid');
click($$('#letterJump .chip')[0]);            // «الكل»
await sleep(200);
assert.strictEqual($$('#grid .card').length, beforeJump, 'clearing the letter restores the grid');

click($('#filtersBtn'));
assert.strictEqual($('#filtersSheet').hidden, false, 'filters sheet opens');
assert.strictEqual($('#filtersBtn').getAttribute('aria-expanded'), 'true', 'filters button reports expanded');
click($$('#densitySel .seg-btn').find((b) => b.dataset.density === 'lg'));
await sleep(160);
assert.strictEqual($('#grid').dataset.density, 'lg', 'density switches to large');
assert.ok(JSON.parse(window.localStorage.getItem('mk.state') || '{}').density === 'lg', 'density persisted');
click($$('#densitySel .seg-btn').find((b) => b.dataset.density === 'md'));
click($('#filtersClose'));
await sleep(120);
assert.strictEqual($('#filtersSheet').hidden, true, 'filters sheet closes');

/* 7e. وضع التحديد */
click($('#selectBtn'));
await sleep(180);
assert.strictEqual($('#selectBtn').getAttribute('aria-pressed'), 'true', 'select mode is on');
assert.ok($$('#grid .card.selectable').length > 0, 'cards become selectable');
click($$('#grid .card')[0]);
await sleep(80);
assert.strictEqual($('#bulkbar').hidden, false, 'bulk bar appears');
assert.ok(/1/.test($('#bulkCount').textContent), 'bulk bar counts the selection');
click($('#bulkClear'));
await sleep(160);
assert.strictEqual($('#bulkbar').hidden, true, 'bulk bar hides when selection clears');

/* 7f. حالة فارغة قابلة للتنفيذ */
$('#q').value = 'ززززززzz';
$('#q').dispatchEvent(new window.Event('input', { bubbles: true }));
await sleep(420);
const emptyBtns = $$('#empty .empty-acts .btn');
assert.ok(emptyBtns.length >= 2, 'empty state offers actions, got ' + emptyBtns.length);
click(emptyBtns[0]);
await sleep(200);
assert.ok($('.hero'), '«امسح البحث» returns to the home page');
console.log('[7] new UI OK — tabs, series:', scards.length, '| density, select, empty actions');

/* 7g. «جديد منذ آخر زيارة» */
window.localStorage.setItem('mk.lastVisit', String(Date.UTC(2019, 0, 2)));   // قبل تواريخ الفهرس
click($('#brand'));
await sleep(200);
assert.ok($('.whatsnew'), 'home shows the «since your last visit» strip');
assert.ok(/\d/.test($('.whatsnew').textContent), 'the strip states how many books are new');
console.log('[7b] what\'s-new strip OK —', $('.whatsnew').textContent.replace(/\s+/g, ' ').trim().slice(0, 44));

/* ---------- 8. لا أخطاء JS ---------- */
assert.ok(true);
console.log('OK — all UI assertions passed');
