import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeepArcsweepPacket,
  deriveHorizonSignal,
  normaliseDeepVisual,
  validateDeepArcsweepPacket,
} from '../deep-spine-contract.mjs';
import { formatYggdrasilDeepContext } from '../yggdrasil-deep-context.mjs';

const worldAnchor = {
  slug: 'terra-aeterna',
  name: 'Terra Aeterna / Hearthweave',
  notion_page_id: 'notion-1',
  notion_url: 'https://app.notion.com/p/notion-1',
  route: '/arkfire.html?profile=terra-aeterna',
  runa_profile: 'docs/profiles/arkfire/terra-aeterna.v0.2.json',
  status: 'calibration',
};

test('derives the inspectable DEEP horizon synthesis', () => {
  const H = deriveHorizonSignal({ C: 0.8, E: 0.2, R: 0.7, A: 0.6, bz: -10, kp: 4.5, charge: 0.3, pulse: 0.2 });
  assert.equal(H, 0.673);
});

test('does not invent H when required DEEP variables are missing', () => {
  const deep = normaliseDeepVisual({ C: 0.8, R: 0.7 });
  assert.equal(deep.values.H, null);
  assert.equal(deep.completeness, 'partial');
  assert.ok(deep.missing.includes('E'));
});

test('keeps visual, science, mathematical, and canon registers separate', () => {
  const packet = buildDeepArcsweepPacket({
    worldAnchor,
    deep: { P: 0.7, C: 0.8, R: 0.7, E: 0.2, M: 0.6, A: 0.6, charge: 0.3, source: 'test' },
    environmentReading: { premaq: { pulse: 0.6, coherence: 0.8 }, jspace: { state: [0, 1, 0], claimLabel: 'speculative-theory' } },
    mathematicalAnalysis: { determinant: -2, physicalFoldProbability: null },
    sourceRefs: ['observer:test'],
  });

  assert.equal(packet.deep.register, 'VISUAL_SYNTHESIS');
  assert.equal(packet.scienceSpine.premaq.register, 'PHYSICS_MODEL');
  assert.equal(packet.scienceSpine.jspace.register, 'SPECULATIVE_MODEL');
  assert.equal(packet.scienceSpine.fold.register, 'MATHEMATICAL_DERIVATION');
  assert.equal(packet.worldAnchor.authority, 'notion-living-canon');
  assert.ok(packet.yggdrasil.forbiddenUses.includes('upgrade-interpretation-to-measurement'));
  assert.equal(validateDeepArcsweepPacket(packet).valid, true);
});

test('requires a resolved Notion world authority', () => {
  assert.throws(() => buildDeepArcsweepPacket({ worldAnchor: { slug: 'orphan' } }), /Notion URL/);
});

test('formats a named operational packet for Yggdrasil', () => {
  const packet = buildDeepArcsweepPacket({ worldAnchor, deep: { P: 0.5, C: 0.5, R: 0.5, E: 0.5, M: 0.5, A: 0.5 } });
  const context = formatYggdrasilDeepContext(packet);
  assert.match(context, /Operational Context: DEEP × Arcsweep Science Spine/);
  assert.match(context, /Do not turn mathematical derivation into physical proof/);
  assert.match(context, /Notion authority/);
});
