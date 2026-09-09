const n = (stats, key) => Number(stats?.[key]) || 0;

function concentrationLabel(topTwoShare) {
  if (topTwoShare >= 0.67) return 'Highly concentrated';
  if (topTwoShare >= 0.5) return 'Focused';
  return 'Balanced';
}

function matchup(game, teamIndex) {
  const isHome = game.homeTeam?.index === teamIndex;
  const teamScore = isHome ? game.homeScore : game.awayScore;
  const opponentScore = isHome ? game.awayScore : game.homeScore;
  return {
    opponent: isHome ? game.awayTeam : game.homeTeam,
    location: isHome ? 'vs' : '@',
    result: `${teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T'} ${teamScore}–${opponentScore}`,
  };
}

export function analyzeTeamGames(games, teamIndex) {
  const receivers = new Map();
  const weekly = [];
  const totals = {
    games: games.length,
    passAttempts: 0,
    completions: 0,
    passYards: 0,
    passTouchdowns: 0,
    interceptions: 0,
    rushAttempts: 0,
    rushYards: 0,
    rushTouchdowns: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    drops: 0,
    yardsAfterCatch: 0,
  };

  for (const game of games) {
    const gameReceivers = [];
    const gameTotals = {
      passAttempts: 0,
      completions: 0,
      passYards: 0,
      passTouchdowns: 0,
      interceptions: 0,
      rushAttempts: 0,
      rushYards: 0,
      rushTouchdowns: 0,
      receptions: 0,
      receivingYards: 0,
      receivingTouchdowns: 0,
      drops: 0,
      yardsAfterCatch: 0,
    };

    for (const player of game.players.filter((entry) => entry.teamIndex === teamIndex)) {
      const stats = player.stats;
      const passing = {
        attempts: n(stats, 'PASSATTEMPTS'),
        completions: n(stats, 'PASSCOMPLETED'),
        yards: n(stats, 'PASSYARDS'),
        touchdowns: n(stats, 'PASSTDS'),
        interceptions: n(stats, 'PASSINTS'),
      };
      const rushing = {
        attempts: n(stats, 'RUSHATTEMPTS'),
        yards: n(stats, 'RUSHYARDS'),
        touchdowns: n(stats, 'RUSHTDS'),
      };
      const receiving = {
        receptions: n(stats, 'RECEIVECATCHES'),
        yards: n(stats, 'RECEIVEYARDS'),
        touchdowns: n(stats, 'RECEIVETDS'),
        drops: n(stats, 'RECEIVEDROPS'),
        yardsAfterCatch: n(stats, 'RECEIVEYARDSAFTER'),
      };

      gameTotals.passAttempts += passing.attempts;
      gameTotals.completions += passing.completions;
      gameTotals.passYards += passing.yards;
      gameTotals.passTouchdowns += passing.touchdowns;
      gameTotals.interceptions += passing.interceptions;
      gameTotals.rushAttempts += rushing.attempts;
      gameTotals.rushYards += rushing.yards;
      gameTotals.rushTouchdowns += rushing.touchdowns;

      if (receiving.receptions || receiving.yards || receiving.touchdowns || receiving.drops) {
        const key = String(player.playerId);
        if (!receivers.has(key)) {
          receivers.set(key, {
            key,
            name: `${player.firstName} ${player.lastName}`.trim(),
            position: player.position,
            games: 0,
            receptions: 0,
            yards: 0,
            touchdowns: 0,
            drops: 0,
            yardsAfterCatch: 0,
          });
        }
        const receiver = receivers.get(key);
        receiver.games += 1;
        receiver.receptions += receiving.receptions;
        receiver.yards += receiving.yards;
        receiver.touchdowns += receiving.touchdowns;
        receiver.drops += receiving.drops;
        receiver.yardsAfterCatch += receiving.yardsAfterCatch;
        gameReceivers.push({ ...receiver, ...receiving });
        gameTotals.receptions += receiving.receptions;
        gameTotals.receivingYards += receiving.yards;
        gameTotals.receivingTouchdowns += receiving.touchdowns;
        gameTotals.drops += receiving.drops;
        gameTotals.yardsAfterCatch += receiving.yardsAfterCatch;
      }
    }

    for (const key of Object.keys(gameTotals)) totals[key] += gameTotals[key];
    const touches = gameReceivers.sort((a, b) => b.receptions - a.receptions || b.yards - a.yards);
    const topTwoCatches = touches.slice(0, 2).reduce((sum, player) => sum + player.receptions, 0);
    const playCount = gameTotals.passAttempts + gameTotals.rushAttempts;
    weekly.push({
      gameId: game.gameId,
      year: game.year,
      week: game.week,
      weekType: game.weekType,
      ...matchup(game, teamIndex),
      ...gameTotals,
      passRate: playCount ? gameTotals.passAttempts / playCount : 0,
      topReceiver: touches[0] ?? null,
      topTwoShare: gameTotals.receptions ? topTwoCatches / gameTotals.receptions : 0,
    });
  }

  const receiverRows = [...receivers.values()].sort((a, b) => b.receptions - a.receptions || b.yards - a.yards);
  for (const receiver of receiverRows) {
    receiver.receptionShare = totals.receptions ? receiver.receptions / totals.receptions : 0;
    receiver.yardShare = totals.receivingYards ? receiver.yards / totals.receivingYards : 0;
    receiver.yardsPerCatch = receiver.receptions ? receiver.yards / receiver.receptions : 0;
  }

  const positions = new Map();
  for (const receiver of receiverRows) {
    if (!positions.has(receiver.position)) {
      positions.set(receiver.position, { position: receiver.position, receptions: 0, yards: 0, touchdowns: 0 });
    }
    const group = positions.get(receiver.position);
    group.receptions += receiver.receptions;
    group.yards += receiver.yards;
    group.touchdowns += receiver.touchdowns;
  }
  const positionRows = [...positions.values()]
    .map((group) => ({
      ...group,
      receptionShare: totals.receptions ? group.receptions / totals.receptions : 0,
      yardShare: totals.receivingYards ? group.yards / totals.receivingYards : 0,
    }))
    .sort((a, b) => b.receptions - a.receptions);

  const topTwoShare = receiverRows.slice(0, 2).reduce((sum, player) => sum + player.receptionShare, 0);
  const playCount = totals.passAttempts + totals.rushAttempts;
  return {
    totals: {
      ...totals,
      passRate: playCount ? totals.passAttempts / playCount : 0,
      completionRate: totals.passAttempts ? totals.completions / totals.passAttempts : 0,
      passYardsPerGame: totals.games ? totals.passYards / totals.games : 0,
      rushYardsPerGame: totals.games ? totals.rushYards / totals.games : 0,
    },
    receivers: receiverRows,
    positions: positionRows,
    weekly: weekly.sort((a, b) => a.week - b.week || a.gameId - b.gameId),
    concentration: {
      topTwoShare,
      label: concentrationLabel(topTwoShare),
    },
  };
}
