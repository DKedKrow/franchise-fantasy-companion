import path from 'node:path';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extractPlayerGameStats } from './extractor.js';
import { calculateFantasyPoints } from './scoring.js';

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('Usage: npm run extract -- "C:\\path\\to\\CAREER-save"');
  process.exit(1);
}

const scratch = await mkdtemp(path.join(tmpdir(), 'madden-fantasy-'));
const copiedSave = path.join(scratch, path.basename(sourcePath));

try {
  await copyFile(sourcePath, copiedSave);
  const games = await extractPlayerGameStats(copiedSave);
  const latest = games.at(-1);
  if (!latest) {
    console.log('No completed player game statistics were found in this save.');
    process.exit(0);
  }

  const leaderboard = latest.players
    .map((player) => ({ ...player, fantasy: calculateFantasyPoints(player.stats) }))
    .filter((player) => player.fantasy.total !== 0)
    .sort((a, b) => b.fantasy.total - a.fantasy.total);

  console.log(
    `Year ${latest.year}, ${latest.weekType} week ${latest.week + 1} — ` +
      `${latest.awayScore}-${latest.homeScore} (${latest.status})`,
  );
  console.table(
    leaderboard.slice(0, 30).map((player) => ({
      Player: `${player.firstName} ${player.lastName}`,
      Pos: player.position,
      Points: player.fantasy.total,
      PassYds: player.stats.PASSYARDS ?? 0,
      PassTD: player.stats.PASSTDS ?? 0,
      RushYds: player.stats.RUSHYARDS ?? 0,
      RushTD: player.stats.RUSHTDS ?? 0,
      Rec: player.stats.RECEIVECATCHES ?? 0,
      RecYds: player.stats.RECEIVEYARDS ?? 0,
      RecTD: player.stats.RECEIVETDS ?? 0,
    })),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
