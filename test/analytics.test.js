import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTeamGames } from '../src/analytics.js';

const game = {
  gameId: 1,
  year: 1,
  week: 0,
  weekType: 'RegularSeason',
  homeScore: 31,
  awayScore: 20,
  homeTeam: { index: 15, abbreviation: 'TKY' },
  awayTeam: { index: 4, abbreviation: 'DAL' },
  players: [
    { playerId: 1, teamIndex: 15, firstName: 'Jaxson', lastName: 'Dart', position: 'QB', stats: { PASSATTEMPTS: 30, PASSCOMPLETED: 20, PASSYARDS: 300, PASSTDS: 3, PASSINTS: 1, RUSHATTEMPTS: 5, RUSHYARDS: 30 } },
    { playerId: 2, teamIndex: 15, firstName: 'Malik', lastName: 'Nabers', position: 'WR', stats: { RECEIVECATCHES: 12, RECEIVEYARDS: 200, RECEIVETDS: 2, RECEIVEYARDSAFTER: 60 } },
    { playerId: 3, teamIndex: 15, firstName: 'Theo', lastName: 'Johnson', position: 'TE', stats: { RECEIVECATCHES: 8, RECEIVEYARDS: 100, RECEIVETDS: 1, RECEIVEDROPS: 1 } },
    { playerId: 4, teamIndex: 15, firstName: 'Cam', lastName: 'Skattebo', position: 'HB', stats: { RUSHATTEMPTS: 15, RUSHYARDS: 80 } },
    { playerId: 5, teamIndex: 4, firstName: 'Other', lastName: 'Player', position: 'WR', stats: { RECEIVECATCHES: 15, RECEIVEYARDS: 250 } },
  ],
};

test('builds passing distribution and excludes the opponent', () => {
  const analysis = analyzeTeamGames([game], 15);
  assert.equal(analysis.totals.receptions, 20);
  assert.equal(analysis.totals.receivingYards, 300);
  assert.equal(analysis.receivers[0].name, 'Malik Nabers');
  assert.equal(analysis.receivers[0].receptionShare, 0.6);
  assert.equal(analysis.positions.find((row) => row.position === 'TE').touchdowns, 1);
});

test('calculates play balance and weekly concentration', () => {
  const analysis = analyzeTeamGames([game], 15);
  assert.equal(analysis.totals.passAttempts, 30);
  assert.equal(analysis.totals.rushAttempts, 20);
  assert.equal(analysis.totals.passRate, 0.6);
  assert.equal(analysis.weekly[0].topTwoShare, 1);
  assert.equal(analysis.weekly[0].result, 'W 31–20');
});
