import Franchise from 'madden-franchise';
import { extractPlayerGameStats } from '../src/extractor.js';

const savePath = process.argv[2] ?? './sample-save';
const games = await extractPlayerGameStats(savePath);
const latest = games.filter((game) => !game.isSimmed && game.numberTimesPlayed > 0).at(-1);
const userTeam = latest.homeTeam?.abbreviation === 'TKY' ? latest.homeTeam : latest.awayTeam;

const franchise = await Franchise.create(savePath, { saveOnChange: false });
const playerTable = franchise.getTableByName('Player');
await playerTable.readRecords([
  'FirstName', 'LastName', 'Position', 'TeamIndex', 'OverallRating', 'Age', 'TraitDevelopment',
  'SpeedRating', 'AccelerationRating', 'AwarenessRating', 'ThrowPowerRating',
  'ThrowAccuracyShortRating', 'ThrowAccuracyMidRating', 'ThrowAccuracyDeepRating',
  'CarryingRating', 'BreakTackleRating', 'CatchingRating', 'CatchInTrafficRating',
  'ShortRouteRunningRating', 'MediumRouteRunningRating', 'DeepRouteRunningRating',
  'PassBlockRating', 'PassBlockPowerRating', 'PassBlockFinesseRating',
  'RunBlockRating', 'RunBlockPowerRating', 'RunBlockFinesseRating',
]);

const offensivePositions = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT']);
const order = ['QB', 'HB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
const roster = playerTable.records
  .filter((player) => !player.isEmpty)
  .filter((player) => player.getValueByKey('TeamIndex') === userTeam.index)
  .filter((player) => offensivePositions.has(player.getValueByKey('Position')))
  .map((player) => {
    const gamePlayer = latest.players.find((entry) => entry.playerId === player.index);
    const stat = (key) => gamePlayer?.stats[key] ?? 0;
    return {
      Player: `${player.getValueByKey('FirstName')} ${player.getValueByKey('LastName')}`,
      Pos: player.getValueByKey('Position'),
      OVR: player.getValueByKey('OverallRating'),
      Age: player.getValueByKey('Age'),
      Dev: player.getValueByKey('TraitDevelopment'),
      SPD: player.getValueByKey('SpeedRating'),
      AWR: player.getValueByKey('AwarenessRating'),
      THP: player.getValueByKey('ThrowPowerRating'),
      SAC: player.getValueByKey('ThrowAccuracyShortRating'),
      MAC: player.getValueByKey('ThrowAccuracyMidRating'),
      DAC: player.getValueByKey('ThrowAccuracyDeepRating'),
      CAR: player.getValueByKey('CarryingRating'),
      BTK: player.getValueByKey('BreakTackleRating'),
      CTH: player.getValueByKey('CatchingRating'),
      SRR: player.getValueByKey('ShortRouteRunningRating'),
      MRR: player.getValueByKey('MediumRouteRunningRating'),
      DRR: player.getValueByKey('DeepRouteRunningRating'),
      PBK: player.getValueByKey('PassBlockRating'),
      RBK: player.getValueByKey('RunBlockRating'),
      PassYds: stat('PASSYARDS'),
      PassTD: stat('PASSTDS'),
      INT: stat('PASSINTS'),
      RushYds: stat('RUSHYARDS'),
      RushTD: stat('RUSHTDS'),
      Rec: stat('RECEIVECATCHES'),
      RecYds: stat('RECEIVEYARDS'),
      RecTD: stat('RECEIVETDS'),
    };
  })
  .sort((a, b) => order.indexOf(a.Pos) - order.indexOf(b.Pos) || b.OVR - a.OVR);

console.log(JSON.stringify({ team: userTeam, latestGame: { week: latest.week + 1, score: `${latest.awayScore}-${latest.homeScore}` }, roster }, null, 2));
