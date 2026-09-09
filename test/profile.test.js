import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlayerProfile } from '../src/profile.js';

test('summarizes player production shares and highs', () => {
  const profile = summarizePlayerProfile([
    { points: 20, stats: { RECEIVECATCHES: 8, RECEIVEYARDS: 120 }, teamStats: { receptions: 20, receivingYards: 300 } },
    { points: 10, stats: { RECEIVECATCHES: 4, RECEIVEYARDS: 60 }, teamStats: { receptions: 20, receivingYards: 300 } },
  ]);
  assert.equal(profile.aggregate.RECEIVECATCHES, 12);
  assert.equal(profile.shares.receptions, 0.3);
  assert.equal(profile.shares.receivingYards, 0.3);
  assert.equal(profile.highLog.points, 20);
  assert.equal(profile.consistencyScore, 83);
  assert.equal(profile.consistencyLabel, 'Steady');
});
