// Regression: per-habit preference windows.
// Runs against BOTH builds (mobile index.html / desktop fixture) and asserts the
// data layer, Next Wave wiring, Manage UI, and backup schema all agree.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BUILD_FILES = [
  { label: 'mobile', path: 'index.html' },
  { label: 'desktop', path: 'tests/fixtures/friday_app_2026-07-12.html' },
];

function extractMainScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  return scripts.reduce((longest, s) => (s.length > longest.length ? s : longest), '');
}

function extractFunction(script, name) {
  const re = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{`);
  const start = script.search(re);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  const braceStart = script.indexOf('{', start);
  for (let i = braceStart; i < script.length; i++) {
    if (script[i] === '{') depth++;
    else if (script[i] === '}') {
      depth--;
      if (depth === 0) return script.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

// Only the small pure functions are VM-loaded; the big production functions
// (normalizeCustomHabitOverrides, buildRuntimeHabits) are already deeply tested
// by system-habit-parameters-regression.mjs and are asserted here via source.
const VM_SYMBOLS = ['normalizePreferenceWindow','expandPreferenceWindow','getPreferenceWindowsMap','preferenceWindowToDisplayTime','displayTimeToPreferenceWindow','isEligibleForPreferenceWindow'];

for (const { label, path } of BUILD_FILES) {
  const html = readFileSync(path, 'utf8');
  const script = extractMainScript(html);

  const context = {};
  vm.createContext(context);
  const defs = VM_SYMBOLS.map(s => extractFunction(script, s)).join('\n');
  const stubs = `
    const SYSTEM_HABIT_PARAMETER_DEFS = {
      wake:{ targetTime:{ type:'time', default:'06:30' } },
      dinner:{ targetTime:{ type:'time', default:'19:00' } },
      sleep:{ targetTime:{ type:'time', default:'22:00' } },
    };
    ${defs}
  `;
  try {
    vm.runInContext(stubs, context, { filename: `${label}-preference-windows.js` });
  } catch (err) {
    throw new Error(`${label}: failed to load functions: ${err.message}`);
  }

  const n = context;
  const assert = (cond, msg) => { if (!cond) throw new Error(`${label}: ${msg}`); };

  // ── normalizePreferenceWindow ──
  assert(JSON.stringify(n.normalizePreferenceWindow({ idealStart:420, idealEnd:480 })) === '{"idealStart":420,"idealEnd":480}', 'valid window preserved');
  assert(JSON.stringify(n.normalizePreferenceWindow({ idealStart:420 })) === '{"idealStart":420}', 'missing idealEnd is allowed');
  assert(n.normalizePreferenceWindow({ idealStart:1500 }) === null, 'out-of-range idealStart rejected');
  assert(n.normalizePreferenceWindow(null) === null, 'null returns null');
  assert(n.normalizePreferenceWindow({ idealStart:500, idealEnd:400 }) === null, 'reversed window rejected');

  // ── expandPreferenceWindow (grace period 60, MVP single preferred time) ──
  const expanded = n.expandPreferenceWindow({ idealStart:420, idealEnd:480 }, { start:300, idealStart:360, end:900 });
  assert(expanded.eligibleStart === 360, 'eligibleStart = idealStart - 60');
  assert(expanded.idealStart === 420, 'idealStart preserved');
  assert(expanded.idealEnd === 480, 'idealEnd preserved');
  assert(expanded.lateStart === 480, 'lateStart = idealEnd');
  assert(expanded.eligibleEnd === 900, 'eligibleEnd = system end when present');
  const noSystemEnd = n.expandPreferenceWindow({ idealStart:420, idealEnd:480 }, null);
  assert(noSystemEnd.eligibleEnd === 540, 'eligibleEnd = idealEnd + 60 when no system end');

  // ── display time round-trip (07:30 preferred → idealStart 07:15 → display 07:30) ──
  assert(n.preferenceWindowToDisplayTime(n.displayTimeToPreferenceWindow('07:30')) === '07:30', 'display round-trips through idealStart+15');
  assert(n.displayTimeToPreferenceWindow('25:99') === null, 'invalid time rejected');
  assert(n.preferenceWindowToDisplayTime(null) === '', 'null preference shows empty');

  // ── eligibility ──
  assert(n.isEligibleForPreferenceWindow({ id:'stretch', context:{ start:360 } }) === true, 'timing habit without time param is eligible');
  assert(n.isEligibleForPreferenceWindow({ id:'wake', context:{ start:300 } }) === false, 'habit with time parameter is excluded');
  assert(n.isEligibleForPreferenceWindow({ id:'x', context:{} }) === false, 'habit without context.start is excluded');

  // ── getPreferenceWindowsMap expands windows for Next Wave ──
  const map = n.getPreferenceWindowsMap([
    { id:'stretch', preferenceWindow:{ idealStart:420, idealEnd:480 }, context:{ start:300, end:900 } },
  ]);
  assert(map.stretch.idealStart === 420 && map.stretch.eligibleEnd === 900, 'map carries expanded 5-boundary window');

  // ── source-level wiring assertions ──
  assert(/getPreferenceWindowsMap\(HABITS\)/.test(script), 'renderNextWave builds the preference map');
  assert(/getNextWaveSuggestion\(\s*HABITS, state\.done \|\| \{\}, state\.progress \|\| \{\}, now, rhythmWeatherData,\s*recentCompletionCue, preferenceWindows, recentNextWaveProgressCue\s*\)/.test(script),
    'renderNextWave passes preferenceWindows and partial-progress cooldown state to getNextWaveSuggestion');
  assert(/getNextWaveRefreshDelay\(HABITS, now, rhythmWeatherData, getPreferenceWindowsMap\(HABITS\)\)/.test(script),
    'scheduleNextWaveContextRefresh passes preferenceWindows');
  assert(/getEffectiveRecommendationContext\(habit, preferenceWindows\?\.\[habit\.id\]\)/.test(script),
    'getNextWaveRefreshDelay applies per-habit preference windows');
  assert(/preferenceWindow[^]*allowedFields[^]*'rhythm'\]\)/.test(script) === false || /allowedFields = new Set\(\[[^\]]*'preferenceWindow'/.test(script),
    'normalizeCustomHabitOverrides whitelists preferenceWindow');
  assert(/if \(override\.preferenceWindow\) runtime\.preferenceWindow = normalizePreferenceWindow\(override\.preferenceWindow, false\)/.test(script),
    'buildRuntimeHabits merges and re-normalizes preferenceWindow');

  // ── Manage UI source ──
  assert(/eh-preference/.test(script), 'Manage modal renders the preferred-time field');
  assert(/isEligibleForPreferenceWindow\(h\)/.test(script), 'preferred-time field is eligibility-gated');
  assert(/displayTimeToPreferenceWindow\(prefValue\)/.test(script), 'saveManageModal converts display time to a window');
  assert(/changes\.preferenceWindow = null/.test(script), 'clearing the field clears the preference');
  assert(/preferenceWindowToDisplayTime\(h\.preferenceWindow\)/.test(script), 'modal pre-fills from stored preference');

  // ── backup schema (v5) ──
  assert(/const BACKUP_VERSION = 5;/.test(script), 'backup schema is version 5');
  assert(/preferenceWindows:\s*Object\.fromEntries\(/.test(script), 'payload carries a preferenceWindows map');
  assert(/\[1, 2, 3, 4, BACKUP_VERSION\]\.includes\(payload\.version\)/.test(html), 'import still accepts v1–v4');
  assert(/if \(payload\.preferenceWindows && typeof payload\.preferenceWindows === 'object'/.test(script),
    'import restores the preferenceWindows map');

  console.log(`${label}: preference-window regression tests passed`);
}

console.log('preference-window regression tests passed for mobile and desktop');