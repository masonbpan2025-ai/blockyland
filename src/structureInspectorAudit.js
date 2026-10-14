// Inspector view of the structure audit: the Audit panel, the Entities list, the world-height gauge and the
// "audit all structures" table.
//
// Pure view-models first (testable in Node), then a thin renderer that writes them into the page. The decisions
// live in `structureAudit.js`; this file only says how to show them.

import { auditStructure, auditAllStructures, WORLD_HEIGHT } from './structureAudit.js';

const SYMBOL = { pass: '✓', fail: '✗', waived: '≈', unchecked: '?' };
const LAYER_NAME = {
  L1: 'placement', L2: 'layout', L3: 'content', L4: 'game', L5: 'visual', L6: 'saves'
};

/** The audit result as rows the page can draw, failures first. */
export function auditView(result) {
  const order = { fail: 0, unchecked: 1, waived: 2, pass: 3 };
  const rows = [...result.rows].sort((a, b) => (order[a.status] - order[b.status]) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const { pass, fail, waived, unchecked } = result.summary;
  const checkable = pass + fail;
  return {
    structureId: result.structureId,
    mode: result.mode,
    title: result.card ? result.card.title : result.structureId,
    wiki: result.card ? result.card.wiki : null,
    hasCard: Boolean(result.card),
    headline: `${pass} pass, ${fail} fail, ${waived} waived, ${unchecked} unchecked`
      + (checkable ? `  (${Math.round((100 * pass) / checkable)}% of checked facts)` : ''),
    verdict: fail > 0 ? 'fail' : unchecked > 0 ? 'incomplete' : 'pass',
    rows: rows.map((row) => ({
      ...row, symbol: SYMBOL[row.status], layerName: LAYER_NAME[row.layer] ?? row.layer
    })),
    summary: result.summary
  };
}

/** The mobs the structure asks for, grouped by type with positions. */
export function entitiesView(observation) {
  if (!observation || !observation.found) return { available: false, reason: 'plan a structure first', groups: [], total: 0 };
  const groups = new Map();
  for (const spawn of observation.spawns) {
    const group = groups.get(spawn.type) ?? { type: spawn.type, count: 0, persistent: 0, variants: new Set(), positions: [] };
    group.count++;
    if (spawn.options?.persistent) group.persistent++;
    if (spawn.options?.variant) group.variants.add(spawn.options.variant);
    group.positions.push([Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)]);
    groups.set(spawn.type, group);
  }
  const delivered = observation.integration ? observation.integration.recorder.mobs.length : null;
  return {
    available: true,
    total: observation.spawns.length,
    delivered,
    groups: [...groups.values()].map((group) => ({ ...group, variants: [...group.variants] }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
  };
}

/** Where the structure sits against the game's 0..63 world, and how much of it is clipped. */
export function heightView(observation) {
  if (!observation || !observation.found || !observation.stats || observation.stats.minY === null) return { available: false };
  const { minY, maxY, clipped, blocks, fitPercent } = observation.stats;
  const low = Math.min(minY, 0) - 4;
  const high = Math.max(maxY, WORLD_HEIGHT - 1) + 4;
  const span = high - low;
  const pct = (y) => Math.round(((y - low) / span) * 1000) / 10;
  return {
    available: true,
    worldMin: 0,
    worldMax: WORLD_HEIGHT - 1,
    minY,
    maxY,
    clipped,
    blocks,
    fitPercent,
    // Percentages along a vertical scale from `low` to `high`, bottom to top, for the page's CSS bar.
    scale: { low, high },
    world: { from: pct(0), to: pct(WORLD_HEIGHT - 1) },
    structure: { from: pct(minY), to: pct(maxY) },
    label: `structure Y ${minY}..${maxY}; world 0..${WORLD_HEIGHT - 1}; ${clipped} of ${blocks} blocks clipped (${fitPercent}% fit)`
  };
}

/** One row per structure for the "audit all" table. */
export function auditAllView(results) {
  return results.map((entry) => ({
    structureId: entry.structureId,
    implemented: entry.implemented,
    summary: entry.summary,
    failing: entry.rows ? entry.rows.filter((row) => row.status === 'fail').map((row) => row.id) : [],
    cardFacts: entry.cardFacts ?? 0,
    verdict: !entry.implemented ? 'no generator'
      : entry.summary.fail > 0 ? 'fail'
        : entry.summary.unchecked > 0 ? 'incomplete' : 'pass'
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering.

function cell(text, className = '') {
  const td = document.createElement('td');
  td.textContent = String(text);
  if (className) td.className = className;
  return td;
}

/** Run the audit for the session's current structure and draw it. */
export async function runAuditAndRender(session, $, mode = 'flat') {
  const status = $('audit-summary');
  status.textContent = `auditing ${session.state.structureId} (${mode})...`;
  try {
    const result = await auditStructure(session.state.structureId, {
      seed: session.state.seed, mode, biome: session.world.biome
    });
    renderAudit(result, $);
    return result;
  } catch (error) {
    status.textContent = `audit failed: ${error.message}`;
    return null;
  }
}

export function renderAudit(result, $) {
  const view = auditView(result);
  const summary = $('audit-summary');
  summary.className = `audit-${view.verdict}`;
  summary.textContent = `${view.title} [${view.mode}] ${view.headline}${view.hasCard ? '' : '  (universal facts only: no spec card yet)'}`;

  const table = $('audit-table');
  table.replaceChildren();
  for (const row of view.rows) {
    const tr = document.createElement('tr');
    tr.className = `fact-${row.status}`;
    tr.title = `${row.source}\n${row.detail}`;
    tr.append(cell(row.symbol, 'sym'), cell(row.id), cell(row.layerName), cell(`${row.text}${row.detail ? ` — ${row.detail}` : ''}`));
    table.append(tr);
  }

  const entities = entitiesView(result.observation);
  const list = $('entities-info');
  list.replaceChildren();
  if (!entities.available) {
    list.textContent = entities.reason;
  } else if (entities.total === 0) {
    list.textContent = 'this structure requests no mobs';
  } else {
    const head = document.createElement('div');
    head.textContent = `${entities.total} requested${entities.delivered === null ? '' : `, ${entities.delivered} delivered to the game`}`;
    list.append(head);
    for (const group of entities.groups) {
      const line = document.createElement('div');
      line.textContent = `${group.type} × ${group.count}${group.persistent ? ` (${group.persistent} persistent)` : ''}${group.variants.length ? ` [${group.variants.join(', ')}]` : ''}`;
      line.title = group.positions.map((p) => p.join(',')).join('  ');
      list.append(line);
    }
  }

  const height = heightView(result.observation);
  const gauge = $('height-gauge');
  gauge.replaceChildren();
  if (!height.available) {
    gauge.textContent = 'no blocks to measure';
  } else {
    const bar = document.createElement('div');
    bar.className = 'gauge';
    const world = document.createElement('div');
    world.className = 'gauge-world';
    world.style.bottom = `${height.world.from}%`;
    world.style.height = `${height.world.to - height.world.from}%`;
    const structure = document.createElement('div');
    structure.className = `gauge-structure${height.clipped ? ' clipped' : ''}`;
    structure.style.bottom = `${height.structure.from}%`;
    structure.style.height = `${Math.max(1, height.structure.to - height.structure.from)}%`;
    bar.append(world, structure);
    const label = document.createElement('div');
    label.textContent = height.label;
    gauge.append(bar, label);
  }
}

/** Run the universal audit over every structure and draw the table. */
export async function runAuditAllAndRender(session, $, mode = 'flat') {
  const target = $('audit-all');
  target.textContent = `auditing every structure (${mode})...`;
  const results = await auditAllStructures({ mode, seed: session.state.seed });
  const rows = auditAllView(results);
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const label of ['structure', 'verdict', 'pass', 'fail', '?', 'failing facts']) {
    const th = document.createElement('th');
    th.textContent = label;
    head.append(th);
  }
  table.append(head);
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = `verdict-${row.verdict.replace(' ', '-')}`;
    tr.append(
      cell(row.structureId), cell(row.verdict),
      cell(row.summary ? row.summary.pass : '—'), cell(row.summary ? row.summary.fail : '—'),
      cell(row.summary ? row.summary.unchecked : '—'), cell(row.failing.join(', '))
    );
    tr.onclick = () => { try { session.setStructure(row.structureId); } catch (error) { /* picker syncs on next refresh */ } };
    table.append(tr);
  }
  target.replaceChildren(table);
  return rows;
}
