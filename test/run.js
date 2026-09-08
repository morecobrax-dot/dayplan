/* =========================================================
   TEST RUNNER
   ---------------------------------------------------------
     npm test              contracts only  (~1s)
     npm run verify        contracts + config + contamination

   `verify` is the one command to remember. It is the gate before
   any commit or deploy: it proves the contracts hold, that the
   static PWA files still match APP_CONFIG, and that no domain
   residue has crept back in.

   Exit code 0 = pass, 1 = failure. Failures are listed at the end.

   SAFETY: this suite loads index.html as text and runs it against
   an in-memory store. No real browser storage is read or written.
   ========================================================= */
'use strict';
const C = require('./contracts.js');

const TIER = (process.argv[2] || 'contracts').toLowerCase();

/* Contracts run in dependency order: identity and storage first, because
   everything above them is meaningless if those are wrong. */
const SUITES = [
  C.testBoot,
  C.testConfig,
  C.testStorage,
  C.testCollision,
  C.testMigration,
  C.testNavigation,
  C.testOverlays,
  C.testToast,
  C.testConfirmation,
  C.testForms,
  C.testMobile,
  C.testDesignSystem,
  C.testPWA,
  C.testRelease,
  C.testAccessibility,
  C.testStress,
  C.testSourcesOfTruth,
  C.testPortability,
  C.testContamination
];

async function main(){
  const started = Date.now();
  console.log('\n' + '='.repeat(64));
  console.log('  STARTER CONTRACTS — tier: ' + TIER);
  console.log('='.repeat(64));

  for(const suite of SUITES){
    await suite();
  }

  const r = C.results();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(64));
  console.log('  RESULT');
  console.log('='.repeat(64));
  console.log('  passed: ' + r.pass + ' | failed: ' + r.fail);
  console.log('  duration: ' + seconds + 's');

  if(r.fail){
    console.log('\n  FAILURES');
    r.failures.forEach(f => console.log('    - ' + f));
  }

  if(TIER === 'verify'){
    console.log('\n' + '='.repeat(64));
    console.log('  CONFIG INTEGRITY');
    console.log('='.repeat(64));
    const { execFileSync } = require('child_process');
    try{
      const out = execFileSync(process.execPath, [__dirname + '/../scripts/config.js', 'verify'],
                               { encoding: 'utf8' });
      process.stdout.write('  ' + out.trim() + '\n');
    }catch(e){
      process.stdout.write((e.stdout || '') + (e.stderr || ''));
      console.log('\n  VERIFY FAILED — application identity has drifted.');
      process.exit(1);
    }
  }

  console.log('\n  This suite loaded index.html as text and ran it against an in-memory');
  console.log('  store. No real user data was read or written.\n');

  process.exit(r.fail ? 1 : 0);
}

main().catch(err => {
  console.error('\n  RUNNER ERROR — ' + (err && err.stack || err));
  process.exit(1);
});
