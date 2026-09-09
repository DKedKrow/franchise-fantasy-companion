import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_PERSONALITIES, buildWorldStorylines, createFantasyWorld, generateLeagueChat, generateWorldFeed, joinFantasyWorld, observeFantasyWorld, updateWorldContinuity, upgradeFantasyWorld } from '../src/world.js';

const positions = ['QB', 'QB', 'HB', 'HB', 'HB', 'HB', 'WR', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE', 'K', 'DST'];
const players = Array.from({ length: 8 }, (_, group) => positions.map((position, index) => ({
  key: `${position}-${group}-${index}`, name: `${position} Player ${group}-${index}`, position,
  team: { abbreviation: 'TKY' }, ratings: { OverallRating: 99 - group }, games: 1, total: 30 - index,
  logs: [{ week: 0, weekType: 'RegularSeason', points: 30 - index }],
}))).flat();
const weeks = [{ week: 0, weekType: 'RegularSeason' }];

test('creates a populated observer world with distinct leagues', () => {
  const world = createFantasyWorld({ name: 'Test World', seasonYear: 1, leagueCount: 3, players });
  assert.equal(world.mode, 'observe');
  assert.equal(world.leagues.length, 3);
  assert.equal(world.leagues.flatMap((league) => league.managers).length, 24);
  assert.notDeepEqual(world.leagues[0].league.teams[0].roster, world.leagues[1].league.teams[0].roster);
});

test('generates social reactions and lets an observer participate', () => {
  const world = createFantasyWorld({ name: 'Test World', seasonYear: 1, leagueCount: 1, players });
  const feed = generateWorldFeed(world, players, weeks);
  assert.ok(feed.filter((post) => post.type === 'fantasy').length >= 5);
  assert.ok(feed.filter((post) => post.type === 'player').length >= 1);
  assert.ok(feed.every((post) => post.comments.length > 0));
  joinFantasyWorld(world, 'Coach D');
  assert.equal(world.mode, 'participate');
  assert.equal(world.leagues[0].managers[0].displayName, 'Coach D');
  observeFantasyWorld(world);
  assert.equal(world.mode, 'observe');
  assert.equal(world.leagues[0].managers[0].displayName, 'Maya Chen');
});

test('lets the user take over a chosen team in any world league', () => {
  const world = createFantasyWorld({ name: 'Test World', seasonYear: 1, leagueCount: 3, players });
  const chosen = world.leagues[1].managers[3];
  joinFantasyWorld(world, 'Coach D', chosen.id);
  assert.equal(world.userManagerId, chosen.id);
  assert.equal(world.leagues[1].league.userTeamId, chosen.teamId);
  assert.equal(chosen.displayName, 'Coach D');
});

test('upgrades an existing world with varied voices, bios and rivalries', () => {
  const world = createFantasyWorld({ name: 'Old World', seasonYear: 1, leagueCount: 3, players });
  world.leagues.flatMap((entry) => entry.managers).forEach((manager) => {
    manager.personality = 'Stathead'; delete manager.bio; delete manager.rivalId;
  });
  upgradeFantasyWorld(world);
  const managers = world.leagues.flatMap((entry) => entry.managers);
  assert.ok(new Set(managers.map((manager) => manager.personality)).size >= WORLD_PERSONALITIES.length);
  assert.ok(managers.every((manager) => manager.bio && manager.rivalId));
});

test('gives world leagues varied formats, storylines, chats, and manager reputations', () => {
  const world = createFantasyWorld({ name: 'Living World', seasonYear: 1, leagueCount: 5, players });
  assert.ok(new Set(world.leagues.map((entry) => entry.league.settings.waiverType)).size >= 3);
  assert.ok(new Set(world.leagues.map((entry) => entry.league.settings.draftType)).size >= 3);
  const stories = buildWorldStorylines(world, players, weeks);
  const chats = generateLeagueChat(world, 0);
  assert.ok(stories.length >= world.leagues.length);
  assert.equal(chats.length, world.leagues.length);
  assert.ok(world.leagues.flatMap((entry) => entry.managers).every((manager) => manager.reputation));
  assert.ok(generateWorldFeed(world, players, weeks).some((post) => post.author.includes('Group Chat')));
});

test('keeps persistent manager moods, memories, and relationships', () => {
  const world = createFantasyWorld({ name: 'Memory World', seasonYear: 1, leagueCount: 1, players });
  updateWorldContinuity(world, players, weeks);
  const managers = world.leagues[0].managers;
  assert.ok(managers.every((manager) => manager.mood && manager.memories.length === 1));
  assert.ok(managers.every((manager) => Object.hasOwn(manager.relationships, manager.rivalId)));
  updateWorldContinuity(world, players, weeks);
  assert.ok(managers.every((manager) => manager.memories.length === 1));
});
