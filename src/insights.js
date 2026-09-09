import { fantasyAppearances } from './records.js';

const gameKey = (game) => `${game.year}:${game.weekType}:${game.week}`;

export function buildFantasyRedZone(games, rules) {
  const completed = games.filter((game) => game.weekType !== 'PreSeason').sort((a, b) =>
    a.year - b.year || a.week - b.week || a.weekType.localeCompare(b.weekType));
  const latest = completed.at(-1);
  if (!latest) return { week: null, leaders: [], shootouts: [], closeGames: [] };
  const weekGames = completed.filter((game) => gameKey(game) === gameKey(latest));
  const leaders = weekGames.flatMap((game) => fantasyAppearances(game, rules))
    .sort((a, b) => b.points - a.points).slice(0, 12);
  const withTotal = weekGames.map((game) => ({ game, total: game.homeScore + game.awayScore, margin: Math.abs(game.homeScore - game.awayScore) }));
  return {
    week: { year: latest.year, week: latest.week, weekType: latest.weekType }, leaders,
    shootouts: [...withTotal].sort((a, b) => b.total - a.total).slice(0, 5),
    closeGames: withTotal.filter((entry) => entry.margin <= 8).sort((a, b) => a.margin - b.margin).slice(0, 5),
  };
}

export function buildNflPowerRankings(games, teams) {
  const rows = teams.map((team) => {
    const teamGames = games.filter((game) => game.homeTeam?.index === team.index || game.awayTeam?.index === team.index);
    let wins = 0; let losses = 0; let ties = 0; let pointsFor = 0; let pointsAgainst = 0;
    const results = teamGames.map((game) => {
      const home = game.homeTeam?.index === team.index;
      const own = home ? game.homeScore : game.awayScore; const opp = home ? game.awayScore : game.homeScore;
      pointsFor += own; pointsAgainst += opp;
      if (own > opp) wins += 1; else if (own < opp) losses += 1; else ties += 1;
      return own > opp ? 1 : own < opp ? -1 : 0;
    });
    const lastThree = results.slice(-3); const momentum = lastThree.reduce((sum, value) => sum + value, 0);
    const gamesPlayed = teamGames.length;
    const rating = (wins * 10) + (gamesPlayed ? (pointsFor - pointsAgainst) / gamesPlayed : 0) + (momentum * 2.5);
    return { team, games: gamesPlayed, wins, losses, ties, pointsFor, pointsAgainst, momentum, rating };
  }).sort((a, b) => b.rating - a.rating || b.pointsFor - a.pointsFor);
  return rows.map((entry, index) => ({ ...entry, rank: index + 1, movement: entry.momentum > 0 ? '↑' : entry.momentum < 0 ? '↓' : '—' }));
}

export function buildHeadToHeadHistory(games, teamIndex) {
  const opponents = new Map();
  for (const game of games.filter((entry) => entry.homeTeam?.index === teamIndex || entry.awayTeam?.index === teamIndex)) {
    const home = game.homeTeam?.index === teamIndex; const opponent = home ? game.awayTeam : game.homeTeam;
    if (!opponent) continue;
    if (!opponents.has(opponent.index)) opponents.set(opponent.index, { opponent, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 });
    const row = opponents.get(opponent.index); const own = home ? game.homeScore : game.awayScore; const against = home ? game.awayScore : game.homeScore;
    row.games += 1; row.pointsFor += own; row.pointsAgainst += against;
    if (own > against) row.wins += 1; else if (own < against) row.losses += 1; else row.ties += 1;
  }
  return [...opponents.values()].sort((a, b) => b.games - a.games || b.wins - a.wins || a.opponent.name.localeCompare(b.opponent.name));
}

export function buildSeasonMagazine(games, rules) {
  const redZone = buildFantasyRedZone(games, rules);
  const appearances = games.flatMap((game) => fantasyAppearances(game, rules));
  const totals = new Map();
  for (const appearance of appearances) {
    const row = totals.get(appearance.key) ?? { name: appearance.name, team: appearance.team, position: appearance.position, points: 0, games: 0, high: -Infinity };
    row.points += appearance.points; row.games += 1; row.high = Math.max(row.high, appearance.points); totals.set(appearance.key, row);
  }
  const leaders = [...totals.values()].sort((a, b) => b.points - a.points);
  const seasonStar = leaders[0] ?? null; const highGame = [...appearances].sort((a, b) => b.points - a.points)[0] ?? null;
  const highestScoringGame = [...games].sort((a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore))[0] ?? null;
  return {
    title: games.length ? `Year ${games[0].year + 1}: The Season So Far` : 'Season Magazine',
    dek: seasonStar ? `${seasonStar.name} leads the fantasy landscape with ${seasonStar.points.toFixed(2)} points.` : 'Play games to begin the story.',
    seasonStar, highGame, highestScoringGame, latestLeaders: redZone.leaders.slice(0, 3),
  };
}
