import Franchise from 'madden-franchise';
import { extractPlayerGameStats } from '../src/extractor.js';

const savePath = process.argv[2] ?? './sample-save';
const games = await extractPlayerGameStats(savePath);
const playedGames = games.filter((game) => !game.isSimmed && game.numberTimesPlayed > 0);
const latest = playedGames.at(-1);
const userTeam = latest.homeTeam?.abbreviation === 'TKY' ? latest.homeTeam : latest.awayTeam;

const franchise = await Franchise.create(savePath, { saveOnChange: false });
const playerTable = franchise.getTableByName('Player');
await playerTable.readRecords([
  'FirstName', 'LastName', 'Position', 'TeamIndex', 'OverallRating', 'Age', 'TraitDevelopment',
  'SpeedRating', 'AccelerationRating', 'StrengthRating', 'TackleRating', 'HitPowerRating',
  'PlayRecognitionRating', 'ManCoverageRating', 'ZoneCoverageRating', 'BlockSheddingRating',
  'PowerMovesRating', 'FinesseMovesRating',
]);

const defensivePositions = new Set(['LE', 'RE', 'DT', 'LOLB', 'MLB', 'ROLB', 'CB', 'FS', 'SS']);
const roster = playerTable.records
  .filter((player) => !player.isEmpty)
  .filter((player) => player.getValueByKey('TeamIndex') === userTeam.index)
  .filter((player) => defensivePositions.has(player.getValueByKey('Position')))
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
      PRC: player.getValueByKey('PlayRecognitionRating'),
      TAK: player.getValueByKey('TackleRating'),
      POW: player.getValueByKey('PowerMovesRating'),
      FIN: player.getValueByKey('FinesseMovesRating'),
      MCV: player.getValueByKey('ManCoverageRating'),
      ZCV: player.getValueByKey('ZoneCoverageRating'),
      Tkl: stat('DEFTACKLES') + stat('ASSDEFTACKLES'),
      TFL: stat('DEFTACKLESFORLOSS'),
      Sack: stat('DLINESACKS') + stat('DLINEHALFSACK') * 0.5,
      INT: stat('DSECINTS'),
      PD: stat('DEFPASSDEFLECTIONS'),
    };
  })
  .sort((a, b) => b.OVR - a.OVR);

console.log(JSON.stringify({
  team: userTeam,
  latestGame: {
    week: latest.week + 1,
    opponent: latest.homeTeam.index === userTeam.index ? latest.awayTeam : latest.homeTeam,
    score: `${latest.awayScore}-${latest.homeScore}`,
  },
  roster,
}, null, 2));
