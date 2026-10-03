// Mob Studio was removed and the start-screen entry point now leads to the Mob Inspector.
//
// These tests pin both halves: the new button really opens the standalone Inspector page, and
// the Studio is gone rather than merely unreferenced — so a stale import or a leftover panel
// cannot creep back in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const html = read('index.html');
const mainJs = read('src/main.js');
const inspectorHtml = read('mob-debug.html');
const inspectorJs = read('src/mobDebug.js');

// --- the start-screen button -------------------------------------------------

test('the start screen offers a Mob Inspector button and no Mob Studio button', () => {
  assert.match(html, /id="btn-start-mob-inspector"/, 'the Inspector button exists');
  assert.match(html, />\s*Mob Inspector\s*</, 'and is labelled Mob Inspector');
  assert.doesNotMatch(html, /id="btn-start-mob-studio"/, 'the old Studio button is gone');
  assert.doesNotMatch(html, />\s*Mob Studio\s*</, 'and so is its label');
});

test('the Structure Studio button is left alone', () => {
  // The two studios were separate features and shared styling; only Mob Studio was removed.
  assert.match(html, /id="btn-start-structure-studio"/, 'Structure Studio keeps its button');
  assert.match(html, /id="structure-parameter-panel"/, 'and its panel');
});

test('clicking the button leads to the Inspector page', () => {
  // The handler must be wired and must call the navigation method.
  assert.match(mainJs, /getElementById\('btn-start-mob-inspector'\)/, 'the button is looked up');
  assert.match(mainJs, /btnMobInspector\.addEventListener\('click'/, 'a click handler is bound');
  assert.match(mainJs, /this\.openMobInspector\(\)/, 'and it opens the Inspector');
  assert.match(mainJs, /openMobInspector\(\) \{/, 'the method exists');
});

test('openMobInspector navigates to the standalone Inspector page', () => {
  // Exercise the method directly against a stub location, so the URL is verified rather than
  // only the presence of a string.
  const source = mainJs.slice(mainJs.indexOf('openMobInspector() {'));
  const body = source.slice(0, source.indexOf('\n  }'));
  assert.match(body, /\/mob-debug\.html/, 'it targets the Inspector page');
  assert.match(body, /window\.location\.href\s*=/, 'by navigating, not by starting a world');
  assert.match(body, /return url;/, 'and it reports the URL it used');
});

test('the Inspector page is the file the button points at', () => {
  assert.ok(existsSync(join(process.cwd(), 'mob-debug.html')), 'mob-debug.html exists');
  assert.match(inspectorHtml, /<title>Mob Inspector<\/title>/, 'and titles itself Mob Inspector');
});

// --- Mob Studio is fully removed ---------------------------------------------

test('the Mob Studio module and its tests are deleted', () => {
  for (const p of [
    'src/mobStudio.js',
    'tests/mobStudio.test.js',
    'tests/mobStudioAgent.test.js',
    'tests/mobStudioViewMode.test.js',
  ]) {
    assert.equal(existsSync(join(process.cwd(), p)), false, `${p} should be deleted`);
  }
});

test('no source file still imports or constructs Mob Studio', () => {
  const offenders = [];
  for (const [name, text] of [['index.html', html], ['src/main.js', mainJs]]) {
    if (/mobStudio|MobStudio|mob-studio/.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `these still reference Mob Studio: ${offenders.join(', ')}`);
});

test('the Mob Studio panel and its modals are gone from the markup', () => {
  for (const id of ['mob-parameter-panel', 'modal-save-mob', 'modal-open-mob',
    'btn-mob-studio-save', 'btn-mob-studio-open', 'btn-mob-test-attack',
    'mob-view-info', 'mob-showcase-status', 'btn-mob-open-inspector']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} should be gone`);
  }
});

test('the Mob Studio stylesheet rules are gone but Structure Studio keeps its own', () => {
  const css = read('src/style.css');
  for (const sel of ['.mob-parameter-panel', '.mob-view-info', '.mob-showcase-status',
    '.mc-btn-mob-studio', '.studio-btn-test', '.studio-btn-debug']) {
    assert.ok(!css.includes(sel), `${sel} should be removed`);
  }
  for (const sel of ['.studio-panel-header', '.studio-panel-body', '.studio-panel-footer',
    '.studio-btn-save', '.studio-btn-open']) {
    assert.ok(css.includes(sel), `${sel} is still used by Structure Studio`);
  }
});

// --- custom-mob creation is removed ------------------------------------------

test('the agent no longer offers the create_mob action', () => {
  assert.doesNotMatch(mainJs, /create_mob/, 'main.js is clean');
  const plans = read('src/agentPlans.js');
  assert.doesNotMatch(plans, /create_mob/, 'the validator no longer accepts it');
  const agent = read('src/worldAgent.js');
  assert.doesNotMatch(agent, /create_mob/, 'the agent no longer documents or dispatches it');
  assert.doesNotMatch(agent, /executeCreateMob/, 'and its executor is gone');
  assert.doesNotMatch(agent, /buildMobStudioContext/, 'as is the Studio prompt section');
});

test('the agent capability summary no longer promises mob design', () => {
  const caps = read('src/agentCapabilities.js');
  assert.doesNotMatch(caps, /Mob Studio/, 'the Studio is not offered');
  assert.doesNotMatch(caps, /design brand new ones/i, 'nor is designing new mobs');
  assert.match(caps, /summon/i, 'but summoning existing creatures is still offered');
});

test('the plan schema no longer advertises create_mob', () => {
  const agent = read('src/worldAgent.js');
  const schemaLine = agent.split('\n').find(l => l.includes('"action": "build"'));
  assert.ok(schemaLine, 'the schema action line exists');
  assert.doesNotMatch(schemaLine, /create_mob/, 'and omits create_mob');
});

// --- the Inspector owns the showcase now -------------------------------------

test('the Mob Inspector has a Showcase control', () => {
  assert.match(inspectorHtml, /id="showcase"/, 'a Run showcase button exists');
  assert.match(inspectorHtml, /id="showcase-stop"/, 'and a Stop button');
  assert.match(inspectorHtml, /id="showcase-status"/, 'with a status readout');
  assert.match(inspectorHtml, /id="showcase-results"/, 'and a results list');
});

test('the Inspector drives the scenario engine', () => {
  // The engine moved here when Mob Studio was removed; it must actually be wired up.
  assert.match(inspectorJs, /import \{ MobShowcase \} from '\.\/mobShowcase\.js'/, 'it imports the runner');
  assert.match(inspectorJs, /new MobShowcase\(session, ?onShowcaseReport\)/, 'it builds one against its own session');
  assert.match(inspectorJs, /showcase\.start\(selected\)/, 'and starts it for the selected mob');
  assert.match(inspectorJs, /showcase\.tick\(/, 'advancing it over time');
});

test('the Inspector ticks the showcase from its own render loop', () => {
  // The runner has a requestAnimationFrame fallback; driving it from the render loop instead
  // keeps the two from advancing the same mob at once.
  assert.match(inspectorJs, /function tickShowcase\(\)/, 'there is a tick helper');
  assert.match(inspectorJs, /if\(showcase\?\.running\)\{tickShowcase\(\);accumulator=0;\}/, 'the loop prefers the showcase');
  // And the plain world tick must not also run while the showcase is going.
  const loop = inspectorJs.slice(inspectorJs.indexOf('setAnimationLoop'));
  assert.match(loop, /else if\(!paused\)/, 'the normal tick is the else branch');
});

test('respawning or switching mob stops any running showcase', () => {
  // Otherwise the run would keep ticking a mob the session has already replaced.
  assert.match(inspectorJs, /stopShowcase\(\)/, 'the cancel path exists');
  assert.match(inspectorJs, /\$\('mob'\)\.onchange=\(\)=>\{stopShowcase\(\);reset\(\);\}/, 'changing mob stops it');
  assert.match(inspectorJs, /\$\('reset'\)\.onclick=\(\)=>\{stopShowcase\(\);reset\(\);\}/, 'and so does respawn');
});

test('the Inspector reports unimplemented scenarios without counting them as failures', () => {
  // The engine records those as 'unsupported'; the Inspector must score only the rest.
  assert.match(inspectorJs, /r\.status!=='unsupported'/, 'unsupported results are excluded');
  assert.match(inspectorJs, /not implemented yet/, 'and named as such');
});
