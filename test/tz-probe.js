/* =========================================================
   TIMEZONE PROBE
   ---------------------------------------------------------
   Loads the application under ONE named timezone and reports
   whether its civil-date and duration arithmetic held.

   WHY A CHILD PROCESS: a zone has to be set through TZ before the
   process makes its first Date, so it cannot be changed from inside
   a suite that is already running. The zone contract spawns this
   file once per zone and reads the JSON back.

   WHY IT MATTERS: every one of these assertions passes in UTC. They
   are the ones that break, silently and only for some users, when a
   date is parsed as UTC or a day is assumed to be 86,400,000 ms.

   Run directly to debug one zone:
     TZ=America/New_York node test/tz-probe.js
   ========================================================= */
'use strict';
const H = require('./harness.js');

const app = H.loadApp();
const c = app.ctx;
const out = [];

function check(name, cond, detail){
  out.push({ name: name, ok: !!cond, detail: cond ? '' : String(detail === undefined ? '' : detail) });
}

const TZ = process.env.TZ || '(system default)';

/* ---- 1. a civil date survives a round trip on every day of two years ----
   This is the assertion that catches `new Date('2026-09-08')`. That parses as
   UTC midnight, so anywhere west of Greenwich it reads back as the day
   before — for every date, all year, for half the planet. */
{
  let broken = null, count = 0;
  let d = '2026-01-01';
  while(d && d <= '2027-12-31' && count < 800){
    const back = c.civilOf(c.civilToDate(d));
    if(back !== d){ broken = d + ' -> ' + back; break; }
    d = c.addDays(d, 1);
    count++;
  }
  check('every civil date in two years round-trips', broken === null, broken);
  check('the walk covered a full two years', count >= 729, String(count));
}

/* ---- 2. adding days is calendar arithmetic, not elapsed milliseconds ----
   A DST day is 23 or 25 hours long. Adding 86,400,000 ms to local midnight
   on such a day lands at 23:00 the previous day or 01:00 the next — and the
   date is then read off the wrong day. Stepping day by day and jumping
   directly must agree, or the app cannot page through a calendar. */
{
  let step = '2026-01-01';
  for(let i = 0; i < 400; i++) step = c.addDays(step, 1);
  const jump = c.addDays('2026-01-01', 400);
  check('400 single steps equal one 400-day jump', step === jump, step + ' vs ' + jump);
  check('and both land on the right date', jump === '2027-02-05', jump);
}

/* ---- 3. the DST transition days themselves ----
   Northern spring forward, northern autumn back, and the southern
   equivalents — whichever of them this zone actually observes. */
{
  const days = ['2026-03-07', '2026-03-08', '2026-03-29', '2026-04-05',
                '2026-10-04', '2026-10-25', '2026-11-01'];
  let bad = null;
  days.forEach(day => {
    if(bad) return;
    const next = c.addDays(day, 1);
    if(c.daysBetween(day, next) !== 1) bad = day + ': daysBetween=' + c.daysBetween(day, next);
    if(c.civilOf(c.civilToDate(day)) !== day) bad = day + ': round trip failed';
  });
  check('every transition day is exactly one day long', bad === null, bad);
}

/* ---- 4. a duration is wall-clock, not elapsed time ----
   09:00 to 10:00 is sixty minutes on the 23-hour day too. If duration were
   derived by subtracting two instants, this is where it would read 0 or 120.
   The rule holds because durations never touch Date at all. */
{
  const item = c.normalizeItem({ title: 'Probe', kind: 'event', date: '2026-03-08', start: 540, duration: 60 });
  check('a stored start is wall-clock minutes', item.start === 540, String(item.start));
  check('an end is derived by adding minutes', c.itemEnd(item) === 600, String(c.itemEnd(item)));
  const late = c.normalizeItem({ title: 'Probe', kind: 'event', date: '2026-11-01', start: 60, duration: 120 });
  check('and it is unchanged on the day the clocks go back', c.itemEnd(late) === 180, String(c.itemEnd(late)));
}

/* ---- 5. the week starts on the same weekday everywhere ---- */
{
  const ws = c.weekStart('2026-09-08');            /* a Tuesday */
  check('a week starts on its Monday', ws === '2026-09-07', ws);
  check('and the weekday of that Monday is Monday', c.weekdayOf(ws) === 1, String(c.weekdayOf(ws)));
}

/* ---- 6. a leap day is a real day ---- */
{
  check('February 29th 2028 exists', c.isCivil('2028-02-29'));
  check('February 30th does not', !c.isCivil('2028-02-30'));
  check('stepping into a leap day works', c.addDays('2028-02-28', 1) === '2028-02-29');
  check('and out of it', c.addDays('2028-02-29', 1) === '2028-03-01');
  check('2027 has no 29th of February', !c.isCivil('2027-02-29'));
}

/* ---- 7. a recurrence lands on the weekday it was asked for ----
   Weekly recurrence expanded with millisecond arithmetic drifts by an hour
   across a DST boundary and eventually reports the wrong weekday. */
{
  const series = c.normalizeItem({
    title: 'Probe', kind: 'task', date: '2026-01-05', start: 540, duration: 30,
    recurrence: { freq: 'weekly', days: [1], interval: 1 }
  });
  let hits = 0, wrongDay = null, d = '2026-01-05';
  for(let i = 0; i < 365; i++){
    if(c.seriesOccursOn(series, d)){
      hits++;
      if(c.weekdayOf(d) !== 1) wrongDay = d;
    }
    d = c.addDays(d, 1);
  }
  check('a weekly series only ever lands on its weekday', wrongDay === null, wrongDay);
  check('and occurs about once a week for a year', hits >= 51 && hits <= 53, String(hits));
}

process.stdout.write(JSON.stringify({ tz: TZ, checks: out }));

/* The app keeps a clock interval alive once wired, which is correct in a
   browser and fatal here: without an explicit exit this process would hold
   its event loop open forever and the parent would block on it. */
process.exit(0);
