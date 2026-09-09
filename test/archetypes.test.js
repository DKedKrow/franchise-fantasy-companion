import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYSTYLE_ARCHETYPES, archetypeDraftValue, archetypeLineupValue, getArchetype } from '../src/archetypes.js';

const receiver = { key: 'wr', position: 'WR', total: 200, games: 10, high: 40, team: { abbreviation: 'TKY' }, ratings: { OverallRating: 90, Age: 24, TraitDevelopment: 'College_Star' }, profile: { aggregate: {}, consistencyScore: 80 }, logs: [{ week: 0, weekType: 'RegularSeason', points: 10 }, { week: 1, weekType: 'RegularSeason', points: 30 }] };
const runner = { ...receiver, key: 'hb', position: 'HB', profile: { aggregate: { RUSHYARDS: 1200, RECEIVECATCHES: 45 }, consistencyScore: 80 } };

test('provides a large valid archetype library with complete rosters', () => {
  assert.ok(PLAYSTYLE_ARCHETYPES.length >= 16);
  for (const archetype of PLAYSTYLE_ARCHETYPES) {
    assert.equal(archetype.plan.length, 15);
    assert.equal(archetype.plan.filter((position) => position === 'QB').length, 2);
    assert.equal(archetype.plan.filter((position) => position === 'HB').length, 4);
    assert.equal(archetype.plan.filter((position) => position === 'WR').length, 5);
  }
});

test('archetypes materially alter draft and lineup preferences', () => {
  assert.ok(archetypeDraftValue(runner, 'ground_pound') > archetypeDraftValue(runner, 'air_raid'));
  assert.ok(archetypeDraftValue(receiver, 'homer', { favoriteTeam: 'TKY' }) > archetypeDraftValue(receiver, 'homer', { favoriteTeam: 'DAL' }));
  assert.ok(archetypeLineupValue(receiver, 'boom_bust', { week: 2, weekType: 'RegularSeason' }) > archetypeLineupValue(receiver, 'safe_floor', { week: 2, weekType: 'RegularSeason' }));
  assert.equal(getArchetype('te_premium').name, 'TE Premium');
});
