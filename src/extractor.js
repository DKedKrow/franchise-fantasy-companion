import Franchise from 'madden-franchise';

const ZERO_REFERENCE = /^0{32}$/;
const STAT_TABLES = [
  'GameOffensiveStats',
  'GameDefensiveStats',
  'GameKickingStats',
  'GameOffensiveKPReturnStats',
  'GameDefensiveKPReturnStats',
];
const PLAYER_RATING_FIELDS = [
  'Age',
  'OverallRating',
  'TraitDevelopment',
  'SpeedRating',
  'AccelerationRating',
  'AwarenessRating',
  'ThrowPowerRating',
  'ThrowAccuracyShortRating',
  'ThrowAccuracyMidRating',
  'ThrowAccuracyDeepRating',
  'CarryingRating',
  'BreakTackleRating',
  'CatchingRating',
  'CatchInTrafficRating',
  'ShortRouteRunningRating',
  'MediumRouteRunningRating',
  'DeepRouteRunningRating',
  'KickPowerRating',
  'KickAccuracyRating',
];
const PLAYER_PORTRAIT_FIELDS = ['PLYR_PORTRAIT', 'GenericPortrait', 'PortraitForceSilhouette'];

const value = (record, key) => record?.getValueByKey(key);
const validReference = (reference) =>
  typeof reference === 'string' && reference.length === 32 && !ZERO_REFERENCE.test(reference);

function mergeRecord(target, record) {
  for (const field of record.fieldsArray) {
    if (field.isReference || typeof field.value !== 'number' || field.value === 0) continue;
    target[field.key] = (target[field.key] ?? 0) + field.value;
  }
}

export async function extractPlayerGameStats(savePath) {
  const franchise = await Franchise.create(savePath, { saveOnChange: false });
  if (franchise.gameType !== 'madden' || franchise.gameYear !== 27) {
    throw new Error(`Expected a Madden 27 Franchise save; found ${franchise.gameType} ${franchise.gameYear}.`);
  }

  const playerTable = franchise.getTableByName('Player');
  const gameStatsTable = franchise.getTableByName('GameStats[]');
  const seasonGameTable = franchise.getTableByName('SeasonGame');
  const teamTable = franchise
    .getAllTablesByName('Team')
    .find((table) => table.header.recordCapacity > 1);
  const statTables = STAT_TABLES.map((name) => franchise.getTableByName(name)).filter(Boolean);

  await Promise.all([
    playerTable.readRecords([
      'FirstName', 'LastName', 'Position', 'TeamIndex', 'GameStats',
      ...PLAYER_RATING_FIELDS,
      ...PLAYER_PORTRAIT_FIELDS,
    ]),
    gameStatsTable.readRecords(),
    seasonGameTable.readRecords([
      'SeasonGameID',
      'SeasonYear',
      'SeasonWeek',
      'SeasonWeekType',
      'GameStatus',
      'HomeScore',
      'AwayScore',
      'HomeTeam',
      'AwayTeam',
      'IsSimmed',
      'NumberTimesPlayed',
    ]),
    teamTable.readRecords(['TeamIndex', 'DisplayName', 'LongName', 'ShortName', 'IsUserManaged']),
    ...statTables.map((table) => table.readRecords()),
  ]);

  const games = new Map();

  for (const player of playerTable.records) {
    if (player.isEmpty) continue;
    const wrapperReference = value(player, 'GameStats');
    if (!validReference(wrapperReference)) continue;
    const wrapper = franchise.getReferencedRecord(wrapperReference);
    if (!wrapper || wrapper.isEmpty) continue;

    for (const field of wrapper.fieldsArray) {
      if (!validReference(field.value)) continue;
      const statRecord = franchise.getReferencedRecord(field.value);
      if (!statRecord || statRecord.isEmpty || !STAT_TABLES.includes(statRecord.parent.name)) continue;
      const gameReference = value(statRecord, 'SeasonGame');
      if (!validReference(gameReference)) continue;
      const gameRecord = franchise.getReferencedRecord(gameReference);
      if (!gameRecord || gameRecord.isEmpty) continue;

      const gameId = value(gameRecord, 'SeasonGameID');
      const homeTeam = franchise.getReferencedRecord(value(gameRecord, 'HomeTeam'));
      const awayTeam = franchise.getReferencedRecord(value(gameRecord, 'AwayTeam'));
      const opposingTeam = franchise.getReferencedRecord(value(statRecord, 'OpposingTeam'));
      const opposingTeamIndex = value(opposingTeam, 'TeamIndex');
      const teamAtGame =
        opposingTeamIndex === value(homeTeam, 'TeamIndex')
          ? awayTeam
          : opposingTeamIndex === value(awayTeam, 'TeamIndex')
            ? homeTeam
            : null;
      const playerKey = `${player.index}`;
      if (!games.has(gameId)) {
        games.set(gameId, {
          gameId,
          year: value(gameRecord, 'SeasonYear'),
          week: value(gameRecord, 'SeasonWeek'),
          weekType: value(gameRecord, 'SeasonWeekType'),
          status: value(gameRecord, 'GameStatus'),
          homeScore: value(gameRecord, 'HomeScore'),
          awayScore: value(gameRecord, 'AwayScore'),
          isSimmed: value(gameRecord, 'IsSimmed'),
          numberTimesPlayed: value(gameRecord, 'NumberTimesPlayed'),
          homeTeam: homeTeam
            ? {
                index: value(homeTeam, 'TeamIndex'),
                name: value(homeTeam, 'DisplayName') || value(homeTeam, 'LongName'),
                abbreviation: value(homeTeam, 'ShortName'),
                isUserManaged: value(homeTeam, 'IsUserManaged'),
              }
            : null,
          awayTeam: awayTeam
            ? {
                index: value(awayTeam, 'TeamIndex'),
                name: value(awayTeam, 'DisplayName') || value(awayTeam, 'LongName'),
                abbreviation: value(awayTeam, 'ShortName'),
                isUserManaged: value(awayTeam, 'IsUserManaged'),
              }
            : null,
          players: new Map(),
        });
      }

      const game = games.get(gameId);
      if (!game.players.has(playerKey)) {
        game.players.set(playerKey, {
          playerId: player.index,
          firstName: value(player, 'FirstName'),
          lastName: value(player, 'LastName'),
          position: value(player, 'Position'),
          teamIndex: value(teamAtGame, 'TeamIndex') ?? value(player, 'TeamIndex'),
          team: teamAtGame
            ? {
                index: value(teamAtGame, 'TeamIndex'),
                name: value(teamAtGame, 'DisplayName') || value(teamAtGame, 'LongName'),
                abbreviation: value(teamAtGame, 'ShortName'),
              }
            : null,
          ratings: Object.fromEntries(PLAYER_RATING_FIELDS.map((field) => [field, value(player, field)])),
          portrait: {
            id: value(player, 'PLYR_PORTRAIT') || value(player, 'GenericPortrait') || 0,
            forceSilhouette: Boolean(value(player, 'PortraitForceSilhouette')),
          },
          stats: {},
        });
      }
      mergeRecord(game.players.get(playerKey).stats, statRecord);
    }
  }

  return [...games.values()]
    .map((game) => ({ ...game, players: [...game.players.values()] }))
    .sort((a, b) => a.year - b.year || a.week - b.week || a.gameId - b.gameId);
}
