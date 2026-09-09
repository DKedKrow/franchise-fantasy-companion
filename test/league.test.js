import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINEUP_SLOTS, bestLineup, createFantasyLeague, lineupForTeam, roundRobinPairings,
  advanceAiDraft, currentDraftTeam, draftNeeds, makeUserDraftPick, saveManualLineup,
  scoreFantasyLeague, startFantasyDraft, availableFantasyPlayers, buildPlayoffPicture,
  buildWeeklyProjections, makeUserAuctionBid, processWaivers, projectPlayer, proposeTrade,
  submitWaiverClaim, upgradeFantasyLeague, carryFantasyLeagueForward,
} from '../src/league.js';

function player(key, position, overall, points) {
  return { key, name: key, position, ratings: { OverallRating: overall }, games: 1, total: points, logs: [{ week: 0, weekType: 'RegularSeason', points }] };
}

const positions = ['QB', 'QB', 'HB', 'HB', 'HB', 'HB', 'WR', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE', 'K', 'DST'];
const pool = Array.from({ length: 4 }, (_, team) => positions.map((position, index) => player(`${position}-${team}-${index}`, position, 99 - team, 30 - index))).flat();

test('creates a balanced snake-drafted fantasy league', () => {
  const league = createFantasyLeague({ name: 'Test League', teamCount: 4, seasonYear: 1, players: pool });
  assert.equal(league.teams.length, 4);
  assert.equal(league.teams[0].roster.length, 15);
  for (const team of league.teams) {
    assert.equal(team.roster.filter((key) => key.startsWith('DST')).length, 1);
    assert.equal(team.roster.filter((key) => key.startsWith('QB')).length, 2);
  }
});

test('sets a valid best-ball lineup and round-robin schedule', () => {
  const league = createFantasyLeague({ name: 'Test League', teamCount: 4, seasonYear: 1, players: pool });
  const playersByKey = new Map(pool.map((entry) => [entry.key, entry]));
  const lineup = bestLineup(league.teams[0], playersByKey, { week: 0, weekType: 'RegularSeason' });
  assert.equal(lineup.entries.length, 9);
  assert.equal(new Set(lineup.entries.map((entry) => entry.player.key)).size, 9);
  assert.equal(roundRobinPairings(league.teams.map((team) => team.id), 0).length, 2);
  const scored = scoreFantasyLeague(league, pool, [{ week: 0, weekType: 'RegularSeason' }]);
  assert.equal(scored.standings.reduce((sum, standing) => sum + standing.wins, 0), 2);
});

test('saves a user lineup and uses it instead of the archetype lineup', () => {
  const roster = pool.slice(0, 15);
  const team = { id: 'mine', name: 'My Team', archetype: 'balanced', roster: roster.map((entry) => entry.key) };
  const playersByKey = new Map(pool.map((entry) => [entry.key, entry]));
  const week = { week: 0, weekType: 'RegularSeason' };
  const choices = {
    QB: 'QB-0-1', RB1: 'HB-0-2', RB2: 'HB-0-3', WR1: 'WR-0-6', WR2: 'WR-0-7',
    TE: 'TE-0-11', FLEX: 'WR-0-8', K: 'K-0-13', DST: 'DST-0-14',
  };
  saveManualLineup(team, week, choices, playersByKey);
  const lineup = lineupForTeam(team, playersByKey, week);
  assert.equal(lineup.source, 'manual');
  assert.equal(lineup.entries.length, LINEUP_SLOTS.length);
  assert.equal(lineup.entries[0].player.key, 'QB-0-1');
  assert.throws(() => saveManualLineup(team, week, { ...choices, RB2: choices.RB1 }, playersByKey), /eligible, unique/);
});

test('runs a resumable snake draft with user picks against archetype AI', () => {
  const league = startFantasyDraft({ name: 'Live Draft', teamCount: 4, seasonYear: 1, players: pool, userSlot: 3 });
  advanceAiDraft(league, pool);
  assert.equal(currentDraftTeam(league).id, league.userTeamId);
  const playersByKey = new Map(pool.map((entry) => [entry.key, entry]));
  while (league.draft.status === 'active') {
    const user = currentDraftTeam(league);
    assert.equal(user.id, league.userTeamId);
    const needs = draftNeeds(user, playersByKey);
    const choice = league.draft.available.map((key) => playersByKey.get(key))
      .find((entry) => needs[entry.position === 'FB' ? 'HB' : entry.position] > 0);
    makeUserDraftPick(league, choice.key, pool);
  }
  assert.equal(league.teams.every((team) => team.roster.length === 15), true);
  assert.equal(league.draft.log.length, 60);
  assert.deepEqual(draftNeeds(league.teams.find((team) => team.id === league.userTeamId), playersByKey), { QB: 0, HB: 0, WR: 0, TE: 0, K: 0, DST: 0 });
});

test('keeps auction and FAAB optional through league settings', () => {
  const league = startFantasyDraft({ name: 'Auction', teamCount: 2, seasonYear: 1, players: pool, userSlot: 1, settings: { draftType: 'auction', waiverType: 'faab', faabBudget: 150 } });
  assert.equal(league.settings.draftType, 'auction');
  assert.equal(league.settings.waiverType, 'faab');
  assert.equal(league.teams[0].faabRemaining, 150);
  advanceAiDraft(league, pool);
  while (league.draft.status === 'active') {
    const team = currentDraftTeam(league);
    if (team.id !== league.userTeamId) { advanceAiDraft(league, pool); continue; }
    const playersByKey = new Map(pool.map((entry) => [entry.key, entry]));
    const needs = draftNeeds(team, playersByKey);
    const choice = league.draft.available.map((key) => playersByKey.get(key)).find((entry) => needs[entry.position] > 0);
    makeUserAuctionBid(league, choice.key, 1, pool);
  }
  assert.equal(league.teams.every((team) => team.roster.length === 15), true);
  assert.ok(league.draft.log.some((pick) => pick.price));
});

test('normalizes optional draft clock settings', () => {
  const league = startFantasyDraft({ name: 'Timed', teamCount: 4, seasonYear: 1, players: pool, settings: { draftTimer: 30 } });
  assert.equal(league.settings.draftTimer, 30);
  const fallback = startFantasyDraft({ name: 'Fallback', teamCount: 4, seasonYear: 1, players: pool, settings: { draftTimer: 45 } });
  assert.equal(fallback.settings.draftTimer, 60);
});

test('processes FAAB waivers and records transactions', () => {
  const expandedPool = [...pool, player('WR-free-agent', 'WR', 88, 28)];
  const league = createFantasyLeague({ name: 'FAAB', teamCount: 4, seasonYear: 1, players: pool, settings: { waiverType: 'faab', faabBudget: 100 } });
  const team = league.teams[0];
  const drop = team.roster.find((key) => key.startsWith('WR'));
  submitWaiverClaim(league, { teamId: team.id, addPlayerKey: 'WR-free-agent', dropPlayerKey: drop, bid: 17, week: 1 });
  const processed = processWaivers(league, expandedPool, [{ week: 0, weekType: 'RegularSeason' }]);
  assert.equal(processed.length, 1);
  assert.equal(team.faabRemaining, 83);
  assert.ok(team.roster.includes('WR-free-agent'));
  assert.equal(league.transactions[0].type, 'waiver');
});

test('builds projections, playoff seeds, trades, and upgrades old saves', () => {
  const league = createFantasyLeague({ name: 'Full Season', teamCount: 4, seasonYear: 1, players: pool });
  const week = { week: 1, weekType: 'RegularSeason' };
  assert.ok(projectPlayer(pool[0]).projection > 0);
  assert.equal(buildWeeklyProjections(league, pool, week).length, 4);
  assert.equal(buildPlayoffPicture(league, pool, [week]).seeds.length, 4);
  const first = league.teams[0]; const second = league.teams[1];
  const offered = pool.find((entry) => entry.key === first.roster[0]);
  const requested = second.roster.find((key) => pool.find((entry) => entry.key === key)?.position === offered.position);
  const result = proposeTrade(league, pool, { fromTeamId: first.id, toTeamId: second.id, offerPlayerKey: first.roster[0], requestPlayerKey: requested, week: 1 });
  assert.equal(typeof result.accepted, 'boolean');
  const old = { schemaVersion: 1, name: 'Old', seasonYear: 1, teams: league.teams.map((team) => ({ ...team })) };
  upgradeFantasyLeague(old);
  assert.equal(old.schemaVersion, 2);
  assert.equal(old.settings.waiverType, 'rolling');
  assert.ok(Array.isArray(availableFantasyPlayers(league, pool)));
});

test('carries keeper and dynasty leagues into a new season', () => {
  const previous = createFantasyLeague({ name: 'Keep It', teamCount: 4, seasonYear: 1, players: pool, settings: { keeperMode: 'keeper' } });
  previous.history.push({ seasonYear: 1, champion: previous.teams[0].name, bestRecord: '10-4' });
  const favorite = previous.teams[0].roster[0];
  const next = carryFantasyLeagueForward(previous, { seasonYear: 2, players: pool, keeperCount: 3 });
  assert.equal(next.seasonYear, 2);
  assert.equal(next.history.length, 1);
  assert.equal(next.teams.every((team) => team.roster.length === 15), true);
  assert.ok(next.teams[0].roster.includes(favorite));
  assert.equal(new Set(next.teams.flatMap((team) => team.roster)).size, 60);
});
