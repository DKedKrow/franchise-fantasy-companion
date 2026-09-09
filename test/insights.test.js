import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORING } from '../src/scoring.js';
import { buildFantasyRedZone, buildHeadToHeadHistory, buildNflPowerRankings, buildSeasonMagazine } from '../src/insights.js';

const teams = [{ index: 1, name: 'Giants', abbreviation: 'NYG' }, { index: 2, name: 'Cowboys', abbreviation: 'DAL' }];
const game = { year: 0, week: 0, weekType: 'RegularSeason', homeTeam: teams[0], awayTeam: teams[1], homeScore: 31, awayScore: 28, players: [
  { playerId: 1, teamIndex: 1, firstName: 'Star', lastName: 'Receiver', position: 'WR', stats: { DOWNSPLAYED: 50, RECEIVECATCHES: 10, RECEIVEYARDS: 150, RECEIVETDS: 2 } },
] };

test('builds weekly redzone and season magazine insights', () => {
  const redzone = buildFantasyRedZone([game], DEFAULT_SCORING);
  assert.equal(redzone.leaders[0].name, 'Star Receiver');
  assert.equal(redzone.closeGames.length, 1);
  const magazine = buildSeasonMagazine([game], DEFAULT_SCORING);
  assert.equal(magazine.seasonStar.name, 'Star Receiver');
});

test('builds NFL power rankings and head-to-head history', () => {
  assert.equal(buildNflPowerRankings([game], teams)[0].team.index, 1);
  const history = buildHeadToHeadHistory([game], 1);
  assert.equal(history[0].wins, 1);
  assert.equal(history[0].opponent.index, 2);
});
