import { calculateFantasyPoints, calculateTeamDefensePoints, DEFAULT_SCORING } from '../scoring.js';
import { analyzeTeamGames } from '../analytics.js';
import { summarizePlayerProfile } from '../profile.js';
import { buildRecordBook, buildTeamRecaps, buildWeeklyAwards } from '../records.js';
import {
  LINEUP_SLOTS, bestLineup, clearManualLineup, createFantasyLeague, lineupForTeam,
  advanceAiDraft, currentDraftTeam, draftNeeds, lineupWeekKey, makeUserDraftPick,
  roundRobinPairings, saveManualLineup, scoreFantasyLeague, startFantasyDraft,
  archiveFantasySeason, availableFantasyPlayers, buildPlayoffPicture, buildWeeklyProjections,
  carryFantasyLeagueForward,
  draftScarcity, generateAiWaiverClaims, gradeDraft, makeUserAuctionBid, processWaivers,
  projectPlayer, proposeTrade, recommendLineupMoves, runAiTransactions, submitWaiverClaim,
  toggleDraftQueue, upgradeFantasyLeague,
} from '../league.js';
import { buildWorldStorylines, createFantasyWorld, generateLeagueChat, generateWorldFeed, joinFantasyWorld, observeFantasyWorld, updateWorldContinuity, upgradeFantasyWorld } from '../world.js';
import { PLAYSTYLE_ARCHETYPES, archetypeForTeam, getArchetype } from '../archetypes.js';
import { buildNflTeamStyles } from '../team-styles.js';
import { buildFantasyRedZone, buildHeadToHeadHistory, buildNflPowerRankings, buildSeasonMagazine } from '../insights.js';

const fantasyPositions = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'K', 'DST']);
const positionOrder = ['QB', 'HB', 'FB', 'WR', 'TE', 'K', 'DST', 'LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS'];
const elements = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((element) => [element.id, element]),
);
let currentAnalysis = null;
let activeCategory = 'fantasy';
let activeView = 'game';
let seasonRowsByKey = new Map();
let analyticsRowsByKey = new Map();
let recordsRowsByKey = new Map();
let gameChoices = [];
let activeLeague = null;
let leagueRowsByKey = new Map();
let activeWorld = null;
let worldRowsByKey = new Map();
let worldFeedFilter = 'all';
let recapVisibleCount = 20;
let appInfo = { version: '0.16.0', platform: 'win32', arch: 'x64' };

const PREFERENCES_KEY = 'madden-fantasy:preferences';
const DEFAULT_PREFERENCES = {
  defaultView: 'game', recapPageSize: 20, autoRefresh: true, onboarded: false, scoringFormat: 'ppr',
  customScoring: { reception: 1, passingTouchdown: 4, rushingTouchdown: 6, receivingTouchdown: 6, interception: -2 },
};

function loadPreferences() {
  try { return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY)) }; }
  catch { return { ...DEFAULT_PREFERENCES }; }
}

function savePreferences(changes = {}) {
  const next = { ...loadPreferences(), ...changes };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

const n = (stats, key) => Number(stats[key]) || 0;
const average = (total, attempts) => (attempts ? (total / attempts).toFixed(1) : '—');
const percent = (made, attempts) => (attempts ? `${Math.round((made / attempts) * 100)}%` : '—');

const categories = {
  fantasy: {
    title: 'Fantasy leaderboard',
    columns: [
      ['Fantasy', (p) => p.fantasy.total.toFixed(2), 'points'],
      ['Pass Yds', (p) => n(p.stats, 'PASSYARDS') || '—'],
      ['Pass TD', (p) => n(p.stats, 'PASSTDS') || '—'],
      ['Rush Yds', (p) => n(p.stats, 'RUSHYARDS') || '—'],
      ['Rush TD', (p) => n(p.stats, 'RUSHTDS') || '—'],
      ['Rec', (p) => n(p.stats, 'RECEIVECATCHES') || '—'],
      ['Rec Yds', (p) => n(p.stats, 'RECEIVEYARDS') || '—'],
      ['Rec TD', (p) => n(p.stats, 'RECEIVETDS') || '—'],
      ['Sacks', (p) => (p.position === 'DST' ? n(p.stats, 'DSTSACKS') : '—')],
      ['Takeaways', (p) => (p.position === 'DST' ? n(p.stats, 'DSTTAKEAWAYS') : '—')],
      ['DST TD', (p) => (p.position === 'DST' ? n(p.stats, 'DSTTDS') : '—')],
      ['PA', (p) => (p.position === 'DST' ? n(p.stats, 'DSTPOINTSALLOWED') : '—')],
    ],
    active: (p) => p.position === 'DST' || p.fantasy.total !== 0,
    sort: (a, b) => b.fantasy.total - a.fantasy.total,
  },
  passing: {
    title: 'Passing stats',
    columns: [
      ['Cmp', (p) => n(p.stats, 'PASSCOMPLETED')],
      ['Att', (p) => n(p.stats, 'PASSATTEMPTS')],
      ['Yds', (p) => n(p.stats, 'PASSYARDS'), 'points'],
      ['TD', (p) => n(p.stats, 'PASSTDS')],
      ['INT', (p) => n(p.stats, 'PASSINTS')],
      ['Long', (p) => n(p.stats, 'PASSLONGEST')],
      ['Rating', (p) => n(p.stats, 'GAMERATING')],
    ],
    active: (p) => n(p.stats, 'PASSATTEMPTS') > 0,
    sort: (a, b) => n(b.stats, 'PASSYARDS') - n(a.stats, 'PASSYARDS'),
  },
  rushing: {
    title: 'Rushing stats',
    columns: [
      ['Att', (p) => n(p.stats, 'RUSHATTEMPTS')],
      ['Yds', (p) => n(p.stats, 'RUSHYARDS'), 'points'],
      ['Avg', (p) => average(n(p.stats, 'RUSHYARDS'), n(p.stats, 'RUSHATTEMPTS'))],
      ['TD', (p) => n(p.stats, 'RUSHTDS')],
      ['Long', (p) => n(p.stats, 'RUSHLONGEST')],
      ['20+', (p) => n(p.stats, 'RUSH20YARDRUNS')],
      ['Fum', (p) => n(p.stats, 'RUSHFUMBLES')],
    ],
    active: (p) => n(p.stats, 'RUSHATTEMPTS') > 0,
    sort: (a, b) => n(b.stats, 'RUSHYARDS') - n(a.stats, 'RUSHYARDS'),
  },
  receiving: {
    title: 'Receiving stats',
    columns: [
      ['Rec', (p) => n(p.stats, 'RECEIVECATCHES')],
      ['Yds', (p) => n(p.stats, 'RECEIVEYARDS'), 'points'],
      ['Avg', (p) => average(n(p.stats, 'RECEIVEYARDS'), n(p.stats, 'RECEIVECATCHES'))],
      ['TD', (p) => n(p.stats, 'RECEIVETDS')],
      ['Long', (p) => n(p.stats, 'RECEIVELONGEST')],
      ['YAC', (p) => n(p.stats, 'RECEIVEYARDSAFTER')],
      ['Drops', (p) => n(p.stats, 'RECEIVEDROPS')],
    ],
    active: (p) => n(p.stats, 'RECEIVECATCHES') > 0 || n(p.stats, 'RECEIVEDROPS') > 0,
    sort: (a, b) => n(b.stats, 'RECEIVEYARDS') - n(a.stats, 'RECEIVEYARDS'),
  },
  kicking: {
    title: 'Kicking stats',
    columns: [
      ['FGM', (p) => n(p.stats, 'KICKFGMADE'), 'points'],
      ['FGA', (p) => n(p.stats, 'KICKFGATTEMPTS')],
      ['FG%', (p) => percent(n(p.stats, 'KICKFGMADE'), n(p.stats, 'KICKFGATTEMPTS'))],
      ['Long', (p) => n(p.stats, 'KICKFGLONGEST')],
      ['XP', (p) => n(p.stats, 'KICKEPMADE')],
      ['XPA', (p) => n(p.stats, 'KICKEPATTEMPTS')],
      ['50+', (p) => n(p.stats, 'KICKFGMADE50ORMORE')],
    ],
    active: (p) => n(p.stats, 'KICKFGATTEMPTS') > 0 || n(p.stats, 'KICKEPATTEMPTS') > 0,
    sort: (a, b) => n(b.stats, 'KICKFGMADE') - n(a.stats, 'KICKFGMADE'),
  },
  defense: {
    title: 'Defensive stats',
    columns: [
      ['Tkl', (p) => n(p.stats, 'DEFTACKLES'), 'points'],
      ['Ast', (p) => n(p.stats, 'ASSDEFTACKLES')],
      ['TFL', (p) => n(p.stats, 'DEFTACKLESFORLOSS')],
      ['Sack', (p) => n(p.stats, 'DLINESACKS') + n(p.stats, 'DLINEHALFSACK') * 0.5],
      ['INT', (p) => n(p.stats, 'DSECINTS')],
      ['PD', (p) => n(p.stats, 'DEFPASSDEFLECTIONS')],
      ['FF', (p) => n(p.stats, 'DLINEFORCEDFUMBLES')],
      ['FR', (p) => n(p.stats, 'DLINEFUMBLERECOVERIES')],
      ['TD', (p) => n(p.stats, 'DSECINTTDS') + n(p.stats, 'DLINEFUMBLETDS')],
    ],
    active: (p) =>
      n(p.stats, 'DEFTACKLES') +
        n(p.stats, 'ASSDEFTACKLES') +
        n(p.stats, 'DEFTACKLESFORLOSS') +
        n(p.stats, 'DLINESACKS') +
        n(p.stats, 'DLINEHALFSACK') +
        n(p.stats, 'DSECINTS') +
        n(p.stats, 'DEFPASSDEFLECTIONS') +
        n(p.stats, 'DLINEFORCEDFUMBLES') +
        n(p.stats, 'DLINEFUMBLERECOVERIES') +
        n(p.stats, 'CTHALLOWED') >
      0,
    sort: (a, b) => n(b.stats, 'DEFTACKLES') - n(a.stats, 'DEFTACKLES'),
  },
};

function rules() {
  if (elements.scoring.value === 'custom') return { ...DEFAULT_SCORING, ...loadPreferences().customScoring };
  const reception = { ppr: 1, half: 0.5, standard: 0 }[elements.scoring.value];
  return { ...DEFAULT_SCORING, reception };
}

function setStatus(message, state = 'ready') {
  elements.status.className = `status ${state}`;
  elements.status.querySelector('span').textContent = message;
}

function setSaveHealth(state, title, detail) {
  elements['save-health'].classList.toggle('error', state === 'error');
  elements['save-health-title'].textContent = title;
  elements['save-health-detail'].textContent = detail;
  elements['save-health-badge'].textContent = state === 'error' ? 'NEEDS ATTENTION' : state === 'working' ? 'CHECKING' : 'SUPPORTED';
}

function gameName(game) {
  return `${game.weekType.replace('Season', ' Season')} · Week ${game.week + 1} · ${game.awayTeam?.abbreviation ?? 'Away'} at ${game.homeTeam?.abbreviation ?? 'Home'}`;
}

function selectedGame() {
  return gameChoices[Number(elements['game-select'].value) || 0];
}

function availableTeams() {
  const teams = new Map();
  for (const game of currentAnalysis?.leagueGames ?? []) {
    for (const team of [game.homeTeam, game.awayTeam]) {
      if (team && !teams.has(team.index)) teams.set(team.index, team);
    }
  }
  return [...teams.values()].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
}

function preferredTeamIndex() {
  const counts = new Map();
  for (const game of currentAnalysis?.games ?? []) {
    for (const team of [game.homeTeam, game.awayTeam]) {
      if (team) counts.set(team.index, (counts.get(team.index) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? availableTeams()[0]?.index;
}

function populateGameChoices() {
  const teamIndex = Number(elements['game-team'].value);
  gameChoices = (currentAnalysis?.leagueGames ?? [])
    .filter((game) => game.homeTeam?.index === teamIndex || game.awayTeam?.index === teamIndex)
    .slice()
    .reverse();
  elements['game-select'].replaceChildren(...gameChoices.map((game, index) => option(index, gameName(game))));
}

function populateGameTeamFilter() {
  const previous = elements['game-team'].value;
  const teams = availableTeams();
  elements['game-team'].replaceChildren(...teams.map((team) => option(team.index, `${team.name} (${team.abbreviation})`)));
  const choice = teams.some((team) => String(team.index) === previous) ? previous : String(preferredTeamIndex());
  elements['game-team'].value = choice;
  populateGameChoices();
}

function playerTeam(game, player) {
  if (player.team) return player.team;
  if (player.teamIndex === game.awayTeam?.index) return game.awayTeam;
  if (player.teamIndex === game.homeTeam?.index) return game.homeTeam;
  return { index: player.teamIndex, abbreviation: '—', name: 'Unknown' };
}

function createDstPlayer(game, team, pointsAllowed) {
  const teamPlayers = game.players.filter((player) => player.teamIndex === team.index);
  const stats = teamPlayers.reduce(
    (totals, player) => {
      totals.sacks += n(player.stats, 'DLINESACKS') + n(player.stats, 'DLINEHALFSACK') * 0.5;
      totals.interceptions += n(player.stats, 'DSECINTS');
      totals.fumbleRecoveries += n(player.stats, 'DLINEFUMBLERECOVERIES');
      totals.defensiveTouchdowns += n(player.stats, 'DSECINTTDS') + n(player.stats, 'DLINEFUMBLETDS');
      totals.returnTouchdowns += n(player.stats, 'KRETTDS') + n(player.stats, 'PRETTDS');
      totals.safeties += n(player.stats, 'DLINESAFETIES');
      return totals;
    },
    {
      sacks: 0,
      interceptions: 0,
      fumbleRecoveries: 0,
      defensiveTouchdowns: 0,
      returnTouchdowns: 0,
      safeties: 0,
    },
  );

  return {
    playerId: `dst-${team.index}`,
    firstName: team.name,
    lastName: 'D/ST',
    position: 'DST',
    teamIndex: team.index,
    team,
    stats: {
      DSTSACKS: stats.sacks,
      DSTTAKEAWAYS: stats.interceptions + stats.fumbleRecoveries,
      DSTTDS: stats.defensiveTouchdowns + stats.returnTouchdowns,
      DSTPOINTSALLOWED: pointsAllowed,
    },
    fantasy: calculateTeamDefensePoints(stats, pointsAllowed, rules()),
  };
}

function dstPlayers(game) {
  return [
    [game.awayTeam, game.homeScore],
    [game.homeTeam, game.awayScore],
  ]
    .filter(([team]) => team?.index !== undefined && team?.index !== null)
    .map(([team, pointsAllowed]) => createDstPlayer(game, team, pointsAllowed));
}

function fantasyAppearance(player) {
  return (
    n(player.stats, 'DOWNSPLAYED') > 0 ||
    n(player.stats, 'PASSATTEMPTS') > 0 ||
    n(player.stats, 'RUSHATTEMPTS') > 0 ||
    n(player.stats, 'RECEIVECATCHES') > 0 ||
    n(player.stats, 'RECEIVEDROPS') > 0 ||
    n(player.stats, 'KICKFGATTEMPTS') > 0 ||
    n(player.stats, 'KICKEPATTEMPTS') > 0
  );
}

function gameLogEntry(game, player) {
  const team = player.team ?? playerTeam(game, player);
  const isHome = team.index === game.homeTeam?.index;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const ownScore = isHome ? game.homeScore : game.awayScore;
  const opponentScore = isHome ? game.awayScore : game.homeScore;
  const result = ownScore > opponentScore ? 'W' : ownScore < opponentScore ? 'L' : 'T';
  const teamPlayers = game.players.filter((entry) => entry.teamIndex === team.index);
  const teamStats = teamPlayers.reduce((totals, entry) => {
    totals.passAttempts += n(entry.stats, 'PASSATTEMPTS');
    totals.rushAttempts += n(entry.stats, 'RUSHATTEMPTS');
    totals.rushYards += n(entry.stats, 'RUSHYARDS');
    totals.receptions += n(entry.stats, 'RECEIVECATCHES');
    totals.receivingYards += n(entry.stats, 'RECEIVEYARDS');
    return totals;
  }, { passAttempts: 0, rushAttempts: 0, rushYards: 0, receptions: 0, receivingYards: 0 });
  return {
    gameId: game.gameId,
    week: game.week,
    weekType: game.weekType,
    opponent: opponent?.abbreviation ?? '—',
    location: isHome ? 'vs' : '@',
    result: `${result} ${ownScore}–${opponentScore}`,
    points: player.fantasy.total,
    stats: { ...player.stats },
    teamStats,
  };
}

function buildSeasonRows(games) {
  const records = new Map();
  for (const game of games) {
    const players = game.players
      .filter((player) => fantasyPositions.has(player.position) && fantasyAppearance(player))
      .map((player) => ({
        ...player,
        team: playerTeam(game, player),
        fantasy: calculateFantasyPoints(player.stats, rules()),
      }));
    players.push(...dstPlayers(game));

    for (const player of players) {
      const key = String(player.playerId);
      if (!records.has(key)) {
        records.set(key, {
          key,
          name: `${player.firstName} ${player.lastName}`.trim(),
          position: player.position,
          team: player.team,
          ratings: player.ratings ?? null,
          portrait: player.portrait ?? null,
          logs: [],
        });
      }
      const record = records.get(key);
      record.team = player.team;
      if (player.ratings) record.ratings = player.ratings;
      if (player.portrait) record.portrait = player.portrait;
      record.logs.push(gameLogEntry(game, player));
    }
  }

  return [...records.values()].map((record) => {
    record.logs.sort((a, b) => {
      const phase = (weekType) => ({ RegularSeason: 0, Playoff: 1, OffSeason: 2 })[weekType] ?? 3;
      return phase(a.weekType) - phase(b.weekType) || a.week - b.week || a.gameId - b.gameId;
    });
    const total = record.logs.reduce((sum, log) => sum + log.points, 0);
    const profile = summarizePlayerProfile(record.logs);
    return {
      ...record,
      games: record.logs.length,
      total: Math.round((total + Number.EPSILON) * 100) / 100,
      average: Math.round(((total / record.logs.length) + Number.EPSILON) * 100) / 100,
      high: Math.max(...record.logs.map((log) => log.points)),
      last: record.logs.at(-1).points,
      profile,
    };
  });
}

function seasonGames() {
  const year = Number(elements['season-filter'].value);
  return (currentAnalysis?.leagueGames ?? []).filter(
    (game) => game.year === year && game.weekType !== 'PreSeason',
  );
}

function renderSeason() {
  const games = seasonGames();
  const position = elements['season-position'].value;
  const teamFilter = elements['season-team'].value;
  const allRows = buildSeasonRows(games).sort((a, b) => b.total - a.total);
  const rows = allRows
    .filter((row) => teamFilter === 'all' || String(row.team?.index) === teamFilter)
    .filter((row) => position === 'all' || row.position === position);
  seasonRowsByKey = new Map(rows.map((row) => [row.key, row]));

  elements['season-leaderboard'].replaceChildren(
    ...rows.map((player, index) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.tabIndex = 0;
      row.dataset.playerKey = player.key;
      const values = [
        index + 1,
        player.name,
        player.team?.abbreviation ?? '—',
        player.position,
        player.games,
        player.total.toFixed(2),
        player.average.toFixed(2),
        player.high.toFixed(2),
        player.last.toFixed(2),
      ];
      values.forEach((entry, cellIndex) => {
        const cell = document.createElement('td');
        cell.textContent = entry;
        if (cellIndex === 1) cell.className = 'player-name';
        if (cellIndex === 5) cell.className = 'points';
        row.append(cell);
      });
      return row;
    }),
  );
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'no-stats';
    cell.textContent = 'No fantasy results match this season and position.';
    row.append(cell);
    elements['season-leaderboard'].append(row);
  }

  const leader = rows[0];
  const high = rows.flatMap((player) => player.logs.map((log) => ({ ...log, player: player.name })))
    .sort((a, b) => b.points - a.points)[0];
  const latestWeek = games.reduce((max, game) => Math.max(max, game.week + 1), 0);
  elements['summary-leader'].textContent = leader?.name ?? '—';
  elements['summary-leader-points'].textContent = leader ? `${leader.total.toFixed(2)} points · ${leader.position}` : '—';
  elements['summary-high-player'].textContent = high?.player ?? '—';
  elements['summary-high-points'].textContent = high ? `${high.points.toFixed(2)} points · Week ${high.week + 1}` : '—';
  const scopedGames = teamFilter === 'all'
    ? games
    : games.filter((game) => String(game.homeTeam?.index) === teamFilter || String(game.awayTeam?.index) === teamFilter);
  elements['summary-games'].textContent = scopedGames.length;
  elements['summary-weeks'].textContent = latestWeek ? `Through Week ${latestWeek}` : 'No completed weeks';
}

function openPlayerLog(player) {
  if (!player) return;
  elements['dialog-team'].textContent = `${player.team?.abbreviation ?? '—'} · ${player.position}`;
  elements['dialog-player'].textContent = player.name;
  elements['dialog-total'].textContent = player.total.toFixed(2);
  elements['dialog-average'].textContent = `${player.average.toFixed(2)} PPG`;
  elements['dialog-high'].textContent = player.high.toFixed(2);
  elements['dialog-consistency'].textContent = player.profile.consistencyLabel;
  elements['dialog-consistency-score'].textContent = `${player.profile.consistencyScore}/100 · σ ${player.profile.deviation.toFixed(1)} pts`;
  renderProfilePortrait(player);
  renderProfileChart(player);
  renderProfileProduction(player);
  renderProfileRatings(player);
  elements['dialog-log-summary'].textContent = `${player.games} games · ${player.total.toFixed(2)} fantasy points`;
  elements['dialog-games'].replaceChildren(
    ...[...player.logs].reverse().map((log) => {
      const row = document.createElement('tr');
      const weekLabel = log.weekType === 'Playoff' ? `Playoff ${log.week + 1}` : `Week ${log.week + 1}`;
      [weekLabel, `${log.location} ${log.opponent}`, log.result, profileStatLine(player.position, log.stats), log.points.toFixed(2)].forEach((entry, index) => {
        const cell = document.createElement('td');
        cell.textContent = entry;
        if (index === 4) cell.className = 'points';
        row.append(cell);
      });
      return row;
    }),
  );
  const best = [...player.logs].sort((a, b) => b.points - a.points)[0];
  const milestones = [
    [player.logs[0], `Franchise debut: ${player.logs[0]?.points.toFixed(2) ?? '—'} fantasy points`],
    [best, `Career high: ${best?.points.toFixed(2) ?? '—'} points against ${best?.opponent ?? '—'}`],
    [player.logs.find((log) => log.points >= 30), 'Entered the 30-point club'],
    [player.logs.at(-1), `Latest appearance: ${player.logs.at(-1)?.result ?? '—'}`],
  ].filter(([log], index, all) => log && all.findIndex(([candidate]) => candidate === log) === index);
  elements['dialog-timeline'].replaceChildren(...milestones.map(([log, text]) => {
    const item = document.createElement('div'); item.className = 'timeline-event';
    const when = document.createElement('strong'); when.textContent = `${log.weekType === 'Playoff' ? 'Playoff' : 'Week'} ${log.week + 1}`;
    const detail = document.createElement('span'); detail.textContent = text; item.append(when, detail); return item;
  }));
  elements['player-dialog'].showModal();
}

function renderProfilePortrait(player) {
  const image = elements['dialog-portrait'];
  const fallback = elements['dialog-portrait-fallback'];
  fallback.textContent = player.position === 'DST'
    ? player.team?.abbreviation ?? 'DST'
    : player.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  fallback.hidden = false;
  image.hidden = true;
  image.removeAttribute('src');
  image.alt = `${player.name} Madden portrait`;
  if (!player.portrait?.id || player.portrait.forceSilhouette || player.position === 'DST') return;
  image.onload = () => {
    image.hidden = false;
    fallback.hidden = true;
  };
  image.onerror = () => {
    image.hidden = true;
    fallback.hidden = false;
  };
  image.src = `https://ratings-images-prod.pulse.ea.com/madden-nfl-27/portraits/${encodeURIComponent(player.portrait.id)}.png?im=FaceCrop,padding=0.7`;
}

function profileStatLine(position, stats) {
  if (position === 'QB') {
    return `${n(stats, 'PASSCOMPLETED')}/${n(stats, 'PASSATTEMPTS')}, ${n(stats, 'PASSYARDS')} PY, ${n(stats, 'PASSTDS')} PTD, ${n(stats, 'PASSINTS')} INT`;
  }
  if (position === 'DST') {
    return `${n(stats, 'DSTSACKS')} sacks, ${n(stats, 'DSTTAKEAWAYS')} takeaways, ${n(stats, 'DSTTDS')} TD, ${n(stats, 'DSTPOINTSALLOWED')} PA`;
  }
  if (position === 'K') {
    return `${n(stats, 'KICKFGMADE')}/${n(stats, 'KICKFGATTEMPTS')} FG, ${n(stats, 'KICKEPMADE')}/${n(stats, 'KICKEPATTEMPTS')} XP`;
  }
  const receiving = `${n(stats, 'RECEIVECATCHES')} rec, ${n(stats, 'RECEIVEYARDS')} yds, ${n(stats, 'RECEIVETDS')} TD`;
  const rushing = n(stats, 'RUSHATTEMPTS')
    ? ` · ${n(stats, 'RUSHATTEMPTS')} car, ${n(stats, 'RUSHYARDS')} yds, ${n(stats, 'RUSHTDS')} TD`
    : '';
  return receiving + rushing;
}

function renderProfileChart(player) {
  const svg = elements['dialog-chart'];
  const namespace = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const logs = player.logs;
  const width = 760;
  const baseline = logs.some((log) => log.points < 0) ? 137 : 147;
  const positiveMax = Math.max(1, ...logs.map((log) => Math.max(0, log.points)));
  const negativeMax = Math.max(1, ...logs.map((log) => Math.max(0, -log.points)));
  const slot = width / Math.max(logs.length, 1);
  const barWidth = Math.min(42, slot * 0.58);
  for (const y of [42, 77, 112, baseline]) {
    const line = document.createElementNS(namespace, 'line');
    line.setAttribute('x1', '16'); line.setAttribute('x2', String(width - 16));
    line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y));
    line.setAttribute('class', 'grid-line');
    svg.append(line);
  }
  logs.forEach((log, index) => {
    const center = slot * index + slot / 2;
    const positive = log.points >= 0;
    const height = positive
      ? Math.max(2, (log.points / positiveMax) * 100)
      : Math.max(2, (-log.points / negativeMax) * 22);
    const bar = document.createElementNS(namespace, 'rect');
    bar.setAttribute('x', String(center - barWidth / 2));
    bar.setAttribute('y', String(positive ? baseline - height : baseline));
    bar.setAttribute('width', String(barWidth));
    bar.setAttribute('height', String(height));
    bar.setAttribute('rx', '4');
    bar.setAttribute('class', `chart-bar${log.points === player.high ? ' high' : ''}`);
    const valueLabel = document.createElementNS(namespace, 'text');
    valueLabel.setAttribute('x', String(center));
    valueLabel.setAttribute('y', String(positive ? baseline - height - 6 : baseline + height + 12));
    valueLabel.setAttribute('class', 'chart-value');
    valueLabel.textContent = log.points.toFixed(1);
    const weekLabel = document.createElementNS(namespace, 'text');
    weekLabel.setAttribute('x', String(center));
    weekLabel.setAttribute('y', '177');
    weekLabel.setAttribute('class', 'chart-week');
    weekLabel.textContent = log.weekType === 'Playoff' ? `P${log.week + 1}` : `W${log.week + 1}`;
    svg.append(bar, valueLabel, weekLabel);
  });
}

function profileStat(label, value) {
  const tile = document.createElement('div');
  tile.className = 'profile-stat';
  const caption = document.createElement('span');
  caption.textContent = label;
  const number = document.createElement('strong');
  number.textContent = value;
  tile.append(caption, number);
  return tile;
}

function renderProfileProduction(player) {
  const stats = player.profile.aggregate;
  const shares = player.profile.shares;
  let metrics;
  if (player.position === 'QB') {
    metrics = [
      ['Pass yards', n(stats, 'PASSYARDS').toLocaleString()],
      ['Pass TD / INT', `${n(stats, 'PASSTDS')} / ${n(stats, 'PASSINTS')}`],
      ['Team pass attempts', percentage(shares.passAttempts)],
      ['Rush yards', n(stats, 'RUSHYARDS').toLocaleString()],
    ];
  } else if (player.position === 'DST') {
    metrics = [
      ['Sacks', n(stats, 'DSTSACKS')],
      ['Takeaways', n(stats, 'DSTTAKEAWAYS')],
      ['Touchdowns', n(stats, 'DSTTDS')],
      ['Points allowed/game', (n(stats, 'DSTPOINTSALLOWED') / Math.max(player.games, 1)).toFixed(1)],
    ];
  } else if (player.position === 'K') {
    metrics = [
      ['Field goals', `${n(stats, 'KICKFGMADE')}/${n(stats, 'KICKFGATTEMPTS')}`],
      ['Extra points', `${n(stats, 'KICKEPMADE')}/${n(stats, 'KICKEPATTEMPTS')}`],
      ['50+ made', n(stats, 'KICKFGMADE50ORMORE')],
      ['Long', n(stats, 'KICKFGLONGEST')],
    ];
  } else {
    metrics = [
      ['Receptions', n(stats, 'RECEIVECATCHES')],
      ['Receiving yards', n(stats, 'RECEIVEYARDS').toLocaleString()],
      ['Reception share', percentage(shares.receptions)],
      ['Receiving yard share', percentage(shares.receivingYards)],
      ['Rush attempts', n(stats, 'RUSHATTEMPTS')],
      ['Rush yards', n(stats, 'RUSHYARDS').toLocaleString()],
      ['Rush attempt share', percentage(shares.rushAttempts)],
      ['Total touchdowns', n(stats, 'RECEIVETDS') + n(stats, 'RUSHTDS')],
    ];
  }
  elements['dialog-production'].replaceChildren(...metrics.map(([label, value]) => profileStat(label, value)));
}

function renderProfileRatings(player) {
  const ratings = player.ratings;
  if (!ratings) {
    elements['dialog-rating-meta'].textContent = player.position === 'DST' ? 'Team unit' : 'Not available';
    elements['dialog-ratings'].replaceChildren(profileStat('Ratings', '—'));
    return;
  }
  const common = [
    ['OVR', 'OverallRating'], ['SPD', 'SpeedRating'], ['ACC', 'AccelerationRating'], ['AWR', 'AwarenessRating'],
  ];
  const positionRatings = player.position === 'QB'
    ? [['THP', 'ThrowPowerRating'], ['SAC', 'ThrowAccuracyShortRating'], ['MAC', 'ThrowAccuracyMidRating'], ['DAC', 'ThrowAccuracyDeepRating']]
    : player.position === 'K'
      ? [['KPW', 'KickPowerRating'], ['KAC', 'KickAccuracyRating']]
      : player.position === 'HB' || player.position === 'FB'
        ? [['CAR', 'CarryingRating'], ['BTK', 'BreakTackleRating'], ['CTH', 'CatchingRating'], ['CIT', 'CatchInTrafficRating']]
        : [['CTH', 'CatchingRating'], ['CIT', 'CatchInTrafficRating'], ['SRR', 'ShortRouteRunningRating'], ['MRR', 'MediumRouteRunningRating'], ['DRR', 'DeepRouteRunningRating']];
  const selected = [...common, ...positionRatings].filter(([, key]) => ratings[key] !== undefined && ratings[key] !== null);
  elements['dialog-ratings'].replaceChildren(...selected.map(([label, key]) => {
    const pill = document.createElement('div');
    pill.className = 'rating-pill';
    const score = document.createElement('strong');
    score.textContent = ratings[key];
    const caption = document.createElement('span');
    caption.textContent = label;
    pill.append(score, caption);
    return pill;
  }));
  const development = String(ratings.TraitDevelopment ?? 'Normal').replaceAll('_', ' ');
  elements['dialog-rating-meta'].textContent = `Age ${ratings.Age ?? '—'} · ${development}`;
}

function populateSeasonFilters() {
  const previousTeam = elements['season-team'].value;
  const years = [...new Set((currentAnalysis?.leagueGames ?? [])
    .filter((game) => game.weekType !== 'PreSeason')
    .map((game) => game.year))].sort((a, b) => b - a);
  elements['season-filter'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  elements['season-team'].replaceChildren(
    option('all', 'All Teams'),
    ...availableTeams().map((team) => option(team.index, `${team.name} (${team.abbreviation})`)),
  );
  elements['season-team'].value = previousTeam && [...elements['season-team'].options].some((item) => item.value === previousTeam)
    ? previousTeam
    : 'all';
  elements['season-position'].replaceChildren(
    option('all', 'All Positions'),
    ...['QB', 'HB', 'FB', 'WR', 'TE', 'K', 'DST'].map((position) => option(position, position)),
  );
}

function populateAnalyticsFilters() {
  const games = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason');
  const previousYear = elements['analytics-season'].value;
  const previousTeam = elements['analytics-team'].value;
  const years = [...new Set(games.map((game) => game.year))].sort((a, b) => b - a);
  elements['analytics-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['analytics-season'].value = previousYear;

  const orderedTeams = availableTeams();
  elements['analytics-team'].replaceChildren(
    ...orderedTeams.map((team) => option(team.index, `${team.name} (${team.abbreviation})`)),
  );
  elements['analytics-team'].value = orderedTeams.map((team) => String(team.index)).includes(previousTeam)
    ? previousTeam
    : String(preferredTeamIndex());
}

function populateIdentityFilters() {
  const games = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason');
  const previousYear = elements['identity-season'].value;
  const previousTeam = elements['identity-team'].value;
  const years = [...new Set(games.map((game) => game.year))].sort((a, b) => b - a);
  elements['identity-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['identity-season'].value = previousYear;
  elements['identity-team'].replaceChildren(option('all', 'All Teams'), ...availableTeams().map((team) => option(
    team.index, `${team.name} (${team.abbreviation})`,
  )));
  if ([...elements['identity-team'].options].some((entry) => entry.value === previousTeam)) elements['identity-team'].value = previousTeam;
}

function populateRecordsFilters() {
  const leagueGames = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason');
  const previousYear = elements['records-season'].value;
  const previousTeam = elements['records-team'].value;
  const years = [...new Set(leagueGames.map((game) => game.year))].sort((a, b) => b - a);
  elements['records-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['records-season'].value = previousYear;

  const ordered = availableTeams();
  elements['records-team'].replaceChildren(
    option('all', 'All Teams'),
    ...ordered.map((team) => option(team.index, `${team.name} (${team.abbreviation})`)),
  );
  elements['records-team'].value = previousTeam === 'all' || ordered.map((team) => String(team.index)).includes(previousTeam)
    ? previousTeam
    : String(preferredTeamIndex());
}

function populateHqFilters() {
  const games = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason');
  const previousYear = elements['hq-season'].value; const previousTeam = elements['hq-team'].value;
  const years = [...new Set(games.map((game) => game.year))].sort((a, b) => b - a);
  elements['hq-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['hq-season'].value = previousYear;
  const teams = availableTeams();
  elements['hq-team'].replaceChildren(...teams.map((team) => option(team.index, `${team.name} (${team.abbreviation})`)));
  elements['hq-team'].value = teams.some((team) => String(team.index) === previousTeam) ? previousTeam : String(preferredTeamIndex());
}

function renderFantasyHq() {
  const year = Number(elements['hq-season'].value); const teamIndex = Number(elements['hq-team'].value);
  const games = (currentAnalysis?.leagueGames ?? []).filter((game) => game.year === year && game.weekType !== 'PreSeason');
  const redzone = buildFantasyRedZone(games, rules());
  elements['hq-week'].textContent = redzone.week ? `${redzone.week.weekType === 'Playoff' ? 'Playoff' : 'Week'} ${redzone.week.week + 1}` : 'Latest week';
  elements['hq-leaders'].replaceChildren(...redzone.leaders.slice(0, 6).map((appearance, index) => {
    const row = document.createElement('div'); row.className = 'hq-row';
    row.append(Object.assign(document.createElement('strong'), { textContent: `${index + 1}. ${appearance.name} · ${appearance.team?.abbreviation ?? '—'}` }), Object.assign(document.createElement('span'), { textContent: appearance.points.toFixed(2) })); return row;
  }));
  const spotlightGames = [...redzone.shootouts.slice(0, 2), ...redzone.closeGames.slice(0, 2)]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.game.gameId === entry.game.gameId) === index);
  elements['hq-games'].replaceChildren(...spotlightGames.map(({ game, total, margin }) => {
    const row = document.createElement('div'); row.className = 'hq-row';
    row.append(Object.assign(document.createElement('strong'), { textContent: `${game.awayTeam?.abbreviation} ${game.awayScore} · ${game.homeTeam?.abbreviation} ${game.homeScore}` }), Object.assign(document.createElement('span'), { textContent: margin <= 8 ? `${margin}-pt finish` : `${total} total` })); return row;
  }));

  const rankings = buildNflPowerRankings(games, availableTeams());
  elements['hq-power'].replaceChildren(...rankings.map((entry) => {
    const row = document.createElement('tr'); appendCells(row, [[entry.rank], [`${entry.team.name} (${entry.team.abbreviation})`, 'player-name'], [`${entry.wins}-${entry.losses}${entry.ties ? `-${entry.ties}` : ''}`], [entry.pointsFor], [entry.pointsAgainst], [`${entry.movement} ${entry.momentum > 0 ? 'Hot' : entry.momentum < 0 ? 'Cooling' : 'Steady'}`, 'points']]); return row;
  }));
  const history = buildHeadToHeadHistory(games, teamIndex);
  elements['hq-history'].replaceChildren(...history.map((entry) => {
    const row = document.createElement('tr'); appendCells(row, [[`${entry.opponent.name} (${entry.opponent.abbreviation})`, 'player-name'], [`${entry.wins}-${entry.losses}${entry.ties ? `-${entry.ties}` : ''}`], [entry.pointsFor], [entry.pointsAgainst]]); return row;
  }));
  if (!history.length) emptyTable(elements['hq-history'], 4, 'No head-to-head games found.');

  const magazine = buildSeasonMagazine(games, rules());
  elements['hq-mag-title'].textContent = magazine.title; elements['hq-mag-dek'].textContent = magazine.dek;
  const scoringGame = magazine.highestScoringGame;
  const magazineItems = [
    ['Fantasy MVP', magazine.seasonStar ? `${magazine.seasonStar.name} · ${magazine.seasonStar.points.toFixed(2)} pts` : '—'],
    ['Performance of the year', magazine.highGame ? `${magazine.highGame.name} · ${magazine.highGame.points.toFixed(2)} pts` : '—'],
    ['Game of the year', scoringGame ? `${scoringGame.awayTeam?.abbreviation} ${scoringGame.awayScore} – ${scoringGame.homeTeam?.abbreviation} ${scoringGame.homeScore}` : '—'],
  ];
  elements['hq-magazine'].replaceChildren(...magazineItems.map(([label, value]) => {
    const item = document.createElement('div'); item.className = 'magazine-item'; item.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('strong'), { textContent: value })); return item;
  }));

  const alerts = [];
  const weekNumbers = [...new Set(games.filter((game) => game.weekType === 'RegularSeason').map((game) => game.week))];
  const expectedWeeks = weekNumbers.length ? Math.max(...weekNumbers) + 1 : 0;
  if (weekNumbers.length < expectedWeeks) alerts.push(`${expectedWeeks - weekNumbers.length} completed week${expectedWeeks - weekNumbers.length === 1 ? '' : 's'} missing from the save data.`);
  if (activeLeague?.waiverClaims?.length) alerts.push(`${activeLeague.waiverClaims.length} fantasy waiver claim${activeLeague.waiverClaims.length === 1 ? '' : 's'} awaiting processing.`);
  alerts.push(...(activeLeague?.notifications ?? []).slice(0, 3).map((entry) => entry.text));
  if (!alerts.length) alerts.push('Everything is current. No lineup, data, or league alerts detected.');
  elements['hq-alerts'].replaceChildren(...alerts.map((text) => {
    const row = document.createElement('div'); row.className = 'hq-row'; row.append(Object.assign(document.createElement('strong'), { textContent: text }), Object.assign(document.createElement('span'), { textContent: '•' })); return row;
  }));
}

const percentage = (value) => `${Math.round(value * 1000) / 10}%`;

function appendCells(row, values) {
  for (const [entry, className] of values) {
    const cell = document.createElement('td');
    cell.textContent = entry;
    if (className) cell.className = className;
    row.append(cell);
  }
}

function emptyTable(body, columns, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'no-stats';
  cell.textContent = message;
  row.append(cell);
  body.replaceChildren(row);
}

function renderAnalytics() {
  const year = Number(elements['analytics-season'].value);
  const teamIndex = Number(elements['analytics-team'].value);
  const games = (currentAnalysis?.leagueGames ?? []).filter(
    (game) => game.weekType !== 'PreSeason' && game.year === year &&
      (game.homeTeam?.index === teamIndex || game.awayTeam?.index === teamIndex),
  );
  const analysis = analyzeTeamGames(games, teamIndex);
  const { totals, receivers, positions, weekly, concentration } = analysis;
  const leader = receivers[0];
  analyticsRowsByKey = new Map(
    buildSeasonRows(games)
      .filter((player) => player.team?.index === teamIndex)
      .map((player) => [player.key, player]),
  );

  elements['analytics-balance'].textContent = totals.games ? `${percentage(totals.passRate)} pass` : '—';
  elements['analytics-balance-detail'].textContent = totals.games
    ? `${totals.passAttempts} pass attempts · ${totals.rushAttempts} rushes`
    : 'No played games';
  elements['analytics-ypg'].textContent = totals.games ? `${totals.passYardsPerGame.toFixed(1)} pass` : '—';
  elements['analytics-ypg-detail'].textContent = totals.games
    ? `${totals.rushYardsPerGame.toFixed(1)} rush · ${percentage(totals.completionRate)} complete`
    : '—';
  elements['analytics-top-player'].textContent = leader?.name ?? '—';
  elements['analytics-top-share'].textContent = leader
    ? `${percentage(leader.receptionShare)} of catches · ${percentage(leader.yardShare)} of yards`
    : '—';
  elements['analytics-concentration'].textContent = totals.games ? concentration.label : '—';
  elements['analytics-concentration-detail'].textContent = totals.games
    ? `${percentage(concentration.topTwoShare)} of catches went to the top two`
    : '—';
  elements['analytics-passing-line'].textContent = totals.games
    ? `${totals.completions} completions · ${totals.passYards.toLocaleString()} yards · ${totals.passTouchdowns} TD · ${totals.interceptions} INT`
    : '—';

  if (receivers.length) {
    elements['analytics-receivers'].replaceChildren(
      ...receivers.map((receiver, index) => {
        const row = document.createElement('tr');
        row.className = 'clickable-row';
        row.tabIndex = 0;
        row.dataset.playerKey = receiver.key;
        appendCells(row, [
          [index + 1],
          [receiver.name, 'player-name'],
          [receiver.position],
          [receiver.receptions],
          [percentage(receiver.receptionShare), 'share-value'],
          [receiver.yards.toLocaleString(), 'points'],
          [percentage(receiver.yardShare), 'share-value'],
          [receiver.yardsPerCatch.toFixed(1)],
          [receiver.touchdowns],
          [receiver.yardsAfterCatch],
          [receiver.drops],
        ]);
        return row;
      }),
    );
  } else {
    emptyTable(elements['analytics-receivers'], 11, 'No receiving production was found for this team and season.');
  }

  if (positions.length) {
    elements['analytics-positions'].replaceChildren(
      ...positions.map((position) => {
        const row = document.createElement('tr');
        appendCells(row, [
          [position.position, 'player-name'],
          [position.receptions],
          [percentage(position.receptionShare), 'share-value'],
          [position.yards.toLocaleString(), 'points'],
          [position.touchdowns],
        ]);
        return row;
      }),
    );
  } else {
    emptyTable(elements['analytics-positions'], 5, 'No position data found.');
  }

  if (weekly.length) {
    elements['analytics-weekly'].replaceChildren(
      ...[...weekly].reverse().map((game) => {
        const row = document.createElement('tr');
        const week = game.weekType === 'Playoff' ? `Playoff ${game.week + 1}` : `Week ${game.week + 1}`;
        const topReceiver = game.topReceiver
          ? `${game.topReceiver.name} · ${game.topReceiver.receptions}/${game.topReceiver.yards}`
          : '—';
        appendCells(row, [
          [week],
          [`${game.location} ${game.opponent?.abbreviation ?? '—'}`, 'team-cell'],
          [game.result],
          [game.passAttempts],
          [game.rushAttempts],
          [percentage(game.passRate), 'share-value'],
          [game.passYards],
          [game.rushYards],
          [topReceiver, 'player-name'],
          [percentage(game.topTwoShare), 'share-value'],
        ]);
        return row;
      }),
    );
  } else {
    emptyTable(elements['analytics-weekly'], 10, 'No played games were found for this team and season.');
  }
}

function renderIdentities() {
  const year = Number(elements['identity-season'].value);
  const selectedTeam = elements['identity-team'].value;
  const games = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason' && game.year === year);
  const profiles = buildNflTeamStyles(games, availableTeams())
    .filter((profile) => selectedTeam === 'all' || String(profile.team.index) === selectedTeam)
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
  const gameCounts = profiles.map((profile) => profile.metrics.games).filter(Boolean);
  const minimumGames = gameCounts.length ? Math.min(...gameCounts) : 0;
  elements['identity-confidence'].textContent = minimumGames >= 8
    ? `Strong sample · at least ${minimumGames} games per displayed team`
    : `Developing sample · ${minimumGames} completed games for the least-observed team`;
  elements['identity-grid'].replaceChildren(...profiles.map((profile) => {
    const card = document.createElement('article'); card.className = 'identity-card panel';
    const head = document.createElement('div'); head.className = 'identity-head';
    const mark = document.createElement('span'); mark.textContent = profile.team.abbreviation;
    const title = document.createElement('div');
    const name = document.createElement('h3'); name.textContent = profile.team.name;
    const sample = document.createElement('small'); sample.textContent = `${profile.metrics.games} games · ${profile.metrics.pointsPg.toFixed(1)} PF · ${profile.metrics.pointsAllowedPg.toFixed(1)} PA`;
    title.append(name, sample); head.append(mark, title);
    const groups = document.createElement('div'); groups.className = 'identity-groups';
    for (const [label, styles] of [['OFFENSE', profile.offense], ['DEFENSE', profile.defense]]) {
      const group = document.createElement('section');
      const eyebrow = document.createElement('b'); eyebrow.textContent = label;
      const primary = document.createElement('strong'); primary.textContent = styles[0]?.name ?? 'Unformed';
      const description = document.createElement('p'); description.textContent = styles[0]?.description ?? 'More games are needed.';
      const tags = document.createElement('div'); tags.className = 'identity-tags';
      tags.append(...styles.slice(1).map((style) => { const tag = document.createElement('span'); tag.textContent = style.name; tag.title = style.description; return tag; }));
      group.append(eyebrow, primary, description, tags); groups.append(group);
    }
    const metrics = document.createElement('div'); metrics.className = 'identity-metrics';
    metrics.append(
      `${Math.round(profile.metrics.passRate * 100)}% pass`,
      `${profile.metrics.passYpg.toFixed(0)} pass YPG`,
      `${profile.metrics.rushYpg.toFixed(0)} rush YPG`,
      `${profile.metrics.sacksPg.toFixed(1)} sacks`,
      `${profile.metrics.takeawaysPg.toFixed(1)} takeaways`,
    );
    card.append(head, groups, metrics); return card;
  }));
}

function awardText(appearance) {
  return appearance ? `${appearance.name} · ${appearance.points.toFixed(2)}` : '—';
}

function renderRecords() {
  const year = Number(elements['records-season'].value);
  const teamValue = elements['records-team'].value;
  const teamIndex = teamValue === 'all' ? null : Number(teamValue);
  const allGames = (currentAnalysis?.leagueGames ?? []).filter((game) => game.weekType !== 'PreSeason');
  const games = allGames.filter((game) => game.year === year);
  const book = buildRecordBook(allGames, rules(), teamIndex);
  const awards = buildWeeklyAwards(games, rules(), teamIndex);
  const profiles = buildSeasonRows(games);
  recordsRowsByKey = new Map(profiles.map((player) => [player.key, player]));
  const selectedTeam = availableTeams().find((team) => team.index === teamIndex);
  elements['awards-scope'].textContent = selectedTeam ? `${selectedTeam.abbreviation} weekly winners` : 'League-wide winners';

  elements['record-cards'].replaceChildren(...book.categories.map((item) => {
    const card = document.createElement('article');
    card.className = 'record-card panel';
    const label = document.createElement('span');
    label.textContent = item.label;
    const value = document.createElement('strong');
    value.textContent = item.display;
    const holder = document.createElement('b');
    holder.textContent = `${item.holder}${item.team?.abbreviation ? ` · ${item.team.abbreviation}` : ''}`;
    const detail = document.createElement('small');
    detail.textContent = item.game
      ? `Year ${item.game.year + 1} · Week ${item.game.week + 1} · ${item.result}`
      : 'No record available';
    card.append(label, value, holder, detail);
    return card;
  }));

  const seasonLeaders = book.seasonLeaders.filter((player) => player.year === year).slice(0, 20);
  if (seasonLeaders.length) {
    elements['season-records'].replaceChildren(...seasonLeaders.map((player, index) => {
      const row = document.createElement('tr');
      row.className = 'clickable-row';
      row.tabIndex = 0;
      row.dataset.playerKey = player.key.split(':').slice(1).join(':');
      appendCells(row, [
        [index + 1], [player.name, 'player-name'], [player.team?.abbreviation ?? '—', 'team-cell'],
        [player.position], [player.games], [player.points.toFixed(2), 'points'],
        [player.average.toFixed(2)], [player.high.toFixed(2)],
      ]);
      return row;
    }));
  } else {
    emptyTable(elements['season-records'], 8, 'No season fantasy records found.');
  }

  if (awards.length) {
    elements['weekly-awards'].replaceChildren(...[...awards].reverse().map((award) => {
      const row = document.createElement('tr');
      const week = award.weekType === 'Playoff' ? `Playoff ${award.week + 1}` : `Week ${award.week + 1}`;
      appendCells(row, [
        [week], [awardText(award.overall), 'player-name'], [awardText(award.quarterback)],
        [awardText(award.playmaker)], [awardText(award.defense)],
      ]);
      return row;
    }));
  } else {
    emptyTable(elements['weekly-awards'], 5, 'No weekly awards found.');
  }

  const recapGames = (currentAnalysis?.leagueGames ?? []).filter(
    (game) => game.weekType !== 'PreSeason' && game.year === year && (teamIndex === null ||
      game.homeTeam?.index === teamIndex || game.awayTeam?.index === teamIndex),
  );
  const recaps = buildTeamRecaps(recapGames, teamIndex, rules());
  const visibleRecaps = recaps.slice(0, recapVisibleCount);
  elements['recap-count'].textContent = recaps.length
    ? `Showing ${visibleRecaps.length} of ${recaps.length} generated recaps`
    : 'Generated locally from the Franchise save';
  elements['recap-more'].hidden = visibleRecaps.length >= recaps.length;
  elements['recap-more'].textContent = `Show ${Math.min(loadPreferences().recapPageSize, recaps.length - visibleRecaps.length)} more recaps`;
  elements['recap-list'].replaceChildren(...visibleRecaps.map((recap) => {
    const card = document.createElement('article');
    card.className = 'recap-card panel';
    const top = document.createElement('div');
    top.className = 'recap-topline';
    const week = document.createElement('span');
    week.textContent = recap.game.weekType === 'Playoff' ? `Playoff ${recap.game.week + 1}` : `Week ${recap.game.week + 1}`;
    const kicker = document.createElement('span');
    kicker.textContent = recap.kicker;
    const title = document.createElement('h3');
    title.textContent = recap.headline;
    const copy = document.createElement('p');
    copy.textContent = recap.recap;
    const ball = document.createElement('div');
    ball.className = 'game-ball';
    ball.append('FANTASY GAME BALL · ');
    const winner = document.createElement('strong');
    winner.textContent = recap.gameBall ? `${recap.gameBall.name} (${recap.gameBall.points.toFixed(2)} pts)` : '—';
    ball.append(winner);
    top.append(week, kicker);
    card.append(top, title, copy, ball);
    return card;
  }));
  if (!recaps.length) {
    const card = document.createElement('article');
    card.className = 'recap-card panel';
    const copy = document.createElement('p');
    copy.textContent = teamIndex === null
      ? 'No played games were found for this season.'
      : 'No played games were found for this team and season.';
    card.append(copy);
    elements['recap-list'].append(card);
  }
}

function leagueStorageKey(year) {
  return `madden-fantasy-league:${encodeURIComponent(currentAnalysis?.sourcePath ?? 'unknown')}:${year}`;
}

function lineupWeeks(weeks) {
  if (!weeks.length) return [];
  const latest = weeks.at(-1);
  return [...weeks, { week: latest.week + 1, weekType: 'RegularSeason', upcoming: true }];
}

function renderLineupEditor(container, team, players, week, locked = false) {
  if (!team || !week) { container.replaceChildren(); return; }
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const saved = team.lineups?.[lineupWeekKey(week)];
  const automatic = bestLineup(team, playersByKey, week);
  const automaticSelections = Object.fromEntries(LINEUP_SLOTS.map((slot, index) => [slot.id, automatic.entries[index]?.player.key ?? '']));
  const selections = saved ?? automaticSelections;
  container.replaceChildren(...LINEUP_SLOTS.map((slot) => {
    const row = document.createElement('label'); row.className = 'lineup-slot';
    const label = document.createElement('strong'); label.textContent = slot.label;
    const select = document.createElement('select'); select.dataset.lineupSlot = slot.id; select.disabled = locked;
    const choices = team.roster.map((key) => playersByKey.get(key)).filter((player) => {
      const position = player?.position === 'FB' ? 'HB' : player?.position;
      return player && slot.positions.includes(position);
    }).sort((a, b) => b.average - a.average || a.name.localeCompare(b.name));
    select.append(option('', `Choose ${slot.label}`), ...choices.map((player) => option(
      player.key, `${player.name} · ${player.team?.abbreviation ?? '—'} · ${player.average.toFixed(1)} avg`,
    )));
    select.value = selections[slot.id] ?? '';
    row.append(label, select);
    return row;
  }));
}

function lineupSelections(container) {
  return Object.fromEntries([...container.querySelectorAll('select[data-lineup-slot]')]
    .map((select) => [select.dataset.lineupSlot, select.value]));
}

function nextOpponent(league, teamId, round) {
  const pairing = roundRobinPairings(league.teams.map((team) => team.id), round)
    .find((teams) => teams.includes(teamId));
  const opponentId = pairing?.find((id) => id !== teamId);
  return league.teams.find((team) => team.id === opponentId) ?? null;
}

function saveLeague() {
  if (activeLeague) localStorage.setItem(leagueStorageKey(activeLeague.seasonYear), JSON.stringify(activeLeague));
}

function resetLeagueDashboardControls() {
  for (const id of ['league-week', 'league-roster-team', 'commissioner-team', 'commissioner-add', 'commissioner-drop']) elements[id].replaceChildren();
  for (const id of ['league-lineup-editor', 'league-standings', 'league-matchups', 'league-roster', 'draft-pool', 'draft-roster', 'draft-log', 'draft-needs', 'draft-queue', 'draft-scarcity', 'league-projections', 'league-recommendations', 'league-playoffs', 'league-history', 'league-notifications', 'league-transactions']) elements[id].replaceChildren();
  elements['draft-search'].value = '';
  elements['draft-position'].value = 'all';
  elements['league-mock-result'].textContent = '';
  for (const id of ['league-season', 'league-team-count', 'league-draft-mode', 'league-draft-slot']) elements[id].disabled = false;
  updateDraftSlots();
}

function loadLeague() {
  const year = Number(elements['league-season'].value);
  try {
    const stored = JSON.parse(localStorage.getItem(leagueStorageKey(year)));
    activeLeague = stored?.seasonYear === year ? upgradeFantasyLeague(stored) : null;
    activeLeague?.teams.forEach((team, index) => {
      team.archetype ??= archetypeForTeam(index, activeLeague.draftSeed ?? 1).id;
    });
    if (activeLeague) {
      activeLeague.userTeamId ??= activeLeague.teams[0]?.id;
      activeLeague.commissionerUndo ??= [];
    }
  } catch {
    activeLeague = null;
  }
}

function populateLeagueFilters() {
  const previousYear = elements['league-season'].value;
  const years = [...new Set((currentAnalysis?.leagueGames ?? [])
    .filter((game) => game.weekType === 'RegularSeason')
    .map((game) => game.year))].sort((a, b) => b - a);
  elements['league-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['league-season'].value = previousYear;
  updateDraftSlots();
  loadLeague();
}

function updateDraftSlots() {
  const count = Number(elements['league-team-count'].value) || 4;
  const previous = elements['league-draft-slot'].value;
  elements['league-draft-slot'].replaceChildren(...Array.from({ length: count }, (_, index) => option(index + 1, `Pick ${index + 1}`)));
  if ([...elements['league-draft-slot'].options].some((entry) => entry.value === previous)) elements['league-draft-slot'].value = previous;
  const draftType = elements['league-draft-mode'].value;
  elements['league-draft-slot'].disabled = draftType === 'instant';
  elements['league-auction-budget-label'].hidden = draftType !== 'auction';
  elements['league-faab-budget-label'].hidden = elements['league-waiver-type'].value !== 'faab';
}

function leagueData() {
  const year = Number(elements['league-season'].value);
  const games = (currentAnalysis?.leagueGames ?? []).filter(
    (game) => game.year === year && game.weekType === 'RegularSeason',
  );
  const players = buildSeasonRows(games);
  const weeks = [...new Map(games.map((game) => [`${game.weekType}:${game.week}`, { week: game.week, weekType: game.weekType }])).values()]
    .sort((a, b) => a.week - b.week);
  return { year, games, players, weeks };
}

function renderDraftRoom(players) {
  if (!activeLeague?.draft || activeLeague.draft.status !== 'active') return;
  const paused = Boolean(activeLeague.draft.paused);
  elements['draft-pause'].textContent = paused ? 'Resume draft' : 'Pause draft';
  elements['draft-undo'].disabled = !activeLeague.draftCheckpoint;
  if (paused) elements['draft-status'].textContent = 'Draft paused';
  if (!paused && currentDraftTeam(activeLeague)?.id !== activeLeague.userTeamId) {
    advanceAiDraft(activeLeague, players); saveLeague();
    if (activeLeague.draft.status !== 'active') { renderLeague(); return; }
  }
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const userTeam = activeLeague.teams.find((team) => team.id === activeLeague.userTeamId);
  const onClock = currentDraftTeam(activeLeague);
  const needs = draftNeeds(userTeam, playersByKey);
  const overallPick = activeLeague.draft.pickIndex + 1;
  const round = Math.floor(activeLeague.draft.pickIndex / activeLeague.teams.length) + 1;
  const pickInRound = (activeLeague.draft.pickIndex % activeLeague.teams.length) + 1;
  const auction = activeLeague.draft.type === 'auction';
  elements['draft-format-label'].textContent = auction ? 'LIVE AUCTION DRAFT' : 'LIVE SNAKE DRAFT';
  if (!paused) elements['draft-status'].textContent = onClock?.id === userTeam.id ? (auction ? 'Nominate and bid' : 'You’re on the clock') : `${onClock?.name ?? 'AI'} is picking`;
  const openPositions = Object.entries(needs).filter(([, remaining]) => remaining > 0).map(([position, remaining]) => `${position} ×${remaining}`);
  const clock = activeLeague.settings.draftTimer ? `${activeLeague.settings.draftTimer} sec clock · ` : 'No clock · ';
  elements['draft-on-clock'].textContent = `${userTeam.name} · ${clock}${auction ? `$${activeLeague.draft.budgets[userTeam.id]} left · ` : `Pick ${overallPick} · `}Still need ${openPositions.join(', ')}`;
  elements['draft-bid-label'].hidden = !auction;
  elements['draft-bid'].max = activeLeague.draft.budgets[userTeam.id] ?? activeLeague.settings.auctionBudget;
  elements['draft-round'].textContent = round;
  elements['draft-pick'].textContent = pickInRound;
  elements['draft-needs'].replaceChildren(...Object.entries(needs).map(([position, remaining]) => {
    const badge = document.createElement('span'); badge.className = `draft-need${remaining ? ' open' : ''}`; badge.textContent = `${position} ${remaining} left`; return badge;
  }));
  const query = elements['draft-search'].value.trim().toLowerCase();
  const position = elements['draft-position'].value;
  const available = activeLeague.draft.available.map((key) => playersByKey.get(key)).filter(Boolean)
    .filter((player) => !query || player.name.toLowerCase().includes(query) || player.team?.abbreviation?.toLowerCase().includes(query))
    .filter((player) => position === 'all' || (player.position === 'FB' ? 'HB' : player.position) === position)
    .sort((a, b) => {
      const aPosition = a.position === 'FB' ? 'HB' : a.position; const bPosition = b.position === 'FB' ? 'HB' : b.position;
      const aDraftable = needs[aPosition] > 0 ? 1 : 0; const bDraftable = needs[bPosition] > 0 ? 1 : 0;
      return bDraftable - aDraftable || (Number(b.ratings?.OverallRating) || 0) - (Number(a.ratings?.OverallRating) || 0) || b.average - a.average;
    });
  elements['draft-pool'].replaceChildren(...available.map((player, index) => {
    const normalized = player.position === 'FB' ? 'HB' : player.position;
    const row = document.createElement('tr');
    appendCells(row, [[index + 1], [player.name, 'player-name'], [player.team?.abbreviation ?? '—', 'team-cell'], [player.position], [player.ratings?.OverallRating ?? '—'], [player.average.toFixed(2)], [player.total.toFixed(2), 'points']]);
    const queueCell = document.createElement('td'); const queue = document.createElement('button');
    queue.className = 'secondary queue-button'; queue.textContent = activeLeague.draft.queue?.includes(player.key) ? '★' : '☆'; queue.dataset.queuePlayerKey = player.key; queueCell.append(queue);
    const action = document.createElement('td'); const button = document.createElement('button');
    button.textContent = needs[normalized] ? (auction ? 'Bid' : 'Draft') : 'Full'; button.disabled = paused || !needs[normalized]; button.dataset.draftPlayerKey = player.key;
    action.append(button); row.append(queueCell, action); return row;
  }));
  const roster = userTeam.roster.map((key) => playersByKey.get(key)).filter(Boolean);
  elements['draft-roster'].replaceChildren(...roster.map((player) => {
    const row = document.createElement('div'); row.className = 'draft-roster-row';
    const name = document.createElement('strong'); name.textContent = player.name;
    const detail = document.createElement('small'); detail.textContent = `${player.team?.abbreviation ?? '—'} · ${player.position} · ${player.ratings?.OverallRating ?? '—'} OVR`;
    row.append(name, detail); return row;
  }));
  elements['draft-log'].replaceChildren(...activeLeague.draft.log.slice(-14).reverse().map((pick) => {
    const team = activeLeague.teams.find((entry) => entry.id === pick.teamId); const player = playersByKey.get(pick.playerKey);
    const row = document.createElement('div'); row.className = 'draft-log-row';
    const name = document.createElement('strong'); name.textContent = `${pick.overallPick}. ${player?.name ?? 'Unknown player'}`;
    const detail = document.createElement('small'); detail.textContent = `${team?.name ?? 'Team'} · ${player?.position ?? '—'}${pick.price ? ` · $${pick.price}` : ''}`;
    row.append(name, detail); return row;
  }));
  elements['draft-queue'].replaceChildren(...(activeLeague.draft.queue ?? []).map((key) => playersByKey.get(key)).filter(Boolean).map((player) => {
    const row = document.createElement('div'); row.className = 'draft-queue-row';
    const name = document.createElement('strong'); name.textContent = player.name;
    const detail = document.createElement('span'); detail.textContent = `${player.position} · ${player.ratings?.OverallRating ?? '—'}`;
    row.append(name, detail); return row;
  }));
  elements['draft-scarcity'].replaceChildren(...draftScarcity(activeLeague, players).slice(0, 4).map((entry) => {
    const row = document.createElement('div'); row.className = 'scarcity-row';
    row.append(Object.assign(document.createElement('strong'), { textContent: entry.position }), Object.assign(document.createElement('span'), { textContent: `${entry.available} available / ${entry.openSpots} needs` }));
    return row;
  }));
}

function renderLeague() {
  const { players, weeks } = leagueData();
  const drafting = activeLeague?.draft?.status === 'active';
  elements['league-setup'].hidden = Boolean(activeLeague);
  elements['league-draft-room'].hidden = !drafting;
  elements['league-dashboard'].hidden = !activeLeague || drafting;
  elements['league-week-label'].hidden = !activeLeague || drafting;
  if (!activeLeague) return;
  if (drafting) { renderDraftRoom(players); return; }

  const aiMoves = runAiTransactions(activeLeague, players, weeks);
  if (aiMoves.length) saveLeague();

  leagueRowsByKey = new Map(players.map((player) => [player.key, player]));
  const displayWeeks = lineupWeeks(weeks);
  const previousWeek = elements['league-week'].value;
  const previousWasUpcoming = elements['league-week'].selectedOptions[0]?.textContent.includes('Set lineup');
  elements['league-week'].replaceChildren(...displayWeeks.map((week, index) => option(index, `Week ${week.week + 1}${week.upcoming ? ' · Set lineup' : ''}`)));
  elements['league-week'].value = previousWasUpcoming
    ? String(Math.max(displayWeeks.length - 1, 0))
    : [...elements['league-week'].options].some((item) => item.value === previousWeek)
    ? previousWeek
    : String(Math.max(displayWeeks.length - 1, 0));
  const selectedWeekIndex = Number(elements['league-week'].value) || 0;
  const scored = scoreFantasyLeague(activeLeague, players, weeks);
  if (weeks.length && activeLeague.lastNotifiedWeek !== weeks.length) {
    const latestMatchup = scored.matchups.at(-1)?.games.find((game) => [game.first.id, game.second.id].includes(activeLeague.userTeamId));
    if (latestMatchup) {
      const userFirst = latestMatchup.first.id === activeLeague.userTeamId;
      const mine = userFirst ? latestMatchup.firstLineup.total : latestMatchup.secondLineup.total;
      const theirs = userFirst ? latestMatchup.secondLineup.total : latestMatchup.firstLineup.total;
      const opponent = userFirst ? latestMatchup.second.name : latestMatchup.first.name;
      activeLeague.notifications.unshift({ type: mine >= theirs ? 'success' : 'alert', text: `${mine >= theirs ? 'Win' : 'Loss'} vs ${opponent}, ${mine.toFixed(2)}-${theirs.toFixed(2)}.`, at: new Date().toISOString() });
    }
    activeLeague.lastNotifiedWeek = weeks.length;
  }
  const selectedWeek = scored.matchups[selectedWeekIndex];
  const lineupWeek = displayWeeks[selectedWeekIndex];
  const leader = scored.standings[0];
  const pointsLeader = [...scored.standings].sort((a, b) => b.pointsFor - a.pointsFor)[0];

  elements['league-name'].textContent = activeLeague.name;
  elements['league-leader'].textContent = leader?.team.name ?? '—';
  elements['league-leader-record'].textContent = leader ? `${leader.wins}-${leader.losses}${leader.ties ? `-${leader.ties}` : ''} · ${leader.pointsFor.toFixed(2)} PF` : '—';
  elements['league-points-leader'].textContent = pointsLeader?.team.name ?? '—';
  elements['league-points-total'].textContent = pointsLeader ? `${pointsLeader.pointsFor.toFixed(2)} points scored` : '—';
  elements['league-progress'].textContent = weeks.length ? `Week ${weeks.at(-1).week + 1}` : '—';
  elements['league-progress-detail'].textContent = `${weeks.length} scored weeks · ${activeLeague.teams.length} teams`;

  elements['league-standings'].replaceChildren(...scored.standings.map((standing, index) => {
    const row = document.createElement('tr');
    appendCells(row, [
      [index + 1], [standing.team.name, 'player-name'], [getArchetype(standing.team.archetype).name, 'playstyle-cell'], [standing.wins], [standing.losses], [standing.ties],
      [standing.pointsFor.toFixed(2), 'points'], [standing.pointsAgainst.toFixed(2)],
    ]);
    return row;
  }));

  elements['league-matchups'].replaceChildren(...(selectedWeek?.games ?? []).map((game) => {
    const card = document.createElement('article');
    card.className = 'matchup-card panel';
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.className = `matchup-team${game.firstLineup.total > game.secondLineup.total ? ' winner' : ''}`;
    second.className = `matchup-team${game.secondLineup.total > game.firstLineup.total ? ' winner' : ''}`;
    const firstName = document.createElement('span'); firstName.textContent = `${game.first.name} · ${getArchetype(game.first.archetype).name}`;
    const firstScore = document.createElement('strong'); firstScore.textContent = game.firstLineup.total.toFixed(2);
    const secondName = document.createElement('span'); secondName.textContent = `${game.second.name} · ${getArchetype(game.second.archetype).name}`;
    const secondScore = document.createElement('strong'); secondScore.textContent = game.secondLineup.total.toFixed(2);
    first.append(firstName, firstScore); second.append(secondName, secondScore); card.append(first, second);
    return card;
  }));
  if (!selectedWeek) {
    const upcoming = document.createElement('article'); upcoming.className = 'matchup-card panel';
    upcoming.textContent = 'Lineups are open. Matchups will score when this week appears in your Franchise save.';
    elements['league-matchups'].replaceChildren(upcoming);
  }

  const previousTeam = elements['league-roster-team'].value;
  elements['league-roster-team'].replaceChildren(...activeLeague.teams.map((team) => option(team.id, team.name)));
  elements['league-roster-team'].value = activeLeague.teams.some((team) => team.id === previousTeam) ? previousTeam : activeLeague.teams[0].id;
  renderLeagueRoster(players, lineupWeek);
  renderLeagueManager(players, lineupWeek, scored, weeks.length);
  renderLeagueTools(players, weeks, lineupWeek);
  renderCommissionerTools(players);
}

function renderLeagueManager(players, week, scored = null, completedWeekCount = 0) {
  const team = activeLeague?.teams.find((entry) => entry.id === activeLeague.userTeamId);
  const selectedTeamId = elements['league-roster-team'].value;
  const locked = !week?.upcoming;
  elements['league-manager-team'].textContent = team?.name ?? 'Choose a team';
  const standing = scored?.standings.find((entry) => entry.team.id === team?.id);
  const record = standing ? `${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ''}` : '0-0';
  const opponent = team ? nextOpponent(activeLeague, team.id, completedWeekCount) : null;
  elements['league-manager-status'].textContent = locked
    ? `${record} record · Week ${week.week + 1} is complete and locked.`
    : `${record} record · Next: ${opponent?.name ?? 'TBD'} · Save Week ${week.week + 1} before playing.`;
  elements['league-control'].hidden = !team || selectedTeamId === team.id;
  elements['league-control'].disabled = locked;
  elements['league-save-lineup'].disabled = locked || !team;
  elements['league-auto-lineup'].disabled = locked || !team;
  renderLineupEditor(elements['league-lineup-editor'], team, players, week, locked);
}

function renderLeagueTools(players, weeks, week) {
  const team = activeLeague?.teams.find((entry) => entry.id === activeLeague.userTeamId);
  if (!team || !week) return;
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const projections = buildWeeklyProjections(activeLeague, players, week);
  const mine = projections.find((entry) => entry.team.id === team.id);
  const opponent = nextOpponent(activeLeague, team.id, weeks.length);
  const theirs = projections.find((entry) => entry.team.id === opponent?.id);
  const winChance = mine && theirs ? Math.max(5, Math.min(95, Math.round(50 + (mine.projection - theirs.projection) * 2.5))) : 50;
  elements['league-projections'].replaceChildren(...[
    ['Your projection', `${mine?.projection.toFixed(2) ?? '—'} pts`],
    ['Opponent', `${opponent?.name ?? 'TBD'} · ${theirs?.projection.toFixed(2) ?? '—'} pts`],
    ['Win probability', `${winChance}%`],
  ].map(([label, value]) => {
    const row = document.createElement('div'); row.className = 'tool-row';
    row.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('strong'), { textContent: value })); return row;
  }));
  const advice = recommendLineupMoves(team, players, week);
  elements['league-recommendations'].textContent = advice.suggestions.length
    ? advice.suggestions.slice(0, 3).map((entry) => `Start ${entry.player.name} at ${entry.slot}: ${entry.reason}.`).join(' ')
    : 'Your current starters match the projection model. Injury and availability warnings will appear here when present in the save.';

  const freeAgents = availableFantasyPlayers(activeLeague, players).slice(0, 80);
  const previousAdd = elements['league-waiver-add'].value;
  elements['league-waiver-add'].replaceChildren(...freeAgents.map((entry) => option(entry.player.key, `${entry.player.name} · ${entry.player.position} · ${entry.projection.toFixed(1)} proj`)));
  if (freeAgents.some((entry) => entry.player.key === previousAdd)) elements['league-waiver-add'].value = previousAdd;
  const previousDrop = elements['league-waiver-drop'].value;
  elements['league-waiver-drop'].replaceChildren(...team.roster.map((key) => playersByKey.get(key)).filter(Boolean).sort((a, b) => projectPlayer(a).projection - projectPlayer(b).projection).map((player) => option(player.key, `${player.name} · ${player.position}`)));
  if (team.roster.includes(previousDrop)) elements['league-waiver-drop'].value = previousDrop;
  const waiverLabel = { rolling: 'Rolling priority', reverse: 'Reverse standings', faab: 'FAAB bidding' }[activeLeague.settings.waiverType];
  elements['league-waiver-summary'].textContent = `${waiverLabel} · Priority ${team.waiverPriority}${activeLeague.settings.waiverType === 'faab' ? ` · $${team.faabRemaining} remaining` : ''} · ${activeLeague.waiverClaims.filter((claim) => claim.teamId === team.id).length} pending`;
  elements['league-waiver-bid-label'].hidden = activeLeague.settings.waiverType !== 'faab';
  elements['league-waiver-bid'].max = team.faabRemaining;

  const previousPartner = elements['league-trade-team'].value;
  const partners = activeLeague.teams.filter((entry) => entry.id !== team.id);
  elements['league-trade-team'].replaceChildren(...partners.map((entry) => option(entry.id, `${entry.name} · ${getArchetype(entry.archetype).name}`)));
  if (partners.some((entry) => entry.id === previousPartner)) elements['league-trade-team'].value = previousPartner;
  const partner = partners.find((entry) => entry.id === elements['league-trade-team'].value) ?? partners[0];
  const fillPlayerSelect = (select, roster) => {
    const previous = select.value;
    const choices = roster.map((key) => playersByKey.get(key)).filter(Boolean).sort((a, b) => projectPlayer(b).projection - projectPlayer(a).projection);
    select.replaceChildren(...choices.map((player) => option(player.key, `${player.name} · ${player.position} · ${projectPlayer(player).projection.toFixed(1)} proj`)));
    if (choices.some((player) => player.key === previous)) select.value = previous;
  };
  fillPlayerSelect(elements['league-trade-offer'], team.roster);
  const offeredPosition = playersByKey.get(elements['league-trade-offer'].value)?.position;
  fillPlayerSelect(elements['league-trade-request'], (partner?.roster ?? []).filter((key) => {
    const position = playersByKey.get(key)?.position;
    return (position === 'FB' ? 'HB' : position) === (offeredPosition === 'FB' ? 'HB' : offeredPosition);
  }));

  if (weeks.length >= 17) archiveFantasySeason(activeLeague, players, weeks);
  const playoffs = buildPlayoffPicture(activeLeague, players, weeks);
  elements['league-playoffs'].replaceChildren(...playoffs.seeds.map((seed) => {
    const row = document.createElement('div'); row.className = 'tool-row';
    row.append(Object.assign(document.createElement('strong'), { textContent: `#${seed.seed} ${seed.team.name}` }), Object.assign(document.createElement('span'), { textContent: `${seed.wins}-${seed.losses} · ${seed.pointsFor.toFixed(1)} PF` })); return row;
  }));
  elements['league-history'].textContent = activeLeague.history.length
    ? activeLeague.history.map((entry) => `Year ${entry.seasonYear + 1}: ${entry.champion} (${entry.bestRecord})`).join(' · ')
    : `${activeLeague.settings.playoffTeams}-team playoff · ${activeLeague.settings.keeperMode} league. Championship history begins when the Franchise regular season is complete.`;

  elements['league-notifications'].textContent = activeLeague.notifications.slice(0, 4).map((entry) => entry.text).join(' · ') || 'No new alerts.';
  elements['league-transactions'].replaceChildren(...activeLeague.transactions.slice(0, 8).map((transaction) => {
    const transactionTeam = activeLeague.teams.find((entry) => entry.id === (transaction.teamId ?? transaction.toTeamId));
    const acquired = playersByKey.get(transaction.addPlayerKey ?? transaction.requestPlayerKey ?? transaction.playerKey);
    const row = document.createElement('div'); row.className = 'tool-row';
    row.append(Object.assign(document.createElement('strong'), { textContent: transactionTeam?.name ?? 'League' }), Object.assign(document.createElement('span'), { textContent: `${transaction.type} · ${acquired?.name ?? 'player'}${transaction.bid ? ` · $${transaction.bid}` : ''}` })); return row;
  }));
  saveLeague();
}

function renderLeagueRoster(players, week) {
  const team = activeLeague?.teams.find((entry) => entry.id === elements['league-roster-team'].value);
  if (!team || !week) return;
  elements['league-team-name'].value = team.name;
  const style = getArchetype(team.archetype);
  elements['league-team-style'].textContent = `${style.name} — ${style.description}`;
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const lineup = lineupForTeam(team, playersByKey, week);
  const starterSlots = new Map(lineup.entries.map((entry) => [entry.player.key, entry.slot]));
  const roster = team.roster.map((key) => playersByKey.get(key)).filter(Boolean).sort((a, b) => {
    const aStarter = starterSlots.has(a.key) ? 0 : 1;
    const bStarter = starterSlots.has(b.key) ? 0 : 1;
    return aStarter - bStarter || a.position.localeCompare(b.position) || b.total - a.total;
  });
  elements['league-roster'].replaceChildren(...roster.map((player) => {
    const row = document.createElement('tr');
    row.className = 'clickable-row';
    row.tabIndex = 0;
    row.dataset.playerKey = player.key;
    const slot = starterSlots.get(player.key) ?? 'Bench';
    const weekPoints = player.logs.find((log) => log.week === week.week && log.weekType === week.weekType)?.points ?? 0;
    appendCells(row, [
      [slot, slot === 'Bench' ? 'bench-slot' : 'starter-slot'], [player.name, 'player-name'],
      [player.team?.abbreviation ?? '—', 'team-cell'], [player.position], [player.ratings?.OverallRating ?? '—'],
      [weekPoints.toFixed(2), 'points'], [player.total.toFixed(2)], [player.average.toFixed(2)],
    ]);
    return row;
  }));
}

function renderCommissionerTools(players) {
  if (!activeLeague) return;
  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const previousTeam = elements['commissioner-team'].value;
  elements['commissioner-team'].replaceChildren(...activeLeague.teams.map((team) => option(team.id, team.name)));
  if (activeLeague.teams.some((team) => team.id === previousTeam)) elements['commissioner-team'].value = previousTeam;
  const team = activeLeague.teams.find((entry) => entry.id === elements['commissioner-team'].value) ?? activeLeague.teams[0];
  const previousAdd = elements['commissioner-add'].value;
  const freeAgents = availableFantasyPlayers(activeLeague, players).slice(0, 150);
  elements['commissioner-add'].replaceChildren(...freeAgents.map(({ player }) => option(player.key, `${player.name} · ${player.position}`)));
  if (freeAgents.some(({ player }) => player.key === previousAdd)) elements['commissioner-add'].value = previousAdd;
  const added = playersByKey.get(elements['commissioner-add'].value);
  const normalized = (position) => position === 'FB' ? 'HB' : position;
  const dropChoices = team.roster.map((key) => playersByKey.get(key)).filter(Boolean)
    .filter((player) => !added || normalized(player.position) === normalized(added.position));
  elements['commissioner-drop'].replaceChildren(...dropChoices.map((player) => option(player.key, `${player.name} · ${player.position}`)));
  elements['commissioner-playoffs'].value = String(activeLeague.settings.playoffTeams);
  elements['commissioner-undo'].disabled = !(activeLeague.commissionerUndo?.length);
}

function backupPayload() {
  const storage = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('madden-fantasy')) storage[key] = localStorage.getItem(key);
  }
  return { format: 'madden-fantasy-backup', schemaVersion: 1, appVersion: appInfo.version, exportedAt: new Date().toISOString(), storage };
}

function supportReport() {
  const games = currentAnalysis?.leagueGames ?? [];
  const years = [...new Set(games.map((game) => game.year + 1))];
  return {
    format: 'madden-fantasy-support-report', app: appInfo, createdAt: new Date().toISOString(),
    save: currentAnalysis ? {
      type: 'offline-franchise', completedGames: games.length,
      userGames: currentAnalysis.games?.length ?? 0, teamsDetected: availableTeams().length, franchiseYears: years,
      latestGame: games.at(-1) ? { year: games.at(-1).year + 1, week: games.at(-1).week + 1, type: games.at(-1).weekType } : null,
    } : null,
    storedItems: Object.keys(backupPayload().storage).map((key) =>
      key === PREFERENCES_KEY ? 'preferences' : key.startsWith('madden-fantasy-league:') ? 'fantasy-league' : key.startsWith('madden-fantasy-world:') ? 'fantasy-world' : 'companion-data'),
  };
}

function searchCompanion(query) {
  const term = query.trim().toLowerCase();
  if (term.length < 2 || !currentAnalysis) { elements['global-search-results'].hidden = true; return; }
  const latestYear = Math.max(...currentAnalysis.leagueGames.map((game) => game.year));
  const players = buildSeasonRows(currentAnalysis.leagueGames.filter((game) => game.year === latestYear));
  const screenNames = [
    ['game', 'Game Stats'], ['hq', 'Fantasy HQ'], ['season', 'Season Hub'], ['analytics', 'Team Analytics'], ['identities', 'NFL Identities'],
    ['records', 'Records & Awards'], ['league', 'Fantasy League'], ['world', 'Fantasy World'],
  ];
  const results = [
    ...players.filter((player) => `${player.name} ${player.position} ${player.team?.abbreviation ?? ''}`.toLowerCase().includes(term)).slice(0, 7)
      .map((player) => ({ kind: 'player', id: player.key, label: player.name, detail: `${player.team?.abbreviation ?? '—'} · ${player.position} · ${player.average.toFixed(1)} PPG`, player })),
    ...availableTeams().filter((team) => `${team.name} ${team.abbreviation}`.toLowerCase().includes(term)).slice(0, 4)
      .map((team) => ({ kind: 'team', id: String(team.index), label: team.name, detail: `${team.abbreviation} · Open team identity` })),
    ...screenNames.filter(([, label]) => label.toLowerCase().includes(term)).map(([id, label]) => ({ kind: 'screen', id, label, detail: 'Open screen' })),
  ].slice(0, 10);
  elements['global-search-results'].replaceChildren(...(results.length ? results : [{ kind: 'none', label: 'No matches', detail: 'Try a player, team, or screen name.' }]).map((result) => {
    const button = document.createElement('button'); button.className = 'search-result'; button.disabled = result.kind === 'none';
    button.dataset.searchKind = result.kind; button.dataset.searchId = result.id ?? '';
    const label = document.createElement('strong'); label.textContent = result.label;
    const detail = document.createElement('small'); detail.textContent = result.detail;
    button.append(label, detail); if (result.player) button._player = result.player; return button;
  }));
  elements['global-search-results'].hidden = false;
}

function worldStorageKey(year) {
  return `madden-fantasy-world:${encodeURIComponent(currentAnalysis?.sourcePath ?? 'unknown')}:${year}`;
}

function saveWorld() {
  if (activeWorld) localStorage.setItem(worldStorageKey(activeWorld.seasonYear), JSON.stringify(activeWorld));
}

function resetWorldDashboardControls() {
  elements['world-join-team'].replaceChildren();
  elements['world-lineup-week'].replaceChildren();
  elements['world-lineup-editor'].replaceChildren();
  elements['world-feed'].replaceChildren();
  elements['world-trending-list'].replaceChildren();
  elements['world-league-list'].replaceChildren();
  elements['world-story-list'].replaceChildren();
  elements['world-history-list'].replaceChildren();
  elements['world-profile'].replaceChildren();
  elements['world-people-list'].replaceChildren();
  elements['world-style-list'].replaceChildren();
  elements['world-post-text'].value = '';
  for (const id of ['world-season', 'world-league-count', 'world-mode']) elements[id].disabled = false;
  worldFeedFilter = 'all';
  document.querySelectorAll('.world-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.worldFilter === 'all'));
}

function reloadAfterFantasyReset(view) {
  // Native select popups can retain stale Chromium state when their option trees
  // are emptied and rebuilt repeatedly. Reloading guarantees fresh controls and
  // event bindings while returning the user to the same fantasy screen.
  sessionStorage.setItem('madden-fantasy:resume-view', view);
  window.location.reload();
}

function loadWorld() {
  const year = Number(elements['world-season'].value);
  try {
    const stored = JSON.parse(localStorage.getItem(worldStorageKey(year)));
    activeWorld = stored?.seasonYear === year ? upgradeFantasyWorld(stored) : null;
    activeWorld?.leagues.forEach((entry, leagueIndex) => entry.league.teams.forEach((team, teamIndex) => {
      team.archetype ??= archetypeForTeam(teamIndex, leagueIndex + 101).id;
    }));
  } catch {
    activeWorld = null;
  }
}

function populateWorldFilters() {
  const previousYear = elements['world-season'].value;
  const years = [...new Set((currentAnalysis?.leagueGames ?? [])
    .filter((game) => game.weekType === 'RegularSeason')
    .map((game) => game.year))].sort((a, b) => b - a);
  elements['world-season'].replaceChildren(...years.map((year) => option(year, `Year ${year + 1}`)));
  if (years.map(String).includes(previousYear)) elements['world-season'].value = previousYear;
  loadWorld();
}

function worldData() {
  const year = Number(elements['world-season'].value);
  const games = (currentAnalysis?.leagueGames ?? []).filter(
    (game) => game.year === year && game.weekType === 'RegularSeason',
  );
  const players = buildSeasonRows(games);
  const weeks = [...new Map(games.map((game) => [`${game.weekType}:${game.week}`, { week: game.week, weekType: game.weekType }])).values()]
    .sort((a, b) => a.week - b.week);
  return { year, players, weeks };
}

function renderWorldFeed(feed) {
  const filtered = feed.filter((post) => worldFeedFilter === 'all' || post.type === worldFeedFilter).slice(0, 100);
  elements['world-feed'].replaceChildren(...filtered.map((post) => {
    const card = document.createElement('article');
    card.className = `social-post panel${post.playerKey && worldRowsByKey.has(post.playerKey) ? ' clickable-row' : ''}`;
    if (post.playerKey && worldRowsByKey.has(post.playerKey)) {
      card.tabIndex = 0;
      card.dataset.playerKey = post.playerKey;
    }
    const head = document.createElement('div'); head.className = 'social-head';
    const avatar = document.createElement('div'); avatar.className = 'social-avatar'; avatar.textContent = post.initials;
    const author = document.createElement('div'); author.className = 'social-author';
    const authorName = document.createElement('strong'); authorName.textContent = post.author;
    const authorMeta = document.createElement('span');
    authorMeta.textContent = `${post.handle}${post.personality ? ` · ${post.personality}` : ''}${post.archetype ? ` · ${post.archetype}` : ''}${post.leagueName ? ` · ${post.leagueName}` : ''}`;
    const time = document.createElement('span'); time.className = 'social-time'; time.textContent = `Week ${post.week + 1}`;
    const copy = document.createElement('p'); copy.className = 'social-copy'; copy.textContent = post.text;
    const meta = document.createElement('div'); meta.className = 'social-meta';
    meta.append(`♥ ${post.likes}`, `↩ ${post.comments.length}`);
    author.append(authorName, authorMeta); head.append(avatar, author, time); card.append(head, copy, meta);
    if (post.comments.length) {
      const comments = document.createElement('div'); comments.className = 'social-comments';
      comments.append(...post.comments.map((comment) => {
        const line = document.createElement('div'); line.className = 'social-comment';
        const name = document.createElement('strong'); name.textContent = `${comment.author} `;
        line.append(name, comment.text); return line;
      }));
      card.append(comments);
    }
    return card;
  }));
}

function renderWorldManager(players, weeks, userTeam, userLeague) {
  const panel = elements['world-team-manager'];
  panel.hidden = !userTeam || activeWorld.mode !== 'participate';
  if (panel.hidden) return;
  const availableWeeks = lineupWeeks(weeks);
  const previous = elements['world-lineup-week'].value;
  const previousWasUpcoming = elements['world-lineup-week'].selectedOptions[0]?.textContent.includes('Set lineup');
  elements['world-lineup-week'].replaceChildren(...availableWeeks.map((week, index) => option(
    index, `Week ${week.week + 1}${week.upcoming ? ' · Set lineup' : ' · Final'}`,
  )));
  elements['world-lineup-week'].value = previousWasUpcoming
    ? String(Math.max(availableWeeks.length - 1, 0))
    : [...elements['world-lineup-week'].options].some((item) => item.value === previous)
    ? previous
    : String(Math.max(availableWeeks.length - 1, 0));
  const week = availableWeeks[Number(elements['world-lineup-week'].value) || 0];
  const locked = !week?.upcoming;
  elements['world-manager-team'].textContent = `${userTeam.name} · ${getArchetype(userTeam.archetype).name}`;
  const scored = scoreFantasyLeague(userLeague.league, players, weeks);
  const standing = scored.standings.find((entry) => entry.team.id === userTeam.id);
  const record = `${standing?.wins ?? 0}-${standing?.losses ?? 0}${standing?.ties ? `-${standing.ties}` : ''}`;
  const opponent = nextOpponent(userLeague.league, userTeam.id, weeks.length);
  elements['world-manager-status'].textContent = locked
    ? `${record} record · Week ${week.week + 1} is complete and locked.`
    : `${record} record · Next: ${opponent?.name ?? 'TBD'} · Your saved starters will decide Week ${week.week + 1}.`;
  elements['world-save-lineup'].disabled = locked;
  elements['world-auto-lineup'].disabled = locked;
  renderLineupEditor(elements['world-lineup-editor'], userTeam, players, week, locked);

  const playersByKey = new Map(players.map((player) => [player.key, player]));
  const freeAgents = availableFantasyPlayers(userLeague.league, players).slice(0, 60);
  elements['world-waiver-add'].replaceChildren(...freeAgents.map((entry) => option(entry.player.key, `${entry.player.name} · ${entry.player.position} · ${entry.projection.toFixed(1)} proj`)));
  elements['world-waiver-drop'].replaceChildren(...userTeam.roster.map((key) => playersByKey.get(key)).filter(Boolean).sort((a, b) => projectPlayer(a).projection - projectPlayer(b).projection).map((player) => option(player.key, `${player.name} · ${player.position}`)));
  const waiverType = userLeague.league.settings.waiverType;
  elements['world-waiver-summary'].textContent = `${waiverType === 'faab' ? `FAAB · $${userTeam.faabRemaining} left` : waiverType === 'reverse' ? 'Reverse standings priority' : `Rolling priority #${userTeam.waiverPriority}`}`;
  elements['world-waiver-bid-label'].hidden = waiverType !== 'faab';
  elements['world-waiver-bid'].max = userTeam.faabRemaining;
  const partners = userLeague.league.teams.filter((team) => team.id !== userTeam.id);
  const previousPartner = elements['world-trade-team'].value;
  elements['world-trade-team'].replaceChildren(...partners.map((team) => option(team.id, team.name)));
  if (partners.some((team) => team.id === previousPartner)) elements['world-trade-team'].value = previousPartner;
  const partner = partners.find((team) => team.id === elements['world-trade-team'].value) ?? partners[0];
  const previousOffer = elements['world-trade-offer'].value;
  elements['world-trade-offer'].replaceChildren(...userTeam.roster.map((key) => playersByKey.get(key)).filter(Boolean).map((player) => option(player.key, `${player.name} · ${player.position}`)));
  if (userTeam.roster.includes(previousOffer)) elements['world-trade-offer'].value = previousOffer;
  const offeredPosition = playersByKey.get(elements['world-trade-offer'].value)?.position;
  const previousRequest = elements['world-trade-request'].value;
  const requests = (partner?.roster ?? []).map((key) => playersByKey.get(key)).filter((player) => player && (player.position === 'FB' ? 'HB' : player.position) === (offeredPosition === 'FB' ? 'HB' : offeredPosition));
  elements['world-trade-request'].replaceChildren(...requests.map((player) => option(player.key, `${player.name} · ${player.position}`)));
  if (requests.some((player) => player.key === previousRequest)) elements['world-trade-request'].value = previousRequest;
}

function renderWorld() {
  const { players, weeks } = worldData();
  elements['world-setup'].hidden = Boolean(activeWorld);
  elements['world-dashboard'].hidden = !activeWorld;
  if (!activeWorld) return;
  worldRowsByKey = new Map(players.map((player) => [player.key, player]));
  for (const entry of activeWorld.leagues) {
    const moves = runAiTransactions(entry.league, players, weeks);
    if (moves.length) activeWorld.storylines.unshift({ leagueName: entry.league.name, title: `${moves.length} waiver moves processed`, detail: 'AI managers adjusted their rosters after the latest Franchise results.' });
    if (weeks.length >= 17) archiveFantasySeason(entry.league, players, weeks);
  }
  updateWorldContinuity(activeWorld, players, weeks);
  generateLeagueChat(activeWorld, weeks.at(-1)?.week ?? 0);
  const storylines = buildWorldStorylines(activeWorld, players, weeks);
  saveWorld();
  const feed = generateWorldFeed(activeWorld, players, weeks);
  const latestWeek = weeks.at(-1);
  const trending = players
    .map((player) => ({ player, points: player.logs.find((log) => log.week === latestWeek?.week && log.weekType === latestWeek?.weekType)?.points ?? null }))
    .filter((entry) => entry.points !== null)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
  const residents = activeWorld.leagues.reduce((sum, entry) => sum + entry.managers.length, 0);
  const userManager = activeWorld.leagues.flatMap((entry) => entry.managers).find((manager) => manager.id === activeWorld.userManagerId);
  const userLeague = activeWorld.leagues.find((entry) => entry.managers.some((manager) => manager.id === activeWorld.userManagerId));
  const userTeam = userLeague?.league.teams.find((team) => team.id === userManager?.teamId);
  if (userLeague && userTeam) userLeague.league.userTeamId = userTeam.id;

  elements['world-name'].textContent = activeWorld.name;
  elements['world-mode-label'].textContent = activeWorld.mode === 'participate'
    ? `PARTICIPANT · ${userTeam?.name ?? 'FANTASY MANAGER'}`
    : 'OBSERVER MODE';
  elements['world-join'].textContent = activeWorld.mode === 'participate' ? 'Return to observer' : 'Join this team';
  elements['world-join-team'].hidden = activeWorld.mode === 'participate';
  const previousJoinTeam = elements['world-join-team'].value;
  elements['world-join-team'].replaceChildren(...activeWorld.leagues.flatMap((entry) => entry.league.teams.map((team) => {
    const manager = entry.managers.find((candidate) => candidate.teamId === team.id);
    return option(manager.id, `${entry.league.name} · ${manager.displayName} (${manager.personality}) · ${team.name}`);
  })));
  if ([...elements['world-join-team'].options].some((item) => item.value === previousJoinTeam)) elements['world-join-team'].value = previousJoinTeam;
  elements['world-residents'].textContent = residents;
  elements['world-leagues'].textContent = activeWorld.leagues.length;
  elements['world-league-detail'].textContent = `${activeWorld.leagues.length * 8} fantasy teams competing`;
  elements['world-posts'].textContent = feed.length;
  elements['world-post-detail'].textContent = latestWeek ? `Living through Week ${latestWeek.week + 1}` : 'Waiting for games';
  elements['world-trending'].textContent = trending[0]?.player.name ?? '—';
  elements['world-trending-detail'].textContent = trending[0] ? `${trending[0].points.toFixed(2)} points this week` : '—';
  elements['world-composer'].hidden = activeWorld.mode !== 'participate';
  elements['world-composer-avatar'].textContent = userManager?.initials ?? 'YO';
  if (userManager && userLeague && userTeam) {
    const standing = scoreFantasyLeague(userLeague.league, players, weeks).standings.find((entry) => entry.team.id === userTeam.id);
    const rival = userLeague.managers.find((manager) => manager.id === userManager.rivalId);
    const favorite = players.find((player) => player.key === userManager.favoritePlayerKey);
    elements['world-profile'].replaceChildren(...[
      ['Manager', `${userManager.displayName} · ${userManager.reputation ?? 'Newcomer'}`],
      ['Mood', userManager.mood ?? 'Locked in'],
      ['Career', `${standing?.wins ?? 0}-${standing?.losses ?? 0} · ${userManager.titles ?? 0} titles`],
      ['Favorite', favorite?.name ?? 'Still deciding'],
      ['Rival', rival?.displayName ?? 'No rivalry yet'],
      ['Latest memory', userManager.memories?.[0]?.text ?? 'The season is just beginning.'],
    ].map(([label, value]) => {
      const row = document.createElement('div'); row.className = 'tool-row';
      row.append(Object.assign(document.createElement('strong'), { textContent: label }), Object.assign(document.createElement('span'), { textContent: value })); return row;
    }));
  } else elements['world-profile'].textContent = 'Join any team to build a manager record, reputation, rivalries, favorite players, and championship history.';
  renderWorldManager(players, weeks, userTeam, userLeague);
  renderWorldFeed(feed);

  elements['world-trending-list'].replaceChildren(...trending.map((entry, index) => {
    const row = document.createElement('div'); row.className = 'trend-row clickable-row'; row.dataset.playerKey = entry.player.key; row.tabIndex = 0;
    const name = document.createElement('strong'); name.textContent = `${index + 1}. ${entry.player.name}`;
    const detail = document.createElement('small'); detail.textContent = `${entry.player.team?.abbreviation ?? '—'} · ${entry.player.position} · ${entry.points.toFixed(2)} pts`;
    row.append(name, detail); return row;
  }));
  elements['world-league-list'].replaceChildren(...activeWorld.leagues.map((entry) => {
    const scored = scoreFantasyLeague(entry.league, players, weeks);
    const leader = scored.standings[0];
    const row = document.createElement('div'); row.className = 'league-pulse-row';
    const name = document.createElement('strong'); name.textContent = entry.league.name;
    const settings = entry.league.settings;
    const format = `${settings.draftType} · ${settings.waiverType}${settings.waiverType === 'faab' ? ` $${settings.faabBudget}` : ''} · ${settings.keeperMode}`;
    const detail = document.createElement('small'); detail.textContent = leader ? `${leader.team.name} leads ${leader.wins}-${leader.losses} · ${format}` : format;
    row.append(name, detail); return row;
  }));
  elements['world-story-list'].replaceChildren(...storylines.slice(0, 8).map((story) => {
    const row = document.createElement('div'); row.className = 'league-pulse-row';
    const name = document.createElement('strong'); name.textContent = story.title;
    const detail = document.createElement('small'); detail.textContent = `${story.leagueName} · ${story.detail}`;
    row.append(name, detail); return row;
  }));
  const history = activeWorld.leagues.flatMap((entry) => entry.league.history.map((record) => ({ ...record, leagueName: entry.league.name })));
  elements['world-history-list'].replaceChildren(...(history.length ? history : [{ leagueName: 'World', champion: 'No champion yet', bestRecord: 'The first title is still up for grabs.' }]).map((record) => {
    const row = document.createElement('div'); row.className = 'league-pulse-row';
    const name = document.createElement('strong'); name.textContent = `${record.leagueName} · ${record.champion}`;
    const detail = document.createElement('small'); detail.textContent = record.bestRecord;
    row.append(name, detail); return row;
  }));
  const people = activeWorld.leagues.flatMap((entry) => entry.managers);
  const peopleOffset = people.length ? (latestWeek?.week ?? 0) % people.length : 0;
  const featuredPeople = [...people.slice(peopleOffset), ...people.slice(0, peopleOffset)].slice(0, 6);
  elements['world-people-list'].replaceChildren(...featuredPeople.map((manager) => {
    const row = document.createElement('div'); row.className = 'person-row';
    const name = document.createElement('strong'); name.textContent = `${manager.displayName} · ${manager.handle}`;
    const detail = document.createElement('small');
    const voice = document.createElement('b'); voice.textContent = manager.personality;
    detail.append(voice, ` · ${manager.bio}`); row.append(name, detail); return row;
  }));
  elements['world-style-list'].replaceChildren(...PLAYSTYLE_ARCHETYPES.map((style) => {
    const row = document.createElement('div'); row.className = 'playstyle-row';
    const name = document.createElement('strong'); name.textContent = style.name;
    const detail = document.createElement('small'); detail.textContent = style.description;
    row.append(name, detail); return row;
  }));
}

function switchView(view) {
  activeView = view;
  elements['global-search-results'].hidden = true;
  document.querySelectorAll('.view-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  elements.results.hidden = view !== 'game';
  elements['fantasy-hq'].hidden = view !== 'hq';
  elements['season-dashboard'].hidden = view !== 'season';
  elements['team-analytics'].hidden = view !== 'analytics';
  elements['team-identities'].hidden = view !== 'identities';
  elements['records-awards'].hidden = view !== 'records';
  elements['fantasy-league'].hidden = view !== 'league';
  elements['fantasy-world'].hidden = view !== 'world';
  if (view === 'season') renderSeason();
  if (view === 'hq') renderFantasyHq();
  if (view === 'analytics') renderAnalytics();
  if (view === 'identities') renderIdentities();
  if (view === 'records') renderRecords();
  if (view === 'league') renderLeague();
  if (view === 'world') renderWorld();
}

function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}

function updateFilters(game) {
  const previousTeam = elements['team-filter'].value;
  const previousPosition = elements['position-filter'].value;
  elements['team-filter'].replaceChildren(
    option('all', 'All Teams'),
    option(String(game.awayTeam?.index), `${game.awayTeam?.name ?? 'Away'} (${game.awayTeam?.abbreviation ?? 'AWY'})`),
    option(String(game.homeTeam?.index), `${game.homeTeam?.name ?? 'Home'} (${game.homeTeam?.abbreviation ?? 'HME'})`),
  );
  elements['team-filter'].value = [...elements['team-filter'].options].some((item) => item.value === previousTeam)
    ? previousTeam
    : 'all';

  const positions = [...new Set([...game.players.map((player) => player.position), 'DST'])].sort(
    (a, b) => (positionOrder.indexOf(a) < 0 ? 99 : positionOrder.indexOf(a)) - (positionOrder.indexOf(b) < 0 ? 99 : positionOrder.indexOf(b)) || a.localeCompare(b),
  );
  elements['position-filter'].replaceChildren(option('all', 'All Positions'), ...positions.map((position) => option(position, position)));
  elements['position-filter'].value = positions.includes(previousPosition) ? previousPosition : 'all';
}

function renderTable(game) {
  if (!game) return;
  const category = categories[activeCategory];
  const teamFilter = elements['team-filter'].value;
  const positionFilter = elements['position-filter'].value;
  document.querySelector('.table-heading h2').textContent = category.title;

  const headers = ['#', 'Player', 'Team', 'Pos', ...category.columns.map(([label]) => label)];
  elements['table-header'].replaceChildren(
    ...headers.map((label) => {
      const cell = document.createElement('th');
      cell.textContent = label;
      return cell;
    }),
  );

  const playerRows = game.players.map((player) => ({
    ...player,
    team: playerTeam(game, player),
    fantasy: calculateFantasyPoints(player.stats, rules()),
  }));
  if (activeCategory === 'fantasy') playerRows.push(...dstPlayers(game));

  const players = playerRows
    .filter((player) => teamFilter === 'all' || String(player.teamIndex) === teamFilter)
    .filter((player) => positionFilter === 'all' || player.position === positionFilter)
    .filter((player) => activeCategory !== 'fantasy' || positionFilter !== 'all' || fantasyPositions.has(player.position))
    .filter(category.active)
    .sort(category.sort);

  elements.leaderboard.replaceChildren(
    ...players.map((player, index) => {
      const row = document.createElement('tr');
      const values = [
        [index + 1],
        [`${player.firstName} ${player.lastName}`, 'player-name'],
        [player.team.abbreviation, 'team-cell'],
        [player.position],
        ...category.columns.map(([, read, className]) => [read(player), className]),
      ];
      values.forEach(([entry, className]) => {
        const cell = document.createElement('td');
        cell.textContent = entry;
        if (className) cell.className = className;
        row.append(cell);
      });
      return row;
    }),
  );

  if (!players.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = headers.length;
    cell.className = 'no-stats';
    cell.textContent = 'No players match these filters for this stat category.';
    row.append(cell);
    elements.leaderboard.append(row);
  }
}

function renderGame({ resetFilters = false } = {}) {
  const game = selectedGame();
  if (!game) {
    elements.results.hidden = true;
    elements.empty.hidden = false;
    return;
  }

  elements.empty.hidden = true;
  elements.results.hidden = false;
  elements['away-abbr'].textContent = game.awayTeam?.abbreviation ?? 'AWY';
  elements['away-name'].textContent = game.awayTeam?.name ?? 'Away';
  elements['away-score'].textContent = game.awayScore;
  elements['home-abbr'].textContent = game.homeTeam?.abbreviation ?? 'HME';
  elements['home-name'].textContent = game.homeTeam?.name ?? 'Home';
  elements['home-score'].textContent = game.homeScore;
  elements['game-label'].textContent = `YEAR ${game.year + 1} · WEEK ${game.week + 1}`;
  if (resetFilters || !elements['team-filter'].options.length) updateFilters(game);
  renderTable(game);
}

async function analyze(sourcePath, silent = false) {
  if (!sourcePath) return;
  if (!silent) setStatus('Reading copied save…', 'working');
  setSaveHealth('working', 'Checking save structure…', 'Reading a temporary copy; the original remains untouched.');
  try {
    currentAnalysis = await window.maddenFantasy.analyzeSave(sourcePath);
    populateGameTeamFilter();
    populateSeasonFilters();
    populateAnalyticsFilters();
    populateIdentityFilters();
    populateRecordsFilters();
    populateHqFilters();
    populateLeagueFilters();
    populateWorldFilters();
    renderGame({ resetFilters: true });
    if (activeView !== 'game') switchView(activeView);
    setStatus(`Updated ${new Date(currentAnalysis.readAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    const years = new Set(currentAnalysis.leagueGames.map((game) => game.year));
    setSaveHealth('ready', 'Compatible offline Franchise save', `${currentAnalysis.leagueGames.length} completed games · ${availableTeams().length} teams · ${years.size} season${years.size === 1 ? '' : 's'} detected`);
  } catch (error) {
    setStatus('Could not read this save', 'error');
    elements.results.hidden = true;
    elements.empty.hidden = false;
    elements.empty.querySelector('h2').textContent = 'This save could not be read';
    elements.empty.querySelector('p').textContent = error.message;
    setSaveHealth('error', 'This save needs attention', error.message);
  }
}

async function initialize() {
  appInfo = await window.maddenFantasy.appInfo();
  elements['app-version'].textContent = `Franchise Fantasy Companion ${appInfo.version} · ${appInfo.arch}`;
  const preferences = loadPreferences();
  recapVisibleCount = preferences.recapPageSize;
  elements.scoring.value = preferences.scoringFormat;
  const resumeView = sessionStorage.getItem('madden-fantasy:resume-view');
  sessionStorage.removeItem('madden-fantasy:resume-view');
  activeView = ['league', 'world'].includes(resumeView) ? resumeView : preferences.defaultView;
  const { saves } = await window.maddenFantasy.listSaves();
  elements['save-select'].replaceChildren(
    ...saves.map((save) => option(save.path, save.name.replace('CAREER-', '').replace('-AUTOSAVE', ' · Autosave'))),
  );
  if (saves[0]) await analyze(saves[0].path);
  else {
    setStatus('Choose a Franchise save', 'error');
    setSaveHealth('error', 'No automatic save location found', 'Use Browse to select a Madden 27 offline Franchise CAREER file.');
  }
  if (!preferences.onboarded) elements['onboarding-dialog'].showModal();
  elements['onboarding-view'].value = preferences.defaultView;
}

elements.refresh.addEventListener('click', () => analyze(elements['save-select'].value));
elements['save-select'].addEventListener('change', () => analyze(elements['save-select'].value));
elements['game-select'].addEventListener('change', () => renderGame({ resetFilters: true }));
elements['game-team'].addEventListener('change', () => {
  populateGameChoices();
  renderGame({ resetFilters: true });
});
elements['team-filter'].addEventListener('change', () => renderTable(selectedGame()));
elements['position-filter'].addEventListener('change', () => renderTable(selectedGame()));
elements.scoring.addEventListener('change', () => {
  savePreferences({ scoringFormat: elements.scoring.value });
  renderTable(selectedGame());
  if (activeView === 'hq') renderFantasyHq();
  if (activeView === 'season') renderSeason();
  if (activeView === 'records') renderRecords();
  if (activeView === 'league') renderLeague();
  if (activeView === 'world') renderWorld();
});
elements['season-filter'].addEventListener('change', renderSeason);
elements['season-team'].addEventListener('change', renderSeason);
elements['season-position'].addEventListener('change', renderSeason);
elements['analytics-season'].addEventListener('change', renderAnalytics);
elements['analytics-team'].addEventListener('change', renderAnalytics);
elements['identity-season'].addEventListener('change', renderIdentities);
elements['identity-team'].addEventListener('change', renderIdentities);
elements['records-season'].addEventListener('change', () => { recapVisibleCount = loadPreferences().recapPageSize; renderRecords(); });
elements['records-team'].addEventListener('change', () => { recapVisibleCount = loadPreferences().recapPageSize; renderRecords(); });
elements['hq-season'].addEventListener('change', renderFantasyHq);
elements['hq-team'].addEventListener('change', renderFantasyHq);
elements['recap-more'].addEventListener('click', () => { recapVisibleCount += loadPreferences().recapPageSize; renderRecords(); });
elements['league-season'].addEventListener('change', () => {
  loadLeague();
  renderLeague();
});
elements['league-week'].addEventListener('change', renderLeague);
elements['league-roster-team'].addEventListener('change', () => {
  const { players, weeks } = leagueData();
  const week = lineupWeeks(weeks)[Number(elements['league-week'].value) || 0];
  renderLeagueRoster(players, week);
  const scored = scoreFantasyLeague(activeLeague, players, weeks);
  renderLeagueManager(players, week, scored, weeks.length);
});
elements['league-team-count'].addEventListener('change', updateDraftSlots);
elements['league-draft-mode'].addEventListener('change', updateDraftSlots);
elements['league-waiver-type'].addEventListener('change', updateDraftSlots);
elements['draft-search'].addEventListener('input', () => renderDraftRoom(leagueData().players));
elements['draft-position'].addEventListener('change', () => renderDraftRoom(leagueData().players));
elements['draft-pool'].addEventListener('click', (event) => {
  const queueButton = event.target.closest('button[data-queue-player-key]');
  if (queueButton && activeLeague) {
    toggleDraftQueue(activeLeague, queueButton.dataset.queuePlayerKey); saveLeague(); renderDraftRoom(leagueData().players); return;
  }
  const button = event.target.closest('button[data-draft-player-key]');
  if (!button || !activeLeague) return;
  try {
    if (activeLeague.draft.paused) throw new Error('Resume the draft before making a pick.');
    const { players } = leagueData();
    const checkpoint = structuredClone(activeLeague);
    checkpoint.draftCheckpoint = null;
    activeLeague.draftCheckpoint = checkpoint;
    if (activeLeague.draft.type === 'auction') makeUserAuctionBid(activeLeague, button.dataset.draftPlayerKey, elements['draft-bid'].value, players);
    else makeUserDraftPick(activeLeague, button.dataset.draftPlayerKey, players);
    const completed = activeLeague.draft.status === 'complete';
    saveLeague();
    if (completed) {
      const grade = gradeDraft(activeLeague, players).find((entry) => entry.team.id === activeLeague.userTeamId);
      activeLeague.notifications.unshift({ type: 'success', text: `Draft complete: ${grade?.grade ?? 'B'} grade, ranked #${grade?.rank ?? '—'}.`, at: new Date().toISOString() });
      elements['league-draft-room'].hidden = true;
      elements['league-dashboard'].hidden = false;
      elements['league-week-label'].hidden = false;
      setStatus('Draft complete — your league and lineup room are ready.');
    }
    renderLeague();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['draft-pause'].addEventListener('click', () => {
  if (!activeLeague?.draft || activeLeague.draft.status !== 'active') return;
  activeLeague.draft.paused = !activeLeague.draft.paused;
  saveLeague(); renderDraftRoom(leagueData().players);
});
elements['draft-undo'].addEventListener('click', () => {
  if (!activeLeague?.draftCheckpoint) return;
  activeLeague = activeLeague.draftCheckpoint;
  activeLeague.draftCheckpoint = null;
  saveLeague(); renderLeague(); setStatus('Last draft pick undone.');
});
elements['draft-cancel'].addEventListener('click', () => {
  if (!activeLeague || !window.confirm('Cancel this draft and return to league setup?')) return;
  document.activeElement?.blur();
  localStorage.removeItem(leagueStorageKey(activeLeague.seasonYear)); activeLeague = null;
  resetLeagueDashboardControls(); populateLeagueFilters(); renderLeague();
});
elements['league-mock'].addEventListener('click', () => {
  try {
    const { year, players } = leagueData();
    const teamCount = Number(elements['league-team-count'].value);
    const mock = createFantasyLeague({ name: 'Mock Draft', teamCount, seasonYear: year, players, draftSeed: Date.now() % 997, settings: { draftType: 'instant' } });
    const grades = gradeDraft(mock, players);
    elements['league-mock-result'].textContent = `Mock complete: ${grades.slice(0, 4).map((entry) => `${entry.rank}. ${entry.team.name} ${entry.grade}`).join(' · ')}. No league was saved.`;
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['league-create'].addEventListener('click', () => {
  try {
    const { year, players } = leagueData();
    resetLeagueDashboardControls();
    const draftType = elements['league-draft-mode'].value;
    const leagueSettings = {
      draftType, waiverType: elements['league-waiver-type'].value,
      faabBudget: Number(elements['league-faab-budget'].value), auctionBudget: Number(elements['league-auction-budget'].value),
      playoffTeams: Number(elements['league-playoff-teams'].value), keeperMode: elements['league-keeper-mode'].value,
      draftTimer: Number(elements['league-draft-timer'].value),
    };
    const creation = { name: elements['league-create-name'].value, teamCount: Number(elements['league-team-count'].value), seasonYear: year, players, settings: leagueSettings };
    let previousLeague = null;
    if (leagueSettings.keeperMode !== 'redraft') {
      try { previousLeague = JSON.parse(localStorage.getItem(leagueStorageKey(year - 1))); } catch { previousLeague = null; }
    }
    if (previousLeague?.teams?.length === creation.teamCount) {
      previousLeague.settings = { ...(previousLeague.settings ?? {}), ...leagueSettings };
      activeLeague = carryFantasyLeagueForward(previousLeague, { seasonYear: year, players });
      setStatus(`${leagueSettings.keeperMode === 'dynasty' ? 'Dynasty rosters' : 'Keepers'} carried into the new season.`);
    } else if (draftType !== 'instant') {
      activeLeague = startFantasyDraft({ ...creation, userSlot: Number(elements['league-draft-slot'].value) });
      advanceAiDraft(activeLeague, players);
    } else activeLeague = createFantasyLeague(creation);
    saveLeague();
    renderLeague();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});
elements['league-rename'].addEventListener('click', () => {
  const team = activeLeague?.teams.find((entry) => entry.id === elements['league-roster-team'].value);
  const name = elements['league-team-name'].value.trim();
  if (!team || !name) return;
  team.name = name;
  saveLeague();
  renderLeague();
});
elements['league-control'].addEventListener('click', () => {
  const team = activeLeague?.teams.find((entry) => entry.id === elements['league-roster-team'].value);
  if (!team) return;
  activeLeague.userTeamId = team.id;
  saveLeague();
  renderLeague();
});
elements['league-save-lineup'].addEventListener('click', () => {
  const { players, weeks } = leagueData();
  const week = lineupWeeks(weeks)[Number(elements['league-week'].value) || 0];
  const team = activeLeague?.teams.find((entry) => entry.id === activeLeague.userTeamId);
  if (!team || !week?.upcoming) return;
  try {
    saveManualLineup(team, week, lineupSelections(elements['league-lineup-editor']), new Map(players.map((player) => [player.key, player])));
    saveLeague();
    setStatus(`${team.name}'s Week ${week.week + 1} lineup is saved.`);
    renderLeague();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['league-auto-lineup'].addEventListener('click', () => {
  const { weeks } = leagueData();
  const week = lineupWeeks(weeks)[Number(elements['league-week'].value) || 0];
  const team = activeLeague?.teams.find((entry) => entry.id === activeLeague.userTeamId);
  if (!team || !week?.upcoming) return;
  clearManualLineup(team, week);
  saveLeague();
  renderLeague();
});
elements['league-trade-team'].addEventListener('change', () => {
  const { players, weeks } = leagueData();
  const week = lineupWeeks(weeks)[Number(elements['league-week'].value) || 0];
  renderLeagueTools(players, weeks, week);
});
elements['league-trade-offer'].addEventListener('change', () => {
  const { players, weeks } = leagueData();
  renderLeagueTools(players, weeks, lineupWeeks(weeks)[Number(elements['league-week'].value) || 0]);
});
elements['league-submit-claim'].addEventListener('click', () => {
  try {
    const { weeks } = leagueData();
    submitWaiverClaim(activeLeague, {
      teamId: activeLeague.userTeamId, addPlayerKey: elements['league-waiver-add'].value,
      dropPlayerKey: elements['league-waiver-drop'].value, bid: elements['league-waiver-bid'].value, week: weeks.length,
    });
    saveLeague(); setStatus('Waiver claim submitted.'); renderLeague();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['league-process-waivers'].addEventListener('click', () => {
  const { players, weeks } = leagueData();
  generateAiWaiverClaims(activeLeague, players, weeks.length);
  const results = processWaivers(activeLeague, players, weeks);
  saveLeague(); setStatus(`${results.length} waiver claim${results.length === 1 ? '' : 's'} processed.`); renderLeague();
});
elements['league-propose-trade'].addEventListener('click', () => {
  try {
    const { players, weeks } = leagueData();
    const result = proposeTrade(activeLeague, players, {
      fromTeamId: activeLeague.userTeamId, toTeamId: elements['league-trade-team'].value,
      offerPlayerKey: elements['league-trade-offer'].value, requestPlayerKey: elements['league-trade-request'].value, week: weeks.length,
    });
    elements['league-trade-result'].textContent = result.accepted ? 'Trade accepted. Rosters and the transaction feed are updated.' : 'Trade rejected. The AI manager did not see enough value.';
    saveLeague(); renderLeague();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['league-run-ai'].addEventListener('click', () => {
  const { players, weeks } = leagueData();
  activeLeague.lastAiTransactionWeek = null;
  const moves = runAiTransactions(activeLeague, players, weeks);
  saveLeague(); setStatus(`AI managers completed ${moves.length} roster move${moves.length === 1 ? '' : 's'}.`); renderLeague();
});
elements['commissioner-team'].addEventListener('change', () => renderCommissionerTools(leagueData().players));
elements['commissioner-add'].addEventListener('change', () => renderCommissionerTools(leagueData().players));
elements['commissioner-swap'].addEventListener('click', () => {
  try {
    const { players } = leagueData();
    const playersByKey = new Map(players.map((player) => [player.key, player]));
    const team = activeLeague?.teams.find((entry) => entry.id === elements['commissioner-team'].value);
    const addKey = elements['commissioner-add'].value; const dropKey = elements['commissioner-drop'].value;
    const added = playersByKey.get(addKey); const dropped = playersByKey.get(dropKey);
    if (!team || !added || !dropped || !team.roster.includes(dropKey)) throw new Error('Choose a valid team, free agent, and player to drop.');
    const position = (value) => value === 'FB' ? 'HB' : value;
    if (position(added.position) !== position(dropped.position)) throw new Error('Commissioner swaps must use the same position.');
    const snapshot = { teamId: team.id, roster: [...team.roster], lineups: structuredClone(team.lineups ?? {}), description: `${added.name} for ${dropped.name}` };
    activeLeague.commissionerUndo ??= []; activeLeague.commissionerUndo.push(snapshot); activeLeague.commissionerUndo = activeLeague.commissionerUndo.slice(-10);
    team.roster = team.roster.map((key) => key === dropKey ? addKey : key);
    for (const lineup of Object.values(team.lineups ?? {})) for (const slot of Object.keys(lineup)) if (lineup[slot] === dropKey) lineup[slot] = addKey;
    activeLeague.transactions.unshift({ id: `commissioner-${Date.now()}`, type: 'commissioner', teamId: team.id, addPlayerKey: addKey, dropPlayerKey: dropKey, at: new Date().toISOString() });
    elements['commissioner-result'].textContent = `${team.name}: added ${added.name} and dropped ${dropped.name}.`;
    saveLeague(); renderLeague();
  } catch (error) { elements['commissioner-result'].textContent = error.message; }
});
elements['commissioner-save-settings'].addEventListener('click', () => {
  const count = Number(elements['commissioner-playoffs'].value);
  if (!activeLeague || count > activeLeague.teams.length) { elements['commissioner-result'].textContent = 'Playoff field cannot be larger than the league.'; return; }
  activeLeague.settings.playoffTeams = count; saveLeague(); elements['commissioner-result'].textContent = `Playoff field updated to ${count} teams.`; renderLeague();
});
elements['commissioner-clear-waivers'].addEventListener('click', () => {
  if (!activeLeague?.waiverClaims.length) { elements['commissioner-result'].textContent = 'There are no pending waiver claims.'; return; }
  if (!window.confirm(`Clear ${activeLeague.waiverClaims.length} pending waiver claims?`)) return;
  activeLeague.waiverClaims = []; saveLeague(); elements['commissioner-result'].textContent = 'Pending waiver claims cleared.'; renderLeague();
});
elements['commissioner-undo'].addEventListener('click', () => {
  const snapshot = activeLeague?.commissionerUndo?.pop();
  const team = activeLeague?.teams.find((entry) => entry.id === snapshot?.teamId);
  if (!snapshot || !team) return;
  team.roster = snapshot.roster; team.lineups = snapshot.lineups;
  const index = activeLeague.transactions.findIndex((entry) => entry.type === 'commissioner' && entry.teamId === team.id);
  if (index >= 0) activeLeague.transactions.splice(index, 1);
  saveLeague(); elements['commissioner-result'].textContent = `Undid ${snapshot.description} for ${team.name}.`; renderLeague();
});
elements['league-reset'].addEventListener('click', () => {
  if (!activeLeague || !window.confirm('Remove this local fantasy league and start over?')) return;
  document.activeElement?.blur();
  localStorage.removeItem(leagueStorageKey(activeLeague.seasonYear));
  activeLeague = null;
  reloadAfterFantasyReset('league');
});
elements['world-season'].addEventListener('change', () => {
  loadWorld();
  renderWorld();
});
elements['world-create'].addEventListener('click', () => {
  try {
    const { year, players } = worldData();
    resetWorldDashboardControls();
    activeWorld = createFantasyWorld({
      name: elements['world-create-name'].value,
      seasonYear: year,
      leagueCount: Number(elements['world-league-count'].value),
      players,
      mode: elements['world-mode'].value,
      userName: elements['world-user-name'].value,
    });
    saveWorld();
    renderWorld();
  } catch (error) {
    setStatus(error.message, 'error');
  }
});
elements['world-join'].addEventListener('click', () => {
  if (!activeWorld) return;
  if (activeWorld.mode === 'participate') observeFantasyWorld(activeWorld);
  else joinFantasyWorld(activeWorld, elements['world-user-name'].value, elements['world-join-team'].value);
  elements['world-lineup-week'].replaceChildren();
  elements['world-lineup-editor'].replaceChildren();
  saveWorld();
  renderWorld();
});
elements['world-lineup-week'].addEventListener('change', () => {
  const { players, weeks } = worldData();
  const manager = activeWorld?.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === activeWorld.userManagerId);
  const league = activeWorld?.leagues.find((entry) => entry.managers.includes(manager));
  renderWorldManager(players, weeks, league?.league.teams.find((team) => team.id === manager?.teamId), league);
});
elements['world-save-lineup'].addEventListener('click', () => {
  const { players, weeks } = worldData();
  const week = lineupWeeks(weeks)[Number(elements['world-lineup-week'].value) || 0];
  const manager = activeWorld?.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === activeWorld.userManagerId);
  const league = activeWorld?.leagues.find((entry) => entry.managers.includes(manager));
  const team = league?.league.teams.find((entry) => entry.id === manager?.teamId);
  if (!team || !week?.upcoming) return;
  try {
    saveManualLineup(team, week, lineupSelections(elements['world-lineup-editor']), new Map(players.map((player) => [player.key, player])));
    saveWorld();
    setStatus(`${team.name}'s Week ${week.week + 1} lineup is saved.`);
    renderWorld();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['world-auto-lineup'].addEventListener('click', () => {
  const { weeks } = worldData();
  const week = lineupWeeks(weeks)[Number(elements['world-lineup-week'].value) || 0];
  const manager = activeWorld?.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === activeWorld.userManagerId);
  const league = activeWorld?.leagues.find((entry) => entry.managers.includes(manager));
  const team = league?.league.teams.find((entry) => entry.id === manager?.teamId);
  if (!team || !week?.upcoming) return;
  clearManualLineup(team, week);
  saveWorld();
  renderWorld();
});
function worldUserLeagueContext() {
  const manager = activeWorld?.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === activeWorld.userManagerId);
  const entry = activeWorld?.leagues.find((candidate) => candidate.managers.includes(manager));
  const team = entry?.league.teams.find((candidate) => candidate.id === manager?.teamId);
  return { manager, entry, team };
}
elements['world-trade-team'].addEventListener('change', renderWorld);
elements['world-trade-offer'].addEventListener('change', renderWorld);
elements['world-submit-claim'].addEventListener('click', () => {
  try {
    const { weeks } = worldData(); const { entry, team } = worldUserLeagueContext();
    submitWaiverClaim(entry.league, { teamId: team.id, addPlayerKey: elements['world-waiver-add'].value, dropPlayerKey: elements['world-waiver-drop'].value, bid: elements['world-waiver-bid'].value, week: weeks.length });
    saveWorld(); setStatus('Fantasy World waiver claim submitted.'); renderWorld();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['world-process-waivers'].addEventListener('click', () => {
  const { players, weeks } = worldData(); const { entry } = worldUserLeagueContext();
  generateAiWaiverClaims(entry.league, players, weeks.length);
  const results = processWaivers(entry.league, players, weeks);
  saveWorld(); setStatus(`${results.length} Fantasy World claims processed.`); renderWorld();
});
elements['world-propose-trade'].addEventListener('click', () => {
  try {
    const { players, weeks } = worldData(); const { manager, entry, team } = worldUserLeagueContext();
    const result = proposeTrade(entry.league, players, { fromTeamId: team.id, toTeamId: elements['world-trade-team'].value, offerPlayerKey: elements['world-trade-offer'].value, requestPlayerKey: elements['world-trade-request'].value, week: weeks.length });
    if (result.accepted) {
      const partner = entry.managers.find((candidate) => candidate.teamId === result.toTeamId);
      manager.tradePartners ??= [];
      if (partner && !manager.tradePartners.includes(partner.id)) manager.tradePartners.push(partner.id);
      manager.reputation = 'Trade architect';
    }
    elements['world-trade-result'].textContent = result.accepted ? 'Accepted—the trade is already on the timeline.' : 'Rejected—the manager wants more value.';
    saveWorld(); renderWorld();
  } catch (error) { setStatus(error.message, 'error'); }
});
elements['world-reset'].addEventListener('click', () => {
  if (!activeWorld || !window.confirm('Remove this local fantasy world and all of its posts?')) return;
  document.activeElement?.blur();
  localStorage.removeItem(worldStorageKey(activeWorld.seasonYear));
  activeWorld = null;
  reloadAfterFantasyReset('world');
});
elements['world-post'].addEventListener('click', () => {
  const text = elements['world-post-text'].value.trim();
  if (!activeWorld?.userManagerId || !text) return;
  const manager = activeWorld.leagues.flatMap((entry) => entry.managers).find((entry) => entry.id === activeWorld.userManagerId);
  const { weeks } = worldData();
  activeWorld.customPosts.unshift({
    id: `custom-${Date.now()}`, week: weeks.at(-1)?.week ?? 0, weekType: 'RegularSeason', type: 'community',
    author: manager.displayName, handle: manager.handle, initials: manager.initials, personality: 'Player',
    text, likes: 0, comments: [],
  });
  elements['world-post-text'].value = '';
  saveWorld();
  renderWorld();
});
document.querySelectorAll('.world-tab').forEach((button) => button.addEventListener('click', () => {
  worldFeedFilter = button.dataset.worldFilter;
  document.querySelectorAll('.world-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
  renderWorld();
}));
document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
elements['season-leaderboard'].addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row) openPlayerLog(seasonRowsByKey.get(row.dataset.playerKey));
});
elements['season-leaderboard'].addEventListener('keydown', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row && (event.key === 'Enter' || event.key === ' ')) openPlayerLog(seasonRowsByKey.get(row.dataset.playerKey));
});
elements['analytics-receivers'].addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row) openPlayerLog(analyticsRowsByKey.get(row.dataset.playerKey));
});
elements['analytics-receivers'].addEventListener('keydown', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row && (event.key === 'Enter' || event.key === ' ')) openPlayerLog(analyticsRowsByKey.get(row.dataset.playerKey));
});
elements['season-records'].addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row) openPlayerLog(recordsRowsByKey.get(row.dataset.playerKey));
});
elements['season-records'].addEventListener('keydown', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row && (event.key === 'Enter' || event.key === ' ')) openPlayerLog(recordsRowsByKey.get(row.dataset.playerKey));
});
elements['league-roster'].addEventListener('click', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row) openPlayerLog(leagueRowsByKey.get(row.dataset.playerKey));
});
elements['league-roster'].addEventListener('keydown', (event) => {
  const row = event.target.closest('tr[data-player-key]');
  if (row && (event.key === 'Enter' || event.key === ' ')) openPlayerLog(leagueRowsByKey.get(row.dataset.playerKey));
});
for (const body of [elements['world-feed'], elements['world-trending-list']]) {
  body.addEventListener('click', (event) => {
    const row = event.target.closest('[data-player-key]');
    if (row) openPlayerLog(worldRowsByKey.get(row.dataset.playerKey));
  });
  body.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-player-key]');
    if (row && (event.key === 'Enter' || event.key === ' ')) openPlayerLog(worldRowsByKey.get(row.dataset.playerKey));
  });
}
elements['dialog-close'].addEventListener('click', () => elements['player-dialog'].close());
elements['player-dialog'].addEventListener('click', (event) => {
  if (event.target === elements['player-dialog']) elements['player-dialog'].close();
});
document.querySelectorAll('.category-tab').forEach((button) => {
  button.addEventListener('click', () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll('.category-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderTable(selectedGame());
  });
});
elements.browse.addEventListener('click', async () => {
  const selected = await window.maddenFantasy.chooseSave();
  if (selected) await analyze(selected);
});
elements['global-search'].addEventListener('input', (event) => searchCompanion(event.target.value));
elements['global-search-results'].addEventListener('click', (event) => {
  const button = event.target.closest('button[data-search-kind]'); if (!button) return;
  if (button.dataset.searchKind === 'player' && button._player) openPlayerLog(button._player);
  if (button.dataset.searchKind === 'team') {
    switchView('identities'); elements['identity-team'].value = button.dataset.searchId; renderIdentities();
  }
  if (button.dataset.searchKind === 'screen') switchView(button.dataset.searchId);
  elements['global-search'].value = ''; elements['global-search-results'].hidden = true;
});
elements['global-search'].addEventListener('keydown', (event) => { if (event.key === 'Escape') elements['global-search-results'].hidden = true; });
document.addEventListener('click', (event) => {
  if (!event.target.closest('.global-search-wrap')) elements['global-search-results'].hidden = true;
});
elements['onboarding-finish'].addEventListener('click', () => {
  const defaultView = elements['onboarding-view'].value; savePreferences({ onboarded: true, defaultView });
  elements['onboarding-dialog'].close(); switchView(defaultView);
});
elements['open-settings'].addEventListener('click', () => {
  const preferences = loadPreferences();
  elements['settings-default-view'].value = preferences.defaultView;
  elements['settings-recap-size'].value = String(preferences.recapPageSize);
  elements['settings-auto-refresh'].checked = preferences.autoRefresh;
  elements['custom-ppr'].value = preferences.customScoring.reception;
  elements['custom-pass-td'].value = preferences.customScoring.passingTouchdown;
  elements['custom-skill-td'].value = preferences.customScoring.rushingTouchdown;
  elements['custom-int'].value = preferences.customScoring.interception;
  elements['settings-result'].textContent = '';
  elements['settings-dialog'].showModal();
});
elements['settings-close'].addEventListener('click', () => elements['settings-dialog'].close());
elements['settings-save'].addEventListener('click', () => {
  const preferences = savePreferences({
    onboarded: true, defaultView: elements['settings-default-view'].value,
    recapPageSize: Number(elements['settings-recap-size'].value), autoRefresh: elements['settings-auto-refresh'].checked,
    customScoring: {
      reception: Number(elements['custom-ppr'].value), passingTouchdown: Number(elements['custom-pass-td'].value),
      rushingTouchdown: Number(elements['custom-skill-td'].value), receivingTouchdown: Number(elements['custom-skill-td'].value),
      interception: Number(elements['custom-int'].value),
    },
  });
  recapVisibleCount = preferences.recapPageSize;
  elements['settings-result'].textContent = 'Settings saved.';
  if (activeView === 'records') renderRecords();
  if (elements.scoring.value === 'custom') switchView(activeView);
});
elements['backup-export'].addEventListener('click', async () => {
  try {
    const output = await window.maddenFantasy.exportJson('backup', backupPayload());
    elements['settings-result'].textContent = output ? 'Backup exported successfully.' : 'Backup export canceled.';
  } catch (error) { elements['settings-result'].textContent = error.message; }
});
elements['backup-import'].addEventListener('click', async () => {
  try {
    const backup = await window.maddenFantasy.importBackup(); if (!backup) return;
    if (backup.format !== 'madden-fantasy-backup' || !backup.storage || typeof backup.storage !== 'object') throw new Error('That file is not a valid companion backup.');
    const entries = Object.entries(backup.storage).filter(([key, value]) => key.startsWith('madden-fantasy') && typeof value === 'string');
    if (!entries.length) throw new Error('The backup does not contain companion data.');
    if (!window.confirm(`Restore ${entries.length} companion data items? Current leagues, worlds, and settings will be replaced.`)) return;
    const existing = []; for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (key?.startsWith('madden-fantasy')) existing.push(key); }
    existing.forEach((key) => localStorage.removeItem(key)); entries.forEach(([key, value]) => localStorage.setItem(key, value));
    sessionStorage.setItem('madden-fantasy:resume-view', activeView); window.location.reload();
  } catch (error) { elements['settings-result'].textContent = error.message; }
});
elements['diagnostics-export'].addEventListener('click', async () => {
  try {
    const output = await window.maddenFantasy.exportJson('diagnostics', supportReport());
    elements['settings-result'].textContent = output ? 'Privacy-safe support report created.' : 'Support report canceled.';
  } catch (error) { elements['settings-result'].textContent = error.message; }
});
window.maddenFantasy.onSaveChanged(() => { if (loadPreferences().autoRefresh) analyze(elements['save-select'].value, true); });

initialize();
