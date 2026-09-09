import test from 'node:test';
import assert from 'node:assert/strict';
import { NFL_DEFENSIVE_ARCHETYPES, NFL_OFFENSIVE_ARCHETYPES, buildNflTeamStyles } from '../src/team-styles.js';

const team = { index: 1, name: 'Giants', abbreviation: 'NYG' };
const opponent = { index: 2, name: 'Cowboys', abbreviation: 'DAL' };
const game = { homeTeam: team, awayTeam: opponent, homeScore: 31, awayScore: 17, players: [
  { playerId: 1, teamIndex: 1, position: 'QB', stats: { PASSATTEMPTS: 40, PASSCOMPLETED: 30, PASSYARDS: 340, PASSTDS: 3, RUSHATTEMPTS: 8, RUSHYARDS: 70 } },
  { playerId: 2, teamIndex: 1, position: 'WR', stats: { RECEIVECATCHES: 12, RECEIVEYARDS: 180, RECEIVEYARDSAFTER: 70 } },
  { playerId: 3, teamIndex: 1, position: 'LE', stats: { DLINESACKS: 3, DEFTACKLESFORLOSS: 4 } },
  { playerId: 4, teamIndex: 2, position: 'QB', stats: { PASSATTEMPTS: 32, PASSYARDS: 210 } },
  { playerId: 5, teamIndex: 2, position: 'HB', stats: { RUSHATTEMPTS: 18, RUSHYARDS: 72 } },
] };

test('offers deep NFL offense and defense archetype libraries', () => {
  assert.ok(NFL_OFFENSIVE_ARCHETYPES.length >= 24);
  assert.ok(NFL_DEFENSIVE_ARCHETYPES.length >= 20);
});

test('builds multiple evidence-based identities for an NFL team', () => {
  const [profile] = buildNflTeamStyles([game], [team]);
  assert.equal(profile.offense.length, 3);
  assert.equal(profile.defense.length, 3);
  assert.equal(profile.metrics.games, 1);
  assert.ok(profile.metrics.passYpg > 300);
  assert.ok(profile.metrics.sacksPg >= 3);
});
