/* =========================================================
   TEST HARNESS
   ---------------------------------------------------------
   Loads the application into an isolated Node context with a DOM
   stub, so every system can be exercised without a browser, a
   bundler, or a single dependency.

   HOW IT WORKS
   index.html is read as TEXT. The largest <script> block is
   extracted and evaluated in a Node `vm` against an in-memory
   store. Nothing is written to disk and no real browser storage
   is touched.

   WHY THE LARGEST SCRIPT BLOCK
   The app is one file with one main script. That is what makes a
   zero-build app fully testable — but it also means code placed in
   a SECOND script block, or in a linked .js file, is invisible to
   every contract here and the suite will still pass. A contract
   asserts there is only one substantial block; keep it that way.

   ISOLATION GUARANTEE
   The harness never reads or writes real user data.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_PATH = path.join(ROOT, 'index.html');
const SW_PATH = path.join(ROOT, 'sw.js');
const MANIFEST_PATH = path.join(ROOT, 'manifest.webmanifest');
const PKG_PATH = path.join(ROOT, 'package.json');

function readApp(){ return fs.readFileSync(APP_PATH, 'utf8'); }
function readSW(){ return fs.readFileSync(SW_PATH, 'utf8'); }
function readManifest(){ return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
function readPkg(){ return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')); }

/* Every <script> block, and the one the app actually lives in. */
function scriptBlocks(src){
  return [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}
function mainScript(src){
  const blocks = scriptBlocks(src);
  if(!blocks.length) throw new Error('no <script> block found in index.html');
  return blocks.reduce((a, b) => (b.length > a.length ? b : a));
}
function styleBlock(src){
  const a = src.indexOf('<style>'), b = src.indexOf('</style>');
  if(a === -1 || b === -1) throw new Error('no <style> block found in index.html');
  return src.slice(a + 7, b);
}
function bodyBlock(src){
  const a = src.indexOf('<body>'), b = src.lastIndexOf('</body>');
  if(a === -1 || b === -1) throw new Error('no <body> found in index.html');
  return src.slice(a + 6, b);
}

/* ---------- deterministic PRNG (same seed => same run) ---------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =========================================================
   IN-MEMORY localStorage
   ---------------------------------------------------------
   A real implementation, not a no-op: the storage-namespace
   contracts depend on being able to inspect exactly which keys
   were written, and on two app ids sharing one store the way two
   deployments share one origin.
   ========================================================= */
function makeLocalStorage(shared, failWrites){
  const map = shared || new Map();
  return {
    _map: map,
    get length(){ return map.size; },
    key(i){ return [...map.keys()][i] ?? null; },
    getItem(k){ return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v){
      if(failWrites) throw new Error('QuotaExceededError');
      map.set(String(k), String(v));
    },
    removeItem(k){ map.delete(String(k)); },
    clear(){ map.clear(); }
  };
}

/* =========================================================
   DOM STUB
   ---------------------------------------------------------
   Enough of a document for the overlay engine, the renderers and
   the boot sequence to run for real. Elements declared in the
   shipped markup are pre-registered with their real ids and
   classes, so `querySelectorAll('.overlay.open')` reflects genuine
   state rather than a fixture someone hand-maintained.
   ========================================================= */
function buildDom(src){
  const byId = new Map();
  const all = [];

  function mkEl(tag, id){
    const classes = new Set();
    const attrs = new Map();
    let _text = '', _html = '';
    const el = {
      tagName: (tag || 'div').toUpperCase(),
      id: id || '',
      style: {},
      dataset: {},
      value: '',
      checked: false,
      disabled: false,
      files: [],
      children: [],
      parentNode: null,
      offsetParent: {},          // "visible" — focusables filter on this
      classList: {
        add(...c){ c.forEach(x => classes.add(x)); },
        remove(...c){ c.forEach(x => classes.delete(x)); },
        toggle(c, f){
          if(f === undefined){ classes.has(c) ? classes.delete(c) : classes.add(c); }
          else { f ? classes.add(c) : classes.delete(c); }
        },
        contains(c){ return classes.has(c); }
      },
      _classes: classes,
      setAttribute(k, v){ attrs.set(k, String(v)); },
      getAttribute(k){ return attrs.has(k) ? attrs.get(k) : null; },
      removeAttribute(k){ attrs.delete(k); },
      hasAttribute(k){ return attrs.has(k); },
      _attrs: attrs,
      appendChild(c){ this.children.push(c); c.parentNode = this; return c; },
      insertAdjacentHTML(){},
      insertAdjacentElement(){},
      remove(){
        if(this.parentNode){
          const i = this.parentNode.children.indexOf(this);
          if(i > -1) this.parentNode.children.splice(i, 1);
        }
        this.parentNode = null;
      },
      removeChild(c){ const i = this.children.indexOf(c); if(i > -1) this.children.splice(i, 1); },
      focus(){ dom.document.activeElement = this; },
      blur(){},
      click(){ const h = attrs.get('onclick'); if(h) try{ evalOnclick(h); }catch(e){} },
      addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); },
      removeEventListener(type, fn){
        const l = this._listeners[type]; if(!l) return;
        const i = l.indexOf(fn); if(i > -1) l.splice(i, 1);
      },
      _listeners: {},
      dispatch(type, ev){ (this._listeners[type] || []).forEach(f => { try{ f(ev || {}); }catch(e){} }); },
      querySelector(sel){ return query(sel, this)[0] || null; },
      querySelectorAll(sel){ return query(sel, this); },
      closest(){ return null; },
      scrollIntoView(){},
      get firstElementChild(){ return this.children[0] || null; },
      get childElementCount(){ return this.children.length; }
    };
    /* className is an accessor on a real element, not a plain string: code
       that assigns it must actually change the class list, or a later
       classList query silently disagrees with what was set. */
    Object.defineProperty(el, 'className', {
      enumerable: true, configurable: true,
      get(){ return [...classes].join(' '); },
      set(v){
        classes.clear();
        String(v == null ? '' : v).split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    });
    /* textContent and innerHTML linked the way a real element links them.
       escapeHtml() works by assigning textContent to a detached div and
       reading innerHTML back; with plain string properties that returns ''
       and every escaped value in the app renders empty under test. */
    Object.defineProperty(el, 'textContent', {
      enumerable: true, configurable: true,
      get(){ return _text; },
      set(v){
        _text = v == null ? '' : String(v);
        _html = _text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
    });
    Object.defineProperty(el, 'innerHTML', {
      enumerable: true, configurable: true,
      get(){ return _html; },
      set(v){
        _html = v == null ? '' : String(v);
        _text = _html.replace(/<[^>]*>/g, '');
        /* Children rendered by innerHTML are not modelled; the tests that
           care about generated markup assert on the HTML string itself. */
        this.children = [];
      }
    });
    all.push(el);
    return el;
  }

  let evalOnclick = () => {};

  /* Supports the selector shapes the app actually uses: `.a`, `.a.b`,
     `#id .a`, `tag`, and comma lists. Anything else returns []. */
  function query(sel, scope){
    const parts = String(sel).split(',').map(s => s.trim()).filter(Boolean);
    const out = [];
    parts.forEach(p => {
      let pool = all;
      const spaced = p.split(/\s+/);
      if(spaced.length === 2 && spaced[0].startsWith('#')){
        const parent = byId.get(spaced[0].slice(1));
        pool = parent ? all.filter(e => e._scope === parent.id) : [];
        p = spaced[1];
      } else if(spaced.length > 1){
        p = spaced[spaced.length - 1];
      }
      if(scope && scope !== dom.document && scope.id){
        pool = pool.filter(e => e === scope || e._scope === scope.id);
      }
      pool.forEach(e => {
        if(matches(e, p) && out.indexOf(e) === -1) out.push(e);
      });
    });
    return out;
  }
  function matches(el, sel){
    if(sel.startsWith('#')) return el.id === sel.slice(1);
    if(sel.startsWith('.')){
      return sel.split('.').filter(Boolean).every(c => el._classes.has(c));
    }
    if(/^[a-z]+$/i.test(sel)) return el.tagName === sel.toUpperCase();
    if(sel.includes('[')) return false;
    return false;
  }

  const body = mkEl('body', 'body');
  const html = mkEl('html', 'documentElement');

  const dom = {
    mkEl,
    byId,
    all,
    setOnclickEvaluator(fn){ evalOnclick = fn; },
    document: {
      body,
      documentElement: html,
      activeElement: body,
      visibilityState: 'visible',
      getElementById(id){
        if(byId.has(id)) return byId.get(id);
        return null;
      },
      createElement(tag){ return mkEl(tag, ''); },
      querySelector(sel){ return query(sel)[0] || null; },
      querySelectorAll(sel){ return query(sel); },
      addEventListener(type, fn){ (this._listeners[type] = this._listeners[type] || []).push(fn); },
      removeEventListener(){},
      _listeners: {},
      dispatch(type, ev){ (this._listeners[type] || []).forEach(f => { try{ f(ev || {}); }catch(e){} }); },
      contains(){ return true; }
    }
  };

  /* Register every element the shipped markup declares with an id, carrying
     its real class list and its owning overlay/view for scoped queries. */
  const bodyHtml = bodyBlock(src);
  const tagRe = /<(div|main|nav|section|header|footer|form|label|button|input|textarea|select|span|p|ul|ol|li|a|h1|h2|h3|h4)\b([^>]*)>/g;
  let m;

  /* Two passes: ids first (so scoping can resolve), then scope assignment by
     nearest enclosing element that has an id. */
  const found = [];
  while((m = tagRe.exec(bodyHtml)) !== null){
    const tag = m[1], attrText = m[2] || '';
    const idM = attrText.match(/\bid="([^"]+)"/);
    const clsM = attrText.match(/\bclass="([^"]+)"/);
    const onM = attrText.match(/\bonclick="([^"]+)"/);
    const roleM = attrText.match(/\brole="([^"]+)"/);
    found.push({ tag, id: idM ? idM[1] : null, cls: clsM ? clsM[1] : '',
                 onclick: onM ? onM[1] : null, role: roleM ? roleM[1] : null, at: m.index });
  }
  /* Nearest preceding element with an id and a container class becomes scope. */
  const containers = found.filter(f => f.id && /overlay|view|list|segmented|tabbar|host|panel|grid/.test(f.cls + ' ' + f.id));
  found.forEach(f => {
    if(!f.id) return;
    const el = mkEl(f.tag, f.id);
    f.cls.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    /* onclick matters: the overlay engine reads a surface's declared close
       path out of this attribute rather than inventing one. */
    if(f.onclick) el.setAttribute('onclick', f.onclick);
    if(f.role) el.setAttribute('role', f.role);
    const owner = containers.filter(c => c.at < f.at && c.id !== f.id).pop();
    el._scope = owner ? owner.id : null;
    byId.set(f.id, el);
  });
  /* Class-only elements the engine and tests query for (.tab-btn, .view,
     .list-row) are registered too, scoped to their nearest id container. */
  const classRe = /<(button|div|main|nav|span|a|li)\b[^>]*class="([^"]*)"[^>]*>/g;
  while((m = classRe.exec(bodyHtml)) !== null){
    const attrAll = m[0];
    if(/\bid="/.test(attrAll)) continue;
    const el = mkEl(m[1], '');
    m[2].split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
    const dataTab = attrAll.match(/data-tab="([^"]+)"/);
    if(dataTab) el.dataset.tab = dataTab[1];
    const dataFilter = attrAll.match(/data-filter="([^"]+)"/);
    if(dataFilter) el.dataset.filter = dataFilter[1];
    const dataStatus = attrAll.match(/data-status="([^"]+)"/);
    if(dataStatus) el.dataset.status = dataStatus[1];
    const onclick = attrAll.match(/onclick="([^"]+)"/);
    if(onclick) el.setAttribute('onclick', onclick[1]);
    const owner = containers.filter(c => c.at < m.index).pop();
    el._scope = owner ? owner.id : null;
  }

  return dom;
}

/* =========================================================
   LOAD THE APP
   ---------------------------------------------------------
   `overrides.appId` rewrites APP_CONFIG.id before evaluation, which
   is how the cross-app collision contracts run two identities
   against one shared localStorage.
   ========================================================= */
const BRIDGE = [
  'APP_CONFIG', 'APP_UPDATES', 'APP_VERSION', 'APP_ID_PATTERN',
  'STORAGE_NAMESPACE', 'CACHE_NAMESPACE', 'KEYS',
  'Store', 'DATA_SCHEMA_VERSION', 'MIGRATIONS', 'migrationWarning', 'Domain',
  'items', 'itemFilter', 'editingItemId', 'detailItemId', 'formStatus',
  'ITEM_STATUSES', 'STATUS_LABEL', 'currentTab',
  'TOAST_MS', 'MAX_TOASTS', 'TOAST_VARIANTS',
  'OVERLAY_Z_BASE', '_openSheetStack', '_sheetOpeners', '_lockDepth', '_lockedScrollY',
  '_historyDepth', '_pendingSelfPops', '_confirmResolve'
];

function loadApp(opts){
  const o = opts || {};
  const src = readApp();
  let code = mainScript(src);

  if(o.appId){
    const before = code;
    code = code.replace(/(\bid:\s*)'[^']*'/, "$1'" + o.appId + "'");
    if(code === before) throw new Error('could not override APP_CONFIG.id');
  }

  const dom = buildDom(src);
  const storage = makeLocalStorage(o.sharedStorage, o.failWrites);
  const errors = [];
  const logs = [];
  const timers = { count: 0, live: 0 };

  const sandbox = {
    console: {
      log: (...a) => logs.push(a.join(' ')),
      warn: (...a) => logs.push(a.join(' ')),
      error: (...a) => errors.push(a.map(String).join(' '))
    },
    document: dom.document,
    navigator: { serviceWorker: { register: () => Promise.resolve() }, vibrate: () => true },
    location: { protocol: 'https:', origin: 'https://example.github.io', href: '', reload(){} },
    history: { pushState(){}, replaceState(){}, back(){} },
    setTimeout: (fn, ms) => { timers.count++; timers.live++; const t = setTimeout(() => { timers.live--; fn(); }, ms); return t; },
    clearTimeout: (t) => { clearTimeout(t); },
    setInterval, clearInterval,
    requestAnimationFrame: f => f(),
    Blob: class { constructor(p){ this.parts = p; } },
    URL: Object.assign(function(u){ return { origin: 'https://example.github.io', href: u }; },
                       { createObjectURL: () => 'blob:x', revokeObjectURL(){} }),
    FileReader: class {
      readAsText(file){ this.result = file && file._text || ''; if(this.onload) this.onload(); }
    },
    Math, JSON, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, Promise, Set, Map, Symbol,
    __errors: errors, __logs: logs, __timers: timers
  };
  sandbox.window = {
    localStorage: storage,
    scrollY: 0, pageYOffset: 0,
    scrollTo(arg){ sandbox.window.scrollY = (arg && arg.top) || 0; },
    addEventListener(type, fn){ (sandbox.window._listeners[type] = sandbox.window._listeners[type] || []).push(fn); },
    removeEventListener(){},
    _listeners: {},
    dispatch(type, ev){ (sandbox.window._listeners[type] || []).forEach(f => { try{ f(ev || {}); }catch(e){} }); },
    matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }),
    MutationObserver: undefined
  };
  sandbox.globalThis = sandbox;
  sandbox.localStorage = storage;

  /* Minimal MutationObserver: registered like the real one, but fired on
     demand by a test through ctx.__flush(), so contracts drive the engine
     deterministically instead of racing a real observer. */
  const observers = [];
  sandbox.MutationObserver = class {
    constructor(cb){ this.cb = cb; observers.push(this); }
    observe(){}
    disconnect(){ const i = observers.indexOf(this); if(i > -1) observers.splice(i, 1); }
    takeRecords(){ return []; }
  };
  sandbox.window.MutationObserver = sandbox.MutationObserver;

  /* Top-level `let`/`const` in a VM context create LEXICAL bindings that are
     not attached to globalThis (unlike function declarations). A direct eval
     appended to the same scope can still see them, so each is bridged to a
     live accessor property — reads and writes hit the real binding. */
  const bootstrap = '\n;(function(){var __N=' + JSON.stringify(BRIDGE) + ';' +
    '__N.forEach(function(n){try{' +
    'eval(n);' +
    'Object.defineProperty(globalThis,n,{configurable:true,' +
    'get:function(){return eval(n);},' +
    'set:function(v){try{eval(n+"=v");}catch(e){}}});' +
    '}catch(e){}});})();';

  vm.createContext(sandbox);
  vm.runInContext(code + bootstrap, sandbox, { filename: 'app.js' });

  sandbox.__observers = observers;
  sandbox.__flush = () => observers.forEach(o => { try{ o.cb([]); }catch(e){} });
  sandbox.__storage = storage;

  /* Clicking a stub element runs its onclick in the app's own context. */
  dom.setOnclickEvaluator(expr => vm.runInContext(expr, sandbox));

  return { ctx: sandbox, dom, storage, errors, logs, timers, src };
}

function settle(ms){ return new Promise(r => setTimeout(r, ms === undefined ? 30 : ms)); }

module.exports = {
  ROOT, APP_PATH, SW_PATH, MANIFEST_PATH, PKG_PATH,
  readApp, readSW, readManifest, readPkg,
  scriptBlocks, mainScript, styleBlock, bodyBlock,
  loadApp, settle, mulberry32, makeLocalStorage, BRIDGE
};
