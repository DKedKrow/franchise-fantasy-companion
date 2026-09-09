const QB = 'QB';
const HB = 'HB';
const WR = 'WR';
const TE = 'TE';
const K = 'K';
const DST = 'DST';

export const PLAYSTYLE_ARCHETYPES = [
  { id: 'balanced', name: 'Balanced Builder', description: 'Builds evenly at every position and trusts stable weekly roles.', plan: [QB, HB, WR, WR, HB, TE, WR, HB, QB, WR, TE, HB, K, DST, WR] },
  { id: 'air_raid', name: 'Air Raid', description: 'Loads up on quarterbacks and receivers to chase passing explosions.', plan: [WR, QB, WR, WR, TE, QB, WR, HB, TE, HB, WR, HB, HB, K, DST] },
  { id: 'ground_pound', name: 'Ground & Pound', description: 'Builds around volume runners and rushing production.', plan: [HB, HB, QB, HB, WR, WR, HB, TE, WR, QB, WR, TE, WR, DST, K] },
  { id: 'zero_rb', name: 'Zero RB', description: 'Secures elite pass catchers before attacking running-back depth late.', plan: [WR, WR, TE, WR, QB, WR, TE, WR, QB, HB, HB, HB, HB, K, DST] },
  { id: 'hero_qb', name: 'Hero QB', description: 'Pays a premium for quarterback stability and weekly ceiling.', plan: [QB, WR, HB, WR, TE, HB, WR, QB, HB, WR, TE, HB, WR, K, DST] },
  { id: 'te_premium', name: 'TE Premium', description: 'Treats tight end as a weekly matchup advantage instead of an afterthought.', plan: [TE, WR, HB, QB, TE, WR, HB, WR, QB, HB, WR, HB, WR, K, DST] },
  { id: 'safe_floor', name: 'Safe Floor', description: 'Prefers consistent workloads and avoids volatile weekly bets.', plan: [HB, WR, QB, WR, HB, TE, WR, HB, QB, WR, TE, HB, WR, K, DST] },
  { id: 'boom_bust', name: 'Boom/Bust', description: 'Embraces volatile stars and game-breaking weekly ceilings.', plan: [WR, WR, QB, HB, WR, TE, HB, WR, QB, HB, TE, WR, HB, K, DST] },
  { id: 'youth', name: 'Youth Movement', description: 'Chases young players, development traits and future breakouts.', plan: [WR, HB, QB, WR, HB, TE, WR, QB, HB, WR, TE, HB, WR, K, DST] },
  { id: 'star_chaser', name: 'Star Chaser', description: 'Collects the highest-rated names regardless of positional fashion.', plan: [WR, HB, QB, WR, TE, HB, WR, QB, HB, WR, TE, HB, WR, K, DST] },
  { id: 'defense_first', name: 'Defense & Details', description: 'Invests unusually early in D/ST and kicking edges.', plan: [DST, K, QB, HB, WR, WR, HB, TE, WR, HB, QB, WR, TE, HB, WR] },
  { id: 'homer', name: 'Hometown Loyalist', description: 'Aggressively targets players from one favorite NFL team.', plan: [QB, HB, WR, WR, HB, TE, WR, QB, HB, WR, TE, HB, WR, K, DST] },
  { id: 'contrarian', name: 'Contrarian', description: 'Looks past obvious stars for overlooked production and strange roster builds.', plan: [TE, HB, WR, QB, HB, WR, TE, WR, HB, QB, WR, HB, WR, DST, K] },
  { id: 'dual_threat', name: 'Dual-Threat Lab', description: 'Builds around mobile quarterbacks and multi-purpose weapons.', plan: [QB, HB, WR, QB, WR, HB, TE, WR, HB, WR, TE, HB, WR, K, DST] },
  { id: 'receiving_backs', name: 'Backfield Targets', description: 'Values running backs who contribute as receivers and flex options.', plan: [HB, WR, HB, QB, HB, WR, TE, HB, WR, QB, TE, WR, WR, K, DST] },
  { id: 'upside', name: 'Upside Hunter', description: 'Prioritizes development traits, recent breakouts and untapped ceilings.', plan: [WR, HB, QB, WR, HB, TE, WR, QB, WR, HB, TE, HB, WR, K, DST] },
];

const n = (stats, key) => Number(stats?.[key]) || 0;

function hashText(text) {
  let hash = 2166136261;
  for (const character of String(text)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function getArchetype(id) {
  return PLAYSTYLE_ARCHETYPES.find((archetype) => archetype.id === id) ?? PLAYSTYLE_ARCHETYPES[0];
}

export function archetypeForTeam(index, seed = 0) {
  return PLAYSTYLE_ARCHETYPES[(index + seed) % PLAYSTYLE_ARCHETYPES.length];
}

export function archetypeDraftValue(player, archetypeId, { seed = 0, favoriteTeam = null } = {}) {
  const archetype = getArchetype(archetypeId);
  const stats = player.profile?.aggregate ?? {};
  const overall = Number(player.ratings?.OverallRating) || 65;
  const average = player.games ? player.total / player.games : 0;
  const age = Number(player.ratings?.Age) || 27;
  const development = String(player.ratings?.TraitDevelopment ?? 'Normal');
  let value = (overall * 8) + (average * 2) + ((hashText(`${seed}:${player.key}`) % 100) / 10);
  if (archetype.id === 'air_raid' && ['QB', 'WR'].includes(player.position)) value += 85;
  if (archetype.id === 'ground_pound' && ['HB', 'FB'].includes(player.position)) value += 90 + (n(stats, 'RUSHYARDS') / 20);
  if (archetype.id === 'zero_rb' && ['WR', 'TE'].includes(player.position)) value += 80;
  if (archetype.id === 'hero_qb' && player.position === 'QB') value += 130;
  if (archetype.id === 'te_premium' && player.position === 'TE') value += 150;
  if (archetype.id === 'safe_floor') value += (player.profile?.consistencyScore ?? 50) * 1.5;
  if (archetype.id === 'boom_bust') value += (player.high ?? average) * 3;
  if (archetype.id === 'youth') value += Math.max(0, 30 - age) * 9 + (development === 'Normal' ? 0 : 35);
  if (archetype.id === 'star_chaser') value += overall * 4;
  if (archetype.id === 'defense_first' && ['DST', 'K'].includes(player.position)) value += 180;
  if (archetype.id === 'homer' && player.team?.abbreviation === favoriteTeam) value += 240;
  if (archetype.id === 'contrarian') value += Math.max(0, 84 - overall) * 5;
  if (archetype.id === 'dual_threat' && player.position === 'QB') value += n(stats, 'RUSHYARDS') / 5;
  if (archetype.id === 'receiving_backs' && ['HB', 'FB'].includes(player.position)) value += n(stats, 'RECEIVECATCHES') * 3;
  if (archetype.id === 'upside') value += (player.high ?? 0) * 2 + (development === 'Normal' ? 0 : 55);
  return value;
}

export function archetypeLineupValue(player, archetypeId, week, favoriteTeam = null) {
  const archetype = getArchetype(archetypeId);
  const prior = player.logs.filter((log) => log.weekType === week.weekType && log.week < week.week);
  const average = prior.length ? prior.reduce((sum, log) => sum + log.points, 0) / prior.length : (Number(player.ratings?.OverallRating) || 65) / 5;
  const high = prior.length ? Math.max(...prior.map((log) => log.points)) : average;
  const deviation = prior.length
    ? Math.sqrt(prior.reduce((sum, log) => sum + ((log.points - average) ** 2), 0) / prior.length)
    : 0;
  let value = average;
  if (archetype.id === 'safe_floor') value = average - (deviation * 0.45);
  if (['boom_bust', 'upside'].includes(archetype.id)) value = (average * 0.55) + (high * 0.45);
  if (archetype.id === 'star_chaser') value += (Number(player.ratings?.OverallRating) || 65) / 12;
  if (archetype.id === 'homer' && player.team?.abbreviation === favoriteTeam) value += 7;
  if (archetype.id === 'te_premium' && player.position === 'TE') value += 4;
  if (archetype.id === 'receiving_backs' && ['HB', 'FB'].includes(player.position)) value += 3;
  if (archetype.id === 'dual_threat' && player.position === 'QB') value += n(player.profile?.aggregate, 'RUSHYARDS') / Math.max(player.games, 1) / 20;
  return value;
}
