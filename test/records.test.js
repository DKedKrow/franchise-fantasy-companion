import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCORING } from '../src/scoring.js';
import { buildRecordBook, buildTeamRecaps, buildWeeklyAwards } from '../src/records.js';

const game = {
  gameId: 7, year: 1, week: 8, weekType: 'RegularSeason', homeScore: 42, awayScore: 35,
  homeTeam: { index: 15, name: 'Sentinels', abbreviation: 'TKY' },
  awayTeam: { index: 4, name: 'Cowboys', abbreviation: 'DAL' },
  players: [
    { playerId: 1, teamIndex: 15, firstName: 'Jaxson', lastName: 'Dart', position: 'QB', stats: { DOWNSPLAYED: 60, PASSATTEMPTS: 35, PASSCOMPLETED: 24, PASSYARDS: 350, PASSTDS: 4, PASSINTS: 1 } },
    { playerId: 2, teamIndex: 15, firstName: 'Malik', lastName: 'Nabers', position: 'WR', stats: { DOWNSPLAYED: 55, RECEIVECATCHES: 12, RECEIVEYARDS: 220, RECEIVETDS: 3 } },
    { playerId: 3, teamIndex: 15, firstName: 'Cam', lastName: 'Skattebo', position: 'HB', stats: { DOWNSPLAYED: 45, RUSHATTEMPTS: 20, RUSHYARDS: 110, RUSHTDS: 1 } },
    { playerId: 4, teamIndex: 4, firstName: 'Dak', lastName: 'Prescott', position: 'QB', stats: { DOWNSPLAYED: 60, PASSATTEMPTS: 40, PASSCOMPLETED: 30, PASSYARDS: 400, PASSTDS: 3 } },
  ],
};

test('builds single-game and season records', () => {
  const book = buildRecordBook([game], DEFAULT_SCORING);
  assert.equal(book.categories.find((item) => item.label === 'Receiving yards').holder, 'Malik Nabers');
  assert.equal(book.categories.find((item) => item.label === 'Team points').display, '42 pts');
  assert.equal(book.categories.find((item) => item.label === 'Largest win').display, '7 pts');
  assert.equal(book.seasonLeaders[0].name, 'Malik Nabers');
});

test('selects weekly award winners and writes team recaps', () => {
  const awards = buildWeeklyAwards([game], DEFAULT_SCORING);
  assert.equal(awards[0].playmaker.name, 'Malik Nabers');
  const recaps = buildTeamRecaps([game], 15, DEFAULT_SCORING);
  assert.match(recaps[0].recap, /Sentinels defeated Cowboys 42–35/);
  assert.equal(recaps[0].gameBall.name, 'Malik Nabers');
});

test('scopes records and awards to a selected team', () => {
  const book = buildRecordBook([game], DEFAULT_SCORING, 15);
  assert.equal(book.categories.find((item) => item.label === 'Passing yards').holder, 'Jaxson Dart');
  const awards = buildWeeklyAwards([game], DEFAULT_SCORING, 15);
  assert.equal(awards[0].quarterback.name, 'Jaxson Dart');
  assert.equal(awards[0].overall.team.index, 15);
});

test('builds one winner-perspective recap per game for the all-teams view', () => {
  const recaps = buildTeamRecaps([game], null, DEFAULT_SCORING);
  assert.equal(recaps.length, 1);
  assert.equal(recaps[0].team.index, 15);
  assert.match(recaps[0].recap, /Sentinels defeated Cowboys 42–35/);
});
