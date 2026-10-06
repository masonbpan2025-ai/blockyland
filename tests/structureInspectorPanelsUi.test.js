// Panel rendering tests, run WITHOUT a DOM.
//
// The renderer takes its element lookup as a parameter precisely so this file needs no `document` stub. This
// repository has a documented history of partial `document` stubs leaking between tests
// (docs/test-determinism.md), and a renderer that demanded a document would have pushed this test into it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderStructurePanels } from '../src/structureInspectorPanelsUi.js';
import { createStructureInspectorSession } from '../src/structureInspectorSession.js';
import { BLOCKS } from '../src/blocks.js';

/** A fake element factory: records what the renderer wrote, with no DOM involved. */
function fakeDom(ids) {
  const elements = new Map(ids.map((id) => [id, { id, textContent: '' }]));
  const writes = [];
  return {
    $: (id) => {
      const element = elements.get(id) ?? null;
      if (element) writes.push(id);
      return element;
    },
    text: (id) => elements.get(id)?.textContent ?? null,
    elements,
    writes
  };
}

const PANEL_IDS = ['plan-summary', 'piece-graph', 'adaptation-info'];

function sessionFor(structure, { biome = 'plains', seed = 4242 } = {}) {
  const session = createStructureInspectorSession({ seed, structureId: structure, blockIds: BLOCKS });
  if (session.setBiome) session.setBiome(biome);
  if (session.setSurface) session.setSurface(70);
  return session;
}

test('the renderer needs an element lookup and says so', () => {
  assert.throws(() => renderStructurePanels({}, {}), /needs an element lookup/);
});

test('a missing element is skipped rather than throwing', () => {
  const session = sessionFor('igloo', { biome: 'snowy_plains' });
  // An empty page: every lookup returns null. The renderer must survive it, because the panels are optional
  // and a page that half-exists should still boot.
  const result = renderStructurePanels(session, { $: () => null });
  assert.equal(result.rendered, true);
});

test('the plan summary and piece graph are filled for a jigsaw structure', () => {
  const session = sessionFor('pillager_outpost');
  if (session.planNearest) session.planNearest();
  const dom = fakeDom(PANEL_IDS);
  renderStructurePanels(session, { $: dom.$, foundationBlock: BLOCKS.STONE });

  const summary = dom.text('plan-summary');
  assert.match(summary, /pillager_outpost/);
  assert.match(summary, /pieces \d+/);
  assert.match(summary, /hash \d+/, 'the hash is the value a reader compares against the golden file');

  const graph = dom.text('piece-graph');
  assert.match(graph, /piece\(s\)/, 'the graph must state its piece count');
  assert.match(graph, /connected/, 'and whether the structure is connected');
  assert.match(graph, /root/, 'and which piece is the root');
  assert.match(graph, /\|/, 'rows must be pipe-separated so a reader can scan them');
  // The tower must appear as a child of the root, which is the point of showing the graph at all.
  assert.match(graph, /watchtower/);
  assert.doesNotMatch(graph, /NOT CONNECTED/, 'a correct plan must not be reported as disconnected');
  assert.doesNotMatch(graph, /orphaned pieces/);
  assert.doesNotMatch(graph, /overlaps:/);

  // The adaptation panel must distinguish structure blocks from added terrain.
  const adaptation = dom.text('adaptation-info');
  assert.match(adaptation, /structure blocks \d+/);
  assert.match(adaptation, /total added \d+/);
});

test('an orphaned or overlapping plan is reported loudly, not rendered as fine', () => {
  const session = sessionFor('pillager_outpost');
  if (session.planNearest) session.planNearest();
  const plan = session.currentPlan();
  assert.ok(plan && plan.start, 'this test needs a plan to corrupt');

  // Break the plan the way a joining bug would: point a piece at a parent that is not in the plan.
  const victim = plan.start.pieces[1];
  const originalParent = victim.parentIndex;
  victim.parentIndex = 999999;
  const dom = fakeDom(PANEL_IDS);
  renderStructurePanels(session, { $: dom.$, foundationBlock: BLOCKS.STONE });
  const graph = dom.text('piece-graph');
  assert.match(graph, /orphaned pieces/, 'a piece whose parent is missing must be called out');
  assert.match(graph, /NOT CONNECTED/, 'and the structure must not be reported as connected');

  victim.parentIndex = originalParent;
});

test('with no plan the panels say so instead of showing an empty structure', () => {
  const session = createStructureInspectorSession({ seed: 1, structureId: 'igloo', blockIds: BLOCKS });
  const dom = fakeDom(PANEL_IDS);
  renderStructurePanels(session, { $: dom.$, foundationBlock: BLOCKS.STONE });
  assert.match(dom.text('plan-summary'), /no plan/);
  assert.match(dom.text('piece-graph'), /plan a structure/);
  // The adaptation panel must explain itself rather than showing zeroes that look like a flat world.
  assert.match(dom.text('adaptation-info'), /not shown|not applied/);
});

test('rendering twice is idempotent, so a refresh does not accumulate output', () => {
  const session = sessionFor('igloo', { biome: 'snowy_plains' });
  if (session.planNearest) session.planNearest();
  const dom = fakeDom(PANEL_IDS);
  renderStructurePanels(session, { $: dom.$, foundationBlock: BLOCKS.STONE });
  const first = PANEL_IDS.map((id) => dom.text(id)).join('||');
  renderStructurePanels(session, { $: dom.$, foundationBlock: BLOCKS.STONE });
  const second = PANEL_IDS.map((id) => dom.text(id)).join('||');
  assert.equal(second, first, 'the renderer must assign text, never append');
});
