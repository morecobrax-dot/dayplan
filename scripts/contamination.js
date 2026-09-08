/* =========================================================
   CONTAMINATION SCAN
   ---------------------------------------------------------
   This repository was seeded from a copy of a production fitness
   application. The engineering was worth keeping; the domain was
   not. This script is the permanent guarantee that none of the
   domain came along.

     node scripts/contamination.js

   It runs as part of `npm run verify`, so contamination is a
   failing test rather than something someone notices in a year.

   DESIGN NOTE — why this is not a word blocklist
   Ordinary software vocabulary overlaps heavily with fitness
   vocabulary: "program", "set", "record", "session", "track" and
   "run" are all legitimate here. Banning those produces false
   positives, and a check that cries wolf gets deleted. So the
   patterns below are only ever:

     - domain vocabulary with no generic software meaning
       (hypertrophy, deadlift)
     - identifiers the original product actually used
       (workoutLog, TRAINER_ENGINE_VERSION)
     - historical namespaces and branding (loop_, loop-v)

   Adding a new pattern is cheap. Adding an ambiguous one is not:
   if a word could plausibly appear in this starter's own code,
   it does not belong here.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Files that are allowed to describe the check itself. */
const SELF = ['scripts/contamination.js'];

const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXT = new Set(['.html', '.js', '.json', '.md', '.css', '.webmanifest', '.txt', '.yml', '.yaml']);

/* Each rule: a label, a regex, and whether case matters. */
const RULES = [
  /* ---- branding and historical namespaces ---- */
  { label: 'legacy brand token',        re: /\bLOOP\b/g,                       flags: '' },
  { label: 'legacy storage prefix',     re: /\bloop_/gi,                       flags: '' },
  { label: 'legacy cache prefix',       re: /\bloop-v\d/gi,                    flags: '' },
  { label: 'legacy repo path',          re: /Claude Coding Projects[\\/]loop/gi,flags: '' },
  { label: 'legacy remote',             re: /morecobrax-dot\/loop\b/gi,        flags: '' },
  { label: 'legacy tooling file',       re: /\bloop-(tests|movement|evaluate|audit|test-harness|cardio-stress|date-audit|gps-audit|program-audit)\b/gi, flags: '' },

  /* ---- identifiers the original product used ---- */
  { label: 'legacy storage key',        re: /\b(workoutLog|trainerLog|cardioLog|gymProfile|athleteProfile|exercisePrefs|exerciseNotes|dailyReadiness|activeWorkoutDraft|cardioDraft|dismissedMissed|selectedPlan)\b/g, flags: '' },
  { label: 'legacy constant',           re: /\b(TRAINER_ENGINE_VERSION|CANONICAL_EXERCISES|MUSCLE_MAP|SECONDARY_MUSCLE_MAP|DEFAULT_PLANS|GYM_EQUIPMENT|CARDIO_MET_TABLE|PREP_MOVEMENTS|COOLDOWN_STRETCHES|PRESCRIPTION_PROFILES|RECOVERY_CONFIG|CAPABILITY_CONFIG|TRAINER_CONFIG|LOOP_UPDATES|SET_TYPE_REGISTRY|MASTERY_CONFIG|PR_PRIORITY)\b/g, flags: '' },

  /* ---- domain vocabulary with no generic software meaning ---- */
  { label: 'fitness vocabulary',        re: /\b(hypertrophy|deadlift|barbell|dumbbell|kettlebell|squat|bench press|e1RM|1RM|RIR|RPE|deload|recomp|calisthenic|powerlift|glute|quadricep|hamstring|latissimus|bicep|tricep|pectoral|abdominal)\b/gi, flags: '' },
  /* "exercise" is deliberately absent as a bare word: "exercise the code path"
     is ordinary software English, and a check that cries wolf gets deleted.
     The fitness sense is caught by its identifier and phrase forms instead. */
  { label: 'fitness domain noun',       re: /\b(workout|workouts|trainer|athlete|athletes|cardio|gym|gyms|cool-?down|rest timer|personal record|muscle group|training plan|training phase|rep range|set type)\b/gi, flags: '' },
  { label: 'fitness phrase',            re: /\b(exercise (registry|library|name|list|detail|notes|history|substitution)|substitute exercise|exercise[A-Z]\w*|warm-?up (routine|movement|set|exercise))\b/g, flags: '' },
  { label: 'fitness system name',       re: /\b(muscle recovery|exercise registry|shadow trainer|readiness score|capability model|movement library|training block|progression engine)\b/gi, flags: '' }
];

function walk(dir, out){
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if(SKIP_DIRS.has(e.name)) return;
    const full = path.join(dir, e.name);
    if(e.isDirectory()) walk(full, out);
    else out.push(full);
  });
  return out;
}

function isText(f){ return TEXT_EXT.has(path.extname(f).toLowerCase()); }

function run(){
  const files = walk(ROOT, []);
  const hits = [];
  const binaries = [];

  files.forEach(full => {
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if(SELF.indexOf(rel) !== -1) return;

    if(!isText(full)){
      binaries.push(rel);
      /* Filenames are scanned even when contents cannot be. */
      RULES.forEach(r => {
        const re = new RegExp(r.re.source, r.re.flags);
        if(re.test(rel)) hits.push({ file: rel, line: 0, label: r.label, text: rel });
      });
      return;
    }

    const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      RULES.forEach(r => {
        const re = new RegExp(r.re.source, r.re.flags);
        const m = line.match(re);
        if(m){
          hits.push({
            file: rel, line: i + 1, label: r.label,
            text: line.trim().slice(0, 110), match: m[0]
          });
        }
      });
    });
  });

  console.log('contamination scan — ' + files.length + ' files (' + binaries.length + ' binary, scanned by name)');

  if(!hits.length){
    console.log('  clean — no fitness-domain residue found');
    console.log('\n  Note: binary assets are checked by filename only. Icons and images');
    console.log('  still need a human to look at them. See NEW-PROJECT.md.');
    return 0;
  }

  console.error('\n  FAILED — ' + hits.length + ' occurrence(s):\n');
  const byFile = {};
  hits.forEach(h => { (byFile[h.file] = byFile[h.file] || []).push(h); });
  Object.keys(byFile).sort().forEach(f => {
    console.error('  ' + f);
    byFile[f].slice(0, 12).forEach(h => {
      console.error('    ' + String(h.line).padStart(5) + '  [' + h.label + '] ' + h.text);
    });
    if(byFile[f].length > 12) console.error('    ... and ' + (byFile[f].length - 12) + ' more');
  });
  console.error('\n  Every occurrence must be removed, or the pattern justified and');
  console.error('  narrowed in scripts/contamination.js.');
  return 1;
}

if(require.main === module) process.exit(run());
module.exports = { run, RULES };
