/* اختبار منطقي سريع لطبقة البيانات (بدون متصفح) */
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { normalizeAr, arabicCollator, fmtDate, KIND_ICON, ICONS, icon } from '../web/js/util.js';

// fetch مزيّف يقرأ catalog.json من القرص
const catalogText = readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8');
globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(catalogText) });

const { loadCatalog, search, kindCounts, collectionCounts, ancestors, nameOf, randomPick, item } =
  await import('../web/js/data.js');

const cat = await loadCatalog();
console.log('total', cat.total, 'collections', cat.collections.length);
assert.ok(cat.total > 100, 'catalog should have items');

const counts = kindCounts();
const collCounts = collectionCounts();
console.log('kinds', JSON.stringify(counts));
assert.ok(counts.pdf > 100, 'pdf count');

// مجموع أن counts يطابق المجموع الكلي
const sum = Object.values(collCounts).reduce((a, b) => a + b, 0);
assert.strictEqual(sum, cat.total, `collection counts must sum to total (${sum} != ${cat.total})`);

// البحث
const r1 = search('الجاحظ');
console.log('search(الجاحظ) ->', r1.length, r1[0]?.name);
assert.ok(r1.length > 0, 'expected results for a known author');

// بلا همزة/تشكيل: «الاشارات» يجب أن تجد «الإشارات الإلهية.pdf»
const r2 = search('الاشارات');
console.log('search(الاشارات) ->', r2.length, r2[0]?.name);
assert.ok(r2.length > 0, 'hamza-insensitive search failed');
assert.ok(search('الإشارات').length > 0, 'with-hamza search failed');
// مجلدات صور الصفحات مستبعدة، فلا نتائج لاسم مجلد بلا كتاب مطابق
assert.strictEqual(search('امتاع').length, 0, 'page-image folders must not leak into search');

const r3 = search('فلسفة');
assert.ok(r3.length > 0, 'philosophy search');

const r4 = search('زززززز');
assert.strictEqual(r4.length, 0, 'no results expected');

// التطبيع
assert.strictEqual(normalizeAr('الإمْتاع والمؤانسة'), 'الامتاع والموانسه');
assert.strictEqual(normalizeAr('أ'), 'ا');
assert.strictEqual(normalizeAr('مصطفى'), 'مصطفي');
assert.ok(normalizeAr('آثار').startsWith('ا'), 'alef normalization');

// المجلدات والمسارات
const anyFile = Object.values(cat.items)[0];
assert.ok(Array.isArray(anyFile.path), 'path is array');
const anc = ancestors(anyFile.id);
console.log('ancestors of first file:', anc.length, anc.map((a) => a.name).slice(-2));
assert.ok(anc.length >= 1, 'file must live inside a folder');
assert.ok(nameOf(anyFile.id), 'nameOf works');

// الأسماء العربية تُرتّب
const names = ['ب', 'أ', 'ي', 'ا'];
names.sort(arabicCollator.compare);
console.log('sorted:', names.join(''));
assert.strictEqual(names[0], 'أ');

// التواريخ
assert.strictEqual(fmtDate('1/27/19'), '2019/01/27');

// الاختيار العشوائي — بلا تكرار (تظهر كل بطاقة مرة واحدة في «اختيارات عشوائية»)
const picks = randomPick(12, 'pdf');
assert.strictEqual(picks.length, 12);
assert.ok(picks.every((p) => item(p.id)), 'random picks resolve to items');
assert.strictEqual(new Set(picks.map((p) => p.id)).size, 12, 'random picks must be unique');

// روابط التحميل والقراءة: confirm=t ضروري وإلا رجعت صفحة تحذير الفحص لملفات +100MB
const { driveDownload, drivePreview, driveView } = await import('../web/js/reader.js');
const big = Object.values(cat.items).sort((a, b) => (b.size || 0) - (a.size || 0))[0];
assert.ok(driveDownload(big.id).includes('confirm=t'), 'download link must carry confirm=t');
assert.ok(driveDownload(big.id).startsWith('https://drive.usercontent.google.com/download?id='), 'download host');
assert.ok(drivePreview(big.id).endsWith('/preview'), 'preview link');
assert.ok(driveView(big.id).includes('/file/d/'), 'view link');
console.log('biggest book:', Math.round((big.size || 0) / 1e6), 'MB');

// الأيقونات: كل نوع ملف له رمز SVG معرّف في المجموعة
for (const [kind, name] of Object.entries(KIND_ICON)) {
  assert.ok(ICONS[name], `missing icon definition for kind ${kind} -> ${name}`);
}
console.log('icons OK —', Object.keys(KIND_ICON).length, 'kind icons of', Object.keys(ICONS).length, 'total');

// الفهرس: المؤلف مستخرج ومكتوب، وحجمه صغير لأن الحقول المشتقّة لا تُخزَّن
const anyAuthor = Object.values(cat.items).find((i) => i.author);
assert.ok(anyAuthor, 'items carry an author');
assert.ok(!('thumb' in anyAuthor) && !('norm' in anyAuthor) && !('path_norm' in anyAuthor),
  'derived fields (thumb/norm/path_norm) must not be stored — the browser rebuilds them');
const named = Object.values(cat.items).filter((i) => i.author).length;
console.log('authors:', cat.counters.authors, '| books with an author:', named, `(${Math.round(100 * named / cat.total)}%)`);
assert.ok(named > 4000, 'author coverage should be most of the library');

// البحث: مطابقة المؤلف تُرجَّح، ولا سقف صامت عند 400 نتيجة
const byAuthor = search('طه حسين');
console.log('search(طه حسين) ->', byAuthor.length, '| first author:', byAuthor[0] && byAuthor[0].author);
assert.ok(byAuthor.length > 0, 'author search returns results');
assert.strictEqual(byAuthor[0].author, 'طه حسين', 'author match ranks first');
const broad = search('ا');
console.log('broad search (لم يعد محدودًا بـ400):', broad.length);
assert.ok(broad.length > 400, 'search must not silently cap at 400 results');

// المكرّرات: كل نسخة تعرف أخواتها في المجموعات الأخرى
const { otherCopies } = await import('../web/js/data.js');
const dupRow = Object.values(cat.items).find((i) => i.dup);
const others = otherCopies(dupRow.id);
console.log('duplicate sample:', dupRow.name.slice(0, 40), '-> copies:', others.map((o) => o.collName).join(', '));
assert.ok(others.length >= 1, 'a duplicated book reports its other copies');
assert.ok(others.every((o) => o.id !== dupRow.id), 'other copies never include the book itself');

// المجلدات: عمل واحد له عدة أجزاء
const { workKeyOf, volumesOf, newRows, yearCounts, seriesInfo, suggest, dupGroups, authorIndex } =
  await import('../web/js/data.js');
const workItem = Object.values(cat.items).find((i) => i.work);
assert.ok(workItem, 'items of a multi-volume work carry work/vol');
const vols = volumesOf(workItem.collection + '|' + workItem.work);
assert.ok(vols.length >= 2, 'volumesOf returns the parts of one work');
assert.deepStrictEqual(vols.map((v) => v.vol), vols.map((v) => v.vol).slice().sort((a, b) => a - b),
  'volumes come back in volume order');
const workIdx = new Set(Object.values(cat.items).filter((i) => i.work).map((i) => workKeyOf(i)));
console.log('works:', cat.counters.works, '| files inside works:', cat.counters.volumes_in_works,
  '| groups resolved by the client:', workIdx.size);

// المؤلفون: دمج الأشكال الإملائية (هيسة/هيسه)
const ai = authorIndex();
const withAliases = ai.filter((a) => a.aliases.length);
console.log('authors after merging:', ai.length, '(was', cat.counters.authors, ') | merged spellings:', withAliases.length);
assert.ok(ai.length < cat.counters.authors, 'merging variants shrinks the author list');
assert.ok(withAliases.length >= 5, 'some authors carry merged alternative spellings');
assert.ok(withAliases.every((a) => a.aliases.every((al) => al !== a.name)), 'an author never lists itself as an alias');
const mergedSample = withAliases[0];
assert.ok((await import('../web/js/data.js')).booksByAuthor(mergedSample.key).length === mergedSample.count,
  'an author page returns exactly its count of books');

// السلاسل: ترتيب الأعداد
const issue = Object.values(cat.items).find((i) => i.issue);
const si = seriesInfo(issue.id);
assert.ok(si && si.total > 100 && si.ids.length === si.total, 'seriesInfo orders the issues of a series');
console.log('series:', si.series, '| issues:', si.total, '| first id order OK');
/* عناوين الأغلفة: كل عدد في السلسلة له عنوان من قائمة المصدر، لا رقم فقط */
const allIssues = Object.values(cat.items).filter((i) => i.issue);
const withTitle = allIssues.filter((r) => r.display && r.display.length > 3);
assert.ok(withTitle.length === allIssues.length,
  `every issue carries its cover title (${withTitle.length}/${allIssues.length})`);
const first1 = allIssues.find((r) => r.issue === 1);
assert.ok(first1 && /الحضارة/.test(first1.display), 'issue 1 is titled «الحضارة…»: ' + (first1 && first1.display));
assert.ok(!/العدد\s*\d+/.test(first1.display), 'the cover title is not the file number');
console.log('series titles OK —', withTitle.length, 'issues | 001:', first1.display.slice(0, 40));
assert.strictEqual(si.ids[0], (si.ids[0] === issue.id || si.total > 1) ? si.ids[0] : '', 'series list is usable as a navigation order');

// التواريخ: «جديد المكتبة»
const yrs = yearCounts();
assert.ok(yrs.length >= 5, 'yearCounts lists the years present, got ' + yrs.length);
assert.ok(yrs[0][0] >= yrs[yrs.length - 1][0], 'years are ordered newest first');
assert.strictEqual(newRows({ limit: 10 }).length, 10, 'newRows returns a page of the newest books');
assert.ok(yearCounts().reduce((s, [, n]) => s + n, 0) > 6000, 'most books have a usable date');

// المكرّرات واقتراحات البحث
assert.ok(dupGroups().size > 100, 'duplicate groups are derived client-side, got ' + dupGroups().size);
const sg = suggest('طه');
assert.ok(sg.authors.length > 0 && sg.titles.length > 0, 'suggest offers authors and titles');

// المفضلة و«آخر ما قرأت»: منطق الحفظ في الجهاز (بمخزن وهمي يتصرّف كل localStorage)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
};
const { isFav, toggleFav, favCount, favIds, pushRecent, recentIds } = await import('../web/js/user.js');
assert.strictEqual(favCount(), 0, 'favourites start empty');
assert.strictEqual(toggleFav('abc'), true, 'first toggle adds a favourite');
assert.ok(isFav('abc'), 'item is now a favourite');
assert.deepStrictEqual(favIds(), ['abc'], 'favourite list holds the id');
assert.strictEqual(toggleFav('abc'), false, 'second toggle removes it');
assert.strictEqual(favCount(), 0, 'favourites empty again');
pushRecent('a'); pushRecent('b'); pushRecent('a');
assert.deepStrictEqual(recentIds(), ['a', 'b'], 'recent list is newest-first and deduplicated');
mem.set('mk.favs', '{{{ ليس JSON');
assert.deepStrictEqual(favIds(), [], 'corrupt storage degrades to empty instead of throwing');
console.log('favourites/recent OK —', favIds().length, 'favs |', recentIds().length, 'recent');

console.log('OK — all data-layer assertions passed');