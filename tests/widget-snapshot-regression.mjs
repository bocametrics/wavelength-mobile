import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [
  ['mobile', path.resolve(here, '../index.html')],
  ['desktop', path.resolve(here, '../../friday_app_2026-07-12.html')],
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

function loadSnapshotBuilder(html) {
  const names = [
    'normalizeMeasurementConfig',
    'getHabitProgress',
    'isHabitProgressComplete',
    'buildWidgetSnapshot',
  ];
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${names.map(name => extractFunction(html, name)).join('\n')}\n` +
    'globalThis.buildWidgetSnapshot = buildWidgetSnapshot;',
    context,
  );
  return context.buildWidgetSnapshot;
}

for (const [label, htmlPath] of builds) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const buildWidgetSnapshot = loadSnapshotBuilder(html);
  const snapshot = JSON.parse(JSON.stringify(buildWidgetSnapshot({
    habits: [
      { id:'meditate', icon:'🧘', text:'Meditate', targetLabel:'5 min', measurement:'check' },
      { id:'water', icon:'💧', text:'Drink water', targetLabel:'16 oz', measurement:'amount', target:16, step:8, unit:'oz' },
      { id:'walk', icon:'🚶', text:'Outdoor walk or movement', targetLabel:'20+ min', measurement:'check' },
    ],
    dayDone: { meditate:true },
    dayProgress: { water:8 },
    order: ['walk', 'meditate', 'water'],
    suggestion: {
      state:'suggested-now',
      eyebrow:'Suggested now',
      habitId:'walk',
      title:'Outdoor walk or movement',
      targetLabel:'20+ min',
      detail:'AQI 31 · Rain 60%',
      freshUntil:'2026-09-30T17:00:00.000Z',
      rawWeather:{ latitude:26.7, longitude:-80.0 },
    },
    generatedAt:'2026-09-30T16:00:00.000Z',
    dayKey:'2026-09-30',
    timeZone:'America/New_York',
    expiresAt:'2026-10-01T04:00:00.000Z',
    nextRefreshAt:'2026-09-30T16:15:00.000Z',
  })));

  assert.deepEqual(snapshot, {
    schemaVersion:1,
    revision:1790784000000,
    generatedAt:'2026-09-30T16:00:00.000Z',
    dayKey:'2026-09-30',
    timeZone:'America/New_York',
    expiresAt:'2026-10-01T04:00:00.000Z',
    nextRefreshAt:'2026-09-30T16:15:00.000Z',
    progress:{ completed:1, total:3 },
    nextWave:{
      state:'suggested-now',
      eyebrow:'Suggested now',
      habitId:'walk',
      title:'Outdoor walk or movement',
      targetLabel:'20+ min',
      detail:'AQI 31 · Rain 60%',
      freshUntil:'2026-09-30T17:00:00.000Z',
    },
    habits:[
      { id:'walk', icon:'🚶', title:'Outdoor walk or movement', targetLabel:'20+ min', complete:false, progress:null },
      { id:'water', icon:'💧', title:'Drink water', targetLabel:'16 oz', complete:false, progress:{ value:8, target:16, unit:'oz' } },
      { id:'meditate', icon:'🧘', title:'Meditate', targetLabel:'5 min', complete:true, progress:null },
    ],
  }, `${label}: widget snapshot is a compact, ordered, versioned view model`);
  assert.equal(JSON.stringify(snapshot).includes('latitude'), false, `${label}: raw environmental data does not leak into widget storage`);
}

console.log('widget snapshot regression checks passed');
