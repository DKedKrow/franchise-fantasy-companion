import { archetypeDraftValue, archetypeForTeam, archetypeLineupValue, getArchetype } from './archetypes.js';

const defaultNames = [
  'My Fantasy Team', 'Sunday Legends', 'Gridiron Kings', 'End Zone Empire',
  'Fourth Down Club', 'Two-Minute Drill', 'Red Zone Raiders', 'Goal Line Stand',
  'Play Action Heroes', 'Hail Mary Squad', 'Pocket Presence', 'Prime Time',
];

const normalizedPosition = (position) => position === 'FB' ? 'HB' : position;
export const DRAFT_ROSTER_LIMITS = { QB: 2, HB: 4, WR: 5, TE: 2, K: 1, DST: 1 };

export const DEFAULT_LEAGUE_SETTINGS = Object.freeze({
  draftType: 'snake',
  waiverType: 'rolling',
  faabBudget: 100,
  auctionBudget: 200,
  playoffTeams: 4,
  keeperMode: 'redraft',
  tradeDeadlineWeek: 11,
  draftTimer: 60,
});

export function normalizeLeagueSettings(settings = {}, teamCount = 4) {
  const draftType = ['snake', 'auction', 'instant'].includes(settings.draftType) ? settings.draftType : DEFAULT_LEAGUE_SETTINGS.draftType;
  const waiverType = ['rolling', 'reverse', 'faab'].includes(settings.waiverType) ? settings.waiverType : DEFAULT_LEAGUE_SETTINGS.waiverType;
  const eligiblePlayoffCounts = [2, 4, 6].filter((count) => count <= teamCount);
  const requestedPlayoffs = Number(settings.playoffTeams);
  return {
    ...DEFAULT_LEAGUE_SETTINGS,
    ...settings,
    draftType,
    waiverType,
    faabBudget: Math.max(1, Number(settings.faabBudget) || DEFAULT_LEAGUE_SETTINGS.faabBudget),
    auctionBudget: Math.max(50, Number(settings.auctionBudget) || DEFAULT_LEAGUE_SETTINGS.auctionBudget),
    playoffTeams: eligiblePlayoffCounts.includes(requestedPlayoffs) ? requestedPlayoffs : eligiblePlayoffCounts.at(-1) ?? 2,
    keeperMode: ['redraft', 'keeper', 'dynasty'].includes(settings.keeperMode) ? settings.keeperMode : 'redraft',
    tradeDeadlineWeek: Math.max(1, Math.min(17, Number(settings.tradeDeadlineWeek) || 11)),
    draftTimer: [0, 30, 60, 90].includes(Number(settings.draftTimer)) ? Number(settings.draftTimer) : DEFAULT_LEAGUE_SETTINGS.draftTimer,
  };
}

export const LINEUP_SLOTS = [
  { id: 'QB', label: 'QB', positions: ['QB'] },
  { id: 'RB1', label: 'RB', positions: ['HB'] },
  { id: 'RB2', label: 'RB', positions: ['HB'] },
  { id: 'WR1', label: 'WR', positions: ['WR'] },
  { id: 'WR2', label: 'WR', positions: ['WR'] },
  { id: 'TE', label: 'TE', positions: ['TE'] },
  { id: 'FLEX', label: 'FLEX', positions: ['HB', 'WR', 'TE'] },
  { id: 'K', label: 'K', positions: ['K'] },
  { id: 'DST', label: 'D/ST', positions: ['DST'] },
];

export const lineupWeekKey = (week) => `${week.weekType}:${week.week}`;

function draftPool(players) {
  return [...players]
    .filter((player) => Object.hasOwn(DRAFT_ROSTER_LIMITS, normalizedPosition(player.position)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function createTeams(teamCount, players, draftSeed) {
  const nflTeams = [...new Set(players.map((player) => player.team?.abbreviation).filter(Boolean))].sort();
  return Array.from({ length: teamCount }, (_, index) => ({
    id: `team-${index + 1}`,
    name: defaultNames[index],
    archetype: archetypeForTeam(index, draftSeed).id,
    favoriteTeam: nflTeams[(index + draftSeed) % Math.max(nflTeams.length, 1)] ?? null,
    roster: [],
    waiverPriority: index + 1,
    faabRemaining: DEFAULT_LEAGUE_SETTINGS.faabBudget,
    auctionBudget: DEFAULT_LEAGUE_SETTINGS.auctionBudget,
  }));
}

function positionCount(team, position, playersByKey) {
  return team.roster.map((key) => playersByKey.get(key)).filter(Boolean)
    .filter((player) => normalizedPosition(player.position) === position).length;
}

export function draftNeeds(team, playersByKey) {
  return Object.fromEntries(Object.entries(DRAFT_ROSTER_LIMITS).map(([position, limit]) => [
    position, Math.max(0, limit - positionCount(team, position, playersByKey)),
  ]));
}

function snakeOrder(teams) {
  return Array.from({ length: 15 }, (_, round) => (round % 2 ? [...teams].reverse() : teams)
    .map((team) => team.id)).flat();
}

export function startFantasyDraft({ name, teamCount, seasonYear, players, userSlot = 1, draftSeed = 0, settings = {} }) {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 12 || teamCount % 2) {
    throw new Error('Fantasy leagues require an even number of teams from 2 through 12.');
  }
  const pool = draftPool(players);
  const teams = createTeams(teamCount, pool, draftSeed);
  const leagueSettings = normalizeLeagueSettings(settings, teamCount);
  teams.forEach((team) => { team.faabRemaining = leagueSettings.faabBudget; team.auctionBudget = leagueSettings.auctionBudget; });
  const slot = Math.min(teamCount, Math.max(1, Number(userSlot) || 1));
  return {
    schemaVersion: 2, name: name?.trim() || 'Franchise Fantasy League', seasonYear, teams,
    userTeamId: teams[slot - 1].id, createdAt: new Date().toISOString(),
    settings: leagueSettings, transactions: [], waiverClaims: [], notifications: [], history: [],
    draft: { type: leagueSettings.draftType, status: 'active', pickIndex: 0, order: snakeOrder(teams), available: pool.map((player) => player.key), log: [], queue: [], budgets: Object.fromEntries(teams.map((team) => [team.id, leagueSettings.auctionBudget])) },
  };
}

export function currentDraftTeam(league) {
  if (league.draft?.status !== 'active') return null;
  const orderIndex = league.draft.type === 'auction'
    ? league.draft.pickIndex % league.draft.order.length
    : league.draft.pickIndex;
  return league.teams.find((team) => team.id === league.draft.order[orderIndex]) ?? null;
}

function applyDraftPick(league, team, player) {
  const overallPick = league.draft.pickIndex + 1;
  const round = Math.floor(league.draft.pickIndex / league.teams.length) + 1;
  team.roster.push(player.key);
  league.draft.available = league.draft.available.filter((key) => key !== player.key);
  league.draft.log.push({ overallPick, round, teamId: team.id, playerKey: player.key });
  league.draft.pickIndex += 1;
  const complete = league.teams.every((entry) => entry.roster.length >= Object.values(DRAFT_ROSTER_LIMITS).reduce((sum, limit) => sum + limit, 0));
  if (complete || (league.draft.type !== 'auction' && league.draft.pickIndex >= league.draft.order.length)) league.draft.status = 'complete';
}

function auctionPlayerValue(player) {
  const overall = Number(player.ratings?.OverallRating) || 60;
  return Math.max(1, Math.round((overall - 55) * 1.75 + Math.max(0, Number(player.average) || 0) * 0.8));
}

function validAuctionTeams(league, player, playersByKey) {
  const position = normalizedPosition(player.position);
  return league.teams.filter((team) => draftNeeds(team, playersByKey)[position] > 0 && (league.draft.budgets[team.id] ?? 0) > 0);
}

function auctionSpendable(league, team, playersByKey) {
  const remainingSlots = Object.values(draftNeeds(team, playersByKey)).reduce((sum, count) => sum + count, 0);
  return Math.max(1, (league.draft.budgets[team.id] ?? 0) - Math.max(0, remainingSlots - 1));
}

function awardAuctionPlayer(league, team, player, price) {
  const paid = Math.max(1, Math.min(Number(price) || 1, league.draft.budgets[team.id] ?? 1));
  league.draft.budgets[team.id] -= paid;
  team.auctionBudget = league.draft.budgets[team.id];
  applyDraftPick(league, team, player);
  league.draft.log.at(-1).price = paid;
  league.transactions.push({ type: 'auction', teamId: team.id, playerKey: player.key, amount: paid, at: new Date().toISOString() });
}

function aiDraftChoice(league, team, playersByKey) {
  const round = Math.floor(league.draft.pickIndex / league.teams.length);
  const needs = draftNeeds(team, playersByKey);
  const wanted = getArchetype(team.archetype).plan[round];
  const available = league.draft.available.map((key) => playersByKey.get(key)).filter(Boolean)
    .filter((player) => needs[normalizedPosition(player.position)] > 0);
  const preferred = available.filter((player) => normalizedPosition(player.position) === wanted);
  return (preferred.length ? preferred : available).sort((a, b) =>
    archetypeDraftValue(b, team.archetype, { seed: round, favoriteTeam: team.favoriteTeam }) -
      archetypeDraftValue(a, team.archetype, { seed: round, favoriteTeam: team.favoriteTeam }) ||
    a.name.localeCompare(b.name))[0] ?? null;
}

export function advanceAiDraft(league, players) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  while (league.draft?.status === 'active') {
    if (league.draft.type === 'snake' && !league.draft.aiTradeDone && league.draft.pickIndex >= league.teams.length * 3) {
      const aiTeams = league.teams.filter((team) => team.id !== league.userTeamId);
      const firstIndex = league.draft.order.findIndex((teamId, index) => index >= league.draft.pickIndex && teamId === aiTeams[0]?.id);
      const secondIndex = league.draft.order.findIndex((teamId, index) => index >= league.draft.pickIndex && teamId === aiTeams[1]?.id);
      if (firstIndex >= 0 && secondIndex >= 0) {
        [league.draft.order[firstIndex], league.draft.order[secondIndex]] = [league.draft.order[secondIndex], league.draft.order[firstIndex]];
        league.draft.aiTradeDone = true;
        league.transactions.push({ id: transactionId('draft-trade', league), type: 'draft-trade', fromTeamId: aiTeams[0].id, toTeamId: aiTeams[1].id, picks: [firstIndex + 1, secondIndex + 1], at: new Date().toISOString() });
      }
    }
    const team = currentDraftTeam(league);
    if (!team || team.id === league.userTeamId) break;
    const choice = aiDraftChoice(league, team, playersByKey);
    if (!choice && league.draft.type === 'auction' && Object.values(draftNeeds(team, playersByKey)).every((count) => count === 0)) {
      league.draft.pickIndex += 1;
      continue;
    }
    if (!choice) throw new Error(`${team.name} could not make a valid draft pick.`);
    if (league.draft.type === 'auction') awardAuctionPlayer(league, team, choice, Math.min(auctionPlayerValue(choice), auctionSpendable(league, team, playersByKey)));
    else applyDraftPick(league, team, choice);
  }
  return league;
}

export function makeUserDraftPick(league, playerKey, players) {
  const team = currentDraftTeam(league);
  if (!team || team.id !== league.userTeamId) throw new Error('Wait for your draft turn.');
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const player = playersByKey.get(playerKey);
  const position = normalizedPosition(player?.position);
  const needs = draftNeeds(team, playersByKey);
  if (!player || !league.draft.available.includes(player.key)) throw new Error('That player is no longer available.');
  if (!needs[position]) throw new Error(`Your ${position} roster spots are already full.`);
  applyDraftPick(league, team, player);
  advanceAiDraft(league, players);
  return league;
}

export function makeUserAuctionBid(league, playerKey, bid, players) {
  if (league.draft?.type !== 'auction') throw new Error('This is not an auction draft.');
  const nominator = currentDraftTeam(league);
  if (!nominator || nominator.id !== league.userTeamId) throw new Error('Wait for your nomination turn.');
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const player = playersByKey.get(playerKey);
  if (!player || !league.draft.available.includes(playerKey)) throw new Error('That player is no longer available.');
  const amount = Math.floor(Number(bid));
  const user = league.teams.find((team) => team.id === league.userTeamId);
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Enter a bid of at least $1.');
  if (amount > league.draft.budgets[user.id]) throw new Error('That bid exceeds your remaining auction budget.');
  if (amount > auctionSpendable(league, user, playersByKey)) throw new Error('Keep at least $1 available for every remaining roster spot.');
  if (!draftNeeds(user, playersByKey)[normalizedPosition(player.position)]) throw new Error(`Your ${normalizedPosition(player.position)} roster spots are full.`);

  const challengers = validAuctionTeams(league, player, playersByKey).filter((team) => team.id !== user.id)
    .map((team) => ({ team, max: Math.min(auctionSpendable(league, team, playersByKey), Math.round(auctionPlayerValue(player) * (0.82 + (team.waiverPriority % 5) * 0.04)) ) }))
    .sort((a, b) => b.max - a.max);
  const challenger = challengers[0];
  if (challenger && challenger.max >= amount) awardAuctionPlayer(league, challenger.team, player, Math.min(challenger.max, amount + 1));
  else awardAuctionPlayer(league, user, player, amount);
  advanceAiDraft(league, players);
  return league.draft.log.at(-1);
}

export function toggleDraftQueue(league, playerKey) {
  league.draft.queue ??= [];
  league.draft.queue = league.draft.queue.includes(playerKey)
    ? league.draft.queue.filter((key) => key !== playerKey)
    : [...league.draft.queue, playerKey];
  return league.draft.queue;
}

export function draftScarcity(league, players) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  return Object.keys(DRAFT_ROSTER_LIMITS).map((position) => {
    const available = league.draft.available.map((key) => playersByKey.get(key)).filter((player) => normalizedPosition(player?.position) === position);
    const openSpots = league.teams.reduce((sum, team) => sum + draftNeeds(team, playersByKey)[position], 0);
    return { position, available: available.length, openSpots, pressure: openSpots ? available.length / openSpots : 99 };
  }).sort((a, b) => a.pressure - b.pressure);
}

export function gradeDraft(league, players) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const grades = league.teams.map((team) => {
    const value = team.roster.reduce((sum, key) => {
      const player = playersByKey.get(key);
      return sum + (Number(player?.ratings?.OverallRating) || 0) + (Number(player?.average) || 0);
    }, 0) / Math.max(team.roster.length, 1);
    return { team, value };
  }).sort((a, b) => b.value - a.value);
  return grades.map((entry, index) => ({ ...entry, rank: index + 1, grade: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'][Math.min(index, 7)] }));
}

export function createFantasyLeague({ name, teamCount, seasonYear, players, draftSeed = 0, settings = {} }) {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 12 || teamCount % 2) {
    throw new Error('Fantasy leagues require an even number of teams from 2 through 12.');
  }
  const pool = draftPool(players);
  const available = new Map(pool.map((player) => [player.key, player]));
  const teams = createTeams(teamCount, pool, draftSeed);
  const leagueSettings = normalizeLeagueSettings(settings, teamCount);
  teams.forEach((team) => { team.faabRemaining = leagueSettings.faabBudget; team.auctionBudget = leagueSettings.auctionBudget; });

  Array.from({ length: 15 }, (_, round) => round).forEach((round) => {
    const order = round % 2 ? [...teams].reverse() : teams;
    for (const team of order) {
      const wantedPosition = getArchetype(team.archetype).plan[round];
      const choice = [...available.values()]
        .filter((player) => normalizedPosition(player.position) === wantedPosition)
        .sort((a, b) =>
          archetypeDraftValue(b, team.archetype, { seed: draftSeed + round, favoriteTeam: team.favoriteTeam }) -
            archetypeDraftValue(a, team.archetype, { seed: draftSeed + round, favoriteTeam: team.favoriteTeam }) ||
          a.name.localeCompare(b.name))[0];
      if (!choice) continue;
      team.roster.push(choice.key);
      available.delete(choice.key);
    }
  });
  return {
    schemaVersion: 2,
    name: name?.trim() || 'Franchise Fantasy League',
    seasonYear,
    teams,
    userTeamId: teams[0].id,
    settings: leagueSettings,
    transactions: [],
    waiverClaims: [],
    notifications: [],
    history: [],
    createdAt: new Date().toISOString(),
  };
}

export function upgradeFantasyLeague(league) {
  if (!league) return league;
  league.schemaVersion = 2;
  league.settings = normalizeLeagueSettings(league.settings, league.teams.length);
  league.transactions ??= [];
  league.waiverClaims ??= [];
  league.notifications ??= [];
  league.history ??= [];
  league.teams.forEach((team, index) => {
    team.lineups ??= {};
    team.waiverPriority ??= index + 1;
    team.faabRemaining ??= league.settings.faabBudget;
    team.auctionBudget ??= league.settings.auctionBudget;
  });
  if (league.draft) {
    league.draft.type ??= league.settings.draftType;
    league.draft.queue ??= [];
    league.draft.budgets ??= Object.fromEntries(league.teams.map((team) => [team.id, team.auctionBudget]));
  }
  return league;
}

function scoreForWeek(player, week) {
  return player.logs.find((log) => log.week === week.week && log.weekType === week.weekType)?.points ?? 0;
}

export function bestLineup(team, playersByKey, week) {
  const entries = team.roster
    .map((key) => playersByKey.get(key))
    .filter(Boolean)
    .map((player) => ({ player, points: scoreForWeek(player, week), position: normalizedPosition(player.position) }));
  const used = new Set();
  const lineup = [];
  const take = (slot, positions, count) => {
    const choices = entries
      .filter((entry) => positions.includes(entry.position) && !used.has(entry.player.key))
      .sort((a, b) =>
        archetypeLineupValue(b.player, team.archetype, week, team.favoriteTeam) -
          archetypeLineupValue(a.player, team.archetype, week, team.favoriteTeam) ||
        a.player.name.localeCompare(b.player.name));
    for (const entry of choices.slice(0, count)) {
      used.add(entry.player.key);
      lineup.push({ slot, ...entry });
    }
  };
  take('QB', ['QB'], 1);
  take('RB', ['HB'], 2);
  take('WR', ['WR'], 2);
  take('TE', ['TE'], 1);
  take('FLEX', ['HB', 'WR', 'TE'], 1);
  take('K', ['K'], 1);
  take('D/ST', ['DST'], 1);
  return {
    entries: lineup,
    total: Math.round((lineup.reduce((sum, entry) => sum + entry.points, 0) + Number.EPSILON) * 100) / 100,
  };
}

export function savedLineup(team, playersByKey, week) {
  const selections = team.lineups?.[lineupWeekKey(week)];
  if (!selections) return null;
  const used = new Set();
  const entries = [];
  for (const slot of LINEUP_SLOTS) {
    const player = playersByKey.get(selections[slot.id]);
    const position = normalizedPosition(player?.position);
    if (!player || !team.roster.includes(player.key) || !slot.positions.includes(position) || used.has(player.key)) return null;
    used.add(player.key);
    entries.push({ slot: slot.label, player, position, points: scoreForWeek(player, week) });
  }
  return {
    entries,
    total: Math.round((entries.reduce((sum, entry) => sum + entry.points, 0) + Number.EPSILON) * 100) / 100,
    source: 'manual',
  };
}

export function lineupForTeam(team, playersByKey, week) {
  return savedLineup(team, playersByKey, week) ?? { ...bestLineup(team, playersByKey, week), source: 'archetype' };
}

export function saveManualLineup(team, week, selections, playersByKey) {
  const candidate = { ...team, lineups: { ...(team.lineups ?? {}), [lineupWeekKey(week)]: { ...selections } } };
  if (!savedLineup(candidate, playersByKey, week)) throw new Error('Choose one eligible, unique player for every starting slot.');
  team.lineups = candidate.lineups;
  return team.lineups[lineupWeekKey(week)];
}

export function clearManualLineup(team, week) {
  if (!team.lineups) return;
  delete team.lineups[lineupWeekKey(week)];
}

export function roundRobinPairings(teamIds, round) {
  if (teamIds.length < 2 || teamIds.length % 2) return [];
  const fixed = teamIds[0];
  const rotating = teamIds.slice(1);
  const shift = round % rotating.length;
  const rotated = [fixed, ...rotating.slice(shift), ...rotating.slice(0, shift)];
  const pairings = [];
  for (let index = 0; index < rotated.length / 2; index += 1) {
    const first = rotated[index];
    const second = rotated[rotated.length - 1 - index];
    pairings.push(round % 2 ? [second, first] : [first, second]);
  }
  return pairings;
}

export function scoreFantasyLeague(league, players, weeks) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const teamById = new Map(league.teams.map((team) => [team.id, team]));
  const matchups = weeks.map((week, weekIndex) => ({
    ...week,
    games: roundRobinPairings(league.teams.map((team) => team.id), weekIndex).map(([firstId, secondId]) => {
      const first = teamById.get(firstId);
      const second = teamById.get(secondId);
      return {
        first,
        second,
        firstLineup: lineupForTeam(first, playersByKey, week),
        secondLineup: lineupForTeam(second, playersByKey, week),
      };
    }),
  }));

  const standings = league.teams.map((team) => ({ team, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }));
  const standingById = new Map(standings.map((standing) => [standing.team.id, standing]));
  for (const week of matchups) {
    for (const game of week.games) {
      const first = standingById.get(game.first.id);
      const second = standingById.get(game.second.id);
      first.pointsFor += game.firstLineup.total;
      first.pointsAgainst += game.secondLineup.total;
      second.pointsFor += game.secondLineup.total;
      second.pointsAgainst += game.firstLineup.total;
      if (game.firstLineup.total > game.secondLineup.total) { first.wins += 1; second.losses += 1; }
      else if (game.firstLineup.total < game.secondLineup.total) { second.wins += 1; first.losses += 1; }
      else { first.ties += 1; second.ties += 1; }
    }
  }
  standings.forEach((standing) => {
    standing.pointsFor = Math.round((standing.pointsFor + Number.EPSILON) * 100) / 100;
    standing.pointsAgainst = Math.round((standing.pointsAgainst + Number.EPSILON) * 100) / 100;
  });
  standings.sort((a, b) => b.wins - a.wins || b.ties - a.ties || b.pointsFor - a.pointsFor);
  return { matchups, standings };
}

function playerTrend(player) {
  const logs = [...(player.logs ?? [])].sort((a, b) => a.week - b.week).slice(-3);
  if (!logs.length) return Number(player.average) || 0;
  return logs.reduce((sum, log) => sum + Number(log.points || 0), 0) / logs.length;
}

export function projectPlayer(player) {
  const seasonAverage = Number(player.average) || (player.games ? Number(player.total || 0) / player.games : 0);
  const recent = playerTrend(player);
  const overall = Math.max(0, (Number(player.ratings?.OverallRating) || 70) - 60) * 0.08;
  const injury = player.injuryStatus ?? player.injury?.status ?? player.injury ?? null;
  const unavailable = typeof injury === 'string' && /out|ir|pup/i.test(injury);
  const projection = unavailable ? 0 : seasonAverage * 0.55 + recent * 0.35 + overall;
  return { player, projection: Math.round((projection + Number.EPSILON) * 100) / 100, seasonAverage, recent, injury: injury || null };
}

export function buildWeeklyProjections(league, players, week) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  return league.teams.map((team) => {
    const projectedPlayers = new Map(team.roster.map((key) => playersByKey.get(key)).filter(Boolean)
      .map((player) => [player.key, { ...player, logs: [{ week: week.week, weekType: week.weekType, points: projectPlayer(player).projection }] }]));
    const lineup = bestLineup(team, projectedPlayers, week);
    return { team, lineup, projection: lineup.total };
  }).sort((a, b) => b.projection - a.projection);
}

export function recommendLineupMoves(team, players, week) {
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const current = lineupForTeam(team, playersByKey, week);
  const projectedPlayers = new Map(team.roster.map((key) => playersByKey.get(key)).filter(Boolean)
    .map((player) => [player.key, { ...player, logs: [{ week: week.week, weekType: week.weekType, points: projectPlayer(player).projection }] }]));
  const recommended = bestLineup(team, projectedPlayers, week);
  const currentKeys = new Set(current.entries.map((entry) => entry.player.key));
  const suggestions = recommended.entries.filter((entry) => !currentKeys.has(entry.player.key)).map((entry) => ({
    player: playersByKey.get(entry.player.key), slot: entry.slot, projection: entry.points,
    reason: `${playerTrend(playersByKey.get(entry.player.key)).toFixed(1)} recent average and ${playersByKey.get(entry.player.key)?.ratings?.OverallRating ?? '—'} OVR`,
  }));
  return { current, recommended, suggestions };
}

export function availableFantasyPlayers(league, players) {
  const rostered = new Set(league.teams.flatMap((team) => team.roster));
  return draftPool(players).filter((player) => !rostered.has(player.key))
    .map(projectPlayer).sort((a, b) => b.projection - a.projection || a.player.name.localeCompare(b.player.name));
}

function transactionId(prefix, league) {
  return `${prefix}-${Date.now()}-${league.transactions.length + 1}`;
}

export function submitWaiverClaim(league, { teamId, addPlayerKey, dropPlayerKey = null, bid = 0, week = 0 }) {
  upgradeFantasyLeague(league);
  const team = league.teams.find((entry) => entry.id === teamId);
  if (!team) throw new Error('Choose a valid fantasy team.');
  if (!addPlayerKey || team.roster.includes(addPlayerKey)) throw new Error('Choose an available player to add.');
  if (dropPlayerKey && !team.roster.includes(dropPlayerKey)) throw new Error('The dropped player is not on that roster.');
  const amount = league.settings.waiverType === 'faab' ? Math.max(0, Math.floor(Number(bid) || 0)) : 0;
  if (amount > team.faabRemaining) throw new Error('That bid exceeds the remaining FAAB budget.');
  const claim = { id: transactionId('claim', league), teamId, addPlayerKey, dropPlayerKey, bid: amount, week, createdAt: new Date().toISOString() };
  league.waiverClaims.push(claim);
  return claim;
}

export function generateAiWaiverClaims(league, players, week = 0) {
  const freeAgents = availableFantasyPlayers(league, players);
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  for (const team of league.teams.filter((entry) => entry.id !== league.userTeamId)) {
    const roster = team.roster.map((key) => playersByKey.get(key)).filter(Boolean);
    const weakest = [...roster].sort((a, b) => projectPlayer(a).projection - projectPlayer(b).projection)[0];
    const upgrade = freeAgents.find((entry) => normalizedPosition(entry.player.position) === normalizedPosition(weakest?.position) && entry.projection > projectPlayer(weakest).projection + 1.5);
    if (!upgrade || league.waiverClaims.some((claim) => claim.teamId === team.id && claim.addPlayerKey === upgrade.player.key)) continue;
    const bid = league.settings.waiverType === 'faab' ? Math.min(team.faabRemaining, Math.max(1, Math.round((upgrade.projection - projectPlayer(weakest).projection) * 2))) : 0;
    submitWaiverClaim(league, { teamId: team.id, addPlayerKey: upgrade.player.key, dropPlayerKey: weakest.key, bid, week });
  }
  return league.waiverClaims;
}

export function processWaivers(league, players, weeks = []) {
  upgradeFantasyLeague(league);
  const available = new Set(availableFantasyPlayers(league, players).map((entry) => entry.player.key));
  const standings = scoreFantasyLeague(league, players, weeks).standings;
  const rank = new Map(standings.map((standing, index) => [standing.team.id, index]));
  const priority = (claim) => {
    const team = league.teams.find((entry) => entry.id === claim.teamId);
    if (league.settings.waiverType === 'faab') return [-claim.bid, team.waiverPriority, claim.createdAt];
    if (league.settings.waiverType === 'reverse') return [-(rank.get(team.id) ?? 0), team.waiverPriority, claim.createdAt];
    return [team.waiverPriority, 0, claim.createdAt];
  };
  const claims = [...league.waiverClaims].sort((a, b) => {
    const av = priority(a); const bv = priority(b);
    return av[0] - bv[0] || av[1] - bv[1] || String(av[2]).localeCompare(String(bv[2]));
  });
  const processed = [];
  for (const claim of claims) {
    const team = league.teams.find((entry) => entry.id === claim.teamId);
    if (!team || !available.has(claim.addPlayerKey) || (claim.dropPlayerKey && !team.roster.includes(claim.dropPlayerKey))) continue;
    if (league.settings.waiverType === 'faab' && claim.bid > team.faabRemaining) continue;
    if (claim.dropPlayerKey) team.roster = team.roster.filter((key) => key !== claim.dropPlayerKey);
    team.roster.push(claim.addPlayerKey);
    available.delete(claim.addPlayerKey);
    if (claim.dropPlayerKey) available.add(claim.dropPlayerKey);
    if (league.settings.waiverType === 'faab') team.faabRemaining -= claim.bid;
    if (league.settings.waiverType === 'rolling') {
      const previous = team.waiverPriority;
      league.teams.forEach((entry) => { if (entry.waiverPriority > previous) entry.waiverPriority -= 1; });
      team.waiverPriority = league.teams.length;
    }
    const transaction = { id: transactionId('waiver', league), type: 'waiver', ...claim, processedAt: new Date().toISOString() };
    league.transactions.unshift(transaction); processed.push(transaction);
    if (team.id === league.userTeamId) league.notifications.unshift({ type: 'success', text: `Waiver claim awarded for ${claim.addPlayerKey}.`, at: transaction.processedAt });
  }
  league.waiverClaims = [];
  return processed;
}

function rosterPlayerValue(player) {
  const projected = projectPlayer(player).projection;
  return projected + (Number(player?.ratings?.OverallRating) || 60) * 0.12;
}

export function proposeTrade(league, players, { fromTeamId, toTeamId, offerPlayerKey, requestPlayerKey, week = 0 }) {
  upgradeFantasyLeague(league);
  if (week + 1 > league.settings.tradeDeadlineWeek) throw new Error('The trade deadline has passed.');
  const from = league.teams.find((team) => team.id === fromTeamId);
  const to = league.teams.find((team) => team.id === toTeamId);
  if (!from?.roster.includes(offerPlayerKey) || !to?.roster.includes(requestPlayerKey)) throw new Error('Choose one rostered player from each team.');
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const offered = playersByKey.get(offerPlayerKey); const requested = playersByKey.get(requestPlayerKey);
  if (!offered || !requested || normalizedPosition(offered.position) !== normalizedPosition(requested.position)) throw new Error('Trade players at the same roster position.');
  const incomingValue = rosterPlayerValue(offered);
  const outgoingValue = rosterPlayerValue(requested);
  const personalityTolerance = (to.waiverPriority % 4) * 0.04;
  const accepted = incomingValue >= outgoingValue * (0.92 + personalityTolerance);
  const proposal = { id: transactionId('trade', league), type: 'trade', fromTeamId, toTeamId, offerPlayerKey, requestPlayerKey, week, accepted, createdAt: new Date().toISOString() };
  if (accepted) {
    from.roster = from.roster.map((key) => key === offerPlayerKey ? requestPlayerKey : key);
    to.roster = to.roster.map((key) => key === requestPlayerKey ? offerPlayerKey : key);
    league.transactions.unshift(proposal);
  }
  league.notifications.unshift({ type: accepted ? 'success' : 'info', text: `${to.name} ${accepted ? 'accepted' : 'rejected'} your trade offer.`, at: proposal.createdAt });
  return proposal;
}

export function runAiTransactions(league, players, weeks = []) {
  upgradeFantasyLeague(league);
  const week = weeks.length;
  if (league.lastAiTransactionWeek === week) return [];
  league.lastAiTransactionWeek = week;
  generateAiWaiverClaims(league, players, week);
  const moves = processWaivers(league, players, weeks);
  if (week >= 3 && league.lastAiTradeWeek !== week) {
    const aiTeams = league.teams.filter((team) => team.id !== league.userTeamId);
    const first = aiTeams[week % Math.max(aiTeams.length, 1)];
    const second = aiTeams[(week + 1) % Math.max(aiTeams.length, 1)];
    const playersByKey = new Map(players.map((player) => [player.key, player]));
    const offer = first?.roster.map((key) => playersByKey.get(key)).filter((player) => normalizedPosition(player?.position) === 'WR').sort((a, b) => rosterPlayerValue(a) - rosterPlayerValue(b))[0];
    const request = second?.roster.map((key) => playersByKey.get(key)).filter((player) => normalizedPosition(player?.position) === 'WR').sort((a, b) => rosterPlayerValue(b) - rosterPlayerValue(a))[0];
    if (first && second && first.id !== second.id && offer && request && offer.key !== request.key) {
      first.roster = first.roster.map((key) => key === offer.key ? request.key : key);
      second.roster = second.roster.map((key) => key === request.key ? offer.key : key);
      const trade = { id: transactionId('ai-trade', league), type: 'trade', fromTeamId: first.id, toTeamId: second.id, offerPlayerKey: offer.key, requestPlayerKey: request.key, week, accepted: true, createdAt: new Date().toISOString() };
      league.transactions.unshift(trade); moves.push(trade); league.lastAiTradeWeek = week;
    }
  }
  return moves;
}

export function buildPlayoffPicture(league, players, weeks) {
  const scored = scoreFantasyLeague(league, players, weeks);
  const playoffTeams = scored.standings.slice(0, league.settings?.playoffTeams ?? 4);
  const seeds = playoffTeams.map((standing, index) => ({ seed: index + 1, ...standing }));
  const matchups = [];
  for (let index = 0; index < Math.floor(seeds.length / 2); index += 1) {
    matchups.push({ first: seeds[index], second: seeds[seeds.length - 1 - index] });
  }
  const consolationSeeds = scored.standings.slice(playoffTeams.length).map((standing, index) => ({ seed: playoffTeams.length + index + 1, ...standing }));
  const consolation = [];
  for (let index = 0; index < Math.floor(consolationSeeds.length / 2); index += 1) {
    consolation.push({ first: consolationSeeds[index], second: consolationSeeds[consolationSeeds.length - 1 - index] });
  }
  return { seeds, matchups, consolation, regularSeasonComplete: weeks.length >= 14, champion: league.history?.at(-1)?.champion ?? null };
}

export function archiveFantasySeason(league, players, weeks) {
  upgradeFantasyLeague(league);
  const standings = scoreFantasyLeague(league, players, weeks).standings;
  const champion = standings[0]?.team;
  const record = {
    seasonYear: league.seasonYear,
    champion: champion?.name ?? 'TBD',
    championTeamId: champion?.id ?? null,
    bestRecord: standings[0] ? `${standings[0].wins}-${standings[0].losses}` : '0-0',
    pointsLeader: [...standings].sort((a, b) => b.pointsFor - a.pointsFor)[0]?.team.name ?? '—',
    archivedAt: new Date().toISOString(),
  };
  if (!league.history.some((entry) => entry.seasonYear === record.seasonYear)) league.history.push(record);
  return record;
}

export function carryFantasyLeagueForward(previousLeague, { seasonYear, players, keeperCount = 3 }) {
  upgradeFantasyLeague(previousLeague);
  const settings = { ...previousLeague.settings, draftType: 'instant' };
  const next = createFantasyLeague({ name: previousLeague.name, teamCount: previousLeague.teams.length, seasonYear, players, draftSeed: seasonYear + 31, settings });
  next.settings.draftType = previousLeague.settings.draftType;
  next.history = [...previousLeague.history];
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const used = new Set();
  const keepAll = previousLeague.settings.keeperMode === 'dynasty';
  next.teams.forEach((team, index) => {
    const previous = previousLeague.teams[index];
    team.name = previous.name; team.archetype = previous.archetype; team.favoriteTeam = previous.favoriteTeam;
    const candidates = previous.roster.map((key) => playersByKey.get(key)).filter(Boolean)
      .sort((a, b) => rosterPlayerValue(b) - rosterPlayerValue(a));
    const kept = [];
    for (const player of candidates) {
      if (!keepAll && kept.length >= keeperCount) break;
      const position = normalizedPosition(player.position);
      if (kept.filter((entry) => normalizedPosition(entry.position) === position).length >= DRAFT_ROSTER_LIMITS[position]) continue;
      kept.push(player); used.add(player.key);
    }
    team.roster = kept.map((player) => player.key);
  });
  const available = draftPool(players).filter((player) => !used.has(player.key));
  for (let round = 0; round < 20 && next.teams.some((team) => team.roster.length < 15); round += 1) {
    for (const team of (round % 2 ? [...next.teams].reverse() : next.teams)) {
      if (team.roster.length >= 15) continue;
      const needs = draftNeeds(team, playersByKey);
      const wanted = getArchetype(team.archetype).plan[team.roster.length] ?? Object.keys(needs).find((position) => needs[position]);
      const choiceIndex = available.findIndex((player) => normalizedPosition(player.position) === wanted && needs[wanted] > 0);
      const fallbackIndex = available.findIndex((player) => needs[normalizedPosition(player.position)] > 0);
      const index = choiceIndex >= 0 ? choiceIndex : fallbackIndex;
      if (index < 0) continue;
      const [choice] = available.splice(index, 1); team.roster.push(choice.key); used.add(choice.key);
    }
  }
  next.transactions.unshift({ id: transactionId('rollover', next), type: 'rollover', keeperMode: previousLeague.settings.keeperMode, at: new Date().toISOString() });
  next.notifications.unshift({ type: 'success', text: `${previousLeague.settings.keeperMode === 'dynasty' ? 'Dynasty rosters' : `${keeperCount} keepers per team`} carried into Year ${seasonYear + 1}.`, at: new Date().toISOString() });
  return next;
}
