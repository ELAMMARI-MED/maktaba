# مكتبة — Library of books (Google Drive)

A local Arabic RTL web app that indexes public Google Drive folders of books so you can
browse, read in-app, and download them. No files are copied to this device — the app keeps
a catalog of Drive file IDs, sizes, and links only; reading happens through Drive's preview
frame and every book has its own download button.

    ~/maktaba/
      server.py              stdlib HTTP server + /api/*   (port 8112)
      scripts/crawl.py       walks the shared Drive folders -> data/<name>.json
      scripts/size_probe.py  fills data/sizes.json (byte size per file)
      scripts/build_catalog.py  merges crawl + sizes -> data/catalog.json (organizes it)
      web/                   the SPA (index.html, css/app.css, js/*.js)
      data/                  crawl output + sizes.json + catalog.json
      test/                  smoke.mjs (data layer) + ui.mjs (jsdom UI)
    ~/start-maktaba.sh       launcher (binds 0.0.0.0:8112)

## Live demo (GitHub Pages)

https://elammari-med.github.io/maktaba/

GitHub Pages serves static files only, so the site ships its catalog as a file instead of an API:
`loadCatalog()` tries `api/catalog` first and falls back to `data/catalog.json`. Rebuild the published
folder after any change to `web/` or the catalog:

    python scripts/build_pages.py      # web/ → docs/, data/catalog.json → docs/data/catalog.json
    git add -A && git commit -m "pages: rebuild" && git push

The service worker precaches the static catalog, so the demo also works offline after the first visit.
Pages settings: branch `main`, folder `/docs`.

## Run

    git clone https://github.com/ELAMMARI-MED/maktaba.git
    cd maktaba && ./start.sh             # http://127.0.0.1:8112  (or http://<phone-ip>:8112)
    pkill -f "python server[.]py"        # stop
    python server.py                     # same thing, direct

Requirements: Python 3.9+ (stdlib only, no pip installs) and Node 18+ only if you want to run the
tests. The catalog ships with the repo, so it runs straight after cloning.

What is *not* in the repo: the raw crawl dumps (`all_roots_d4.json` & friends, ~65 MB) and the catalog
snapshots. They are regenerable with `scripts/crawl.py` + `scripts/size_probe.py`, and `.gitignore`
keeps them out.

## What is indexed now

6,606 books / 7 collections / 5 sections / 53.68 GB — **every book carries its size**
(the size probe now falls back to a ranged `Content-Range` request, and retries ids it stored
as `null`, so `data/sizes.json` has no holes):

  الأدب والتراث العربي    مؤلفات الكتاب العرب (813) · كتب متنوعة (1,415)
  الفكر والفلسفة          كتاب عالميون (1,781) · فكر فلسفة معارف عامة (1,196)
  الترجمة والعلوم         المنظمة العربية للترجمة (161)
  المعاجم والموسوعات      موسوعات ومعاجم وقواميس (728)
  السلاسل والدوريات       سلسلة عالم المعرفة (512)

Also flagged: 670 books that exist in more than one collection (chip «إخفاء المكرر»).

## Coverage is proven, not assumed

`data/all_roots_d4.json` is the authoritative crawl: all 7 roots at depth 4, **0 nodes
carrying `"truncated": true`**. Check it after every crawl before promising coverage:

    python - <<'PY'
    import json
    d = json.load(open('data/all_roots_d4.json'))
    nodes = []
    def walk(ns):
        for n in ns:
            nodes.append(n); walk(n.get('children', []))
    walk(d['roots'])
    print('truncated:', sum(1 for n in nodes if n.get('truncated')), 'of', len(nodes), 'nodes')
    PY

Depth 2 was **not** enough: it left 24 folders unread (all under «مؤلفات الكتاب العرب»),
which is why the whole library is now crawled at depth 4 in one pass. The older crawl files
(`depth2.json`, `depth3_all.json`, `new_roots*.json`) are superseded; they are kept for
reference only and must not be passed to `build_catalog.py` any more — two of them carry a
wrong-case folder id (`1VMtjli…` vs the correct `1VMtjIi…`), which is silently empty.

## Design system notes

Colour, texture and type tokens live at the top of `web/css/app.css` and in the block titled
«هوية بصرية». The rules that matter when editing:

- Green is the brand: primary actions, the hero, the footer band. It is no longer used for backgrounds
  too — section boxes and cover frames sit on `--paper` (`#fbf8f1` light / `#101d17` dark), which gives
  the page depth without adding a hue. Mint (`--accent-2`) is for links and secondary actions only.
- `--sec-1..5` tint each section box at 6% and draw its 3px spine, so the five sections are
  distinguishable while the palette stays green.
- `--grain` is an inline SVG `feTurbulence` tile at ~5% alpha, applied to the hero, section boxes and
  footer. It replaces the old blurred circle; no image request, no extra file.
- Covers are treated as objects: inner white hairline, a 4px repeating page edge, and in dark mode
  `brightness(.9)` so white PDF pages do not glare.
- Type pairing: Noto Kufi Arabic for headings/UI, Noto Naskh Arabic (`fonts/noto-naskh-arabic.woff2`)
  for body copy, the reader note, empty states and the footer sentence. Both are local files.
- **Font URLs in `web/fonts/fonts.css` are relative to that file** (`url('noto-kufi-arabic.woff2')`).
  Writing `url('fonts/noto-kufi-arabic.woff2')` resolves to `/fonts/fonts/…` and silently 404s, which
  leaves the whole app on a fallback font — that bug was live until this pass.
- Motion tiers: `--speed-chip` 120ms, `--speed-card` 160ms, `--speed-sheet` 220ms. Shadows are
  green-tinted (`--shadow*`), never neutral black on a green page.

## Series titles (عالم المعرفة)

Drive names the 511 issues only `عالم المعرفة — العدد NNN.pdf`, so the library used to show a number
where a book title belongs. The real titles are on the covers and in the published index, and they now
live in the catalog:

    python scripts/series_titles.py         # Wikipedia lists (1-250, 251-500, 501-750) → data/series_titles.json
    python scripts/apply_series_titles.py   # writes display / title_author into data/catalog.json (idempotent)

511/511 issues matched. `display` replaces the file name on the card, in the reader title and in the
sort order; `name` is untouched because it is the download filename, and the issue number stays visible
as metadata (العدد N). Search matches the cover title as well as the file name, and the cover author is
used when the folder gave none — so «حسين مؤنس» finds issue 001 «الحضارة: دراسة في أصول وعوامل قيامها
وتطورها». The apply script also refreshes `counters.authors`, which is what keeps the client's
author-merge check honest.

## Interface (2026 pass)

Navigation lives in the topbar (brand → home, «المجموعات» → drawer) and the category pills;
there is no bottom tab bar. The topbar compacts after 120px of scroll.

The toolbar is now: kind chips + A–Z jump bar + two buttons.

    المرشّحات   bottom sheet: sort, card density (صغير/متوسط/كبير), folders-first, list view, group volumes
    تحديد       multi-select: a checkbox on every card, then «أضف للمفضلة» / «صدّر الروابط»

Reading state lives in `mk.status` (localStorage): opening a book marks it «قيد القراءة» (amber dot),
the reader's «المزيد» menu marks it «تمّت قراءته» (green dot). Home puts reading books first in
«آخر ما قرأت» and shows «جديد منذ آخر زيارة» by comparing `mk.lastVisit` with Drive modification dates.

Also: series hub (`السلاسل`) with issue ranges and a cover mosaic, a «جديد» ribbon for files modified
in the last 30 days, reader fullscreen + a «?» shortcut sheet, empty states that carry their own
actions, plus a skip link and `aria-current` on the active pill.

Covers come from Drive's thumbnail endpoint, and **every cover `<img>` must carry
`referrerpolicy="no-referrer"`**. Drive answers `429` to `drive.google.com/thumbnail?id=…` when the
request includes a `Referer` from localhost (the app's own origin), so without that attribute the
browser shows an empty cover while `curl` — which sends no referrer — fetches the same PNG happily.
That was the whole "blank cover with a letter" bug. Retries now walk three URLs: thumbnail → thumbnail
with `&r=1` → `lh3.googleusercontent.com/d/<id>=w600`, and only then does the card show a generated
title page instead of an empty box: green spine, monogram, book title and author (`.cover-fallback`).
Section tiles use the same fallback, monogram only.
The «جديد» pill was removed from the top bar; new arrivals stay reachable from the drawer and from the
«استعرض» button in the since-last-visit strip.

`test/ui.mjs` section [7] covers them: tabs, series page, reader menu + «تمّت قراءته», letter jump,
density, select mode, actionable empty state and the «since your last visit» strip.

## Refresh the catalog

    cd ~/maktaba
    python scripts/crawl.py data/all_roots_d4.json 4 \
      18f1hsMkB9zouUOiaZJTchk5JlarKqRzv:"مؤلفات الكتاب العرب" \
      1sICW4Ecqu8NjJ919SNsz5B0WfZBkGuT6:"فكر فلسفة معارف عامة" \
      1297LLdMmIXRWqljt4op8L3_7M3xdf1L9:"كتب متنوعة" \
      1Nw1HBQEE3XADAhYLv7QEKsu2w2yTVWsz:"موسوعات ومعاجم وقواميس" \
      1VMtjIiWopE49128vh_vFpJtT4iie_voT:"كتاب عالميون" \
      1mDsWkjg3zKl8cagUX0yCANjrW0sv3Sa2:"سلسلة عالم المعرفة" \
      1mfwn5XeRDFuCI9tg5Zes7_j4noQ0Nr0C:"المنظمة العربية للترجمة"
    python scripts/build_catalog.py data/catalog.json data/all_roots_d4.json   # filter to books
    python scripts/size_probe.py --workers 6                                    # new files only
    python scripts/build_catalog.py data/catalog.json data/all_roots_d4.json    # merge sizes

The crawl takes ~13 min (671 folders, 93,139 file entries) and writes its JSON only at the
end — run it in the background. The size probe only asks about ids with no size in
`sizes.json` (missing *or* stored as `null`), so the second run is quick.

**Drive folder ids are case-sensitive.** A single wrong letter case returns the Drive 404
page, which looks exactly like a private folder. Copy ids verbatim and test one first:

    curl -s -o /dev/null -w '%{http_code}\n' -A 'Mozilla/5.0' \
      https://drive.google.com/drive/folders/<id>          # 200 = public, 404 = wrong id or private

Notes:
- Only public "anyone with the link" folders can be crawled.
- Scanned page dumps (`imageimage(N).png`), reader UI leftovers (`core.js`, `blank.html`) and
  other non-book files are dropped; without that one crawl yields ~85k junk entries vs ~6.6k books.

## Accessibility

`role="dialog" aria-modal="true"` plus a focus trap on the reader and the stats/about windows
(`trapFocus` in `util.js`) so Tab cannot wander into the page behind them; result counts announce
through `role="status"`; covers are requested in a staggered burst (6 immediately, then one every
60 ms) instead of 60 at once, which is what made Drive refuse a few of them.

## Tests

    cd ~/maktaba
    node test/smoke.mjs     # data layer: search, normalization, counts, sizes, links, favourites/recent
    node test/ui.mjs        # full UI in jsdom: home sections, paging, browse, search, reader, theme, favourites

`test/ui.mjs` needs jsdom from `~/maktaba-tools` (absolute path inside the test).
It also guards two things a browser would hide:
- the CSS contract that the reader/modal overlays respect `hidden` — without
  `[hidden] { display: none !important; }` a real browser breaks the whole page;
- the **green** identity (`--accent: var(--green-700)`), so the palette cannot silently
  slide back to blue.

## Content indexes (works · author · series · duplicates · what's new)

- **Multi-volume works**: `build_catalog.py` detects «… 1.pdf / … 2.pdf / المجلد 3» and writes
  `work` (normalized base) + `vol`. With «تجميع المجلدات» on (default) the browse view collapses
  them into one card — «15 مجلدات» — whose button expands the individual volumes. 161 works absorb
  711 files. Seriess issues opt out (`issue` set → no `work`), or «عالم المعرفة» collapses into a
  single 511-volume "book". The grouping keeps the **selected sort order**: the work card sits where
  its first volume would, so «رقم العدد» still puts العدد 001 first.
- **«جديد المكتبة»**: every book has a Drive modified date (6,604/6,606); the view lists newest first
  with a year filter (2025: 512، 2023: 159، 2019: 1,866…).
- **Duplicate screen**: 346 groups listed side by side (collection, size, date) with «فضّل هذه»,
  remembered on the device (`mk.pref`) and shown first. The reader also offers «نسخة أخرى في…».
- **Sources**: author fields and link data come from `data/catalog.json` + `data/link_check.json`.


- **Author** is derived at build time in `build_catalog.py` (`author_of`), from the filename pattern
  «الكتاب - المؤلف.pdf» (first choice) or from the folder the book sits in, when that folder name
  looks like a person (`looks_like_person`). 4,837 of 6,606 books (73%) end up with an author, in
  2,170 distinct names — أجاثا كريستي (173)، طه حسين (53)، عبد الرحمن بدوي (47)…
  The folder rule has a **word-boundary** stop list: `\bدين\b` must not match «نور الدين الزهي»,
  and publishers/themes (الهيئة، المركز، فكر فلسفة معارف) must not become authors. Volumes are
  stripped too, so «بلوتارك 3» → `بلوتارك`. Search ranks an author match above a title match.
- **Series**: `سلسلة عالم المعرفة` issues carry `series`/`issue`; the sort selector has
  «رقم العدد (السلاسل)» and each card shows its issue number.
- **Duplicates**: build_catalog flags `dup`; the SPA groups rows by normalized name
  (`dupGroups`, `otherCopies`) and the reader shows «نسخة أخرى في <collection> — الحجم · التاريخ»
  with a button that opens that copy. 670 books sit in 346 name-groups (253 byte-identical,
  93 differing in size — a different edition or scan).

## Finding things

- **Autocomplete** under the search box: matching authors (with counts) and matching titles; a click
  opens the author page or the book itself.
- **Alphabet bar** on the المؤلفون page (2,023 authors after merging), plus typing to filter.
- **Search** has no cap (it returns all 6,606 when everything matches) and pages the result list.
- **Export**: «تصدير المفضلة» in the drawer writes a text file of favourites + links; «تصدير الروابط»
  in the toolbar writes every link of the folder you are looking at (for a download manager).
- **Share** in the reader uses the phone's share sheet (`navigator.share`), falling back to copying.
- **Series continuity** in the reader: «العدد 45 من 511 — عالم المعرفة» and prev/next by issue.

## Offline shell

`web/sw.js` caches the app shell and the catalog (stale-while-revalidate) so the library opens and
browses with no server; Drive files are deliberately left out of the cache. Bump `CACHE`
(`maktaba-cache-1` → `…-2`) whenever a shell file changes, or the browser keeps serving the old one.

## Link integrity

`python scripts/link_check.py --workers 4` ranged-GETs every catalogued id (2 bytes each) and
writes `data/link_check.json` with a status per file: `ok_206`, `warning_200` (Drive answered with
a page instead of bytes), `dead` (real 4xx/5xx) and `unreachable` (curl got no response at all).
Sweep before promising "every book is downloadable".

**Never read a `0` as "this file is dead".** At 8 concurrent workers Drive refuses a slice of the
requests, curl returns nothing and the id looks deleted — the first sweep here reported 277 "dead"
books, every one of which answered `206` when re-probed one at a time. The script therefore retries
a `0` up to 3 times with backoff, keeps `unreachable` separate from `dead`, and re-checks `0`s on
the next run instead of trusting them.

## Interface

- **Digits are Latin everywhere** (`1234567890`, thousands separator `,`), never Arabic-Indic
  (`١٢٣`): one formatter, `num()` in `web/js/util.js`, feeds the total pill, hero stats, chips,
  folder counts and the stats window — never call `toLocaleString('ar-EG')` in this app.
- **Green identity** (`#16a34a` light / `#4ade80` dark, mint gradient for accents), light + dark
  themes via the 🌙/☀️ button (persisted in `localStorage`), RTL by default, mobile-first spacing.
- **A hue per section** (`--sec-1…--sec-5`, separate light/dark values) tints each section box's top
  border and counts, its catbar pills and the collection header, so a shelf is recognisable at a
  glance. Green stays the app's own identity.
- **A cover mosaic in the hero**: 14 real front pages, masked to fade behind the title. The page
  reads as a library before a single word is read.
- **The typeface travels with the app**: Noto Kufi Arabic (arabic + latin subsets, 154 KB, variable
  400–700) is bundled under `web/fonts/` and listed first in `--sans`, so titles stop changing with
  each device's system font.
- **No permanent sidebar.** Navigation is two pieces: a horizontal `#catbar` of collection
  pills under the top bar (scrolls sideways, shows counts, marks the active collection, and
  carries the «المفضلة» pill) and a `#collSheet` drawer opened by the «المجموعات» button
  (backdrop click / Esc / any navigation closes it). The drawer holds the same pills grouped
  under their sections plus «إحصاء المكتبة» / «عن المكتبة».
- Home = hero → **section boxes** → «آخر ما قرأت» strip → random picks. Each section is one box:
  title, book count, size, **six** small front-page **cover tiles** (each one opens that book), and
  its collections as clickable rows with counts. Boxes are laid out **2 per row at every width**
  (the user's choice: phone and desktop alike) — never one per row, or a section holding a single
  collection leaves most of the row visibly empty. Every box shows exactly six covers
  (`COVERS_PER_BOX`), taken round-robin across its collections (3+3 when a section holds two), which
  is why `build_catalog.py` writes six `sample` ids per collection. Cover tiles show the whole front page
  (`aspect-ratio: 3/4` + `object-fit: contain`, never a cropped band) while staying small —
  52 px wide on phones, 58 px default, 70 px on wide screens — because the user explicitly does not
  want big covers.
- Browse shows a collection header at the collection root, breadcrumbs, chips (kind +
  «إخفاء المكرر» + a «داخل «<collection>»» search-scope chip) and a sort selector.
- Long listings render **60 cards per batch** with a «عرض المزيد — N متبقٍ» button; a collection
  root can hold 1,400+ books and drawing them all at once freezes the phone.
- **عرض قائمة** in the toolbar switches the grid to compact rows (44 px cover, title, author, size);
  the `.grid.list` rules had been in the stylesheet with no control wired to them.
- Cover thumbnails are requested at `sz=w600` — the cards render ~180 px wide, and `w400` was soft
  on a phone screen.
- **Skeleton cards** are painted before the catalog resolves, and the catalog itself is now 0.77 MB
  gzipped (was 1.93 MB) because `build_catalog.py` stops writing the fields the browser rebuilds
  (`norm`, `path_norm`, `thumb`) — do not add them back.

## Reading, keeping, finding again

- Any card opens the reader: PDF/DOC via Google Drive preview, audio/video inline, images inline.
- Every card has quick buttons: favourite (`♥`), download (`⤓`) and open in Drive (`↗`).
  Download links carry `&confirm=t` — without it Drive answers big files with a "virus scan"
  HTML page. The reader bar adds favourite + copy-link next to prev/next.
- Covers come from `https://drive.google.com/thumbnail?id=<id>&sz=w400` (stored crawl thumbs
  expire and return 403); files with no Drive thumbnail fall back to the type badge. A failed
  cover load is retried twice (400 ms then 800 ms) before the badge replaces it: a grid requests
  dozens of thumbnails at once, Drive refuses some of them, and without the retry those cards
  stayed grey for the whole session even though the same URL answers 200 a moment later.
- **Favourites and «آخر ما قرأت» live in this device only** (`localStorage` keys `mk.favs` /
  `mk.recent`, module `web/js/user.js`). Nothing is sent to the server; clearing site data
  clears the shelves.
- Shortcuts: `/` search, `Esc` close reader/drawer, `←`/`→` previous/next (RTL: left = next).

## API

    GET /api/catalog   full catalog JSON (gzip when the client asks: ~6.3 MB -> ~2.0 MB)
    GET /api/stats     counts by type + crawl counters
    GET /api/health    ok/port/total/collections/generated
    GET /api/diag?m=...  browser error reports -> server log (invisible in the page)
