import { calculateFantasyPoints, calculateTeamDefensePoints } from './scoring.js';

const fantasyPositions = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'K']);
const playmakerPositions = new Set(['HB', 'FB', 'WR', 'TE']);
const n = (stats, key) => Number(stats?.[key]) || 0;

function playerTeam(game, player) {
  if (player.team) return player.team;
  return [game.homeTeam, game.awayTeam].find((team) => team?.index === player.teamIndex) ?? null;
}

function resultFor(game, team) {
  const isHome = team?.index === game.homeTeam?.index;
  const own = isHome ? game.homeScore : game.awayScore;
  const opponent = isHome ? game.awayScore : game.homeScore;
  return `${own > opponent ? 'W' : own < opponent ? 'L' : 'T'} ${own}–${opponent}`;
}

function opponentFor(game, team) {
  return team?.index === game.homeTeam?.index ? game.awayTeam : game.homeTeam;
}

function dstAppearance(game, team, pointsAllowed, rules) {
  const stats = game.players
    .filter((player) => player.teamIndex === team.index)
    .reduce((totals, player) => {
      totals.sacks += n(player.stats, 'DLINESACKS') + (n(player.stats, 'DLINEHALFSACK') * 0.5);
      totals.interceptions += n(player.stats, 'DSECINTS');
      totals.fumbleRecoveries += n(player.stats, 'DLINEFUMBLERECOVERIES');
      totals.defensiveTouchdowns += n(player.stats, 'DSECINTTDS') + n(player.stats, 'DLINEFUMBLETDS');
      totals.returnTouchdowns += n(player.stats, 'KRETTDS') + n(player.stats, 'PRETTDS');
      totals.safeties += n(player.stats, 'DLINESAFETIES');
      return totals;
    }, { sacks: 0, interceptions: 0, fumbleRecoveries: 0, defensiveTouchdowns: 0, returnTouchdowns: 0, safeties: 0 });
  return {
    key: `dst-${team.index}`,
    name: `${team.name} D/ST`,
    position: 'DST',
    team,
    stats: {
      DSTSACKS: stats.sacks,
      DSTTAKEAWAYS: stats.interceptions + stats.fumbleRecoveries,
      DSTTDS: stats.defensiveTouchdowns + stats.returnTouchdowns,
      DSTPOINTSALLOWED: pointsAllowed,
    },
    points: calculateTeamDefensePoints(stats, pointsAllowed, rules).total,
    game,
    opponent: opponentFor(game, team),
    result: resultFor(game, team),
  };
}

export function fantasyAppearances(game, rules) {
  const players = game.players
    .filter((player) => fantasyPositions.has(player.position))
    .filter((player) =>
      n(player.stats, 'DOWNSPLAYED') || n(player.stats, 'PASSATTEMPTS') || n(player.stats, 'RUSHATTEMPTS') ||
      n(player.stats, 'RECEIVECATCHES') || n(player.stats, 'KICKFGATTEMPTS') || n(player.stats, 'KICKEPATTEMPTS'))
    .map((player) => {
      const team = playerTeam(game, player);
      return {
        key: String(player.playerId),
        name: `${player.firstName} ${player.lastName}`.trim(),
        position: player.position,
        team,
        stats: player.stats,
        points: calculateFantasyPoints(player.stats, rules).total,
        game,
        opponent: opponentFor(game, team),
        result: resultFor(game, team),
      };
    });
  if (game.awayTeam) players.push(dstAppearance(game, game.awayTeam, game.homeScore, rules));
  if (game.homeTeam) players.push(dstAppearance(game, game.homeTeam, game.awayScore, rules));
  return players;
}

function maxBy(items, read) {
  return items.reduce((best, item) => (!best || read(item) > read(best) ? item : best), null);
}

function record(label, item, read, format = (value) => String(value)) {
  const value = item ? read(item) : 0;
  return {
    label,
    holder: item?.name ?? '—',
    team: item?.team ?? null,
    value,
    display: item ? format(value) : '—',
    game: item?.game ?? null,
    opponent: item?.opponent ?? null,
    result: item?.result ?? '—',
  };
}

export function buildRecordBook(games, rules, teamIndex = null) {
  const fantasy = games.flatMap((game) => fantasyAppearances(game, rules))
    .filter((item) => teamIndex === null || item.team?.index === teamIndex);
  const raw = games.flatMap((game) => game.players.map((player) => {
    const team = playerTeam(game, player);
    return {
      name: `${player.firstName} ${player.lastName}`.trim(),
      team,
      stats: player.stats,
      game,
      opponent: opponentFor(game, team),
      result: resultFor(game, team),
    };
  })).filter((item) => teamIndex === null || item.team?.index === teamIndex);
  const teamGames = games.flatMap((game) => [
    { name: game.awayTeam?.name, team: game.awayTeam, value: game.awayScore, margin: game.awayScore - game.homeScore, game, opponent: game.homeTeam, result: resultFor(game, game.awayTeam) },
    { name: game.homeTeam?.name, team: game.homeTeam, value: game.homeScore, margin: game.homeScore - game.awayScore, game, opponent: game.awayTeam, result: resultFor(game, game.homeTeam) },
  ]).filter((entry) => entry.team && (teamIndex === null || entry.team.index === teamIndex));

  const categories = [
    record('Fantasy points', maxBy(fantasy, (item) => item.points), (item) => item.points, (value) => `${value.toFixed(2)} pts`),
    record('Passing yards', maxBy(raw, (item) => n(item.stats, 'PASSYARDS')), (item) => n(item.stats, 'PASSYARDS'), (value) => `${value} yds`),
    record('Passing touchdowns', maxBy(raw, (item) => n(item.stats, 'PASSTDS')), (item) => n(item.stats, 'PASSTDS'), (value) => `${value} TD`),
    record('Rushing yards', maxBy(raw, (item) => n(item.stats, 'RUSHYARDS')), (item) => n(item.stats, 'RUSHYARDS'), (value) => `${value} yds`),
    record('Rushing touchdowns', maxBy(raw, (item) => n(item.stats, 'RUSHTDS')), (item) => n(item.stats, 'RUSHTDS'), (value) => `${value} TD`),
    record('Receptions', maxBy(raw, (item) => n(item.stats, 'RECEIVECATCHES')), (item) => n(item.stats, 'RECEIVECATCHES'), (value) => `${value} rec`),
    record('Receiving yards', maxBy(raw, (item) => n(item.stats, 'RECEIVEYARDS')), (item) => n(item.stats, 'RECEIVEYARDS'), (value) => `${value} yds`),
    record('Receiving touchdowns', maxBy(raw, (item) => n(item.stats, 'RECEIVETDS')), (item) => n(item.stats, 'RECEIVETDS'), (value) => `${value} TD`),
    record('Defensive sacks', maxBy(raw, (item) => n(item.stats, 'DLINESACKS') + (n(item.stats, 'DLINEHALFSACK') * 0.5)), (item) => n(item.stats, 'DLINESACKS') + (n(item.stats, 'DLINEHALFSACK') * 0.5), (value) => `${value} sacks`),
    record('Defensive interceptions', maxBy(raw, (item) => n(item.stats, 'DSECINTS')), (item) => n(item.stats, 'DSECINTS'), (value) => `${value} INT`),
    record('Total tackles', maxBy(raw, (item) => n(item.stats, 'DEFTACKLES') + n(item.stats, 'ASSDEFTACKLES')), (item) => n(item.stats, 'DEFTACKLES') + n(item.stats, 'ASSDEFTACKLES'), (value) => `${value} tackles`),
    record('Longest field goal', maxBy(raw, (item) => n(item.stats, 'KICKFGLONGEST')), (item) => n(item.stats, 'KICKFGLONGEST'), (value) => `${value} yds`),
    record('Team points', maxBy(teamGames, (item) => item.value), (item) => item.value, (value) => `${value} pts`),
    record('Largest win', maxBy(teamGames, (item) => item.margin), (item) => item.margin, (value) => `${value} pts`),
  ];

  const seasons = new Map();
  for (const appearance of fantasy) {
    const key = `${appearance.game.year}:${appearance.key}`;
    if (!seasons.has(key)) {
      seasons.set(key, { key, name: appearance.name, position: appearance.position, team: appearance.team, year: appearance.game.year, games: 0, points: 0, high: -Infinity });
    }
    const season = seasons.get(key);
    season.team = appearance.team;
    season.games += 1;
    season.points += appearance.points;
    season.high = Math.max(season.high, appearance.points);
  }
  const seasonLeaders = [...seasons.values()]
    .map((season) => ({ ...season, average: season.points / season.games }))
    .sort((a, b) => b.points - a.points);
  return { categories, seasonLeaders };
}

export function buildWeeklyAwards(games, rules, teamIndex = null) {
  const weeks = new Map();
  for (const game of games) {
    const key = `${game.weekType}:${game.week}`;
    if (!weeks.has(key)) weeks.set(key, { week: game.week, weekType: game.weekType, appearances: [] });
    weeks.get(key).appearances.push(
      ...fantasyAppearances(game, rules).filter((item) => teamIndex === null || item.team?.index === teamIndex),
    );
  }
  return [...weeks.values()]
    .map((week) => ({
      week: week.week,
      weekType: week.weekType,
      overall: maxBy(week.appearances, (item) => item.points),
      quarterback: maxBy(week.appearances.filter((item) => item.position === 'QB'), (item) => item.points),
      playmaker: maxBy(week.appearances.filter((item) => playmakerPositions.has(item.position)), (item) => item.points),
      defense: maxBy(week.appearances.filter((item) => item.position === 'DST'), (item) => item.points),
    }))
    .sort((a, b) => a.week - b.week);
}

export function buildTeamRecaps(games, teamIndex, rules) {
  return games.map((game) => {
    const leagueWideTeam = game.homeScore === game.awayScore
      ? game.homeTeam
      : game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
    const team = teamIndex === null
      ? leagueWideTeam
      : [game.homeTeam, game.awayTeam].find((entry) => entry?.index === teamIndex);
    const recapTeamIndex = team?.index;
    const opponent = opponentFor(game, team);
    const isHome = team?.index === game.homeTeam?.index;
    const ownScore = isHome ? game.homeScore : game.awayScore;
    const opponentScore = isHome ? game.awayScore : game.homeScore;
    const players = game.players.filter((player) => player.teamIndex === recapTeamIndex);
    const passer = maxBy(players, (player) => n(player.stats, 'PASSYARDS'));
    const rusher = maxBy(players, (player) => n(player.stats, 'RUSHYARDS'));
    const receiver = maxBy(players, (player) => n(player.stats, 'RECEIVEYARDS'));
    const gameBall = maxBy(fantasyAppearances(game, rules).filter((item) => item.team?.index === recapTeamIndex), (item) => item.points);
    const combined = ownScore + opponentScore;
    const margin = Math.abs(ownScore - opponentScore);
    const style = combined >= 70 ? 'shootout' : opponentScore <= 10 ? 'defensive showcase' : margin >= 21 ? 'rout' : margin <= 8 ? 'one-score finish' : 'complete performance';
    const outcome = ownScore > opponentScore ? 'defeated' : ownScore < opponentScore ? 'fell to' : 'tied';
    const teamName = team?.name ?? 'Team';
    const opponentName = opponent?.name ?? 'the opponent';
    const passerText = passer && n(passer.stats, 'PASSATTEMPTS')
      ? `${passer.firstName} ${passer.lastName} threw for ${n(passer.stats, 'PASSYARDS')} yards and ${n(passer.stats, 'PASSTDS')} touchdowns`
      : null;
    const receiverText = receiver && n(receiver.stats, 'RECEIVECATCHES')
      ? `${receiver.firstName} ${receiver.lastName} led the receivers with ${n(receiver.stats, 'RECEIVECATCHES')} catches for ${n(receiver.stats, 'RECEIVEYARDS')} yards`
      : null;
    const rusherText = rusher && n(rusher.stats, 'RUSHATTEMPTS')
      ? `${rusher.firstName} ${rusher.lastName} added ${n(rusher.stats, 'RUSHYARDS')} rushing yards and ${n(rusher.stats, 'RUSHTDS')} scores`
      : null;
    const performance = [passerText, receiverText, rusherText].filter(Boolean).join('; ');
    return {
      game,
      team,
      opponent,
      headline: `${teamName} ${ownScore}, ${opponent?.abbreviation ?? opponentName} ${opponentScore}`,
      kicker: `${ownScore > opponentScore ? 'Win' : ownScore < opponentScore ? 'Loss' : 'Tie'} · ${style}`,
      recap: `${teamName} ${outcome} ${opponentName} ${ownScore}–${opponentScore}${performance ? `. ${performance}` : ''}.`,
      gameBall,
    };
  }).sort((a, b) => b.game.week - a.game.week);
}
