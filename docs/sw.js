/* عامل الخدمة (service worker) — يعمل في الخلفية داخل نطاق التطبيق ولا يخرج لأي دومين آخر.
   الهدف: يفتح التطبيق ويتصفّح الفهرس بلا شبكة، مع تحديث صحيح عند توفّر الشبكة.
   ملفات درايف (الأغلفة والكتب) لا تُخزَّن هنا: تبقى من الشبكة كما هي.
   عند تغيير أي ملف من قشرة التطبيق، ارفع رقم الإصدار: كاش-N → كاش-N+1. */
const CACHE = 'maktaba-cache-43';

const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './fonts/fonts.css',
  './fonts/noto-kufi-arabic.woff2',
  './fonts/noto-kufi-latin.woff2',
  './fonts/noto-naskh-arabic.woff2',
  './js/app.js',
  './js/data.js',
  './js/reader.js',
  './js/util.js',
  './js/user.js',
  './img/icon.svg',
  './img/favicon.svg',
  './manifest.webmanifest',
  './data/catalog.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => null)               // ملف ناقص لا يمنع التثبيت
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter((k) => k !== CACHE);
    await Promise.all(stale.map((k) => caches.delete(k)));
    await self.clients.claim();
    // ترقية فعلية (كانت هناك نسخة قديمة): أعِد تحميل كل نافذة مفتوحة،
    // وإلا بقي المستخدم على الصفحة القديمة المخزّنة ولا يرى التحديث إلا لاحقًا.
    if (stale.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { c.navigate(c.url); } catch (x) {} }
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // درايف يبقى خارج الكاش

  const isCatalog = url.pathname.endsWith('/api/catalog');
  /* القشرة (html/js/css/fonts) والفهرس: الشبكة أولًا ثم الكاش — وإلا بقي المستخدم
     يرى نسخة قديمة بعد كل تعديل لأن cache-first يخزّن الجديد للتحميل التالي. */
  const isShell = req.mode === 'navigate' || isCatalog ||
    ['/index.html', '/css/app.css', '/js/app.js', '/js/data.js', '/js/reader.js',
     '/js/user.js', '/js/util.js', '/fonts/fonts.css'].some((p) => url.pathname.endsWith(p)) ||
    url.pathname.endsWith('/');

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (isShell) {
      const fresh = await network;
      if (fresh && fresh.ok) return fresh;
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
    } else {
      const cached = await cache.match(req, { ignoreSearch: isCatalog });
      if (cached) { network; return cached; }      // stale-while-revalidate للباقي
      const res = await network;
      if (res) return res;
    }
    return new Response('غير متصل — لا نسخة مخزّنة بعد', {
      status: 504, statusText: 'offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});