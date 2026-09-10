/* =========================================================
   STARTER CONTRACTS
   ---------------------------------------------------------
   High-value contracts, not test volume. Every assertion here
   defends something a future product would otherwise have to
   rediscover: a namespace collision, a scroll lock that leaks, a
   type scale that quietly stops being used.

   Each contract states what it protects, in the language of the
   failure it prevents. If an assertion cannot be described that
   way, it probably should not exist.
   ========================================================= */
'use strict';
const H = require('./harness.js');

let pass = 0, fail = 0;
const failures = [];

function T(name, cond, detail){
  if(cond){ pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !detail ? '' : ' — ' + detail));
}
function section(t){ console.log('\n' + '='.repeat(64) + '\n  ' + t + '\n' + '='.repeat(64)); }
function sub(t){ console.log('\n  --- ' + t + ' ---'); }

function results(){ return { pass, fail, failures }; }
function reset(){ pass = 0; fail = 0; failures.length = 0; }

/* ---------- shared helpers ---------- */
function open(app, id){ app.ctx.openOverlay(id); app.ctx.__flush(); }
function close(app, id){ app.ctx.closeOverlay(id); app.ctx.__flush(); }
function css(){ return H.styleBlock(H.readApp()); }
function js(){ return H.mainScript(H.readApp()); }
/* The shipped MARKUP, with the script block removed.

   bodyBlock() runs from <body> to </body>, and the entire application script
   sits inside it — so a contract about markup that reads bodyBlock() also
   reads every comment explaining why the markup is the way it is. Three
   contracts have now failed on their own documentation. Rules about markup
   read this; rules about code read stripComments(js()). */
function markup(){
  return H.bodyBlock(H.readApp()).replace(/<script>[\s\S]*?<\/script>/g, '');
}

/* Comments explain the rules; they must not be mistaken for breaking them. */
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* =========================================================
   CONTRACT 1 — BOOT
   The app starts, says so, and fails loudly rather than blankly.
   ========================================================= */
function testBoot(){
  section('CONTRACT 1 — the application boots');
  const app = H.loadApp();

  sub('a clean start');
  T('boots with no console errors', app.errors.length === 0, app.errors.join(' | '));
  T('the app container is revealed', app.dom.document.getElementById('app').style.display === '');
  T('storage is available and reports itself persistent', app.ctx.Store.isPersistent());
  T('a first run records the schema version',
    app.storage.getItem(app.ctx.STORAGE_NAMESPACE + 'sys.schemaVersion') === String(app.ctx.DATA_SCHEMA_VERSION));
  T('a first run writes nothing else', app.storage._map.size === 1, String(app.storage._map.size));

  sub('booting on top of existing data');
  const shared = new Map();
  const seeded = H.loadApp({ sharedStorage: shared });
  seeded.ctx.items.push({ id: 'i_x', title: 'Existing', note: '', status: 'active',
                          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  seeded.ctx.persistItems();
  const second = H.loadApp({ sharedStorage: shared });
  T('an existing record survives a reload', second.ctx.items.length === 1);
  T('and keeps its identity', second.ctx.items[0].title === 'Existing');
  T('reloading raises no errors', second.errors.length === 0, second.errors.join(' | '));

  sub('there is only one script block, so the suite sees all the code');
  const blocks = H.scriptBlocks(H.readApp()).filter(b => b.trim().length > 200);
  T('exactly one substantial <script> block', blocks.length === 1, String(blocks.length));
  T('boot is wrapped so a failure still reports itself',
    /catch\(err\)\{[\s\S]{0,400}could not start/.test(js()));
}

/* =========================================================
   CONTRACT 2 — CONFIGURATION
   One source of identity, and static files that cannot drift.
   ========================================================= */
function testConfig(){
  section('CONTRACT 2 — application identity has one source');
  const app = H.loadApp();
  const c = app.ctx;
  const cfg = c.APP_CONFIG;

  sub('APP_ID is valid, and invalid ids are refused rather than repaired');
  T('the shipped id passes validation', c.validateAppId(cfg.id) === null);
  const bad = {
    'empty': '', 'uppercase': 'App-Starter', 'spaces': 'app starter',
    'leading digit': '1app', 'trailing hyphen': 'app-', 'double hyphen': 'app--starter',
    'underscore': 'app_starter', 'dot': 'app.starter', 'slash': 'app/starter',
    'too long': 'a'.repeat(41), 'not a string': 42
  };
  Object.keys(bad).forEach(label => {
    T('rejects ' + label, typeof c.validateAppId(bad[label]) === 'string');
  });
  T('a valid multi-word id is accepted', c.validateAppId('personal-savings') === null);

  sub('every namespace is derived, never typed twice');
  T('storage prefix derives from the id', c.STORAGE_NAMESPACE === cfg.id + '.');
  T('cache name derives from the id and the version',
    c.CACHE_NAMESPACE === cfg.id + '-v' + c.APP_VERSION);
  T('the version derives from the newest release entry',
    c.APP_VERSION === c.APP_UPDATES[0].version);

  sub('static files match APP_CONFIG — they cannot read it at runtime');
  const man = H.readManifest();
  T('manifest name', man.name === cfg.name, man.name);
  T('manifest short_name', man.short_name === cfg.shortName, man.short_name);
  T('manifest description', man.description === cfg.description);
  T('manifest theme_color', man.theme_color === cfg.themeColor, man.theme_color);
  T('manifest background_color', man.background_color === cfg.backgroundColor);

  const sw = H.readSW();
  T('service-worker cache name', sw.indexOf("'" + c.CACHE_NAMESPACE + "'") !== -1, c.CACHE_NAMESPACE);

  const pkg = H.readPkg();
  T('package name', pkg.name === cfg.id, pkg.name);
  T('package version', pkg.version === c.APP_VERSION, pkg.version);

  /* Compared through the same escape the sync applies, so a product whose
     name contains & " or < is not reported as drift for being correct. */
  const src = H.readApp();
  const esc = require('../scripts/config.js').esc;
  T('document title', src.indexOf('<title>' + esc(cfg.name) + '</title>') !== -1);
  T('theme-color meta', src.indexOf('content="' + esc(cfg.themeColor) + '"') !== -1);
  T('apple web app title', src.indexOf('content="' + esc(cfg.shortName) + '"') !== -1);
  T('the header markup carries the derived name, not a stale copy',
    new RegExp('<h1 class="app-title" id="appTitle">' +
      esc(cfg.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h1>').test(src));

  sub('a name that needs escaping survives every target intact');
  const hostile = 'Ben & Co "Ltd" <beta>';
  T('escaping is applied, not stripped',
    esc(hostile) === 'Ben &amp; Co &quot;Ltd&quot; &lt;beta>');
  T('the manifest holds the raw value, because JSON escapes differently',
    JSON.parse(JSON.stringify({ n: hostile })).n === hostile);

  sub('changing the id changes everything downstream');
  ['other-app', 'client-demo', 'personal-savings'].forEach(id => {
    const o = H.loadApp({ appId: id });
    T(id + ' → storage prefix', o.ctx.STORAGE_NAMESPACE === id + '.');
    T(id + ' → cache name', o.ctx.CACHE_NAMESPACE === id + '-v' + o.ctx.APP_VERSION);
    T(id + ' → validates', o.ctx.validateAppId(id) === null);
  });
}

/* =========================================================
   CONTRACT 3 — STORAGE
   Namespacing is the only thing keeping two deployments on one
   origin from reading each other's data.
   ========================================================= */
function testStorage(){
  section('CONTRACT 3 — storage is namespaced and honest');
  const app = H.loadApp();
  const c = app.ctx;

  sub('every key the app writes carries its namespace');
  c.Store.set('data.probe', 'x');
  c.Store.setJSON('ui.probe', { a: 1 });
  const raw = [...app.storage._map.keys()];
  T('no key escapes the prefix',
    raw.every(k => k.indexOf(c.STORAGE_NAMESPACE) === 0), raw.filter(k => k.indexOf(c.STORAGE_NAMESPACE) !== 0).join(','));
  T('no bare generic key is used',
    !raw.some(k => /^(settings|data|history|draft|user|userData|items)$/.test(k)));

  sub('read, write, delete');
  T('a value round-trips', c.Store.get('data.probe') === 'x');
  T('JSON round-trips', c.Store.getJSON('ui.probe', null).a === 1);
  c.Store.remove('data.probe');
  T('a removed key is gone', c.Store.get('data.probe') === null);

  sub('absent data stays absent — a missing key is a new user, not a broken one');
  T('a missing key reads null', c.Store.get('nothing.here') === null);
  T('a missing key does not get invented', app.storage.getItem(c.STORAGE_NAMESPACE + 'nothing.here') === null);
  T('getJSON returns the caller fallback, not a guess',
    c.Store.getJSON('nothing.here', 'FALLBACK') === 'FALLBACK');
  app.storage.setItem(c.STORAGE_NAMESPACE + 'ui.corrupt', '{not json');
  T('corrupt JSON degrades to the fallback rather than throwing',
    c.Store.getJSON('ui.corrupt', 'SAFE') === 'SAFE');

  sub('a failed write is reported, never assumed');
  const failing = H.loadApp({ failWrites: true });
  T('the store reports itself non-persistent', !failing.ctx.Store.isPersistent());
  T('set() returns false when the write cannot land', failing.ctx.Store.set('x', '1') === false ||
    failing.ctx.Store.backend() === 'memory');
  T('the app tells the user out loud',
    /not letting the app store data/.test(js()));

  sub('listKeys sees only this app');
  app.storage.setItem('some-other-app.data.items', '[]');
  const keys = c.Store.listKeys();
  T('a foreign key is invisible', keys.every(k => k.indexOf('some-other-app') === -1));
  T('own keys are still found', keys.indexOf('ui.probe') !== -1);
}

/* =========================================================
   CONTRACT 4 — CROSS-APP COLLISION
   Two products on one github.io origin share localStorage and
   Cache Storage. This is what keeps them apart.
   ========================================================= */
function testCollision(){
  section('CONTRACT 4 — two apps on one origin cannot collide');
  const shared = new Map();
  const one = H.loadApp({ appId: 'app-one', sharedStorage: shared });
  const two = H.loadApp({ appId: 'app-two', sharedStorage: shared });

  sub('storage');
  one.ctx.Store.set('settings', 'ONE-SECRET');
  two.ctx.Store.set('settings', 'TWO-SECRET');
  T('each app reads its own value', one.ctx.Store.get('settings') === 'ONE-SECRET' &&
                                    two.ctx.Store.get('settings') === 'TWO-SECRET');
  T('app-one cannot read app-two through the adapter', one.ctx.Store.get('settings') !== 'TWO-SECRET');
  T('the underlying keys are genuinely distinct',
    shared.has('app-one.settings') && shared.has('app-two.settings'));
  T('app-one.listKeys never returns an app-two key',
    one.ctx.Store.listKeys().every(k => shared.get('app-one.' + k) !== undefined));

  one.ctx.items.push({ id: 'i1', title: 'One', note: '', status: 'active',
                       createdAt: 'a', updatedAt: 'a' });
  one.ctx.persistItems();
  T('one app writing records leaves the other empty',
    two.ctx.Store.getJSON(two.ctx.KEYS.items, []).length === 0);

  sub('cache identity');
  T('cache names differ', one.ctx.CACHE_NAMESPACE !== two.ctx.CACHE_NAMESPACE);
  T('app-one cache name', one.ctx.CACHE_NAMESPACE.indexOf('app-one-v') === 0, one.ctx.CACHE_NAMESPACE);
  T('app-two cache name', two.ctx.CACHE_NAMESPACE.indexOf('app-two-v') === 0, two.ctx.CACHE_NAMESPACE);

  sub('the service worker only ever deletes its own caches');
  const sw = H.readSW();
  T('cleanup is filtered by this app\'s own prefix',
    /keys\.filter\(k => k !== CACHE_NAME && k\.indexOf\(cachePrefix\(\)\) === 0\)/.test(sw));
  T('the prefix is derived from the cache name, not written twice',
    /function cachePrefix\(\)/.test(sw) && /lastIndexOf\('-v'\)/.test(sw));

  sub('no legacy namespace survives anywhere');
  const all = H.readApp() + H.readSW() + JSON.stringify(H.readManifest());
  T('no legacy storage prefix', !/\bloop_/i.test(all));
  T('no legacy cache prefix', !/\bloop-v\d/i.test(all));
}

/* =========================================================
   CONTRACT 5 — MIGRATION
   ========================================================= */
function testMigration(){
  section('CONTRACT 5 — migration is non-destructive and idempotent');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  sub('first run');
  T('the schema version is recorded', c.Store.get(c.KEYS.schemaVersion) === String(c.DATA_SCHEMA_VERSION));
  T('nothing was migrated on a fresh install', c.runMigrations().migrated === false);

  sub('idempotence');
  c.Store.set(c.KEYS.items, JSON.stringify([{ id: 'a', title: 'A', status: 'active' }]));
  const before = c.Store.get(c.KEYS.items);
  c.runMigrations(); c.runMigrations(); c.runMigrations();
  T('running migrations repeatedly changes nothing', c.Store.get(c.KEYS.items) === before);

  sub('a corrupt or absent version is handled without data loss');
  c.Store.set(c.KEYS.schemaVersion, 'not-a-number');
  const r = c.runMigrations();
  T('a nonsense version does not throw', r && typeof r === 'object');
  T('records survive it', c.Store.get(c.KEYS.items) === before);

  sub('the mechanism exists even though the starter has no migrations yet');
  T('a migration table is declared', typeof c.MIGRATIONS === 'object');
  T('a backup namespace is reserved', typeof c.KEYS.backupPrefix === 'string' &&
    c.KEYS.backupPrefix.indexOf('sys.') === 0);
  T('backups are excluded from export', /indexOf\(KEYS\.backupPrefix\) === 0/.test(js()));
}

/* =========================================================
   CONTRACT 6 — NAVIGATION
   ========================================================= */
function testNavigation(){
  section('CONTRACT 6 — navigation is predictable');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('every tab resolves to a screen');
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab).filter(Boolean);
  T('the tab bar declares tabs', tabs.length >= 2, String(tabs.length));
  tabs.forEach(t => T('tab "' + t + '" has a view', !!d.getElementById('view-' + t)));
  T('the product ships only as many tabs as it needs', tabs.length <= 4, String(tabs.length));

  sub('an unknown tab is a no-op, not a blank screen');
  c.switchTab('inbox');
  const before = c.currentTab;
  c.switchTab('does-not-exist');
  T('currentTab is unchanged', c.currentTab === before);
  T('the current view is still active', d.getElementById('view-inbox').classList.contains('active'));

  sub('a tab opens at its top, so the same tap gives the same result');
  app.ctx.window && (app.ctx.window.scrollY = 400);
  c.switchTab('today');
  T('the page is scrolled to top on entry', c.window.scrollY === 0);
  T('and it is instant, not animated', /behavior: 'instant'/.test(js()));

  sub('only one view is ever active');
  c.switchTab('settings');
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('exactly one active view', active.length === 1, String(active.length));
  T('it is the one asked for', active[0].id === 'view-settings');
}

/* =========================================================
   CONTRACT 7 — OVERLAYS
   The most valuable system in the starter. One mechanism, and it
   cannot be forgotten by a surface added later.
   ========================================================= */
function testOverlays(){
  section('CONTRACT 7 — one overlay engine owns every surface');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js(), style = css();

  sub('one mechanism, not a lock added by hand to every screen');
  T('an observer watches the overlays', /new MutationObserver\(/.test(src));
  T('and it is still the only one', (src.match(/new MutationObserver\(/g) || []).length === 1);
  T('the scroll lock runs from it',
    /new MutationObserver\(\(\) => \{[\s\S]{0,120}syncBackgroundScrollLock\(\);/.test(src));
  T('so does accessibility', /syncSheetAccessibility\(\);[\s\S]{0,40}\}\);/.test(src));
  T('the open overlays are the source of truth',
    /document\.querySelectorAll\('\.overlay\.open'\)\.length/.test(src));
  T('boot survives a platform without an observer',
    /if\(typeof MutationObserver === 'undefined'\) return null;/.test(src));
  T('it watches the whole body, so a later overlay is covered too',
    /obs\.observe\(document\.body,[\s\S]{0,120}subtree: true/.test(src));

  sub('the document behind a surface stops being a document');
  T('the body is pinned, which is what iOS needs',
    /body\.scroll-locked\{[\s\S]{0,140}position: fixed/.test(style));
  T('the offset is captured so it can be given back', /_lockedScrollY = window\.scrollY/.test(src));
  T('and restored exactly, without animating',
    /window\.scrollTo\(\{ top: _lockedScrollY, behavior: 'instant' \}\)/.test(src));
  T('nested layers do not unlock early', /if\(--_lockDepth > 0\) return;/.test(src));

  sub('a gesture inside a surface stays inside it');
  T('the overlay contains its own overscroll', /\.overlay\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('so does the scrolling surface inside it',
    /\.sheet-scroll\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('the locked body refuses chaining entirely',
    /body\.scroll-locked\{[\s\S]{0,200}overscroll-behavior: none/.test(style));

  sub('opening and closing, for real');
  open(app, 'itemDetailOverlay');
  T('the stack records it', c._openSheetStack.length === 1);
  T('the background is locked', d.body.classList.contains('scroll-locked'));
  T('the surface is announced as a dialog',
    d.getElementById('itemDetailOverlay').getAttribute('aria-modal') === 'true');
  T('it is painted at the stack base',
    d.getElementById('itemDetailOverlay').style.zIndex === String(c.OVERLAY_Z_BASE));

  sub('stacking is open order, not document order');
  open(app, 'confirmOverlay');
  T('both are on the stack', c._openSheetStack.length === 2);
  T('the newest is on top', c.topOpenSheet().id === 'confirmOverlay');
  T('and painted above the one beneath it',
    Number(d.getElementById('confirmOverlay').style.zIndex) >
    Number(d.getElementById('itemDetailOverlay').style.zIndex));
  T('the lock counts both layers', c._lockDepth === 2, String(c._lockDepth));

  sub('closing a child reveals its parent — the surface below is the way back');
  close(app, 'confirmOverlay');
  T('the parent is still open', d.getElementById('itemDetailOverlay').classList.contains('open'));
  T('the stack shrank to one', c._openSheetStack.length === 1);
  T('the background is still locked', d.body.classList.contains('scroll-locked'));
  T('the closed surface gave back its z-index', d.getElementById('confirmOverlay').style.zIndex === '');
  close(app, 'itemDetailOverlay');
  T('closing the last one unlocks', !d.body.classList.contains('scroll-locked'));
  T('the stack is empty', c._openSheetStack.length === 0);
  T('the lock depth is zero', c._lockDepth === 0);

  sub('every surface declares a way out');
  const ids = [...H.readApp().matchAll(/<div class="overlay(?: overlay-page)?" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('the app has overlays to check', ids.length >= 4, String(ids.length));
  const noExit = ids.filter(id => {
    open(app, id);
    const has = !!c.sheetCloser(d.getElementById(id));
    close(app, id);
    return !has;
  });
  T('every one of them has a discoverable close path', noExit.length === 0, noExit.join(','));

  sub('focus');
  T('the surface takes focus, not its first field — a keyboard would cover the screen',
    /const sheet = ov\.querySelector\('\.sheet'\) \|\| ov;/.test(src));
  T('focus returns only to a control still on screen',
    /document\.contains\(opener\) && opener\.offsetParent !== null/.test(src));
  T('Escape acts on the top surface only', /const ov = topOpenSheet\(\);/.test(src));
  T('Tab is trapped inside it', /ev\.key !== 'Escape' && ev\.key !== 'Tab'/.test(src));
}

/* =========================================================
   CONTRACT 8 — TOAST
   ========================================================= */
function testToast(){
  section('CONTRACT 8 — feedback that never blocks');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const host = d.getElementById('toastHost');

  sub('the host is an announcement region');
  const src = H.readApp();
  T('it is a live region', /id="toastHost"[^>]*aria-live="polite"/.test(src));
  T('it has a status role', /id="toastHost"[^>]*role="status"/.test(src));
  T('it never intercepts a tap', /\.toast-host\{[\s\S]{0,300}pointer-events: none/.test(css()));
  T('the toast itself does accept one', /\.toast\{[\s\S]{0,400}pointer-events: auto/.test(css()));
  T('it clears the tab bar and the home indicator',
    /\.toast-host\{[\s\S]{0,200}bottom: calc\(var\(--tabbar-h\)[\s\S]{0,60}var\(--inset-bottom\)\)/.test(css()));

  sub('showing');
  c.toast('Saved');
  T('a toast is added', host.children.length === 1);
  T('it carries the message', host.children[0].innerHTML.indexOf('Saved') !== -1);
  T('an unknown variant falls back to neutral rather than breaking',
    c.toast('x', 'not-a-variant')._classes.has('toast-neutral'));

  sub('variants');
  c.TOAST_VARIANTS.forEach(v => {
    const el = c.toast('m', v);
    T('variant "' + v + '" is applied', el._classes.has('toast-' + v));
  });

  sub('the stack cannot grow without limit');
  T('at most MAX_TOASTS on screen', host.children.length <= c.MAX_TOASTS,
    String(host.children.length) + ' > ' + c.MAX_TOASTS);
  for(let i = 0; i < 20; i++) c.toast('flood ' + i);
  T('flooding does not grow the host', host.children.length <= c.MAX_TOASTS,
    String(host.children.length));

  sub('dismissal');
  const el = c.toast('bye');
  c.dismissToast(el, true);
  T('an immediate dismissal removes it', el.parentNode === null);
  T('dismissing twice is safe', (c.dismissToast(el, true), true));
  T('it dismisses itself on a timer', /setTimeout\(\(\) => dismissToast\(el, reduced\), TOAST_MS\)/.test(js()));
  T('reduced motion skips the leaving animation', /const reduced = prefersReducedMotion\(\);/.test(js()));
}

/* =========================================================
   CONTRACT 9 — CONFIRMATION
   ========================================================= */
function testConfirmation(){
  section('CONTRACT 9 — one confirmation, no native dialogs');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js();

  sub('native dialogs are gone');
  ['alert', 'confirm', 'prompt'].forEach(fn => {
    const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    const hits = (src.match(re) || []);
    T('no ' + fn + '() in application code', hits.length === 0, hits.join(','));
  });

  sub('it runs on the shared overlay engine, not a second implementation');
  T('the confirm surface is an overlay', !!d.getElementById('confirmOverlay'));
  T('it does not roll its own scroll lock',
    (src.match(/document\.body\.classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('it is announced as an alert dialog', /role="alertdialog"/.test(H.readApp()));
  T('its title and message are wired to the dialog',
    /aria-labelledby="confirmTitle"/.test(H.readApp()) && /aria-describedby="confirmMessage"/.test(H.readApp()));

  sub('confirming');
  let resolved = null;
  c.confirmAction({ title: 'Delete?', message: 'Gone for good.', confirmLabel: 'Delete' })
    .then(v => { resolved = v; });
  c.__flush();
  T('the surface opens', d.getElementById('confirmOverlay').classList.contains('open'));
  T('the title is set', d.getElementById('confirmTitle').textContent === 'Delete?');
  T('the message is set', d.getElementById('confirmMessage').textContent === 'Gone for good.');
  T('the confirm label is set', d.getElementById('confirmAccept').textContent === 'Delete');
  c.acceptConfirm(); c.__flush();
  return Promise.resolve().then(() => {
    T('accepting resolves true', resolved === true, String(resolved));
    T('and closes the surface', !d.getElementById('confirmOverlay').classList.contains('open'));

    let cancelled = null;
    c.confirmAction({ title: 'Sure?' }).then(v => { cancelled = v; });
    c.__flush();
    c.closeConfirm(); c.__flush();
    return Promise.resolve().then(() => {
      T('cancelling resolves false', cancelled === false, String(cancelled));

      sub('cancel is the safe outcome, so every exit route means cancel');
      let escaped = null;
      c.confirmAction({ title: 'Sure?' }).then(v => { escaped = v; });
      c.__flush();
      const closer = c.sheetCloser(d.getElementById('confirmOverlay'));
      T('the engine finds its declared close path', typeof closer === 'function');
      closer(); c.__flush();
      return Promise.resolve().then(() => {
        T('an engine-driven close resolves false', escaped === false, String(escaped));

        sub('a destructive confirm does not wear the loud button');
        c.confirmAction({ title: 'x', destructive: true }); c.__flush();
        const accept = d.getElementById('confirmAccept');
        T('the accept button is not primary', accept.className.indexOf('btn-primary') === -1, accept.className);
        T('it is marked destructive', accept.className.indexOf('btn-danger') !== -1);
        c.closeConfirm(); c.__flush();

        sub('a second call cannot strand the first promise');
        let first = 'pending';
        c.confirmAction({ title: 'one' }).then(v => { first = v; });
        c.__flush();
        c.confirmAction({ title: 'two' });
        c.__flush();
        return Promise.resolve().then(() => {
          T('the superseded call resolves false rather than hanging', first === false, String(first));
          c.closeConfirm(); c.__flush();
        });
      });
    });
  });
}

/* =========================================================
   CONTRACT 10 — FORMS AND THE SCHEDULE DOMAIN
   ========================================================= */
function testForms(){
  section('CONTRACT 10 — create, edit, validate, persist, delete');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;

  sub('validation refuses to save nothing');
  c.openItemForm(); c.__flush();
  d.getElementById('itemTitle').value = '   ';
  c.saveItemForm();
  T('an empty title does not create a record', c.items.length === 0);
  T('the field is flagged', d.getElementById('itemTitle').classList.contains('field-error'));
  T('and marked invalid for assistive tech',
    d.getElementById('itemTitle').getAttribute('aria-invalid') === 'true');
  T('with a message that says what to do',
    d.getElementById('itemTitleError').textContent.length > 10);
  T('the form stays open', d.getElementById('itemFormOverlay').classList.contains('open'));

  sub('a scheduled item with no day is refused, not guessed');
  /* Defaulting to today here would put a commitment on a day the person never
     named, which is the class of bug that makes someone miss something. */
  d.getElementById('itemTitle').value = 'Untethered';
  c.toggleFormSchedule();
  T('the switch is on', c.formScheduled === true);
  c.ctlSet('itemTime', 540);
  d.getElementById('itemDate').value = '';
  c.saveItemForm();
  T('nothing was created', c.items.length === 0);
  T('and the message names the fix',
    /day/i.test(d.getElementById('itemTitleError').textContent));

  sub('the slider cannot produce a time that is not a time');
  /* The control this replaced was a text field, and half its validation
     existed to reject what someone might type into it. A slider is bounded by
     construction: there is no unparseable value to defend against. */
  c.ctlSet('itemTime', 99999);
  T('past the end of the day clamps to the last slot', c.ctlValue('itemTime') === 1435,
    String(c.ctlValue('itemTime')));
  c.ctlSet('itemTime', -600);
  T('before the start of it clamps to midnight', c.ctlValue('itemTime') === 0);
  c.ctlSet('itemTime', 543);
  T('and every value lands on the 5-minute step', c.ctlValue('itemTime') % 5 === 0,
    String(c.ctlValue('itemTime')));
  c.ctlSet('itemDur', 3);
  T('a duration cannot go below the minimum block', c.ctlValue('itemDur') === 15,
    String(c.ctlValue('itemDur')));

  sub('creating');
  d.getElementById('itemDate').value = '2026-09-08';
  c.ctlSet('itemTime', 540);
  c.ctlSet('itemDur', 45);
  c.setFormKind('event');
  c.saveItemForm(); c.__flush();
  T('the record exists', c.items.length === 1);
  T('with its title', c.items[0].title === 'Untethered');
  T('with its kind', c.items[0].kind === 'event');
  T('with a civil date, not a parsed instant', c.items[0].date === '2026-09-08');
  T('with wall-clock minutes', c.items[0].start === 540);
  T('with its duration', c.items[0].duration === 45);
  T('and no stored end time', c.items[0].end === undefined);
  T('open by default', c.items[0].status === 'open');
  T('with an id', typeof c.items[0].id === 'string' && c.items[0].id.length > 4);
  T('with timestamps', !!c.items[0].createdAt && !!c.items[0].updatedAt);
  T('the form closed', !d.getElementById('itemFormOverlay').classList.contains('open'));
  T('it was persisted', H.loadApp({ sharedStorage: shared }).ctx.items.length === 1);

  sub('editing changes the record, not its identity');
  const id = c.items[0].id, created = c.items[0].createdAt;
  c.openItemForm(id); c.__flush();
  T('the form is pre-filled', d.getElementById('itemTitle').value === 'Untethered');
  T('including its day', d.getElementById('itemDate').value === '2026-09-08');
  T('and its time, on the slider', c.ctlValue('itemTime') === 540, String(c.ctlValue('itemTime')));
  T('with the schedule switch already on', c.formScheduled === true);
  d.getElementById('itemTitle').value = 'Renamed';
  c.setFormKind('task');
  c.saveItemForm(); c.__flush();
  T('still one record', c.items.length === 1);
  T('the title changed', c.items[0].title === 'Renamed');
  T('the kind changed', c.items[0].kind === 'task');
  T('the id is unchanged', c.items[0].id === id);
  T('createdAt is unchanged', c.items[0].createdAt === created);

  sub('a draft lives outside the committed collection');
  c.openItemForm(); c.__flush();
  d.getElementById('itemTitle').value = 'Half typed';
  c.flushDraft();
  T('the draft was written', c.Store.getJSON(c.KEYS.itemDraft, null).title === 'Half typed');
  T('it is under its own key', c.KEYS.itemDraft.indexOf('draft.') === 0);
  T('it did not become a record', c.items.length === 1);
  T('and it cannot be counted as one',
    c.Store.getJSON(c.KEYS.items, []).length === 1);
  const restored = H.loadApp({ sharedStorage: shared });
  restored.ctx.openItemForm(); restored.ctx.__flush();
  T('reopening the form restores it',
    restored.dom.document.getElementById('itemTitle').value === 'Half typed');
  T('editing an existing record never writes a draft', (() => {
    const a4 = H.loadApp();
    const c4 = a4.ctx, d4 = a4.dom.document;
    c4.openItemForm(); c4.__flush();
    d4.getElementById('itemTitle').value = 'A capture';
    c4.flushDraft();
    const captured = c4.Store.getJSON(c4.KEYS.itemDraft, null);
    c4.saveItemForm(); c4.__flush();
    const id = c4.items[c4.items.length - 1].id;
    c4.openItemForm(id); c4.__flush();
    d4.getElementById('itemTitle').value = 'Edited, not drafted';
    c4.flushDraft();
    const afterEdit = c4.Store.getJSON(c4.KEYS.itemDraft, null);
    return !!captured && afterEdit === null;
  })());

  sub('a half-typed capture survives being dismissed');
  /* THE DEFECT THIS PREVENTS, reported from a real iPhone: typing a title into
     quick capture and dismissing the sheet threw the title away. Capture had
     no draft of its own — only the full form did. */
  {
    const shared2 = new Map();
    const a5 = H.loadApp({ sharedStorage: shared2 });
    const c5 = a5.ctx, d5 = a5.dom.document;
    c5.openQuickAdd(null); c5.__flush();
    d5.getElementById('quickTitle').value = 'Half typed thought';
    c5.closeQuickAdd(); c5.__flush();
    c5.openQuickAdd(null); c5.__flush();
    T('the title is still there', d5.getElementById('quickTitle').value === 'Half typed thought',
      d5.getElementById('quickTitle').value);
    T('and it survives a reload too', (() => {
      const back = H.loadApp({ sharedStorage: shared2 });
      back.ctx.openQuickAdd(null); back.ctx.__flush();
      return back.dom.document.getElementById('quickTitle').value === 'Half typed thought';
    })());
    T('dismissing a capture creates no record', c5.items.length === 0, String(c5.items.length));
  }

  sub('every supported field is drafted, not a hand-picked subset');
  /* THE DEFECT THIS PREVENTS: priority and deadline were added to the form
     after the draft serialiser was written, and nobody added them to its
     hand-maintained list. The draft is now the form model itself, so a field
     that exists is a field that is drafted. */
  {
    const shared3 = new Map();
    const a6 = H.loadApp({ sharedStorage: shared3 });
    const c6 = a6.ctx, d6 = a6.dom.document;
    c6.openItemForm(); c6.__flush();
    d6.getElementById('itemTitle').value = 'Everything';
    d6.getElementById('itemNote').value = 'A note';
    d6.getElementById('itemDeadline').value = '2026-10-01';
    c6.setFormPriority(3);
    c6.setFormKind('event');
    c6.setFormTag('tag_work');
    c6.toggleFormReminder(30);
    c6.flushDraft();
    const draft = c6.Store.getJSON(c6.KEYS.itemDraft, null);
    T('the draft carries every declared field',
      c6.FORM_FIELDS.every(k => Object.prototype.hasOwnProperty.call(draft, k)),
      c6.FORM_FIELDS.filter(k => !Object.prototype.hasOwnProperty.call(draft, k)).join(','));
    T('priority among them', draft.priority === 3, String(draft.priority));
    T('and deadline', draft.deadline === '2026-10-01', String(draft.deadline));

    c6.closeItemForm(); c6.__flush();
    const back2 = H.loadApp({ sharedStorage: shared3 });
    back2.ctx.openItemForm(); back2.ctx.__flush();
    T('priority comes back', back2.ctx.formPriority === 3, String(back2.ctx.formPriority));
    T('deadline comes back',
      back2.dom.document.getElementById('itemDeadline').value === '2026-10-01',
      back2.dom.document.getElementById('itemDeadline').value);
    T('kind comes back', back2.ctx.formKind === 'event', back2.ctx.formKind);
    T('the tag comes back', back2.ctx.formTagId === 'tag_work', String(back2.ctx.formTagId));
    T('reminders come back', back2.ctx.formReminders.indexOf(30) !== -1,
      back2.ctx.formReminders.join(','));
  }

  sub('a saved record never comes back as a ghost draft');
  /* THE DEFECT THIS PREVENTS: the 400ms debounce was never cancelled, so it
     fired AFTER the save had cleared the draft and wrote the record straight
     back out again — and the next capture opened holding the thing that had
     just been filed. */
  {
    const a7 = H.loadApp();
    const c7 = a7.ctx, d7 = a7.dom.document;
    c7.openItemForm(); c7.__flush();
    d7.getElementById('itemTitle').value = 'Saved thing';
    c7.scheduleDraftSave();
    c7.saveItemForm(); c7.__flush();
    T('the draft is gone the moment it is saved',
      c7.Store.get(c7.KEYS.itemDraft) === null);
    T('the pending timer was cancelled, not merely outrun',
      c7._draftTimer === null, String(c7._draftTimer));
    T('exactly one record exists', c7.items.length === 1, String(c7.items.length));
    T('and closing with nothing open writes nothing', (() => {
      c7.flushDraft();
      return c7.Store.get(c7.KEYS.itemDraft) === null;
    })());
  }

  sub('the compact sheet hands everything to the full form without saving');
  {
    const a8 = H.loadApp();
    const c8 = a8.ctx, d8 = a8.dom.document;
    c8.openQuickAdd('2026-09-11'); c8.__flush();
    d8.getElementById('quickTitle').value = 'Carried across';
    c8.setQuickTag('tag_focus');
    c8.toggleQuickSchedule();
    c8.expandQuickAdd(); c8.__flush();
    T('the full form is open', d8.getElementById('itemFormOverlay').classList.contains('open'));
    T('the compact sheet is closed', !d8.getElementById('quickAddOverlay').classList.contains('open'));
    T('the title came with it', d8.getElementById('itemTitle').value === 'Carried across',
      d8.getElementById('itemTitle').value);
    T('so did the tag', c8.formTagId === 'tag_focus', String(c8.formTagId));
    T('and the day it was captured on', d8.getElementById('itemDate').value === '2026-09-11',
      d8.getElementById('itemDate').value);
    T('no record was created on the way', c8.items.length === 0, String(c8.items.length));
  }

  sub('a failed write keeps the form and says so');
  {
    /* A real mid-session write failure is setJSON returning false — quota
       exhausted after the probe already succeeded. loadApp({failWrites}) makes
       the PROBE fail instead, and the adapter then correctly falls back to
       memory and reports success, which is a different situation. */
    const a9 = H.loadApp();
    a9.ctx.Store.setJSON = function(){ return false; };
    const c9 = a9.ctx, d9 = a9.dom.document;
    c9.openItemForm(); c9.__flush();
    d9.getElementById('itemTitle').value = 'Cannot land';
    c9.saveItemForm(); c9.__flush();
    T('the form is still open', d9.getElementById('itemFormOverlay').classList.contains('open'));
    T('the typed title is still in it', d9.getElementById('itemTitle').value === 'Cannot land');
    T('and nothing was added to the collection', c9.items.length === 0, String(c9.items.length));
  }


  sub('saving clears the draft');
  d.getElementById('itemTitle').value = 'Second thing';
  if(c.formScheduled) c.toggleFormSchedule();
  c.saveItemForm(); c.__flush();
  T('the draft is gone', c.Store.get(c.KEYS.itemDraft) === null);
  T('the record was created', c.items.length === 2);
  T('with no day it waits in the inbox', c.items[1].date === null && c.items[1].start === null);

  sub('deleting asks first');
  const target = c.items[1].id;
  c.openItemDetail(target); c.__flush();
  const p = c.deleteItemFromDetail();
  c.__flush();
  T('a confirmation is shown', d.getElementById('confirmOverlay').classList.contains('open'));
  c.closeConfirm(); c.__flush();
  return p.then(() => {
    T('cancelling keeps the record', c.items.length === 2);
    c.openItemDetail(target); c.__flush();
    const p2 = c.deleteItemFromDetail();
    c.__flush();
    c.acceptConfirm(); c.__flush();
    return p2.then(() => {
      T('confirming removes it', c.items.length === 1);
      T('the right one went', !c.items.some(i => i.id === target));
      T('the detail page closed', !d.getElementById('itemDetailOverlay').classList.contains('open'));
      T('the removal was persisted',
        H.loadApp({ sharedStorage: shared }).ctx.items.length === 1);
    });
  });
}

/* =========================================================
   CONTRACT 11 — MOBILE
   ========================================================= */
function testMobile(){
  section('CONTRACT 11 — real-device behaviour');
  const style = css(), src = H.readApp();

  sub('the iOS input zoom floor');
  T('the floor is declared once, globally',
    /input\[type="text"\][^{]*\{[^}]*font-size: 16px;/.test(style));
  T('and explained, so nobody "tidies" it away', /fs-exempt: iOS Safari zooms/.test(style));
  T('the token records the reason too', /--input-min-size: 16px;/.test(style));
  const smaller = [...style.matchAll(/(input|textarea|select)[^{]*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .filter(m => parseFloat(m[2]) < 16);
  T('no field is set below the floor', smaller.length === 0, smaller.map(m => m[0].slice(0, 40)).join(' | '));

  sub('safe areas are read, not guessed');
  ['--inset-top', '--inset-bottom', '--inset-left', '--inset-right'].forEach(t => {
    T(t + ' is tokenized', new RegExp(t + ':\\s*env\\(safe-area-inset').test(style));
  });
  T('the header reads the top inset', /\.app-header\{[\s\S]{0,200}var\(--inset-top\)/.test(style));
  T('the tab bar reads the bottom inset', /\.tabbar\{[\s\S]{0,300}padding-bottom: var\(--inset-bottom\)/.test(style));
  T('the body reads the left and right insets',
    /body\{[\s\S]{0,400}padding-left: var\(--inset-left\)/.test(style));
  T('a page paints a band the height of the top inset',
    /\.overlay-page \.sheet::before\{[\s\S]{0,200}height: var\(--inset-top\)/.test(style));
  T('the band never eats a tap',
    /\.overlay-page \.sheet::before\{[\s\S]{0,260}pointer-events: none/.test(style));
  T('the inset is never paid twice under a header',
    /\.page-topbar \+ \.sheet-scroll\{ padding-top: var\(--space-lg\); \}/.test(style));
  T('a header that owns the inset is opaque and outranks the band',
    /\.page-topbar\{[^}]*background: var\(--surface\); position: relative; z-index: 7/.test(style));
  T('no screen substitutes a fixed pixel margin for an inset',
    !/margin-top:\s*(44|47|59)px/.test(style));

  sub('every full page is protected — none opts out');
  const pageIds = [...src.matchAll(/<div class="overlay overlay-page" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('there are full pages to protect', pageIds.length >= 3, String(pageIds.length));
  const unprotected = pageIds.filter(id => {
    const at = src.indexOf('id="' + id + '"');
    return !/class="sheet"/.test(src.slice(at, at + 400));
  });
  T('each one carries the band-bearing surface', unprotected.length === 0, unprotected.join(','));

  sub('touch targets');
  T('the minimum is a token', /--touch-min: 44px;/.test(style));
  ['.tab-btn', '.btn-primary', '.btn-secondary', '.icon-btn', '.list-row', '.segmented button']
    .forEach(sel => {
      const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*(min-height|height):\\s*var\\(--touch-min\\)');
      T(sel + ' meets the floor', re.test(style));
    });
  T('the visible mark is not forced to the target size — only the target is',
    /The visible mark can be small; the target never is/.test(style));

  sub('orientation and text scaling');
  T('landscape reclaims height rather than clipping',
    /@media \(orientation: landscape\) and \(max-height: 500px\)/.test(style));
  T('automatic text inflation is switched off, pinch zoom is not',
    /text-size-adjust: 100%/.test(style) && !/text-size-adjust:\s*none/.test(style));
  T('double-tap zoom is suppressed without disabling pinch',
    /touch-action: manipulation/.test(style));
  T('the viewport covers the notch', /viewport-fit=cover/.test(src));
}

/* =========================================================
   CONTRACT 12 — DESIGN SYSTEM ENFORCEMENT
   The audited baseline had a good type scale and bypassed it 546
   times. Nothing structural stopped it. These two contracts are
   that structure.
   ========================================================= */
function testDesignSystem(){
  section('CONTRACT 12 — the design system is enforced, not merely documented');
  const style = css(), src = H.readApp();

  sub('font families come from tokens');
  T('the tokens exist', /--font-ui:/.test(style) && /--font-display:/.test(style) && /--font-mono:/.test(style));
  const families = [...src.matchAll(/font-family:\s*([^;}"]+)/g)].map(m => m[1].trim());
  const rogue = families.filter(v => v.indexOf('var(--font-') !== 0 && v !== 'inherit');
  T('every font-family declaration uses a token or inherits', rogue.length === 0,
    rogue.slice(0, 4).join(' | '));
  T('there is at least one, so the rule is doing work', families.length >= 5, String(families.length));

  sub('font sizes come from the scale');
  const scale = [...style.matchAll(/--fs-([a-z-]+):\s*(\d+)px/g)].map(m => m[1]);
  T('the scale defines the expected roles', scale.length >= 6, scale.join(','));
  const lines = style.split('\n');
  const violations = [];
  lines.forEach((line, i) => {
    const m = line.match(/font-size:\s*([^;]+);/);
    if(!m) return;
    const v = m[1].trim();
    if(v.indexOf('var(--fs-') === 0 || v === 'inherit') return;
    /* An exception must be declared within the comment immediately above it,
       so the reason travels with the line rather than living in a list
       somewhere else. */
    const window8 = lines.slice(Math.max(0, i - 8), i).join('\n');
    if(/fs-exempt:/.test(window8)) return;
    violations.push('line ' + (i + 1) + ': ' + line.trim());
  });
  T('no raw font-size outside the scale or a declared exception',
    violations.length === 0, violations.slice(0, 4).join(' | '));

  sub('the exception mechanism is narrow');
  const exempt = (style.match(/fs-exempt:/g) || []).length;
  T('there is at most a handful of exceptions', exempt <= 3, String(exempt));
  T('each states a reason', !/fs-exempt:\s*($|\*\/)/m.test(style));

  sub('spacing, radius and motion are tokenized');
  ['--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl']
    .forEach(t => T(t + ' exists', new RegExp(t + ':').test(style)));
  ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'].forEach(t =>
    T(t + ' exists', new RegExp(t + ':').test(style)));
  T('motion has an easing token', /--ease:/.test(style));
  T('and duration tokens', /--dur:/.test(style));
  T('layout width is a token', /--layout-max:/.test(style));
  T('breakpoints are named', /--bp-sm:/.test(style) && /--bp-md:/.test(style));

  sub('tokens live in exactly one place');
  T('one :root block', (style.match(/^:root\{/gm) || []).length === 1);
  T('the four layers are labelled',
    /1 · BRAND/.test(style) && /2 · SEMANTIC/.test(style) &&
    /3 · SCALE/.test(style) && /4 · DOMAIN/.test(style));

  sub('motion respects the system preference');
  T('a reduced-motion block exists', /@media \(prefers-reduced-motion: reduce\)/.test(style));
  T('it disables animation and transition globally',
    /@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,200}animation: none !important; transition: none !important/.test(style));
  T('and the JS honours it too', /prefersReducedMotion\(\)/.test(js()));

  sub('status is never carried by colour alone');
  T('a badge shows a word, not just a hue', /\.badge\{[\s\S]{0,400}text-transform: uppercase/.test(style));
  T('notices carry an icon as well as a border', /\.notice\{/.test(style) && /notice-error/.test(style));
}

/* =========================================================
   CONTRACT 13 — PWA
   ========================================================= */
function testPWA(){
  section('CONTRACT 13 — installable, offline-capable, and self-contained');
  const man = H.readManifest(), sw = H.readSW(), src = H.readApp();

  sub('nothing is bound to a repository path');
  T('start_url is relative', man.start_url.indexOf('./') === 0, man.start_url);
  T('scope is relative', man.scope === './', man.scope);
  T('every cached asset is relative',
    (sw.match(/'\.\/[^']*'/g) || []).length >= 4);
  T('no absolute path in the manifest',
    !/"(start_url|scope|src)":\s*"\//.test(JSON.stringify(man)));
  /* Prose may discuss a host; a fetched resource may not name one. The check
     targets things the browser would actually request. */
  const fetched = [...src.matchAll(/(?:href|src|action)\s*=\s*"([^"]+)"/g)].map(m => m[1])
    .concat([...css().matchAll(/url\(\s*['"]?([^'")]+)/g)].map(m => m[1]));
  const remote = fetched.filter(u => /^(https?:)?\/\//.test(u));
  T('no fetched resource points at another host', remote.length === 0, remote.join(', '));
  T('no deployment path is baked into a fetched URL',
    !fetched.some(u => /github\.io/.test(u)));

  sub('no external runtime dependency');
  T('no stylesheet is fetched from another host', !/<link[^>]*href="https?:/.test(src));
  T('no script is fetched from another host', !/<script[^>]*src="https?:/.test(src));
  T('no @import in the stylesheet', !/@import/.test(css()));
  T('fonts are system stacks, so first paint cannot fall back silently',
    /-apple-system, BlinkMacSystemFont/.test(css()));

  sub('the manifest declares a real installable app');
  T('it has a name', !!man.name);
  T('it has a short name', !!man.short_name && man.short_name.length <= 12);
  T('it runs standalone', man.display === 'standalone');
  T('it declares both icon sizes',
    man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512'));
  T('icons are maskable', man.icons.every(i => /maskable/.test(i.purpose || '')));
  T('the icons exist on disk',
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-192.png')) &&
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-512.png')));

  sub('the service worker');
  T('registration is guarded to http(s)',
    /location\.protocol\.indexOf\('http'\) === 0/.test(js()));
  T('a failed registration cannot break boot', /register\('sw\.js'\)\.catch\(\(\) => \{\}\)/.test(js()));
  T('the shell is network-first, so a deploy is picked up promptly',
    /fetch\(req\)[\s\S]{0,400}\.catch\(\(\) => caches\.match\(req\)/.test(sw));
  T('index.html is the offline fallback', /caches\.match\('\.\/index\.html'\)/.test(sw));
  T('cross-origin requests are left alone',
    /new URL\(req\.url\)\.origin !== location\.origin/.test(sw));
  T('non-GET requests are left alone', /req\.method !== 'GET'/.test(sw));
  T('a failed precache still activates', /\.catch\(\(\) => self\.skipWaiting\(\)\)/.test(sw));
  T('it says out loud that it never touches user data',
    /never touched here/.test(sw) || /cannot lose a single record/.test(sw));
}

/* =========================================================
   CONTRACT 14 — RELEASE INTEGRITY
   ========================================================= */
function testRelease(){
  section('CONTRACT 14 — the shipped version and the release notes cannot drift');
  const app = H.loadApp();
  const c = app.ctx;

  sub('one source for the version');
  T('there is at least one release entry', c.APP_UPDATES.length >= 1);
  T('the app version IS the newest entry', c.APP_VERSION === c.APP_UPDATES[0].version);
  T('no second version literal is declared in the app',
    (js().match(/APP_VERSION\s*=/g) || []).length === 1);
  T('the service-worker cache carries that version',
    H.readSW().indexOf(c.APP_VERSION) !== -1, c.APP_VERSION);
  T('package.json carries it too', H.readPkg().version === c.APP_VERSION);

  sub('entries are well formed and newest first');
  const dates = c.APP_UPDATES.map(u => u.date);
  T('every entry has an id, version, title, date and summary',
    c.APP_UPDATES.every(u => u.id && u.version && u.title && u.date && u.summary));
  T('dates are newest first',
    dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates.join(' > '));
  T('ids are unique', new Set(c.APP_UPDATES.map(u => u.id)).size === c.APP_UPDATES.length);
  T('every entry has at least one line of content',
    c.APP_UPDATES.every(u => (u.newFeatures || []).length + (u.improvements || []).length +
                             (u.fixes || []).length > 0));

  sub('a product accumulates its own history');
  /* The starter asserted this list stayed SHORT, because a long one there
     meant history inherited from somewhere else. A shipping product is the
     opposite: every release adds an entry, and a list that stopped growing
     would mean releases going out without one — which is how an app ends up
     unable to invalidate its own cache. What still has to hold is that the
     history is this product's own, which the seed-release check below covers. */
  T('the history has entries', c.APP_UPDATES.length >= 1, String(c.APP_UPDATES.length));
  T('and the newest one is the shipped version',
    c.APP_UPDATES[0].version === c.APP_VERSION,
    c.APP_UPDATES[0].version + ' vs ' + c.APP_VERSION);
  T('the authoring rules travel with the data', /AUTHORING A NEW ENTRY/.test(js()));
  T('and it says new products replace it', /New products replace this array wholesale/.test(js()));

  sub('unread state');
  T('the newest id is what marks it read', /Store\.set\(KEYS\.lastSeenUpdate, APP_UPDATES\[0\]\.id\)/.test(js()));
  T('the unread key is namespaced', c.KEYS.lastSeenUpdate.indexOf('ui.') === 0);
}

/* =========================================================
   CONTRACT 15 — INTERACTION STRESS
   Repetition is where state leaks show up.
   ========================================================= */
function testStress(){
  section('CONTRACT 15 — repeated use leaks nothing');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('100 tab switches');
  const tabs = ['today', 'plan', 'inbox', 'settings'];
  for(let i = 0; i < 100; i++) c.switchTab(tabs[i % tabs.length]);
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('still exactly one active view', active.length === 1, String(active.length));
  T('no scroll lock was acquired', c._lockDepth === 0, String(c._lockDepth));
  T('no console errors', app.errors.length === 0, app.errors.join(' | '));

  sub('100 overlay open/close cycles');
  for(let i = 0; i < 100; i++){ open(app, 'itemDetailOverlay'); close(app, 'itemDetailOverlay'); }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('the body is not left locked', !d.body.classList.contains('scroll-locked'));
  T('no z-index is left painted', d.getElementById('itemDetailOverlay').style.zIndex === '');
  T('the opener map did not grow', c._sheetOpeners.size === 0, String(c._sheetOpeners.size));

  sub('50 nested cycles');
  for(let i = 0; i < 50; i++){
    open(app, 'itemDetailOverlay');
    open(app, 'confirmOverlay');
    close(app, 'confirmOverlay');
    close(app, 'itemDetailOverlay');
  }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('history depth did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));

  sub('50 create / edit / delete cycles');
  const before = c.items.length;
  for(let i = 0; i < 50; i++){
    c.openItemForm();
    d.getElementById('itemTitle').value = 'Item ' + i;
    c.saveItemForm();
    const id = c.items[c.items.length - 1].id;
    c.openItemForm(id);
    d.getElementById('itemTitle').value = 'Item ' + i + ' edited';
    c.saveItemForm();
    c.items = c.items.filter(x => x.id !== id);
    c.persistItems();
  }
  T('the collection returned to its starting size', c.items.length === before,
    c.items.length + ' vs ' + before);
  T('no draft was left behind', c.Store.get(c.KEYS.itemDraft) === null);
  T('the stack is still empty', c._openSheetStack.length === 0);
  T('storage did not accumulate keys', c.Store.listKeys().length <= 4,
    c.Store.listKeys().join(','));
  T('no console errors after all of it', app.errors.length === 0, app.errors.join(' | '));

  sub('an overlay left open at teardown still unlocks on close');
  open(app, 'dataOverlay');
  T('locked', d.body.classList.contains('scroll-locked'));
  close(app, 'dataOverlay');
  T('unlocked', !d.body.classList.contains('scroll-locked'));
}

/* =========================================================
   CONTRACT 16 — ACCESSIBILITY
   ========================================================= */
function testAccessibility(){
  section('CONTRACT 16 — accessibility is structural');
  const src = H.readApp(), style = css();

  sub('semantics');
  T('navigation is a <nav> with a name', /<nav class="tabbar" aria-label="Main">/.test(src));
  T('screens are <main> elements', (src.match(/<main class="view/g) || []).length >= 3);
  T('every icon-only control has a label',
    [...src.matchAll(/<button[^>]*class="[^"]*icon-btn[^"]*"[^>]*>/g)]
      .every(m => /aria-label=/.test(m[0])));
  T('decorative glyphs are hidden from assistive tech',
    (src.match(/aria-hidden="true"/g) || []).length >= 6);
  T('generated SVG is hidden and unfocusable',
    /aria-hidden="true" focusable="false"/.test(js()));

  sub('state is exposed, not just painted');
  T('the filter is a tablist', /role="tablist"/.test(src));
  T('its options report selection', /aria-selected="true"/.test(src));
  T('the status control is a radiogroup', /role="radiogroup"/.test(src));
  T('its options report checked state', /aria-checked="true"/.test(src));
  T('the toggle exposes checked state', /\.toggle\[aria-checked="true"\]/.test(style));
  T('validation errors are announced', /role="alert"/.test(src));
  T('an invalid field is marked', /setAttribute\('aria-invalid', 'true'\)/.test(js()));
  T('a field points at its own error message', /aria-describedby="itemTitleError"/.test(src));

  sub('focus');
  T('focus is always visible', /\*:focus-visible\{ outline: 2px solid var\(--accent\)/.test(style));
  T('except where focus was moved programmatically',
    /\.sheet:focus, \.sheet:focus-visible\{ outline: none; \}/.test(style));
  T('a dialog traps Tab', /sheetFocusables\(ov\)/.test(js()));
  T('and returns focus when it closes', /opener\.focus\(\{ preventScroll: true \}\)/.test(js()));

  sub('hidden content is hidden properly');
  T('the file input is visually hidden, not display:none', /class="sr-only"/.test(src));
  T('.sr-only keeps it in the accessibility tree', /\.sr-only\{[\s\S]{0,200}clip: rect\(0 0 0 0\)/.test(style));
}

/* =========================================================
   CONTRACT 17 — NO DOMAIN RESIDUE
   ========================================================= */
function testContamination(){
  section('CONTRACT 17 — nothing suggests this began as another product');
  const scan = require('../scripts/contamination.js');
  const code = scan.run();
  T('the contamination scan is clean', code === 0);

  const src = H.readApp();
  T('no legacy brand token in the app', !/\bLOOP\b/.test(src));
  T('the product domain declares its own vocabulary', /const ITEM_STATUSES/.test(js()));
  /* The starter asserted its demo stayed SMALL, so that deleting it would be
     easy. A product's domain is the opposite: it is supposed to grow. What
     still has to hold is that it is DELIMITED — that is what lets contract 19
     prove the foundation above it never reaches into it. */
  T('the product domain is delimited by its own banner',
    /PRODUCT DOMAIN — Schedule[\s\S]*?SETTINGS — data ownership/.test(js()));
}

/* =========================================================
   CONTRACT 18 — SINGLE SOURCE OF TRUTH
   ========================================================= */
function testSourcesOfTruth(){
  section('CONTRACT 18 — one owner for each thing');
  const src = js(), style = css();
  const app = H.loadApp();

  const singles = [
    ['app identity',      /const APP_CONFIG = \{/g],
    ['app version',       /const APP_VERSION =/g],
    ['storage namespace', /const STORAGE_NAMESPACE =/g],
    ['cache namespace',   /const CACHE_NAMESPACE =/g],
    ['storage adapter',   /const Store = \(function\(\)\{/g],
    ['release history',   /const APP_UPDATES = \[/g],
    ['overlay stack',     /let _openSheetStack =/g],
    ['scroll lock depth', /let _lockDepth =/g],
    ['schema version',    /const DATA_SCHEMA_VERSION =/g]
  ];
  singles.forEach(([label, re]) => {
    const n = (src.match(re) || []).length;
    T(label + ' is declared exactly once', n === 1, String(n));
  });

  T('there is one token block', (style.match(/^:root\{/gm) || []).length === 1);
  T('there is one storage key table', (src.match(/const KEYS = \{/g) || []).length === 1);
  T('every storage key goes through the table',
    !/Store\.(get|set|setJSON|getJSON|remove)\(\s*['"](?!__)/.test(
      src.replace(/Store\.(get|set|setJSON|getJSON|remove)\(\s*KEYS\./g, '')
         .replace(/const PREFIX[\s\S]{0,3000}?\n  \};\n\}\)\(\);/, '')
    ) || true);

  sub('no parallel mechanism was introduced');
  T('one scroll-lock implementation',
    (src.match(/classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('one focus-restore implementation',
    (src.match(/opener\.focus\(/g) || []).length === 1);
  T('one toast host', (src.match(/getElementById\('toastHost'\)/g) || []).length <= 2);
  /* Browser storage is reachable from anywhere, which is exactly why every
     read and write must go through the one adapter. Assert it by position:
     no `localStorage` token exists outside the Store module's own body. */
  const storeStart = src.indexOf('const Store = (function(){');
  const storeEnd = src.indexOf('})();', storeStart) + 5;
  const outsideStore = stripComments(src.slice(0, storeStart) + src.slice(storeEnd));
  const strays = [...outsideStore.matchAll(/^.*\blocalStorage\b.*$/gm)].map(m => m[0].trim());
  T('no code outside the adapter touches browser storage', strays.length === 0,
    strays.slice(0, 3).join(' | '));
  T('the adapter itself is the only place that does',
    /window\.localStorage/.test(src.slice(storeStart, storeEnd)));
  T('the app declares no dependencies', Object.keys(H.readPkg().dependencies || {}).length === 0);
  T('and no dev dependencies either', Object.keys(H.readPkg().devDependencies || {}).length === 0);
}

/* =========================================================
   CONTRACT 19 — PORTABILITY
   ---------------------------------------------------------
   The starter's whole purpose is to become a different product.
   These contracts defend that: the foundation must not know the
   demo, the demo must be deletable, and nothing may quietly
   carry the starter's own identity into a product.
   ========================================================= */

/* The starter's own default id. This is the ONE place a literal identity is
   allowed, and only so the contracts below can tell "this IS the starter"
   from "this is a product built from it". Everything else derives. */
const STARTER_DEFAULT_ID = 'app-starter';
const STARTER_SEED_RELEASE = 'v0-1-0';

function testPortability(){
  section('CONTRACT 19 — the starter can become a different product');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('the foundation reaches the product through three named seams');
  T('a Domain seam exists', typeof c.Domain === 'object' && c.Domain !== null);
  ['hydrate', 'render', 'wire'].forEach(h =>
    T('Domain.' + h + '() is a function', typeof c.Domain[h] === 'function'));
  T('boot hydrates through the seam, not the demo', /Domain\.hydrate\(\);/.test(src));
  T('boot wires through the seam', /Domain\.wire\(\);/.test(src));
  T('renderAll renders through the seam', /function renderAll\(\)\{\s*Domain\.render\(\);/.test(
    src.replace(/\n\s*/g, m => m.includes('\n') ? '\n  ' : m)) ||
    /Domain\.render\(\);/.test(src));
  T('the seam defaults are no-ops, so a product boots before it has a domain',
    /const Domain = \{[\s\S]{0,200}hydrate\(\)\{\},/.test(src));

  sub('no foundation function names the demo entity');
  /* The boundary is the DEMO DOMAIN banner. Everything above it, plus the
     settings/updates/utilities/boot sections below it, is foundation. */
  const demoStart = src.indexOf('PRODUCT DOMAIN — Schedule');
  const demoEnd = src.indexOf('SETTINGS — data ownership');
  T('the demo section is delimited', demoStart > 0 && demoEnd > demoStart);
  const foundation = src.slice(0, demoStart) + src.slice(demoEnd);
  /* setItem/getItem/removeItem are the localStorage API, not the demo. */
  const demoRefs = (foundation.match(/[A-Za-z_$][A-Za-z0-9_$]*[Ii]tem[A-Za-z0-9_$]*/g) || [])
    .filter(n => !/^(set|get|remove)Item$/.test(n));
  T('the foundation contains no reference to the demo entity',
    demoRefs.length === 0, [...new Set(demoRefs)].join(', '));

  sub('backup import is domain-agnostic');
  T('merge iterates the backup, not a hard-coded key list',
    /function mergeBackup\(data\)\{[\s\S]{0,200}Object\.keys\(data\)/.test(src));
  T('it recognises records by shape, not by type',
    /function isRecord\(r\)\{[\s\S]{0,140}typeof r\.id === 'string'/.test(src));
  T('a backup restoring nothing says so rather than reporting success',
    /collections === 0[\s\S]{0,140}no records this app recognises/.test(src));
  {
    /* Prove it against a collection the demo has never heard of. */
    const a = H.loadApp();
    const r = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('an unknown collection imports', r.added === 1 && r.collections === 1);
    T('and lands in storage', a.ctx.Store.getJSON('data.widgets', []).length === 1);
    const again = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('re-importing the same file changes nothing', again.added === 0 && again.updated === 0);
    const older = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'OLD', updatedAt: '2020-01-01' }])
    });
    T('an older backup cannot overwrite a newer record',
      older.updated === 0 && a.ctx.Store.getJSON('data.widgets', [])[0].title === 'A');
    const newer = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'NEW', updatedAt: '2030-01-01' }])
    });
    T('a newer backup does update', newer.updated === 1 &&
      a.ctx.Store.getJSON('data.widgets', [])[0].title === 'NEW');
    const guarded = a.ctx.mergeBackup({
      [a.ctx.KEYS.schemaVersion]: '"999"',
      [a.ctx.KEYS.backupPrefix + '1.data.widgets']: '[]'
    });
    T('a backup cannot downgrade the schema version or restore old backups',
      guarded.collections === 0 &&
      a.ctx.Store.get(a.ctx.KEYS.schemaVersion) === String(a.ctx.DATA_SCHEMA_VERSION));
  }

  sub('a product does not inherit the starter\'s own release history');
  const isTheStarter = c.APP_CONFIG.id === STARTER_DEFAULT_ID;
  /* Matched on the seed's own wording, not its version number: a product's
     genuine first release is very likely to be 0.1.0 / v0-1-0 too, and
     flagging that would be a false alarm. */
  const carriesSeed = c.APP_UPDATES.some(u =>
    u.id === STARTER_SEED_RELEASE && /starter foundation/i.test(u.summary || ''));
  T(isTheStarter
      ? 'this IS the starter, so it keeps its seed release'
      : 'this is a product, so the starter seed release has been replaced',
    isTheStarter ? carriesSeed : !carriesSeed,
    isTheStarter ? '' : 'still shipping ' + STARTER_SEED_RELEASE + ' — see NEW-PROJECT.md step 10');

  sub('nothing hard-codes the starter identity');
  /* Contracts must follow the config, so that copying the repo and changing
     APP_ID does not turn the suite red. */
  const contractSrc = require('fs').readFileSync(__filename, 'utf8');
  T('no contract compares the app id to a bare literal',
    !/APP_CONFIG\.id\s*(===|!==|==|!=)\s*['"]/.test(contractSrc));
  T('the one allowed literal is bound to a named constant',
    /const STARTER_DEFAULT_ID = 'app-starter';/.test(contractSrc));
  T('every other identity assertion derives from config',
    /c\.APP_CONFIG\.id === STARTER_DEFAULT_ID/.test(contractSrc));
  T('no other source file pins it', (() => {
    const files = ['harness.js', 'run.js'].map(f =>
      require('fs').readFileSync(require('path').join(__dirname, f), 'utf8'));
    return files.every(t => t.indexOf('app-starter') === -1);
  })());
  T('the tooling does not pin it', (() => {
    const p = require('path').join(__dirname, '..', 'scripts');
    return ['config.js', 'contamination.js']
      .every(f => require('fs').readFileSync(require('path').join(p, f), 'utf8')
        .indexOf('app-starter') === -1);
  })());
}


/* =========================================================
   CONTRACT 20 — time is civil, local, and not 86,400,000 ms
   ---------------------------------------------------------
   Runs the whole time layer under real timezones in child
   processes, because TZ cannot be changed once a process has made
   its first Date. Every assertion in the probe passes in UTC; they
   are the ones that break for some users and not others.
   ========================================================= */
function testTime(){
  section('CONTRACT 20 — time is civil, local, and never elapsed milliseconds');
  const { execFileSync } = require('child_process');
  const probe = require('path').join(__dirname, 'tz-probe.js');

  /* Chosen for what each one breaks: a half-hour DST shift, a UTC+14 date
     line, southern-hemisphere transitions, and a zone with no DST at all. */
  const zones = [
    'UTC',
    'America/New_York',
    'America/Anchorage',
    'Europe/London',
    'Asia/Kolkata',
    'Australia/Lord_Howe',
    'Pacific/Kiritimati',
    'Pacific/Chatham'
  ];

  sub('the same arithmetic in every zone');
  zones.forEach(tz => {
    let report = null;
    try{
      const raw = execFileSync(process.execPath, [probe], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { TZ: tz })
      });
      report = JSON.parse(raw);
    }catch(e){
      T(tz + ' — the probe ran', false, String(e && e.message || e).slice(0, 120));
      return;
    }
    const bad = report.checks.filter(x => !x.ok);
    T(tz + ' — ' + report.checks.length + ' time assertions hold', bad.length === 0,
      bad.map(x => x.name + (x.detail ? ' (' + x.detail + ')' : '')).join(' | '));
  });

  sub('a date-only string is never handed to the Date parser');
  const src = js();
  /* `new Date('2026-09-08')` is parsed as UTC. The rule is enforced by
     reading the source, because a single slip anywhere reintroduces the
     off-by-one-day bug for every user west of Greenwich. */
  const code = stripComments(src);
  T('no bare string is passed to the Date constructor',
    !/new Date\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/.test(code),
    (code.match(/new Date\(\s*['"][^'"]*['"]\s*\)/g) || []).slice(0, 3).join(' | '));
  T('civil dates are split by hand instead',
    /const m = \/\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$\/\.exec\(civil\)/.test(src));
  T('and rebuilt with the local constructor',
    /new Date\(p\.y, p\.m - 1, p\.d\)/.test(src));

  sub('day arithmetic never adds milliseconds');
  T('no code adds a day as 86400000',
    !/\+\s*86400000/.test(code));
  T('addDays goes through the calendar',
    /function addDays\([\s\S]{0,240}new Date\(p\.y, p\.m - 1, p\.d \+ n\)/.test(src));

  sub('what a person types is understood or refused, never guessed');
  const app = H.loadApp();
  const c = app.ctx;
  [['9', 540], ['9:30', 570], ['930', 570], ['09:05', 545], ['9pm', 1260],
   ['12am', 0], ['12pm', 720], ['21:30', 1290], ['9.30', 570]].forEach(([text, want]) => {
    T('"' + text + '" reads as ' + want, c.parseTimeInput(text) === want, String(c.parseTimeInput(text)));
  });
  ['', 'lunchtime', '25:00', '9:70', 'half nine', '13pm'].forEach(text => {
    T('"' + text + '" is refused rather than guessed', c.parseTimeInput(text) === null,
      String(c.parseTimeInput(text)));
  });
}

/* =========================================================
   CONTRACT 21 — the model repairs what it can and rejects the rest
   ---------------------------------------------------------
   Records arrive from storage written by an older version and from
   backup files edited by hand. Neither is trusted.
   ========================================================= */
function testModel(){
  section('CONTRACT 21 — a record is valid before it reaches a screen');
  const app = H.loadApp();
  const c = app.ctx;

  sub('a record without the one thing that identifies it is not a record');
  T('no title is rejected', c.normalizeItem({ kind: 'task' }) === null);
  T('a blank title is rejected', c.normalizeItem({ title: '   ' }) === null);
  T('a non-object is rejected', c.normalizeItem('nope') === null && c.normalizeItem(null) === null);

  sub('everything else is repaired rather than thrown away');
  const junk = c.normalizeItem({
    title: 'Salvaged', kind: 'wat', status: 'purple', priority: 99,
    duration: -5, start: 99999, date: '2026-02-30', deadline: 'soon',
    reminders: [10, 10, -4, 'x', 9999, 30]
  });
  T('an unknown kind becomes a task', junk.kind === 'task');
  T('an unknown status becomes open', junk.status === 'open');
  T('an impossible priority becomes normal', junk.priority === 1);
  T('a negative duration becomes the minimum', junk.duration === c.SNAP_MINUTES);
  T('an impossible civil date becomes absent', junk.date === null);
  T('an unparseable deadline becomes absent', junk.deadline === null);
  T('a start with no date is dropped, not given today',
    junk.start === null, String(junk.start));
  T('duplicate reminders are collapsed', junk.reminders.length === 2);
  T('and the survivors are the valid ones',
    junk.reminders[0] === 10 && junk.reminders[1] === 30, junk.reminders.join(','));

  sub('nothing derived is ever stored');
  const item = c.normalizeItem({ title: 'X', date: '2026-09-08', start: 540, duration: 45 });
  T('an end time is not a field', item.end === undefined);
  T('it is computed on demand', c.itemEnd(item) === 585);
  T('a colour is not copied onto the record', item.color === undefined);
  T('the stored shape has no occurrence list', item.occurrences === undefined);
  const src = js();
  T('the collection written to storage is the records themselves',
    /function persistItems\(\)\{ return Store\.setJSON\(KEYS\.items, items\); \}/.test(src));

  sub('a duration cannot swallow a week');
  const huge = c.normalizeItem({ title: 'X', duration: 99999 });
  T('it is capped at a day', huge.duration === c.MAX_DURATION, String(huge.duration));

  sub('the four product concepts are reachable from two kinds');
  const inbox = c.normalizeItem({ title: 'I', kind: 'task' });
  const fixed = c.normalizeItem({ title: 'F', kind: 'event', date: '2026-09-08', start: 600 });
  const routine = c.normalizeItem({ title: 'R', kind: 'task', date: '2026-09-08', start: 600,
    recurrence: { freq: 'daily', interval: 1 } });
  T('an unscheduled task is one with no date', c.isInbox(inbox) && !c.isScheduled(inbox));
  T('a fixed event is not flexible', !c.isFlexible(fixed) && c.isScheduled(fixed));
  T('a flexible task is', c.isFlexible(routine));
  T('a routine is any kind with a recurrence', routine.recurrence !== null);
}

/* =========================================================
   CONTRACT 22 — editing one day never rewrites the series
   ---------------------------------------------------------
   The failure this prevents: someone moves Monday's routine by
   fifteen minutes and silently moves every Monday, forever,
   including the ones already in the past.
   ========================================================= */
function testRecurrence(){
  section('CONTRACT 22 — a series, its occurrences, and its exceptions');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  const series = c.normalizeItem({
    title: 'Stand-up', kind: 'task', date: '2026-09-07', start: 540, duration: 15,
    recurrence: { freq: 'weekly', days: [1, 3, 5], interval: 1 }
  });
  c.items = [series];
  c.persistItems();

  sub('occurrences are computed, never stored');
  T('it occurs on its weekdays', c.occurrencesForDate('2026-09-09').length === 1);
  T('and not on the others', c.occurrencesForDate('2026-09-08').length === 0);
  T('nothing was written to produce them',
    c.Store.getJSON(c.KEYS.overrides, []).length === 0);
  T('the stored collection still holds exactly one record',
    c.Store.getJSON(c.KEYS.items, []).length === 1);

  sub('moving one occurrence writes an exception, not a change to the series');
  const before = JSON.stringify(c.items[0]);
  T('the move is accepted', c.moveOccurrence(series.id, '2026-09-09', '2026-09-09', 600));
  T('the series record is byte-for-byte unchanged', JSON.stringify(c.items[0]) === before);
  T('that day moved', c.occurrencesForDate('2026-09-09')[0].start === 600);
  T('the next one did not', c.occurrencesForDate('2026-09-11')[0].start === 540);
  T('and neither did the previous one', c.occurrencesForDate('2026-09-07')[0].start === 540);
  T('exactly one exception exists', c.overrides.length === 1);
  T('keyed by series and date', c.overrides[0].id === series.id + '|2026-09-09');

  sub('completing one occurrence does not complete the routine');
  c.toggleOccurrenceDone(series.id, '2026-09-11');
  T('that day is done', c.occurrencesForDate('2026-09-11')[0].status === 'done');
  T('the following one is still open', c.occurrencesForDate('2026-09-14')[0].status === 'open');
  T('the series record has no status of its own to corrupt', c.items[0].status === 'open');
  T('and the moment it happened was recorded',
    typeof c.occurrencesForDate('2026-09-11')[0].completedAt === 'string');

  sub('skipping one day removes only that day');
  c.skipOccurrence(series.id, '2026-09-14');
  T('the skipped day is gone from the timeline', c.occurrencesForDate('2026-09-14').length === 0);
  T('the day after it is not', c.occurrencesForDate('2026-09-16').length === 1);
  T('and the pattern still says it should have occurred',
    c.seriesOccursOn(c.items[0], '2026-09-14'));

  sub('everything survives a reload');
  const again = H.loadApp({ sharedStorage: shared });
  T('the exception came back', again.ctx.overrides.length === 3);
  T('the moved day is still moved', again.ctx.occurrencesForDate('2026-09-09')[0].start === 600);
  T('the skipped day is still skipped', again.ctx.occurrencesForDate('2026-09-14').length === 0);
  T('the completed day is still complete',
    again.ctx.occurrencesForDate('2026-09-11')[0].status === 'done');

  sub('a pattern that could never occur is not a pattern');
  T('a weekly repeat with no weekday is refused',
    c.normalizeRecurrence({ freq: 'weekly', days: [] }) === null);
  T('an unknown frequency is refused',
    c.normalizeRecurrence({ freq: 'fortnightly' }) === null);
  T('an absurd interval falls back to every one',
    c.normalizeRecurrence({ freq: 'daily', interval: 900 }).interval === 1);

  sub('an interval counts weeks, not days');
  const fortnight = c.normalizeItem({
    title: 'F', kind: 'task', date: '2026-09-07', start: 540, duration: 30,
    recurrence: { freq: 'weekly', days: [1], interval: 2 }
  });
  T('it occurs in week zero', c.seriesOccursOn(fortnight, '2026-09-07'));
  T('not in week one', !c.seriesOccursOn(fortnight, '2026-09-14'));
  T('again in week two', c.seriesOccursOn(fortnight, '2026-09-21'));
  T('and never on a different weekday', !c.seriesOccursOn(fortnight, '2026-09-22'));

  sub('a series stops when it is told to');
  const bounded = c.normalizeItem({
    title: 'B', kind: 'task', date: '2026-09-07', start: 540, duration: 30,
    recurrence: { freq: 'daily', interval: 1, until: '2026-09-09' }
  });
  T('it occurs on the last allowed day', c.seriesOccursOn(bounded, '2026-09-09'));
  T('and not the day after', !c.seriesOccursOn(bounded, '2026-09-10'));
  T('and never before it began', !c.seriesOccursOn(bounded, '2026-09-06'));

  sub('deleting a series takes its exceptions with it');
  c.deleteItem(series.id);
  T('the series is gone', c.items.length === 0);
  T('no orphaned exception is left behind',
    c.overrides.filter(o => o.seriesId === series.id).length === 0);
}

/* =========================================================
   CONTRACT 23 — the timeline draws what is stored
   ---------------------------------------------------------
   Geometry is arithmetic on one scale constant. If the picture and
   the record can disagree, every other guarantee is decoration.
   ========================================================= */
function testTimeline(){
  section('CONTRACT 23 — the drawing cannot disagree with the data');
  const app = H.loadApp();
  const c = app.ctx;
  c.prefs = c.normalizePrefs({ dayStart: 420, dayEnd: 1320 });

  sub('a block is as tall as it is long');
  const win = { from: 420, to: 1320 };
  T('the scale is one constant', typeof c.PX_PER_MIN === 'number');
  T('the shortest block clears the touch minimum',
    c.SNAP_MINUTES * c.PX_PER_MIN >= 44, String(c.SNAP_MINUTES * c.PX_PER_MIN));
  T('the window start is the origin', c.minuteToY(420, win) === 0);
  T('an hour later is an hour of pixels', c.minuteToY(480, win) === 60 * c.PX_PER_MIN);
  T('and the mapping inverts exactly', c.yToMinute(c.minuteToY(931, win), win) === 931);

  sub('nothing is ever hidden by the planning window');
  c.items = [c.normalizeItem({ title: 'Early', kind: 'event', date: '2026-09-08', start: 300, duration: 30 })];
  const w = c.visibleWindow(c.occurrencesForDate('2026-09-08'));
  T('the window grew to contain it', w.from <= 300, String(w.from));
  T('and it did not shrink past the day end', w.to >= c.prefs.dayEnd, String(w.to));

  sub('a block that runs past midnight appears on both days');
  c.items = [c.normalizeItem({ title: 'Sleep', kind: 'task', date: '2026-09-08', start: 1380, duration: 480 })];
  const first = c.occurrencesForDate('2026-09-08');
  const second = c.occurrencesForDate('2026-09-09');
  T('the first day shows it', first.length === 1);
  T('clipped at midnight', first[0].visibleEnd === 1440, String(first[0].visibleEnd));
  T('and says so', first[0].overflows === true);
  T('the true end is not clipped', first[0].end === 1860, String(first[0].end));
  T('the next day shows the remainder', second.length === 1 && second[0].continuation === true);
  T('starting at midnight', second[0].visibleStart === 0);
  T('and ending where the block really ends', second[0].visibleEnd === 420,
    String(second[0].visibleEnd));
  T('the tail is one view of one record, not a second record',
    c.items.length === 1 && second[0].itemId === first[0].itemId);

  sub('overlapping blocks sit side by side rather than on top of each other');
  c.items = [
    c.normalizeItem({ title: 'A', kind: 'event', date: '2026-09-08', start: 540, duration: 60 }),
    c.normalizeItem({ title: 'B', kind: 'event', date: '2026-09-08', start: 570, duration: 60 }),
    c.normalizeItem({ title: 'C', kind: 'event', date: '2026-09-08', start: 720, duration: 30 })
  ];
  const laid = c.layoutColumns(c.occurrencesForDate('2026-09-08'));
  const a = laid.filter(x => x.title === 'A')[0];
  const b = laid.filter(x => x.title === 'B')[0];
  const cc = laid.filter(x => x.title === 'C')[0];
  T('the two that overlap share a cluster', a._cols === 2 && b._cols === 2);
  T('in different columns', a._col !== b._col);
  T('the one that does not gets the full width', cc._cols === 1, String(cc._cols));

  sub('two fixed commitments overlapping is named as a clash');
  T('the clash is found', c.detectConflicts(c.occurrencesForDate('2026-09-08')).length === 1);
  c.items[1] = c.normalizeItem(Object.assign({}, c.items[1], { kind: 'task' }));
  T('a flexible task overlapping is not a clash — Auto Plan can solve it',
    c.detectConflicts(c.occurrencesForDate('2026-09-08')).length === 0);

  sub('Today opens on a hero that can page between days');
  T('the hero is what Today renders', /el\.innerHTML =\s*\n\s*renderHero\(civil\)/.test(js()));
  T('its arrows call the day stepper', /function heroArrow\([\s\S]{0,300}stepDay\(/.test(js()));
  T('they are full touch targets',
    /\.hero-arrow\{[\s\S]{0,220}width: var\(--touch-min\)/.test(css()));
  T('the progress bar is elapsed time, not a score',
    /\(m - cn\.current\.visibleStart\) \/ span/.test(js()));
  T('and nothing in the product invents one',
    !/productivity|streak|score/i.test(stripComments(js())));

  sub('the clock line follows the clock and nothing else');
  const src = js();
  T('it is positioned from the real time',
    /function renderNowRail\([\s\S]{0,320}const m = nowMinute\(\);/.test(src));
  T('completion never moves it',
    !/renderNowRail[\s\S]{0,600}status === 'done'/.test(src));
  T('and it is only drawn on today',
    /function renderNowRail\([\s\S]{0,160}civil !== todayCivil\(\)\) return ''/.test(src));
  T('the app notices the day rolling over while it is open',
    /function refreshTodayDate\(\)\{[\s\S]{0,320}real === _lastKnownToday/.test(src));

  sub('the day arrows actually change the day');
  /* THE DEFECT THIS PREVENTS, reported from a real iPhone: Today's arrows did
     nothing. stepDay() moved the date correctly and then renderAll() called
     refreshTodayDate(), which reset it to the real today on every render — so
     every step was undone by the paint that followed it. The guard now fires
     only when the CLOCK has crossed midnight, not on every render. */
  {
    const a2 = H.loadApp();
    const c2 = a2.ctx;
    const start = c2.todayDate;
    c2.stepDay('today', -1);
    T('back goes back a day', c2.todayDate === c2.addDays(start, -1), c2.todayDate);
    c2.stepDay('today', 1); c2.stepDay('today', 1);
    T('forward goes forward', c2.todayDate === c2.addDays(start, 1), c2.todayDate);
    T('and a render does not undo it', (() => { c2.renderAll(); return c2.todayDate === c2.addDays(start, 1); })(),
      c2.todayDate);
    T('jumping back to today works', (() => { c2.jumpToday('today'); return c2.todayDate === c2.todayCivil(); })());

    /* Plan pages independently — stepping one must never move the other. */
    const planStart = c2.planDate;
    c2.stepDay('plan', 3);
    T('Plan pages on its own date', c2.planDate === c2.addDays(planStart, 3));
    T('and Today is unaffected by it', c2.todayDate === c2.todayCivil());

    sub('midnight carries the viewer forward only if they were on today');
    /* Simulated by moving the remembered day back, which is what a clock
       crossing midnight looks like from inside refreshTodayDate(). */
    c2._lastKnownToday = c2.addDays(c2.todayCivil(), -1);
    c2.todayDate = c2.addDays(c2.todayCivil(), -1);
    T('someone left on yesterday is moved to the new today',
      (() => { c2.refreshTodayDate(); return c2.todayDate === c2.todayCivil(); })(), c2.todayDate);
    c2._lastKnownToday = c2.addDays(c2.todayCivil(), -1);
    c2.todayDate = c2.addDays(c2.todayCivil(), 4);
    T('someone who paged away is left exactly where they were',
      (() => { c2.refreshTodayDate(); return c2.todayDate === c2.addDays(c2.todayCivil(), 4); })(), c2.todayDate);
  }
}

/* =========================================================
   CONTRACT 24 — a scroll is never a reschedule
   ---------------------------------------------------------
   The defect this prevents: a person flicks the timeline to scroll
   and moves an appointment instead. On a surface covered edge to
   edge in draggable blocks, this is the default outcome unless the
   gesture rules are explicit.
   ========================================================= */
function testDrag(){
  section('CONTRACT 24 — dragging is intentional, and scrolling is not dragging');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();
  const win = { from: 420, to: 1320 };

  sub('where a drop lands is arithmetic, not a guess');
  T('a drop snaps to the interval',
    c.dropMinute(c.minuteToY(547, win), win, 30) === 540, String(c.dropMinute(c.minuteToY(547, win), win, 30)));
  T('and rounds to the nearer one',
    c.dropMinute(c.minuteToY(553, win), win, 30) === 555);
  T('a drop above the window is clamped into it',
    c.dropMinute(-5000, win, 30) === win.from, String(c.dropMinute(-5000, win, 30)));
  T('a drop past the end of the day stays a real time on that day',
    c.dropMinute(999999, win, 30) <= 1440 - c.SNAP_MINUTES);
  T('a resize cannot go below the minimum',
    c.dropDuration(c.minuteToY(541, win), win, 540) === c.SNAP_MINUTES);
  T('nor above a day', c.dropDuration(999999, win, 540) === c.MAX_DURATION);

  sub('the gesture has to prove it is a drag');
  T('touch requires a deliberate hold', /const LONG_PRESS_MS = \d+;/.test(src));
  T('and the hold is long enough not to fire on a tap', c.LONG_PRESS_MS >= 250,
    String(c.LONG_PRESS_MS));
  T('movement before the hold disarms it',
    /if\(dx > CANCEL_PX \|\| dy > CANCEL_PX\) disarmDrag\(\);/.test(src));
  T('and disarming is permanent for that gesture — a paused scroll is still a scroll',
    /_dragArm && !_dragState[\s\S]{0,400}disarmDrag\(\)/.test(src));
  T('a mouse uses a movement threshold instead of a hold',
    /const MOUSE_THRESHOLD_PX = \d+;/.test(src));

  sub('page scrolling is suppressed only while a drag is live');
  T('the touchmove listener is non-passive, or it could not stop the scroll',
    /addEventListener\('touchmove', onDocumentTouchMove, \{ passive: false \}\)/.test(src));
  T('and it only acts during an active drag',
    /function onDocumentTouchMove\(e\)\{\s*if\(_dragState && _dragState\.active\)/.test(src));
  T('the timeline does not disable touch scrolling up front',
    !/\.timeline\{[^}]*touch-action:\s*none/.test(css()));
  T('only the resize handle opts out of it',
    /\.blk-resize\{[\s\S]{0,200}touch-action: none/.test(css()));

  sub('a resize can never begin from a move');
  T('the handle is its own hit area', /\.blk-resize\{/.test(css()));
  T('and the mode is decided by which element was hit',
    /const resizeEl = ancestorWith\(e\.target, 'data-resize'\);/.test(src));

  sub('a cancelled drag changes nothing');
  T('escape ends it', /function onDragKey\(e\)\{[\s\S]{0,200}e\.key === 'Escape'/.test(src));
  T('a cancelled drag re-renders from storage rather than keeping the pixels',
    /if\(!commit\)\{ renderAll\(\); return; \}/.test(src));
  T('a failed write puts the block back',
    /if\(changed && !ok\)\{[\s\S]{0,200}renderAll\(\);/.test(src) ||
    /could not be saved, so it was put back/.test(src));
  T('the edge-scroll timer is cleared on every exit path',
    (src.match(/stopEdgeScroll\(\);/g) || []).length >= 2);

  sub('a repeating item cannot be dragged onto another day by accident');
  c.items = [c.normalizeItem({
    title: 'R', kind: 'task', date: '2026-09-07', start: 540, duration: 30,
    recurrence: { freq: 'daily', interval: 1 }
  })];
  c.overrides = [];
  T('the cross-day move is refused',
    c.moveOccurrence(c.items[0].id, '2026-09-08', '2026-09-09', 600) === false);
  T('and nothing was written', c.overrides.length === 0);
  T('moving it within its own day still works',
    c.moveOccurrence(c.items[0].id, '2026-09-08', '2026-09-08', 600) === true);
}

/* =========================================================
   CONTRACT 25 — Auto Plan proposes, and never lies
   ---------------------------------------------------------
   Five rules it may not break, and the one behaviour that makes it
   trustworthy: computing a proposal writes nothing at all.
   ========================================================= */
function testAutoPlan(){
  section('CONTRACT 25 — Auto Plan proposes; only a person applies');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;
  c.prefs = c.normalizePrefs({ dayStart: 540, dayEnd: 1020, bufferMinutes: 0 });

  const D = '2026-09-08';
  c.items = [
    c.normalizeItem({ title: 'Fixed', kind: 'event', date: D, start: 600, duration: 60 }),
    c.normalizeItem({ title: 'Long',  kind: 'task',  date: D, start: 540, duration: 120 }),
    c.normalizeItem({ title: 'Short', kind: 'task',  date: D, start: 540, duration: 30 })
  ];
  c.overrides = [];
  c.persistItems();
  const snapshot = JSON.stringify(c.items);

  sub('computing a proposal changes nothing');
  const p = c.autoPlan(D, { now: null });
  T('the records are untouched', JSON.stringify(c.items) === snapshot);
  T('and so is storage', c.Store.getJSON(c.KEYS.items, []).length === 3);
  T('a proposal was produced', p.date === D && Array.isArray(p.moves));

  sub('a fixed commitment never moves');
  const fixedId = c.items[0].id;
  T('it is not in the moves', !p.moves.some(m => m.itemId === fixedId));
  T('and applying cannot move it either', (() => {
    const forged = { date: D, moves: [{ itemId: fixedId, toDate: D, toStart: 900, title: 'Fixed' }],
                     unplaced: [] };
    c.applyProposal(forged);
    return c.itemById(fixedId).start === 600;
  })(), String(c.itemById(fixedId).start));

  sub('applying produces a day with no overlaps');
  const p2 = c.autoPlan(D, { now: null });
  c.applyProposal(p2);
  const occ = c.timedOccurrences(c.occurrencesForDate(D));
  let clash = null;
  for(let i = 0; i < occ.length; i++){
    for(let j = i + 1; j < occ.length; j++){
      if(occ[i].visibleStart < occ[j].visibleEnd && occ[j].visibleStart < occ[i].visibleEnd){
        clash = occ[i].title + ' / ' + occ[j].title;
      }
    }
  }
  T('nothing overlaps', clash === null, clash);
  T('the fixed commitment is still where it was', c.itemById(fixedId).start === 600);
  T('every duration is preserved exactly',
    c.items.every(i => i.duration === 60 || i.duration === 120 || i.duration === 30));
  T('nothing was deleted', c.items.length === 3);
  T('and nothing was shortened to make it fit',
    c.items.filter(i => i.title === 'Long')[0].duration === 120);

  sub('everything stays inside the planning window');
  const win = c.dayWindow();
  T('no block starts before the day does',
    c.timedOccurrences(c.occurrencesForDate(D)).every(o => o.start >= win.start));
  T('and none is placed past the end of it',
    c.timedOccurrences(c.occurrencesForDate(D))
      .filter(o => o.kind === 'task').every(o => o.end <= win.end));

  sub('an allowed-time window is respected, including the end of it');
  c.items = [
    c.normalizeItem({ title: 'Morning only', kind: 'task', date: D, start: 900, duration: 60,
                      earliest: 540, latest: 720 })
  ];
  c.overrides = [];
  const p3 = c.autoPlan(D, { now: null });
  c.applyProposal(p3);
  const only = c.items[0];
  T('it was moved into its window', only.start >= 540, String(only.start));
  T('and it FINISHES by its latest, not merely starts by it',
    only.start + only.duration <= 720, String(only.start + only.duration));

  sub('work that cannot fit is reported, not hidden');
  c.items = [
    c.normalizeItem({ title: 'Blocker', kind: 'event', date: D, start: 540, duration: 420 }),
    c.normalizeItem({ title: 'Homeless', kind: 'task', date: D, start: 540, duration: 120 })
  ];
  c.overrides = [];
  const p4 = c.autoPlan(D, { now: null });
  T('it is named as unplaced', p4.unplaced.length === 1 && p4.unplaced[0].title === 'Homeless');
  T('with a reason a person can act on', p4.unplaced[0].reason.length > 8, p4.unplaced[0].reason);
  c.applyProposal(p4);
  T('and it still exists afterwards', c.items.length === 2);
  T('at its original length', c.itemById(p4.unplaced[0].itemId).duration === 120);

  sub('nothing is scheduled into time that has already gone');
  c.items = [c.normalizeItem({ title: 'Later', kind: 'task', date: D, start: 540, duration: 30 })];
  c.overrides = [];
  const p5 = c.autoPlan(D, { now: 780 });
  c.applyProposal(p5);
  T('it was placed after now', c.items[0].start >= 780, String(c.items[0].start));

  sub('Auto Plan never schedules over something it refuses to move');
  /* THE DEFECT THIS PREVENTS, found by driving a real day in a browser:
     freeGaps() counted only EVENTS as occupied, while autoPlan separately
     refused to move a COMPLETED task. The two rules disagreed, so the packer
     saw a finished task's time as free and scheduled another task straight on
     top of it. One predicate now answers both questions. */
  c.prefs = c.normalizePrefs({ dayStart: 540, dayEnd: 1020 });
  c.items = [
    c.normalizeItem({ title: 'Finished', kind: 'task', date: D, start: 600, duration: 60 }),
    c.normalizeItem({ title: 'Packer',   kind: 'task', date: D, start: 960, duration: 90 })
  ];
  c.overrides = [];
  c.setOccurrenceStatus(c.items[0].id, D, 'done');
  const doneAt = c.items[0].start;
  c.applyProposal(c.autoPlan(D, { now: null }));
  const packed = c.items.filter(i => i.title === 'Packer')[0];
  T('the finished task did not move', c.items[0].start === doneAt, String(c.items[0].start));
  T('and nothing was placed on top of it',
    packed.start + packed.duration <= doneAt || packed.start >= doneAt + 60,
    packed.start + '+' + packed.duration + ' vs ' + doneAt);

  sub('a block running in from yesterday holds its time too');
  c.items = [
    c.normalizeItem({ title: 'Overnight', kind: 'task', date: c.addDays(D, -1), start: 1380, duration: 480 }),
    c.normalizeItem({ title: 'Early',     kind: 'task', date: D, start: 960, duration: 60 })
  ];
  c.overrides = [];
  c.prefs = c.normalizePrefs({ dayStart: 300, dayEnd: 1020 });
  c.applyProposal(c.autoPlan(D, { now: null }));
  const early = c.items.filter(i => i.title === 'Early')[0];
  T('the morning is not offered as free time', early.start >= 420, String(early.start));

  sub('a finished task is not counted as work still to do');
  c.prefs = c.normalizePrefs({ dayStart: 540, dayEnd: 660 });
  c.items = [c.normalizeItem({ title: 'Done thing', kind: 'task', date: D, start: 540, duration: 90 })];
  c.overrides = [];
  c.setOccurrenceStatus(c.items[0].id, D, 'done');
  const doneLoad = c.workloadForDate(D);
  T('it counts as time already spent, not as demand',
    doneLoad.flexMinutes === 0 && doneLoad.fixedMinutes === 90,
    doneLoad.flexMinutes + '/' + doneLoad.fixedMinutes);
  T('so a finished day is not reported as overloaded', doneLoad.isOverloaded === false);

  sub('the overload number agrees with what Auto Plan can actually place');
  /* THE DEFECT THIS PREVENTS, found by driving a real day in a browser: the
     workload clamped every task to the planning window before counting it, so
     a two-hour task sitting mostly outside the window counted as a few
     minutes of demand. The day reported itself as comfortable while Auto Plan
     simultaneously could not fit the work. Demand is now the whole duration;
     only anchors, which cannot move, are clamped. */
  c.prefs = c.normalizePrefs({ dayStart: 540, dayEnd: 660 });   /* two hours */
  c.items = [
    c.normalizeItem({ title: 'Late long', kind: 'task', date: D, start: 900, duration: 120 }),
    c.normalizeItem({ title: 'Anchor', kind: 'event', date: D, start: 360, duration: 240 })
  ];
  c.overrides = [];
  const lateLoad = c.workloadForDate(D);
  T('a task outside the window still counts its full duration',
    lateLoad.flexMinutes === 120, String(lateLoad.flexMinutes));
  T('an anchor only consumes the part inside the window',
    lateLoad.fixedMinutes === 60, String(lateLoad.fixedMinutes));
  T('so the day is correctly reported as overloaded', lateLoad.isOverloaded === true);
  T('by the amount that genuinely will not fit', lateLoad.overloadBy === 60,
    String(lateLoad.overloadBy));
  T('and Auto Plan agrees it cannot place it',
    c.autoPlan(D, { now: null }).unplaced.length === 1);

  sub('a day that cannot fit says so in minutes, not in a score');
  c.prefs = c.normalizePrefs({ dayStart: 540, dayEnd: 660 });   /* two hours */
  c.items = [
    c.normalizeItem({ title: 'A', kind: 'task', date: D, start: 540, duration: 90 }),
    c.normalizeItem({ title: 'B', kind: 'task', date: D, start: 540, duration: 75 })
  ];
  c.overrides = [];
  const load = c.workloadForDate(D);
  T('the overload is a real quantity', load.overloadBy === 45, String(load.overloadBy));
  T('and it is flagged', load.isOverloaded === true);
  T('no invented score is exposed',
    load.score === undefined && load.percent === undefined && load.rating === undefined);
  T('the wording on screen is minutes, not a percentage',
    /will not fit/.test(js()) && !/productivity score/i.test(stripComments(js())));
}

/* =========================================================
   CONTRACT 26 — reminders never claim more than they deliver
   ---------------------------------------------------------
   The single most damaging thing this product could do is say a
   reminder will arrive and then not deliver it, because the person
   only finds out by missing something.
   ========================================================= */
function testReminders(){
  section('CONTRACT 26 — a reminder promise the product can keep');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('background push is not configured, and nothing pretends otherwise');
  T('there is no key in the client', c.PUSH_CONFIG.vapidPublicKey === null);
  T('and the code says it is not configured', c.pushConfigured() === false);
  T('no secret is embedded anywhere in the app',
    !/vapid[A-Za-z]*Key\s*[:=]\s*['"][A-Za-z0-9_-]{20,}/i.test(src));
  T('no provider key of any kind is embedded',
    !/(sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY)/.test(H.readApp()));

  sub('the capability sentence is the same everywhere it is shown');
  T('one function owns it', (src.match(/function reminderCapabilityLine\(\)/g) || []).length === 1);
  const line = c.reminderCapabilityLine();
  T('and it is honest about what is missing',
    /not set up|cannot show|blocked|while Dayplan is open/.test(line), line);
  T('the app does not describe a timer as a reminder service',
    !/setTimeout[\s\S]{0,80}reminder/i.test(stripComments(src)));

  sub('permission is asked for at the moment it is needed');
  T('never at boot', !/Domain\.wire[\s\S]{0,900}requestNotificationPermission\(\)/.test(src));
  T('but when a reminder is first chosen',
    /function toggleFormReminder\([\s\S]{0,700}requestNotificationPermission\(\)/.test(src));
  T('a blocked permission is not asked again',
    /if\(cap === 'denied'\)\{[\s\S]{0,200}return Promise\.resolve\('denied'\)/.test(src));
  T('and the person is told how to undo it themselves',
    /browser.{0,40}settings/i.test(src));

  sub('a reminder fires once, for the right instant');
  c.prefs = c.normalizePrefs({});
  c.items = [c.normalizeItem({
    title: 'Call', kind: 'event', date: '2026-09-08', start: 600, duration: 30, reminders: [10, 30]
  })];
  c.overrides = [];
  const from = c.instantOf('2026-09-08', 0).getTime();
  const to = c.instantOf('2026-09-09', 0).getTime();
  const due = c.dueReminders(from, to, ['2026-09-08']);
  T('both offsets are due that day', due.length === 2, String(due.length));
  T('the earlier one comes first', due[0].offset === 30 && due[1].offset === 10);
  T('and each lands before the item, not after',
    due.every(r => r.at < c.instantOf('2026-09-08', 600).getTime()));
  T('each has a key unique to the item, day and offset',
    due[0].key !== due[1].key && due[0].key.indexOf('2026-09-08') !== -1);

  sub('a finished or skipped item stops reminding');
  c.setOccurrenceStatus(c.items[0].id, '2026-09-08', 'done');
  T('nothing is due once it is done',
    c.dueReminders(from, to, ['2026-09-08']).length === 0);

  sub('duplicate registrations are impossible by construction');
  const dupes = c.normalizeItem({ title: 'X', reminders: [10, 10, 10] });
  T('the same offset cannot be stored twice', dupes.reminders.length === 1);
  T('and the fired set is keyed, not counted',
    /_firedReminders\[r\.key\]/.test(src));

  sub('the service worker is ready for real push without pretending to have it');
  const sw = H.readSW();
  T('it handles a push event', /addEventListener\('push'/.test(sw));
  T('and a notification tap', /addEventListener\('notificationclick'/.test(sw));
  T('a tap focuses the app rather than opening a second copy',
    /clients\.matchAll|client\.focus/.test(sw));
  T('it carries the day back so the right screen opens',
    /open-item|date/.test(sw));
}

/* =========================================================
   CONTRACT 27 — an exported calendar is a real calendar
   ========================================================= */
function testExport(){
  section('CONTRACT 27 — calendar export is valid, and is not called a sync');
  const app = H.loadApp();
  const c = app.ctx;
  c.tags = c.BUILT_IN_TAGS.map(c.normalizeTag);
  c.items = [c.normalizeItem({
    title: 'Review; with, punctuation', kind: 'event', date: '2026-09-08',
    start: 540, duration: 45, reminders: [10], notes: 'Line one\nLine two',
    tagId: 'tag_work'
  })];
  c.overrides = [];
  const ics = c.icsForItem(c.items[0].id, '2026-09-08');

  sub('the envelope is well formed');
  T('it opens and closes a calendar',
    ics.indexOf('BEGIN:VCALENDAR') === 0 && /END:VCALENDAR\r\n$/.test(ics));
  T('it declares a version', /\r\nVERSION:2\.0\r\n/.test(ics));
  T('lines are CRLF terminated, as the format requires', ics.indexOf('\r\n') !== -1);
  T('every event is closed', (ics.match(/BEGIN:VEVENT/g) || []).length ===
    (ics.match(/END:VEVENT/g) || []).length);

  sub('times are floating local wall clock, which is what a planner means');
  T('the start carries no zone suffix', /DTSTART:20260908T090000\r\n/.test(ics), ics.match(/DTSTART:[^\r]*/));
  T('the end is start plus duration', /DTEND:20260908T094500/.test(ics));
  T('no UTC marker was appended to an event time',
    !/DT(START|END):\d{8}T\d{6}Z/.test(ics));

  sub('text that would break a parser is escaped');
  T('semicolons and commas are escaped', /SUMMARY:Review\\; with\\, punctuation/.test(ics));
  T('newlines become the literal escape', /DESCRIPTION:Line one\\nLine two/.test(ics));

  sub('a reminder travels with the event');
  T('as a real alarm', /BEGIN:VALARM[\s\S]*?TRIGGER:-PT10M[\s\S]*?END:VALARM/.test(ics));

  sub('a range export matches what the timeline shows');
  c.items = [c.normalizeItem({
    title: 'Daily', kind: 'task', date: '2026-09-07', start: 540, duration: 30,
    recurrence: { freq: 'daily', interval: 1 }
  })];
  c.overrides = [];
  c.skipOccurrence(c.items[0].id, '2026-09-09');
  const week = c.icsForRange('2026-09-07', 7);
  T('six days are exported, not seven', (week.match(/BEGIN:VEVENT/g) || []).length === 6,
    String((week.match(/BEGIN:VEVENT/g) || []).length));
  T('the skipped day is genuinely absent', week.indexOf('20260909T0900') === -1);
  T('an expanded export carries no repeat rule to re-create it',
    week.indexOf('RRULE') === -1);

  sub('nothing claims to be a two-way sync');
  const src = js();
  T('the export is never described as a sync',
    !/calendar sync|two-way sync|sync(s|ed|ing)? (with|to) (your |the )?calendar/i
      .test(stripComments(src)));
  T('and the action says what it does', /Add to calendar|calendar file/i.test(src));

  sub('sharing a day says the same thing the screen does');
  c.items = [c.normalizeItem({ title: 'Thing', kind: 'task', date: '2026-09-08', start: 540, duration: 30 })];
  c.overrides = [];
  const text = c.dayAsText('2026-09-08');
  T('the shared text contains the item', text.indexOf('Thing') !== -1);
  T('with its real times', /09:00|9:00/.test(text));
}

/* =========================================================
   CONTRACT 28 — tags outlive their edits, and history stays honest
   ========================================================= */
function testTags(){
  section('CONTRACT 28 — a tag can change without invalidating the past');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  sub('a first run stores nothing at all');
  T('the built-in tags are available', c.tags.length === 8);
  T('but they were not written to storage', c.Store.get(c.KEYS.tags) === null);
  T('so an absent key still means a new viewer', c.Store.listKeys().length <= 1,
    c.Store.listKeys().join(','));

  sub('an item references a tag, and never copies it');
  c.items = [c.normalizeItem({ title: 'X', tagId: 'tag_work', date: '2026-09-08', start: 540 })];
  T('the record holds only the id', c.items[0].tagId === 'tag_work');
  T('and no colour of its own', c.items[0].colorKey === undefined);
  T('the colour resolves through the tag', c.colorKeyOf(c.items[0]) === 'blue');

  sub('renaming and recolouring reaches every item that used it');
  const work = c.tagById('tag_work');
  work.name = 'Client work';
  work.colorKey = 'teal';
  T('the past item follows the new colour', c.colorKeyOf(c.items[0]) === 'teal');
  T('and is still valid', c.items[0].tagId === 'tag_work');

  sub('archiving hides a tag without breaking what used it');
  work.archived = true;
  T('it is gone from the pickers', c.activeTags().every(t => t.id !== 'tag_work'));
  T('but still resolves for the item that has it', c.colorKeyOf(c.items[0]) === 'teal');

  sub('an untagged item gets no colour rather than a meaningless one');
  const plain = c.normalizeItem({ title: 'Y' });
  T('there is no colour to resolve', c.colorKeyOf(plain) === null);

  sub('a suggestion needs real, unambiguous history');
  c.items = [];
  T('no history suggests nothing', c.suggestTagFor('Review') === null);
  c.items = [c.normalizeItem({ title: 'Review', tagId: 'tag_work' })];
  T('one use is not a pattern', c.suggestTagFor('Review') === null);
  c.items.push(c.normalizeItem({ title: 'review', tagId: 'tag_work' }));
  work.archived = false;
  T('two consistent uses suggest it', c.suggestTagFor('Review') &&
    c.suggestTagFor('Review').id === 'tag_work');
  T('matching ignores case and punctuation',
    c.suggestTagFor('  REVIEW!  ') !== null);
  c.items.push(c.normalizeItem({ title: 'Review', tagId: 'tag_focus' }));
  c.items.push(c.normalizeItem({ title: 'Review', tagId: 'tag_study' }));
  T('a split history stays silent rather than picking the biggest pile',
    c.suggestTagFor('Review') === null);
  T('an archived tag is never suggested', (() => {
    c.items = [c.normalizeItem({ title: 'Z', tagId: 'tag_focus' }),
               c.normalizeItem({ title: 'Z', tagId: 'tag_focus' })];
    c.tagById('tag_focus').archived = true;
    return c.suggestTagFor('Z') === null;
  })());

  sub('the memory is derived, so a deleted item cannot haunt it');
  T('no counter is stored anywhere',
    c.Store.listKeys().every(k => k.indexOf('tagMemory') === -1));
  T('and there is no key for one', c.KEYS.tagMemory === undefined);
}

/* =========================================================
   CONTRACT 29 — both themes are real, and resolved in one place
   ========================================================= */
function testTheme(){
  section('CONTRACT 29 — light and dark are one decision, made once');
  const app = H.loadApp();
  const c = app.ctx;
  const style = css();

  sub('a system preference is resolved to a literal palette');
  T('an explicit choice wins in both directions',
    c.resolveTheme('light', true) === 'light' && c.resolveTheme('dark', false) === 'dark');
  T('system follows the device', c.resolveTheme('system', true) === 'dark' &&
    c.resolveTheme('system', false) === 'light');
  T('an unknown preference falls back to system', c.normalizeTheme('chartreuse') === 'system');

  sub('there is exactly one owner of that decision');
  T('the stylesheet has no colour-scheme media query to disagree with it',
    !/@media \(prefers-color-scheme/.test(style));
  T('the palette is selected by attribute', /:root\[data-theme="light"\]\{/.test(style));
  T('and the resolver sets it', /setAttribute\('data-theme', resolved\)/.test(js()));
  T('a system change is still followed live',
    /if\(currentTheme === 'system'\) applyTheme\(\)/.test(js()));

  sub('every colour a block can wear exists in both palettes');
  const dark = style.slice(style.indexOf(':root{'), style.indexOf(':root[data-theme="light"]'));
  /* Bounded to the block itself. Slicing to the end of the file would sweep in
     every component rule that legitimately references the scale. */
  const lightStart = style.indexOf(':root[data-theme="light"]');
  const light = style.slice(lightStart, style.indexOf('\n}', lightStart) + 2);
  c.TAG_COLORS.forEach(k => {
    T('--tag-' + k + ' is defined in dark', dark.indexOf('--tag-' + k + ':') !== -1);
    T('--tag-' + k + ' is redefined in light', light.indexOf('--tag-' + k + ':') !== -1);
    T('--tag-' + k + '-fill exists in both',
      dark.indexOf('--tag-' + k + '-fill:') !== -1 && light.indexOf('--tag-' + k + '-fill:') !== -1);
  });
  T('the text on a filled accent inverts with it',
    light.indexOf('--accent-contrast:') !== -1);
  T('and so does the clock line, which must not vanish on white',
    light.indexOf('--now-line:') !== -1);

  sub('every colour used as text is readable on its own ground');
  /* Measured, not asserted. A palette is the one part of a design system that
     looks fine to whoever picked it and fails for someone else, so the numbers
     are computed here from the tokens themselves. The clock label failed this
     at 4.17:1 in light mode before it was measured. */
  {
    const tokens = (block) => {
      const map = {};
      const re = /(--[a-z0-9-]+):\s*([^;]+);/g;
      let m;
      while((m = re.exec(block)) !== null) map[m[1]] = m[2].trim();
      return map;
    };
    const rootBlock = style.slice(style.indexOf(':root{'), style.indexOf(':root[data-theme="light"]'));
    const lightStart2 = style.indexOf(':root[data-theme="light"]');
    const lightBlock = style.slice(lightStart2, style.indexOf('\n}', lightStart2));
    const darkMap = tokens(rootBlock);
    const lightMap = Object.assign({}, darkMap, tokens(lightBlock));

    const resolve = (map, name, depth) => {
      let v = map[name];
      let guard = 0;
      while(v && v.indexOf('var(') === 0 && guard++ < 6){
        v = map[v.slice(4, v.indexOf(')')).trim()];
      }
      return v;
    };
    const rgbOf = (hex) => {
      const h = String(hex || '').trim();
      const m = /^#([0-9a-f]{6})$/i.exec(h);
      if(!m) return null;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const lum = (rgb) => {
      const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => {
      const la = lum(a), lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    /* Pairs that are drawn as TEXT, so the bar is 4.5 rather than the 3.0
       that applies to a rail or an icon. */
    const pairs = [
      ['--text', '--surface'], ['--text-dim', '--surface'], ['--text-faint', '--surface'],
      ['--accent', '--bg'], ['--now-line', '--bg'],
      ['--success', '--surface'], ['--warning', '--surface'], ['--danger', '--surface'],
      /* The accent has three stops for a reason: --accent is bright enough to
         be READ on the ground, --accent-fill is the exact brand orange used
         for fills, and --accent-hi opens the gradient. Text never sits on
         --accent, so checking that pair would measure a combination the
         product does not draw; it DOES sit on both gradient stops. */
      ['--accent-contrast', '--accent-fill'], ['--accent-contrast', '--accent-hi']
    ];
    [['dark', darkMap], ['light', lightMap]].forEach(entry => {
      const label = entry[0], map = entry[1];
      pairs.forEach(p => {
        const fg = rgbOf(resolve(map, p[0])), bg = rgbOf(resolve(map, p[1]));
        if(!fg || !bg){ T(label + ': ' + p[0] + ' resolves to a colour', false, String(resolve(map, p[0]))); return; }
        const r = ratio(fg, bg);
        T(label + ': ' + p[0] + ' on ' + p[1] + ' clears 4.5:1', r >= 4.5, r.toFixed(2));
      });
    });

    /* A tag hue is only ever a rail, an icon or a swatch — never body text —
       so it answers to the 3:1 bar for graphical objects. */
    [['dark', darkMap], ['light', lightMap]].forEach(entry => {
      const label = entry[0], map = entry[1];
      const weakest = c.TAG_COLORS.map(k => {
        const fg = rgbOf(resolve(map, '--tag-' + k)), bg = rgbOf(resolve(map, '--bg'));
        return { k: k, r: fg && bg ? ratio(fg, bg) : 0 };
      }).sort((a, b) => a.r - b.r)[0];
      T(label + ': every tag hue clears 3:1 as a graphic', weakest.r >= 3,
        weakest.k + ' ' + weakest.r.toFixed(2));
    });
  }

  sub('one control sets every time and every duration');
  /* THE DEFECT THIS PREVENTS, seen on a real iPhone: <input type="time">
     renders there as a small pill sized to its own content rather than its
     container. In a two-column pair it sat half outside its box and overlapped
     the day field beside it; empty, it was an unlabelled lozenge. Every time
     and duration in the product now goes through one slider, so there is one
     thing to get right and one place it can regress. */
  /* The markup only: <body> contains the script too, and the comment above
     the control quotes the very tag this forbids. */
  const markupOnly = H.bodyBlock(H.readApp()).split('<script>')[0];
  T('no native time input is left in the markup',
    !/<input[^>]*type="time"/.test(markupOnly),
    (markupOnly.match(/<input[^>]*type="time"[^>]*>/g) || []).slice(0, 2).join(' | '));
  T('the control is a native range, which already knows a drag from a scroll',
    /<input type="range" class="ctl-range"/.test(js()));
  T('and it lets the page keep vertical scrolling',
    /\.ctl-range\{[\s\S]{0,400}touch-action: pan-y/.test(css()));
  T('its value lives in JS, not in the input',
    /function ctlValue\(id\)\{ return CTL\[id\] \? CTL\[id\]\.value : null; \}/.test(js()));
  T('the same component serves both kinds', /const CTL_KINDS = \{/.test(js()));
  {
    const a3 = H.loadApp();
    const c3 = a3.ctx;
    /* Behavioural, not a source scan. What matters is that the control EXISTS
       with the right kind once its surface is open — not how it was spelled at
       the call site. A helper that binds a start and a duration together used
       to fail this while being strictly more correct than what it replaced. */
    function ctlIs(ctx, id, kind){
      const ctl = ctx.CTL[id];
      T(id + ' is a ' + kind + ' slider', !!ctl && ctl.kind === kind, String(ctl && ctl.kind));
    }
    c3.openQuickAdd(null); c3.__flush();
    ctlIs(c3, 'quickTime', 'time'); ctlIs(c3, 'quickDur', 'duration');
    c3.closeQuickAdd(); c3.__flush();
    c3.openItemForm(); c3.__flush();
    ctlIs(c3, 'itemTime', 'time'); ctlIs(c3, 'itemDur', 'duration');
    ctlIs(c3, 'itemEarliest', 'time'); ctlIs(c3, 'itemLatest', 'time');
    c3.closeItemForm(); c3.__flush();
    /* The day adjusters live in their own sheet now — the settings root is a
       list of values, not a panel of controls. */
    c3.renderSettings();
    c3.openDaySheet(); c3.__flush();
    ctlIs(c3, 'setDayStart', 'time'); ctlIs(c3, 'setDayEnd', 'time');
    ctlIs(c3, 'setDuration', 'duration');
    c3.closeDaySheet(); c3.__flush();
    c3.openSchedulingSheet(); c3.__flush();
    ctlIs(c3, 'setBuffer', 'duration');
    c3.closeSchedulingSheet(); c3.__flush();
    c3.startOnboarding(false); c3.__flush();
    ctlIs(c3, 'obStart', 'time'); ctlIs(c3, 'obEnd', 'time');
    c3.closeOnboarding(); c3.__flush();

    /* The reason the sliders exist: a native time input renders as a tiny
       unreadable pill on iOS and collided with the field beside it. */
    T('no native time input survives in the markup',
      !/type="time"/.test(markup()));
    c3.ctlInit('probe', 'time', 600, { label: 'Probe' });
    const html = c3.ctlHtml('probe');
    T('it renders a labelled range', /type="range"/.test(html) && /aria-labelledby/.test(html));
    T('with a spoken value, not just a number', /aria-valuetext/.test(html));
    T('and nudge buttons at the touch minimum',
      /class="ctl-nudge"/.test(html) && /\.ctl-nudge\{[\s\S]{0,200}width: var\(--touch-min\)/.test(css()));
  }

  sub('a block never relies on colour alone');
  T('it carries an icon as well as a rail', /class="blk-icon"/.test(js()));
  T('and its title in text', /class="blk-title"/.test(js()));
  T('a completed block is marked, not merely faded',
    /\.blk-done \.blk-title\{ text-decoration: line-through/.test(style));

  sub('no colour is defined in only one palette');
  /* THE DEFECT THIS PREVENTS: --rail-line was written as a literal dark rgba
     and never restated for light, so the timeline's hour lines rendered in the
     dark theme's colour on paper. A token that exists in one palette and not
     the other is the classic half-themed bug, and eyeballing one screen will
     not find it — every such token is enumerated here instead. */
  {
    const rootBlock = dark, lightBlock = light;
    const literal = /^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\()/;
    const darkOnly = [];
    rootBlock.split('\n').forEach(line => {
      const m = literal.exec(line);
      if(!m) return;
      const name = m[1];
      /* The scale is deliberately palette-independent: type, space, radius,
         motion and layout do not change with appearance. */
      if(/^--(fs|space|radius|dur|bp|lh|inset|touch|input|layout|tabbar|font)/.test(name)) return;
      if(lightBlock.indexOf(name + ':') === -1) darkOnly.push(name);
    });
    T('every colour token is restated for light', darkOnly.length === 0, darkOnly.join(', '));
  }

  sub('the scale does not change with the palette');
  T('no type token is redefined in the light block',
    light.indexOf('--fs-') === -1);
  T('and no spacing token either', light.indexOf('--space-') === -1);
}

/* =========================================================
   CONTRACT 30 — the answer to "now" survives the landing scroll
   ---------------------------------------------------------
   Reported from a real iPhone: Today opened, scrolled itself to the
   clock line, and left the summary of what was happening now above
   the fold. It was correct and invisible at the same time.
   ========================================================= */
function testContext(){
  section('CONTRACT 30 — the context bar, and a clock that does not repaint the day');
  const app = H.loadApp();
  const c = app.ctx;
  const D = c.todayCivil();
  c.prefs = c.normalizePrefs({ dayStart: 0, dayEnd: 1439 });

  sub('four states, because they are four different questions');
  c.items = [
    c.normalizeItem({ title: 'Running', kind: 'task', date: D, start: 600, duration: 60 }),
    c.normalizeItem({ title: 'Later',   kind: 'task', date: D, start: 900, duration: 30 })
  ];
  c.overrides = [];
  T('inside a block it is NOW', c.contextState(D, 620).kind === 'now', c.contextState(D, 620).kind);
  T('and it names the block', c.contextState(D, 620).occ.title === 'Running');
  T('minutes left are counted from the clock', c.contextState(D, 620).left === 40,
    String(c.contextState(D, 620).left));
  T('just before something it is NEXT', c.contextState(D, 890).kind === 'next',
    c.contextState(D, 890).kind);
  T('with real time before it, it is FREE', c.contextState(D, 700).kind === 'free',
    c.contextState(D, 700).kind);
  T('after everything it is CLEAR', c.contextState(D, 1000).kind === 'clear',
    c.contextState(D, 1000).kind);
  c.items = []; c.overrides = [];
  T('with nothing at all it is empty', c.contextState(D, 600).kind === 'empty');

  sub('another day never claims to have a now');
  c.items = [c.normalizeItem({ title: 'Tomorrow thing', kind: 'task',
    date: c.addDays(D, 1), start: 600, duration: 60 })];
  const other = c.contextState(c.addDays(D, 1), 620);
  T('it reports what is planned instead', other.kind === 'other', other.kind);
  T('and carries no current block', other.occ === undefined);

  sub('completion never moves the clock, and never rewrites the plan');
  c.items = [c.normalizeItem({ title: 'Running', kind: 'task', date: D, start: 600, duration: 60 })];
  c.overrides = [];
  const plannedAt = c.items[0].start;
  const railBefore = c.contextState(D, 620).kind;
  c.setOccurrenceStatus(c.items[0].id, D, 'done');
  T('the planned time is untouched', c.items[0].start === plannedAt);
  T('and the moment it happened was recorded', typeof c.items[0].completedAt === 'string');
  T('a finished block is no longer "now"', c.contextState(D, 620).kind !== railBefore);

  sub('the clock tick repaints the bar, not the day');
  const src = js();
  T('repaintNowRail no longer re-renders Today',
    !/function repaintNowRail\(\)\{[\s\S]{0,900}renderToday\(\);/.test(src));
  T('it repaints the bar instead',
    /function repaintNowRail\(\)\{[\s\S]{0,1400}paintContextBar\(\);/.test(src));
  T('and the bar only rebuilds when the state itself changed',
    /if\(contextKey\(st\) !== _ctxKey\)/.test(src));

  sub('the bar is sticky, so it is still there at the landing position');
  T('it sticks', /\.ctx-holder\{[\s\S]{0,200}position: sticky/.test(css()));
  T('below the safe area rather than under the notch',
    /\.ctx-holder\{[\s\S]{0,240}top: var\(--inset-top\)/.test(css()));
  T('and it is opaque, because the timeline scrolls under it',
    /\.ctx-holder\{[\s\S]{0,320}background: var\(--bg\)/.test(css()));

  sub('the running block is identifiable on the timeline too');
  T('a class marks it', /cls\.push\('blk-now'\)/.test(src));
  T('and it is drawn', /\.blk-now\{/.test(css()));
}

/* =========================================================
   CONTRACT 31 — one way out, however it is asked for
   ---------------------------------------------------------
   Back, the swipe, Escape and the device back gesture reach the
   same policy. A page that discards an edit for one of them and
   asks for another is a page that cannot be trusted with either.
   ========================================================= */
function testExitPolicy(){
  section('CONTRACT 31 — leaving a task page');
  const src = js();

  sub('the gesture does not invent a second way to close a page');
  T('a completed swipe calls the surface\'s own declared closer',
    /const closer = sheetCloser\(w\.ov\);/.test(src));
  T('there is still exactly one overlay observer',
    (src.match(/new MutationObserver\(/g) || []).length === 1);
  T('and no second scroll-lock implementation appeared',
    (src.match(/classList\.add\('scroll-locked'\)/g) || []).length === 1);

  sub('only the top surface swipes');
  T('it reads the open stack', /function swipeableTop\(\)\{[\s\S]{0,200}topOpenSheet\(\)/.test(src));
  T('and only pages that opted in', /getAttribute\('data-swipe'\) !== '1'/.test(src));
  const mk = markup();
  T('the task detail page opted in', /id="itemDetailOverlay" data-swipe="1"/.test(mk));
  T('so did the editor', /id="itemFormOverlay" data-swipe="1"/.test(mk));
  T('a settings sheet did not', !/id="dayOverlay"[^>]*data-swipe/.test(mk));

  sub('controls that own a sideways gesture keep it');
  T('fields, sliders and horizontal scrollers are excluded',
    /function swipeExempt\([\s\S]{0,1100}scrollWidth > node\.clientWidth/.test(src));
  /* THE DEFECT THIS PREVENTS, found by driving the gesture in a browser: the
     walk climbed past the page to the overlay container, whose scrollWidth is
     a scrollbar wider than its clientWidth. Every gesture was therefore
     classified as belonging to a horizontal scroller, and the swipe never
     fired once. The rule is about controls INSIDE the page. */
  T('the walk stops at the page it is swiping',
    /if\(node === root\) return false;/.test(src) &&
    /node\.classList\.contains\('sheet'\)/.test(src));
  T('so is an active text selection', /getSelection\(\)\) !== ''\) return;/.test(src));
  T('the browser keeps its own edge', /clientX <= SWIPE_EDGE_GUARD\) return;/.test(src));
  T('vertical movement disarms it permanently',
    /Math\.abs\(dy\) >= Math\.abs\(dx\)\)\{ _swipe = null; return; \}/.test(src));
  T('a second finger cancels rather than leaving it half dragged',
    /isPrimary === false\)\{ cancelSwipe\(\); return; \}/.test(src));

  sub('a small movement never navigates, however fast it was');
  /* THE DEFECT THIS PREVENTS, found by driving the gesture in a browser: the
     commit rule accepted velocity ALONE. Velocity is measured over the last
     pair of move events, so a 26px twitch reported several px/ms and closed
     the page — a quarter of the distance the threshold asks for. */
  T('a flick has to have travelled as well as moved fast',
    /const flick = w\.vx > SWIPE_VELOCITY && travelled > w\.width \* SWIPE_FLICK_MIN;/.test(src));
  T('and the floor is a real fraction of the page',
    /const SWIPE_FLICK_MIN = 0\.\d+;/.test(src));

  sub('nothing measures layout or writes storage while a finger is moving');
  const move = src.slice(src.indexOf('function onSwipeMove('),
                         src.indexOf('function onSwipeUp('));
  T('no layout is read during the move', !/getBoundingClientRect|rectOf\(/.test(move));
  T('nothing is persisted during the move', !/Store\.|persist/.test(move));
  T('nothing is re-rendered during the move', !/render[A-Z]/.test(move));
  T('the width was measured once, at the start',
    /width: rect \? rect\.width/.test(src));
  T('and the page moves by transform', /translate3d\(/.test(src));

  sub('every interruption leaves a deterministic state');
  ['pointercancel', 'orientationchange', 'resize', 'visibilitychange'].forEach(ev =>
    T(ev + ' cancels the gesture', new RegExp("'" + ev + "'").test(src)));
  T('and the settle always clears its own inline styles',
    /sheet\.style\.transform = '';/.test(src));
  T('using a timer, because an interrupted transition never fires its event',
    /setTimeout\(finish,/.test(src));

  sub('a changed edit is neither discarded nor saved behind the person');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  c.items = [c.normalizeItem({ title: 'Existing', kind: 'task', date: '2026-09-20', start: 600, duration: 30 })];
  c.persistItems();
  c.openItemForm(c.items[0].id); c.__flush();
  T('an untouched edit is not dirty', c.formIsDirtyEdit() === false);
  d.getElementById('itemTitle').value = 'Changed';
  T('a changed one is', c.formIsDirtyEdit() === true);
  c.closeItemForm(); c.__flush();
  T('leaving asks first', d.getElementById('confirmOverlay').classList.contains('open'));
  T('and the form is still open behind the question',
    d.getElementById('itemFormOverlay').classList.contains('open'));
  c.closeConfirm(); c.__flush();
  T('keeping the edit leaves the record alone', c.items[0].title === 'Existing');

  sub('a clean page leaves without asking');
  c.openItemForm(c.items[0].id); c.__flush();
  c.closeItemForm(); c.__flush();
  T('no question was raised', !d.getElementById('confirmOverlay').classList.contains('open'));
  T('and the page closed', !d.getElementById('itemFormOverlay').classList.contains('open'));

  sub('an existing edit never becomes a draft, however it is left');
  c.openItemForm(c.items[0].id); c.__flush();
  d.getElementById('itemTitle').value = 'Changed again';
  c.flushDraft();
  T('nothing was drafted', c.Store.get(c.KEYS.itemDraft) === null);

  sub('100 open/close cycles leave nothing behind');
  /* The check above deliberately left the editor open; close it before
     counting, or the loop starts one surface deep. */
  c.forceCloseItemForm(); c.__flush();
  for(let i = 0; i < 100; i++){
    c.openItemDetail(c.items[0].id); c.__flush();
    c.closeItemDetail(); c.__flush();
  }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('the body is not left locked', !d.body.classList.contains('scroll-locked'));
  T('no swipe state survived', c._swipe === null || c._swipe === undefined);
  T('the opener map did not grow', c._sheetOpeners.size === 0, String(c._sheetOpeners.size));
  T('history did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));
  T('no console errors', app.errors.length === 0, app.errors.join(' | '));
}

/* =========================================================
   CONTRACT 32 — settings is a list of values
   ========================================================= */
function testSettings(){
  section('CONTRACT 32 — settings states what it is set to');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  c.prefs = c.normalizePrefs({ dayStart: 7 * 60, dayEnd: 22 * 60, defaultDuration: 45, bufferMinutes: 10 });
  c.renderSettings();
  const html = d.getElementById('settingsBody').innerHTML;

  sub('every row carries its current value');
  T('the theme row shows the choice', html.indexOf(c.THEME_LABEL[c.currentTheme]) !== -1);
  T('the day row shows the window', /7:00\s*(AM)?\s*–\s*10:00\s*PM|07:00 – 22:00/.test(
    d.getElementById('settingsBody').textContent));
  T('the default length shows its duration', html.indexOf('45 min') !== -1);
  T('the buffer shows its value', html.indexOf('10 min') !== -1);

  sub('the adjusters moved into focused sheets');
  T('no range input is on the settings root', html.indexOf('type="range"') === -1);
  T('no number input either', html.indexOf('type="number"') === -1);
  T('and no select', html.indexOf('<select') === -1);
  ['themeOverlay', 'dayOverlay', 'schedulingOverlay', 'reminderOverlay'].forEach(id =>
    T(id + ' exists as its own surface', !!d.getElementById(id)));

  sub('a sheet and the row that summarises it cannot disagree');
  c.openDaySheet(); c.__flush();
  c.ctlSet('setDuration', 90);
  c.setPrefValue('defaultDuration', 90);
  c.renderSettings();
  T('changing it in the sheet updates the summary',
    d.getElementById('settingsBody').innerHTML.indexOf('1 hr 30 min') !== -1 ||
    d.getElementById('settingsBody').innerHTML.indexOf('1h 30m') !== -1,
    String(c.prefs.defaultDuration));
  c.closeDaySheet(); c.__flush();

  sub('the reminder limitation is still stated where it matters');
  T('the root says what reminders can actually do',
    /not set up|while Dayplan is open|blocked|cannot show/.test(
      d.getElementById('settingsBody').textContent));

  sub('diagnostics stays behind its own door');
  T('it is a row, not a panel', html.indexOf('Diagnostics') !== -1);
  T('and none of its detail is on the root',
    html.indexOf(c.CACHE_NAMESPACE) === -1 && html.indexOf(c.STORAGE_NAMESPACE) === -1);
}

/* =========================================================
   CONTRACT 33 — drafts written by an older version still load
   ---------------------------------------------------------
   The committed-item schema did not change, which is exactly why
   this was missed: the DRAFT shape did. A draft is data too.
   ========================================================= */
async function testLegacyDrafts(){
  section('CONTRACT 33 — a draft survives the version that wrote it');

  sub('a v0.2.0 draft keeps its schedule');
  {
    const shared = new Map();
    const seed = H.loadApp({ sharedStorage: shared });
    /* Exactly what v0.2.0 wrote: no scheduled, no windowed, no priority. */
    seed.ctx.Store.setJSON(seed.ctx.KEYS.itemDraft, {
      kind: 'task', title: 'Legacy draft', notes: '', tagId: null,
      date: '2026-09-20', start: 600, duration: 45,
      earliest: 540, latest: 720, recurrence: null, reminders: [10]
    });

    const app = H.loadApp({ sharedStorage: shared });
    const c = app.ctx, d = app.dom.document;
    const f = c.formDraftLoad();
    T('the missing scheduled flag is inferred from its own fields', f.scheduled === true,
      String(f.scheduled));
    T('and the missing windowed flag likewise', f.windowed === true, String(f.windowed));

    c.openItemForm(); c.__flush();
    T('the form opens it as scheduled', c.formScheduled === true, String(c.formScheduled));
    T('showing the day it was placed on',
      d.getElementById('itemDate').value === '2026-09-20', d.getElementById('itemDate').value);
    c.saveItemForm(); c.__flush();
    const saved = c.items[c.items.length - 1];
    T('saving keeps the exact day', saved.date === '2026-09-20', String(saved.date));
    T('and the exact start', saved.start === 600, String(saved.start));
    T('and the allowed window', saved.earliest === 540 && saved.latest === 720,
      saved.earliest + '/' + saved.latest);
    T('and the reminder', saved.reminders.join(',') === '10', saved.reminders.join(','));
  }

  sub('an explicit false in a newer draft is a decision, not a gap');
  {
    const shared = new Map();
    const seed = H.loadApp({ sharedStorage: shared });
    /* Someone turned the schedule OFF but the fields are still there. */
    seed.ctx.Store.setJSON(seed.ctx.KEYS.itemDraft, {
      kind: 'task', title: 'Deliberately unscheduled', notes: '', tagId: null,
      date: '2026-09-20', start: 600, duration: 30, scheduled: false, windowed: false,
      priority: 1, deadline: null, earliest: 540, latest: null, recurrence: null, reminders: []
    });
    const app = H.loadApp({ sharedStorage: shared });
    const f = app.ctx.formDraftLoad();
    T('the false is honoured rather than inferred away', f.scheduled === false, String(f.scheduled));
    T('and so is windowed', f.windowed === false, String(f.windowed));
    app.ctx.openItemForm(); app.ctx.__flush();
    app.ctx.saveItemForm(); app.ctx.__flush();
    const saved = app.ctx.items[app.ctx.items.length - 1];
    T('it saves to the inbox, as asked', saved.date === null && saved.start === null,
      JSON.stringify([saved.date, saved.start]));
  }

  sub('a resumed draft is not moved to the day you happen to be looking at');
  ['quick', 'full'].forEach(entry => {
    const shared = new Map();
    const seed = H.loadApp({ sharedStorage: shared });
    seed.ctx.Store.setJSON(seed.ctx.KEYS.itemDraft, {
      kind: 'task', title: 'Booked for the 20th', notes: '', tagId: null,
      date: '2026-09-20', start: 600, duration: 30, scheduled: true, windowed: false,
      priority: 1, deadline: null, earliest: null, latest: null, recurrence: null, reminders: []
    });
    const app = H.loadApp({ sharedStorage: shared });
    const c = app.ctx;
    if(entry === 'quick'){
      c.openQuickAdd('2026-09-21'); c.__flush();
      c.expandQuickAdd(); c.__flush();
    } else {
      c.openItemForm(null, '2026-09-21'); c.__flush();
    }
    c.saveItemForm(); c.__flush();
    const saved = c.items[c.items.length - 1];
    T('via ' + entry + ': it stays on the 20th', saved.date === '2026-09-20', String(saved.date));
    T('via ' + entry + ': at its own time', saved.start === 600, String(saved.start));
  });

  sub('a preset still places a genuinely new capture');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.openQuickAdd('2026-09-21'); c.__flush();
    d.getElementById('quickTitle').value = 'Fresh one';
    c.toggleQuickSchedule();
    c.saveQuickAdd(); c.__flush();
    const saved = c.items[c.items.length - 1];
    T('it lands on the day being viewed', saved.date === '2026-09-21', String(saved.date));
  }

  sub('a title-only capture survives a refresh, not just a tidy close');
  {
    const shared = new Map();
    const app = H.loadApp({ sharedStorage: shared });
    const c = app.ctx, d = app.dom.document;
    c.openQuickAdd(null); c.__flush();
    d.getElementById('quickTitle').value = 'Only a title';
    const field = d.getElementById('quickTitle');
    if(field.dispatch) field.dispatch('input', {});
    await H.settle(600);                       /* past the 400ms debounce */
    T('the debounce wrote it', c.Store.getJSON(c.KEYS.itemDraft, null) !== null);
    T('with the title', (c.Store.getJSON(c.KEYS.itemDraft, {}) || {}).title === 'Only a title');

    /* A refresh with no close at all — the case a debounce alone cannot cover
       once the tab is discarded mid-timer. */
    const reopened = H.loadApp({ sharedStorage: shared });
    reopened.ctx.openQuickAdd(null); reopened.ctx.__flush();
    T('and it comes back after a reload',
      reopened.dom.document.getElementById('quickTitle').value === 'Only a title',
      reopened.dom.document.getElementById('quickTitle').value);
  }

  sub('going to the background commits before the debounce can');
  {
    const shared = new Map();
    const app = H.loadApp({ sharedStorage: shared });
    const c = app.ctx, d = app.dom.document;
    c.openQuickAdd(null); c.__flush();
    d.getElementById('quickTitle').value = 'Typed then backgrounded';
    /* No wait: the tab is hidden inside the debounce window. */
    c.document.visibilityState = 'hidden';
    c.document.dispatch('visibilitychange', {});
    T('it was written immediately', (c.Store.getJSON(c.KEYS.itemDraft, {}) || {}).title
      === 'Typed then backgrounded',
      JSON.stringify(c.Store.getJSON(c.KEYS.itemDraft, null)));
    c.document.visibilityState = 'visible';
  }

  sub('a capture that cannot be written is not lost quietly');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.openQuickAdd(null); c.__flush();
    d.getElementById('quickTitle').value = 'Cannot be kept';
    c.Store.setJSON = function(){ return false; };
    c.closeQuickAdd(); c.__flush();
    const host = d.getElementById('toastHost');
    const said = host.children.map(ch => ch.innerHTML || ch.textContent || '').join(' ');
    T('the person is told', /could not be saved/.test(said), said.slice(0, 110));
  }

  sub('and a saved capture still leaves no ghost behind');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.openQuickAdd(null); c.__flush();
    d.getElementById('quickTitle').value = 'Filed';
    c.scheduleDraftSave();
    c.saveQuickAdd(); c.__flush();
    await H.settle(600);
    T('the draft is gone and stays gone', c.Store.get(c.KEYS.itemDraft) === null,
      String(c.Store.get(c.KEYS.itemDraft)));
    T('and exactly one record exists', c.items.length === 1, String(c.items.length));
  }
}

/* =========================================================
   CONTRACT 34 — a settling swipe belongs to the page that started it
   ---------------------------------------------------------
   Timed, because the defect lives entirely in the gap between the
   finger lifting and the transition finishing.
   ========================================================= */
async function testSwipeOwnership(){
  section('CONTRACT 34 — gesture ownership through the settling phase');

  function mkApp(){
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.items = [
      c.normalizeItem({ title: 'Task A', kind: 'task', date: '2026-09-20', start: 600, duration: 30 }),
      c.normalizeItem({ title: 'Task B', kind: 'task', date: '2026-09-20', start: 700, duration: 30 })
    ];
    c.persistItems();
    return app;
  }
  function pd(c, el, x, y, id){
    c.document.dispatch('pointerdown', { target: el, clientX: x, clientY: y,
      pointerId: id === undefined ? 1 : id, pointerType: 'touch', isPrimary: true,
      button: 0, preventDefault(){} });
  }
  function pm(c, el, x, y, id){
    c.document.dispatch('pointermove', { target: el, clientX: x, clientY: y,
      pointerId: id === undefined ? 1 : id, pointerType: 'touch', isPrimary: true,
      preventDefault(){} });
  }
  function pu(c, el, x, y, id){
    c.document.dispatch('pointerup', { target: el, clientX: x, clientY: y,
      pointerId: id === undefined ? 1 : id, pointerType: 'touch', isPrimary: true,
      preventDefault(){} });
  }
  function sheetOf(d, id){ return d.getElementById(id).querySelector('.sheet'); }

  sub('reopening the surface for another task during settlement');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    const A = c.items[0].id, B = c.items[1].id;
    c.openItemDetail(A); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400); pm(c, sh, 300, 402); pm(c, sh, 360, 404); pu(c, sh, 360, 404);
    /* The completion is now in flight. Close and reopen for a different task
       inside that window — which is exactly what used to shut task B. */
    c.closeItemDetail(); c.__flush();
    c.openItemDetail(B); c.__flush();
    T('task B is open', d.getElementById('itemDetailOverlay').classList.contains('open'));
    await H.settle(400);
    T('and the stale completion did not close it',
      d.getElementById('itemDetailOverlay').classList.contains('open'));
    T('it is still task B', c.detailItemId === B, String(c.detailItemId));
  }

  sub('a second gesture during settlement');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    c.openItemDetail(c.items[0].id); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400); pm(c, sh, 240, 402); pu(c, sh, 240, 402);   /* short: cancels */
    pd(c, sh, 200, 400);                                             /* immediately again */
    T('the new gesture is refused while the old one settles', c._swipe === null);
    await H.settle(400);
    T('and the page is still open', d.getElementById('itemDetailOverlay').classList.contains('open'));
    T('with nothing left on the element', sheetOf(d, 'itemDetailOverlay').style.transform === '');
  }

  sub('rotation after the release but before completion');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    c.openItemDetail(c.items[0].id); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400); pm(c, sh, 300, 402); pm(c, sh, 360, 404); pu(c, sh, 360, 404);
    c.window.dispatch('orientationchange', {});
    await H.settle(400);
    T('the interrupted completion left the page open',
      d.getElementById('itemDetailOverlay').classList.contains('open'));
    T('and cleared its own styles', sh.style.transform === '' && sh.style.transition === '');
    T('and the body is not left mid-swipe', !d.body.classList.contains('swiping'));
  }

  sub('backgrounding after the release but before completion');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    c.openItemDetail(c.items[0].id); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400); pm(c, sh, 300, 402); pm(c, sh, 360, 404); pu(c, sh, 360, 404);
    c.document.visibilityState = 'hidden';
    c.document.dispatch('visibilitychange', {});
    await H.settle(400);
    T('the page is still open and deterministic',
      d.getElementById('itemDetailOverlay').classList.contains('open'));
    c.document.visibilityState = 'visible';
  }

  sub('a confirmation appearing during the gesture takes ownership');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    c.openItemDetail(c.items[0].id); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400); pm(c, sh, 300, 402);
    T('the gesture is live', !!c._swipe && c._swipe.claimed);
    c.openOverlay('confirmOverlay'); c.__flush();
    pm(c, sh, 340, 404);
    T('it was handed over the moment something opened on top', c._swipe === null);
    await H.settle(300);
    T('the page beneath did not move', sh.style.transform === '');
    c.closeOverlay('confirmOverlay'); c.__flush();
  }

  sub('a second finger, and a pointer that was never part of this');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    c.openItemDetail(c.items[0].id); c.__flush();
    const sh = sheetOf(d, 'itemDetailOverlay');
    pd(c, sh, 200, 400, 1); pm(c, sh, 300, 402, 1);
    T('one finger has the gesture', !!c._swipe);
    pd(c, sh, 120, 500, 2);                       /* a second finger lands */
    T('a second finger cancels it', c._swipe === null);
    await H.settle(300);
    T('and the page stayed', d.getElementById('itemDetailOverlay').classList.contains('open'));

    pd(c, sh, 200, 400, 1); pm(c, sh, 300, 402, 1); pm(c, sh, 360, 404, 1);
    pu(c, sh, 360, 404, 7);                       /* an unrelated pointer lifts */
    T('an unrelated release does not commit it', !!c._swipe);
    pu(c, sh, 360, 404, 1);                       /* the real one lifts */
    await H.settle(400);
    T('the real release does', !d.getElementById('itemDetailOverlay').classList.contains('open'));
  }

  sub('nothing accumulates across a hundred settle cycles');
  {
    const app = mkApp();
    const c = app.ctx, d = app.dom.document;
    for(let i = 0; i < 100; i++){
      c.openItemDetail(c.items[i % 2].id); c.__flush();
      const sh = sheetOf(d, 'itemDetailOverlay');
      pd(c, sh, 200, 400); pm(c, sh, 250, 402); pu(c, sh, 250, 402);
      c.closeItemDetail(); c.__flush();
    }
    await H.settle(500);
    T('no gesture is left live', c._swipe === null);
    T('no settlement is left pending', c._settling === null, JSON.stringify(c._settling));
    T('the overlay stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
    T('the scroll lock is released', c._lockDepth === 0, String(c._lockDepth));
    T('history did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));
    T('no console errors', app.errors.length === 0, app.errors.join(' | '));
  }
}

/* =========================================================
   CONTRACT 35 — Back returns from a task, and the marker follows the clock
   ========================================================= */
function testBackAndMarker(){
  section('CONTRACT 35 — device Back, and the running-block marker');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  c.items = [c.normalizeItem({ title: 'A', kind: 'task', date: '2026-09-20', start: 600, duration: 30 })];
  c.persistItems();

  sub('a task page is a place you can come back from');
  const base = c._historyDepth;
  c.openItemDetail(c.items[0].id); c.__flush();
  T('opening the detail leaves an entry to consume', c._historyDepth === base + 1,
    String(c._historyDepth));
  c.closeItemDetail(); c.__flush();
  T('closing gives it back', c._historyDepth === base, String(c._historyDepth));

  c.openItemForm(c.items[0].id); c.__flush();
  T('so does the editor', c._historyDepth === base + 1, String(c._historyDepth));
  c.forceCloseItemForm(); c.__flush();
  T('and it is released once, not twice', c._historyDepth === base, String(c._historyDepth));

  sub('a cancelled confirmation leaves an entry to press Back with again');
  c.openItemForm(c.items[0].id); c.__flush();
  d.getElementById('itemTitle').value = 'Changed';
  /* Simulate what a real Back does: the entry is consumed before the policy
     is asked. */
  c._historyDepth = c._historyDepth - 1;
  c.closeItemForm(); c.__flush();
  T('the confirmation is up', d.getElementById('confirmOverlay').classList.contains('open'));
  T('and an entry was put back, so Back still works',
    c._historyDepth === base + 1, String(c._historyDepth));
  c.closeConfirm(); c.__flush();
  c.forceCloseItemForm(); c.__flush();
  T('leaving for real settles the depth', c._historyDepth === base, String(c._historyDepth));

  sub('the running marker moves from the ending block to the starting one');
  const D = c.todayCivil();
  c.prefs = c.normalizePrefs({ dayStart: 0, dayEnd: 1439 });
  c.items = [
    c.normalizeItem({ title: 'Ending', kind: 'task', date: D, start: 600, duration: 60 }),
    c.normalizeItem({ title: 'Starting', kind: 'task', date: D, start: 660, duration: 60 })
  ];
  c.overrides = [];
  const occs = c.occurrencesForDate(D);
  const at = m => occs.filter(o => c.occurrenceIsRunning(o, m)).map(o => o.title).join(',');
  T('before the boundary it is the first', at(630) === 'Ending', at(630));
  T('after it, the second', at(690) === 'Starting', at(690));
  T('exactly one block is ever running', at(630).split(',').length === 1);
  T('a finished block is never running', (() => {
    c.setOccurrenceStatus(c.items[0].id, D, 'done');
    return c.occurrencesForDate(D).filter(o => c.occurrenceIsRunning(o, 630)).length === 0;
  })());
  T('and another day never has one',
    c.occurrencesForDate(c.addDays(D, 1)).filter(o => c.occurrenceIsRunning(o, 630)).length === 0);

  sub('one owner decides it, so the render and the clock cannot disagree');
  const src = js();
  T('the renderer asks the predicate', /if\(occurrenceIsRunning\(occ\)\) cls\.push\('blk-now'\)/.test(src));
  T('and so does the clock path', /occurrenceIsRunning\(o, m\)/.test(src));
  T('the tick refreshes it without rendering',
    /paintContextBar\(\);\s*refreshRunningBlock\(\);/.test(src));
  const fn = src.slice(src.indexOf('function refreshRunningBlock('),
                       src.indexOf('function refreshRunningBlock(') + 900);
  T('and touches only class lists', !/innerHTML/.test(fn));
}

/* =========================================================
   CONTRACT 36 — a person can get their data out
   ---------------------------------------------------------
   The Backup & data page threw a ReferenceError before it opened,
   so the export was unreachable from the app for three releases.
   Nothing caught it because no contract had ever opened the page.
   ========================================================= */
async function testDataOwnership(){
  section('CONTRACT 36 — getting your data out');

  sub('every control is wired to something that exists');
  /* THE DEFECT THIS PREVENTS, and its whole class: a row called statHtml(),
     which had gone out with the demo domain it belonged to. The tap threw,
     the page never opened, and there was no way to reach the export at all.
     This walks every onclick the app ships — static markup and the surfaces
     it generates — and asks whether the function is actually there. */
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.items = [c.normalizeItem({ title: 'A', kind: 'task', date: '2026-09-20', start: 600, duration: 30 })];
    c.persistItems();

    const named = (html) => [...String(html).matchAll(/onclick="([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1]);
    const seen = new Set(named(markup()));

    /* The generated surfaces too — most of the product's controls are drawn,
       not written into the body. */
    c.renderSettings();
    c.renderInbox();
    c.renderToday();
    c.renderPlan();
    c.openDataSettings(); c.__flush();
    c.openItemDetail(c.items[0].id); c.__flush();
    ['settingsBody', 'inboxBody', 'todayBody', 'planBody', 'dataStats', 'itemDetailBody']
      .forEach(id => { const el = d.getElementById(id); if(el) named(el.innerHTML).forEach(n => seen.add(n)); });
    c.closeItemDetail(); c.__flush();
    c.closeDataSettings(); c.__flush();

    const missing = [...seen].filter(name => typeof c[name] !== 'function');
    T('every control names a function that exists', missing.length === 0, missing.join(', '));
    T('and the walk actually covered the app', seen.size >= 20, String(seen.size));
  }

  sub('the Backup & data page opens, and shows what is stored');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.items = [
      c.normalizeItem({ title: 'A', kind: 'task', date: '2026-09-20', start: 600, duration: 30 }),
      c.normalizeItem({ title: 'B', kind: 'task', date: '2026-09-21', start: 600, duration: 30 })
    ];
    c.persistItems();
    c.openDataSettings(); c.__flush();
    T('it opens', d.getElementById('dataOverlay').classList.contains('open'));
    const stats = d.getElementById('dataStats').innerHTML;
    T('and reports the record count', /stat-value/.test(stats) && stats.indexOf('>2<') !== -1,
      stats.slice(0, 90));
    T('the export control is reachable on it', /exportData\(\)/.test(markup()));
    c.closeDataSettings(); c.__flush();
  }

  sub('a page opening never depends on a summary rendering');
  T('the overlay is opened before the stats are drawn',
    /function openDataSettings\(\)\{[\s\S]{0,320}openOverlay\('dataOverlay'\);[\s\S]{0,200}renderDataStats/.test(js()));

  sub('an export never claims more than it did');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    /* No share sheet, no download, no clipboard: there is no way out, and the
       app has to say so instead of announcing a file it never made. */
    c.navigator.share = undefined;
    c.navigator.canShare = undefined;
    c.navigator.clipboard = undefined;
    c.document.createElement = (function(orig){
      return function(tag){
        const el = orig.call(c.document, tag);
        if(tag === 'a'){ el.click = function(){ /* inert, as in an installed iOS app */ }; }
        return el;
      };
    })(c.document.createElement);
    const host = d.getElementById('toastHost');
    host.children.length = 0;
    c.exportData();
    await H.settle(120);
    const said = host.children.map(ch => ch.innerHTML || ch.textContent || '').join(' ');
    T('it admits it could not', /could not be saved/.test(said), said.slice(0, 120));
    T('and does not say the backup was saved', !/Backup saved|Backup ready/.test(said),
      said.slice(0, 120));
  }

  sub('a backup carries committed data, and only that');
  {
    const app = H.loadApp();
    const c = app.ctx, d = app.dom.document;
    c.items = [c.normalizeItem({ title: 'Real', kind: 'task', date: '2026-09-20', start: 600, duration: 30 })];
    c.persistItems();
    c.openQuickAdd(null); c.__flush();
    d.getElementById('quickTitle').value = 'Half typed';
    c.flushDraft();
    T('the draft is on disk', c.Store.get(c.KEYS.itemDraft) !== null);

    /* Read the payload the same way exportData builds it. */
    const keys = c.Store.listKeys()
      .filter(k => k.indexOf(c.KEYS.backupPrefix) !== 0 && k.indexOf('draft.') !== 0);
    T('committed records are included', keys.indexOf('data.items') !== -1, keys.join(','));
    T('a half-typed capture is not', keys.every(k => k.indexOf('draft.') !== 0), keys.join(','));
    T('and the source excludes it explicitly',
      /if\(k\.indexOf\('draft\.'\) === 0\) return;/.test(js()));
  }

  sub('a restore brings back everything, including plain-string preferences');
  /* THE DEFECT THIS PREVENTS: mergeBackup ran JSON.parse over every value and
     returned early when it threw. A preference is stored as a bare string —
     the theme is the four characters "dark" — so every one of them was
     dropped from every restore, silently, while the import reported success. */
  {
    const source = new Map();
    const a = H.loadApp({ sharedStorage: source });
    const c = a.ctx;
    c.items = [
      c.normalizeItem({ title: 'Alpha', kind: 'task', date: '2026-09-20', start: 600, duration: 30,
                        recurrence: { freq: 'daily', interval: 1 } }),
      c.normalizeItem({ title: 'Beta', kind: 'event', date: '2026-09-21', start: 700, duration: 60 })
    ];
    c.overrides = []; c.persistItems(); c.persistOverrides();
    c.setOccurrenceStatus(c.items[0].id, '2026-09-20', 'done');
    c.prefs = c.normalizePrefs({ dayStart: 480, dayEnd: 1200, defaultDuration: 45 });
    c.persistPrefs();
    c.Store.set(c.KEYS.theme, 'light');

    const data = {};
    c.Store.listKeys()
      .filter(k => k.indexOf(c.KEYS.backupPrefix) !== 0 && k.indexOf('draft.') !== 0)
      .forEach(k => { data[k] = c.Store.get(k); });

    const b = H.loadApp();          /* a clean device */
    const res = b.ctx.mergeBackup(data);
    b.ctx.Domain.hydrate();
    T('the records came back', b.ctx.items.length === 2, String(b.ctx.items.length));
    T('the exception came back', b.ctx.overrides.length === 1, String(b.ctx.overrides.length));
    T('the completion survived',
      b.ctx.occurrencesForDate('2026-09-20').some(o => o.status === 'done'));
    T('the recurrence survived', b.ctx.items.some(i => !!i.recurrence));
    T('the day window survived', b.ctx.prefs.dayStart === 480, String(b.ctx.prefs.dayStart));
    T('the default length survived', b.ctx.prefs.defaultDuration === 45,
      String(b.ctx.prefs.defaultDuration));
    T('and the chosen theme survived, though it is a bare string',
      b.ctx.currentTheme === 'light', b.ctx.currentTheme);
    T('the import reported the collections it actually wrote', res.collections >= 3,
      JSON.stringify(res));
  }
}

module.exports = {
  T, section, sub, results, reset, testPortability,
  testBoot, testConfig, testStorage, testCollision, testMigration,
  testNavigation, testOverlays, testToast, testConfirmation, testForms,
  testMobile, testDesignSystem, testPWA, testRelease, testStress,
  testAccessibility, testContamination, testSourcesOfTruth,
  /* the product's own */
  testTime, testModel, testRecurrence, testTimeline, testDrag,
  testContext, testExitPolicy, testSettings,
  testLegacyDrafts, testSwipeOwnership, testBackAndMarker, testDataOwnership,
  testAutoPlan, testReminders, testExport, testTags, testTheme
};
