/* =========================================================
   CONFIG SYNC / VERIFY
   ---------------------------------------------------------
   APP_CONFIG in index.html is the single source of application
   identity. Static files — the document head, the manifest, the
   service worker and package.json — cannot read a JavaScript
   object at runtime, so this script writes it into them.

     node scripts/config.js sync     write derived values
     node scripts/config.js verify   fail if anything has drifted

   verify runs as part of `npm run verify`, so identity drift is a
   failing test rather than a deployment surprise. There is no
   build step: the app runs straight from source either way.

   Adding a new derived value means adding one entry to targets()
   below. Nothing else changes.
   ========================================================= */
'use strict';
const fs = require('fs');
const H = require('../test/harness.js');

const MODE = (process.argv[2] || 'verify').toLowerCase();

/* Windows checkouts are usually CRLF. Normalise for the edit, restore
   afterwards, so syncing never rewrites every line of a file. */
function readText(p){
  const raw = fs.readFileSync(p, 'utf8');
  return { crlf: raw.indexOf('\r\n') !== -1, text: raw.split('\r\n').join('\n') };
}
function writeText(p, text, crlf){
  fs.writeFileSync(p, crlf ? text.split('\n').join('\r\n') : text);
}

function replaceRegion(text, beginMark, endMark, replacement, file){
  const a = text.indexOf(beginMark);
  const b = text.indexOf(endMark);
  if(a === -1 || b === -1 || b < a){
    throw new Error('markers ' + beginMark + ' / ' + endMark + ' not found in ' + file +
                    ' — refusing to guess where the derived block goes');
  }
  return {
    next: text.slice(0, a + beginMark.length) + '\n' + replacement + '\n' + text.slice(b),
    current: text.slice(a + beginMark.length, b).trim()
  };
}

/* ---------- read the source of truth ---------- */
function loadConfig(){
  const app = H.loadApp();
  const cfg = app.ctx.APP_CONFIG;
  const err = app.ctx.validateAppId(cfg.id);
  if(err) throw new Error(err);
  return {
    cfg,
    version: app.ctx.APP_VERSION,
    cacheName: app.ctx.CACHE_NAMESPACE,
    storagePrefix: app.ctx.STORAGE_NAMESPACE
  };
}

/* ---------- what each static file should contain ---------- */
function targets(c){
  const { cfg, version, cacheName } = c;
  return [
    {
      file: H.APP_PATH,
      label: 'index.html <head>',
      region: ['<!-- APP-META-BEGIN', '<!-- APP-META-END'],
      /* The comment tail after the begin marker is re-emitted so the block
         keeps explaining itself to whoever opens the file next. */
      build: () => [
        ' — derived from APP_CONFIG by `npm run config:sync`. Do not hand-edit. -->',
        '<title>' + esc(cfg.name) + '</title>',
        '<meta name="description" content="' + esc(cfg.description) + '">',
        '<meta name="apple-mobile-web-app-title" content="' + esc(cfg.shortName) + '">',
        '<meta name="theme-color" content="' + esc(cfg.themeColor) + '">'
      ].join('\n')
    },
    {
      /* The header prints the name at boot from APP_CONFIG, but the markup
         carries a copy too — so that view-source is honest and so the first
         paint is not a flash of the wrong product's name. A copy is a second
         source of truth unless it is derived, which is what this does. */
      file: H.APP_PATH,
      label: 'index.html app title',
      pattern: /(<h1 class="app-title" id="appTitle">)([\s\S]*?)(<\/h1>)/,
      build: () => esc(cfg.name)
    },
    {
      file: H.SW_PATH,
      label: 'sw.js cache name',
      region: ['/* APP-CACHE-BEGIN */', '/* APP-CACHE-END */'],
      build: () => "const CACHE_NAME = '" + cacheName + "';"
    },
    {
      file: H.MANIFEST_PATH,
      label: 'manifest.webmanifest',
      json: true,
      build: (current) => {
        const next = Object.assign({}, current, {
          name: cfg.name,
          short_name: cfg.shortName,
          description: cfg.description,
          background_color: cfg.backgroundColor,
          theme_color: cfg.themeColor
        });
        return JSON.stringify(next, null, 2) + '\n';
      }
    },
    {
      file: H.PKG_PATH,
      label: 'package.json',
      json: true,
      build: (current) => {
        const next = Object.assign({}, current, {
          name: cfg.id,
          version: version,
          description: cfg.description
        });
        return JSON.stringify(next, null, 2) + '\n';
      }
    }
  ];
}

function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

/* ---------- run ---------- */
function run(){
  const c = loadConfig();
  const drift = [];
  let wrote = 0;

  targets(c).forEach(t => {
    const { crlf, text } = readText(t.file);

    if(t.json){
      const current = JSON.parse(text);
      const next = t.build(current);
      const same = text.trim() === next.trim();
      if(same) return;
      if(MODE === 'sync'){ writeText(t.file, next, crlf); wrote++; }
      else drift.push(t.label);
      return;
    }

    /* A pattern target rewrites the middle capture and leaves the delimiters
       alone, for values that live in markup rather than in a marked region. */
    if(t.pattern){
      const m = text.match(t.pattern);
      if(!m){
        throw new Error('pattern for ' + t.label + ' not found in ' + t.file +
                        ' — refusing to guess where the derived value goes');
      }
      const want = t.build();
      if(m[2] === want) return;
      if(MODE === 'sync'){
        writeText(t.file, text.replace(t.pattern, (_, a, __, c) => a + want + c), crlf);
        wrote++;
      } else drift.push(t.label);
      return;
    }

    const want = t.build();
    const r = replaceRegion(text, t.region[0], t.region[1], want, t.file);
    if(r.current === want.trim()) return;
    if(MODE === 'sync'){ writeText(t.file, r.next, crlf); wrote++; }
    else drift.push(t.label);
  });

  if(MODE === 'sync'){
    console.log('config:sync  id=' + c.cfg.id + '  version=' + c.version);
    console.log('  storage prefix : ' + c.storagePrefix);
    console.log('  cache name     : ' + c.cacheName);
    console.log(wrote ? '  updated ' + wrote + ' file(s)' : '  already in sync');
    return 0;
  }

  if(drift.length){
    console.error('config:verify  FAILED — these files no longer match APP_CONFIG:');
    drift.forEach(d => console.error('  - ' + d));
    console.error('\n  Run `npm run config:sync` to bring them back in line.');
    return 1;
  }
  console.log('config:verify  ok — id=' + c.cfg.id + ' version=' + c.version +
              ' cache=' + c.cacheName);
  return 0;
}

if(require.main === module){
  try{ process.exit(run()); }
  catch(e){ console.error('config:' + MODE + '  ERROR — ' + e.message); process.exit(1); }
}

module.exports = { loadConfig, targets, esc };
