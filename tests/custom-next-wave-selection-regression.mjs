import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Parent next-slice RED: safe generic selection before any live consent plumbing.
// These explicit-argument fixtures do not enable production callers or authored cues.
const here = path.dirname(fileURLToPath(import.meta.url));
const builds = [['mobile','../index.html'],['desktop','fixtures/friday_app_2026-07-12.html']];
function extractFunction(source,name) {
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`${name} is missing`);
  const signature=source.slice(start).match(/^function\s+\w+\([\s\S]*?\)\s*\{/);
  assert.ok(signature,`${name} body is missing`);
  const brace=start+signature[0].length-1;
  let depth=0,quote=null,escaped=false;
  for(let i=brace;i<source.length;i+=1){
    const c=source[i];
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==="'"||c==='"'||c==='`'){quote=c;continue;}
    if(c==='{')depth+=1;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`${name} does not terminate`);
}
function load(source) {
  const patterns=[
    /const DEFAULT_HABITS = (\[[\s\S]*?\n\]);/,
    /const OPPORTUNITY_WINDOW_POLICY\s*=\s*Object\.freeze\(\{[\s\S]*?\}\);/,
    /const FORECAST_COPY_MAX_AGE_MS\s*=\s*[^;]+;/,
    /const ENVIRONMENT_SOFT_REFRESH_MS\s*=\s*[^;]+;/,
    /const RHYTHM_TYPES\s*=\s*[^;]+;/,
  ];
  const constants=patterns.map(pattern=>{const m=source.match(pattern);assert.ok(m,`missing ${pattern}`);return m[0];});
  const names=[
    'createDefaultCustomNextWaveState','normalizeCustomNextWaveState','normalizePreferenceWindow','isEligibleForPreferenceWindow',
    'deriveCustomRecommendationContext','buildRuntimeHabits','buildCompleteHabitCatalog',
    'normalizeMeasurementConfig','getHabitProgress','isHabitProgressComplete','dateKey',
    'normalizeHabitDays','isHabitScheduledOn','getScheduledHabits','isConciseRhythmNote','normalizeRhythmConfig',
    'getAqiCategory','parseDisplayClockMinutes','getDaylightState','getEffectiveRecommendationContext',
    'evaluateOpportunityWindows','getHabitRecommendationFit','getHabitAdaptiveSuggestion','isHourlyForecastFresh',
    'getFreshEnvironmentalSnapshot','formatForecastClock','getForecastAwareOutdoorSuggestion',
    'createNextWaveProgressCue','isNextWaveProgressCueActive','getNextWaveSuggestion',
  ];
  const sandbox={};vm.createContext(sandbox);
  vm.runInContext(constants.join('\n')+'\nconst MAX_CUSTOM_HABITS=100; const SYSTEM_HABIT_PARAMETER_DEFS={};\n'+
    'const SYSTEM_HABIT_IDS=new Set(DEFAULT_HABITS.map(h=>h.id));\n'+
    names.map(name=>extractFunction(source,name)).join('\n')+
    '\nglobalThis.api={defaults:DEFAULT_HABITS,isEligibleForPreferenceWindow,buildCompleteHabitCatalog,getHabitRecommendationFit,getNextWaveSuggestion,getForecastAwareOutdoorSuggestion};',sandbox);
  return sandbox.api;
}
const id='habit_cafecafe-1234-4234-8234-cafecafecafe';
const definition={id,cat:'movement',icon:'⭐',text:'Independent authored habit',note:'',activeFrom:'2026-10-11',days:[0,1,2,3,4,5,6],measurement:'check'};
const at=(hour,minute=0)=>new Date(2026,9,12,hour,minute,0,0);
const reports=[];
for(const [label,relative] of builds){
  const api=load(fs.readFileSync(path.resolve(here,relative),'utf8'));
  const build=(patch={},setting='either',enabled=true)=>api.buildCompleteHabitCatalog([],{},
    {schemaVersion:1,customDefinitions:[{...definition,...patch}],status:[]},
    {schemaVersion:1,settings:[{habitId:id,enabled,setting}]})[0];
  const run=(name,fn)=>{try{fn();reports.push({build:label,name,passed:true});}catch(err){
    if(err.name!=='AssertionError')throw err;
    reports.push({build:label,name,passed:false,error:err.message});
  }};
  run('manual consent remains excluded despite sunset cue',()=>{
    const habit=build({rhythm:{type:'sunset',note:'Authored'}},'either',false);
    assert.equal(api.getNextWaveSuggestion([habit],{}, {},at(17),{}).habitId,null);
  });
  run('ordinary enabled custom keeps exact identity and generic available result',()=>{
    const habit=build();const result=api.getNextWaveSuggestion([habit],{}, {},at(12),{});
    assert.equal(result.habitId,id);assert.equal(result.title,definition.text);assert.equal(result.reason,'available-now');
  });
  run('retained shipped sunset override keeps its supported identity and established reason',()=>{
    const shipped=api.defaults.find(habit=>habit.id==='meditate');
    assert.ok(shipped,'real shipped meditation fixture is required');
    const habit={...shipped,rhythm:{type:'sunset',note:'Authored'}};
    const result=api.getNextWaveSuggestion([habit],{}, {},at(17),{});
    assert.equal(result.habitId,shipped.id);assert.equal(result.title,shipped.text);
    assert.equal(result.reason,'sunset-rhythm','restricting generic customs must not erase valid retained system sunset overrides');
  });
  for(const setting of ['indoor','outdoor','either'])run(`${setting} sunset cue cannot claim shipped sunset purpose`,()=>{
    const habit=build({rhythm:{type:'sunset',note:'Authored'}},setting);
    const result=api.getNextWaveSuggestion([habit],{}, {},at(17),{});
    assert.equal(result.habitId,id);assert.equal(result.reason,'available-now',
      `${label}: custom sunset cue must not enter shipped sunset-rhythm or condition Insights`);
    assert.doesNotMatch(result.detail,/Sunset today|evening window/i);
  });
  run('advisory AQI cue cannot block generic custom recommendation eligibility',()=>{
    const now=at(12);const habit=build({rhythm:{type:'aqi-below',threshold:40,note:'Authored'}},'outdoor');
    const data={aqi:150,aqiObservedAt:now.getTime()};
    assert.equal(api.getHabitRecommendationFit(habit,now,data).eligible,true,
      `${label}: generic custom advisory cue must not inherit shipped AQI eligibility gate`);
    assert.equal(api.getNextWaveSuggestion([habit],{}, {},now,data).habitId,id);
  });
  run('morning custom late phase has no invented lighter version or tonight wording',()=>{
    const habit=build({preferenceWindow:{idealStart:360,idealEnd:480}});
    const result=api.getNextWaveSuggestion([habit],{}, {},at(8,15),{});
    assert.equal(result.habitId,id);assert.doesNotMatch(result.detail,/lighter|tonight/i,
      `${label}: generic late detail must stay neutral to activity purpose and day period`);
    assert.doesNotMatch(result.eyebrow,/tonight/i);
  });
}
console.log(JSON.stringify({cases:reports,passing:reports.filter(r=>r.passed).length,total:reports.length},null,2));
assert.ok(reports.every(r=>r.passed),'generic custom selection guards are required before live consent activation');
