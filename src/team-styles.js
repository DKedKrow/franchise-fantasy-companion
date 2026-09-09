const n = (stats, key) => Number(stats?.[key]) || 0;
const perGame = (value, games) => games ? value / games : 0;
const ratio = (value, total) => total ? value / total : 0;

export const NFL_OFFENSIVE_ARCHETYPES = [
  ['air_raid', 'Air Raid', 'Lives through passing volume and receiver depth.', (m) => m.passRate * 110 + m.passYpg / 8],
  ['west_coast', 'West Coast Rhythm', 'Leans on completions, timing and yards after catch.', (m) => m.completionRate * 100 + m.yacShare * 70],
  ['vertical', 'Vertical Strike', 'Trades efficiency for explosive downfield gains.', (m) => m.passYpa * 12 + m.longPass * 1.5],
  ['spread', 'Spread Tempo', 'Creates volume and distributes touches across the formation.', (m) => m.playsPerGame + (1 - m.topTargetShare) * 55],
  ['ground_pound', 'Ground & Pound', 'Makes rushing volume the center of the offense.', (m) => (1 - m.passRate) * 120 + m.rushYpg / 6],
  ['power_run', 'Power Run', 'Wins through repeated carries and rushing touchdowns.', (m) => m.rushTdPg * 28 + m.rushAttemptsPg * 2],
  ['zone_run', 'Cutback Run Game', 'Pairs efficient rushing with steady volume.', (m) => m.rushYpc * 15 + m.rushAttemptsPg],
  ['option', 'Dual-Threat Option', 'Uses quarterback rushing as a core constraint.', (m) => m.qbRushShare * 130 + m.rushYpc * 5],
  ['play_action', 'Play-Action Hunter', 'Uses a credible run game to create passing efficiency.', (m) => m.rushAttemptsPg + m.passYpa * 8],
  ['ball_control', 'Ball Control', 'Values long possessions, safe decisions and sustained drives.', (m) => m.playsPerGame + m.completionRate * 45 - m.turnoversPg * 10],
  ['multiple', 'Balanced Multiple', 'Can lean pass or run without abandoning either phase.', (m) => 90 - Math.abs(m.passRate - .56) * 180 + m.pointsPg],
  ['qb_centric', 'QB-Centric', 'Asks the quarterback to carry a huge share of production.', (m) => m.passRate * 65 + m.qbTdShare * 55],
  ['committee', 'Committee Backfield', 'Spreads rushing work instead of relying on one runner.', (m) => (1 - m.leadBackRushShare) * 70 + m.rushAttemptsPg],
  ['bell_cow', 'Bell-Cow Backfield', 'Funnels carries through one featured runner.', (m) => m.leadBackRushShare * 100 + m.rushAttemptsPg],
  ['alpha_funnel', 'Alpha Receiver Funnel', 'Forces the passing game through a true primary target.', (m) => m.topTargetShare * 125 + m.passYpg / 15],
  ['yac', 'YAC Machine', 'Creates offense after the catch through space and leverage.', (m) => m.yacShare * 120 + m.completionRate * 30],
  ['te_centric', 'Tight End Hub', 'Makes tight ends central to the weekly passing plan.', (m) => m.teCatchShare * 150 + m.completionRate * 25],
  ['backfield_pass', 'Backfield Passing Game', 'Treats running backs as receivers and matchup pieces.', (m) => m.rbCatchShare * 160 + m.completionRate * 20],
  ['explosive', 'Explosive Gambler', 'Chases chunk plays even when the offense becomes volatile.', (m) => m.longPass + m.longRush + m.passYpa * 5],
  ['chain_mover', 'Chain Mover', 'Prioritizes efficient, repeatable gains over fireworks.', (m) => m.completionRate * 75 + m.rushYpc * 8 - m.turnoversPg * 8],
  ['red_zone', 'Touchdown Finisher', 'Converts offensive production into touchdowns.', (m) => m.offensiveTdPg * 25 + m.pointsPg],
  ['gunslinger', 'Turnover-Prone Gunslinger', 'Accepts interceptions as the cost of aggressive passing.', (m) => m.passRate * 55 + m.interceptionsPg * 24 + m.passTdPg * 10],
  ['clock_killer', 'Clock Killer', 'Protects leads with rushing volume and low-risk football.', (m) => (1 - m.passRate) * 75 + m.rushAttemptsPg * 1.5 - m.turnoversPg * 8],
  ['comeback', 'Comeback Mode', 'Produces through high-volume passing in scoring races.', (m) => m.passAttemptsPg + m.pointsAllowedPg * 1.2],
].map(([id, name, description, score]) => ({ id, name, description, score }));

export const NFL_DEFENSIVE_ARCHETYPES = [
  ['havoc', 'Havoc Front', 'Creates sacks, tackles for loss and constant disruption.', (m) => m.sacksPg * 15 + m.tflPg * 5],
  ['blitz', 'Pressure Package', 'Builds its identity around getting home on the quarterback.', (m) => m.sacksPg * 22 + m.defensiveTdPg * 12],
  ['front_four', 'Front Four Heat', 'Generates pressure without depending on takeaways.', (m) => m.sacksPg * 18 - m.takeawaysPg * 3],
  ['ball_hawk', 'Ball Hawks', 'Attacks passing lanes and turns mistakes into possessions.', (m) => m.interceptionsPg * 30 + m.passDeflectionsPg * 3],
  ['opportunistic', 'Opportunistic', 'May concede yards but changes games with takeaways.', (m) => m.takeawaysPg * 25 + m.defensiveTdPg * 20],
  ['run_wall', 'Run Wall', 'Makes opponents abandon the ground game.', (m) => 120 - m.rushAllowedPg / 2 + m.tflPg * 4],
  ['no_fly', 'No-Fly Zone', 'Suppresses passing production and contests throws.', (m) => 150 - m.passAllowedPg / 3 + m.passDeflectionsPg * 3],
  ['shutdown', 'Shutdown Unit', 'Limits both yards and points with very few weak spots.', (m) => 100 - m.pointsAllowedPg * 2 - m.yardsAllowedPg / 12],
  ['bend', 'Bend, Don’t Break', 'Allows movement but keeps points off the board.', (m) => m.yardsAllowedPg / 10 - m.pointsAllowedPg * 2],
  ['red_zone', 'Goal-Line Stand', 'Concedes some yardage but limits scoring finishes.', (m) => m.yardsAllowedPg / 12 - m.pointsAllowedPg * 2.5],
  ['pass_funnel', 'Pass Funnel', 'Erases rushing lanes and invites opponents to throw.', (m) => m.opponentPassRate * 100 - m.rushAllowedPg / 5],
  ['run_funnel', 'Run Funnel', 'Discourages passing and challenges opponents to run.', (m) => (1 - m.opponentPassRate) * 100 - m.passAllowedPg / 8],
  ['tackling', 'Tackling Machine', 'Wins with pursuit, cleanup and steady down-to-down execution.', (m) => m.tacklesPg * 2 + m.tflPg],
  ['coverage', 'Coverage Shell', 'Relies on contested windows and limiting passing efficiency.', (m) => m.passDeflectionsPg * 5 - m.passAllowedYpa * 8],
  ['turnover_or_bust', 'Turnover or Bust', 'Needs splash plays to offset an otherwise risky profile.', (m) => m.takeawaysPg * 18 + m.pointsAllowedPg],
  ['big_play_risk', 'Big-Play Vulnerable', 'Produces disruption but can surrender explosive gains.', (m) => m.sacksPg * 8 + m.longAllowed - m.pointsAllowedPg],
  ['scoreboard_survivor', 'Shootout Survivor', 'Lives in high-scoring games and depends on one decisive stop.', (m) => m.pointsAllowedPg + m.takeawaysPg * 8],
  ['disciplined', 'Disciplined Defense', 'Limits scoring without relying on volatile splash plays.', (m) => 80 - m.pointsAllowedPg * 2 - Math.abs(m.takeawaysPg - 1) * 5],
  ['swarm', 'Swarming Pursuit', 'Produces tackles and tackles for loss across the unit.', (m) => m.tacklesPg + m.tflPg * 5],
  ['counterpunch', 'Counterpunch Defense', 'Answers offensive pressure with takeaways and defensive scores.', (m) => m.defensiveTdPg * 35 + m.takeawaysPg * 15 + m.pointsAllowedPg / 2],
].map(([id, name, description, score]) => ({ id, name, description, score }));

function teamMetrics(games, team) {
  const relevant = games.filter((game) => game.homeTeam?.index === team.index || game.awayTeam?.index === team.index);
  const totals = { passAttempts: 0, completions: 0, passYards: 0, passTd: 0, interceptions: 0, rushAttempts: 0, rushYards: 0, rushTd: 0, receptions: 0, yac: 0, points: 0, allowed: 0, sacks: 0, tfl: 0, defInt: 0, fumbleRec: 0, defTd: 0, pd: 0, tackles: 0, oppPassAttempts: 0, oppPassYards: 0, oppRushAttempts: 0, oppRushYards: 0, longPass: 0, longRush: 0, longAllowed: 0 };
  const receiverCatches = new Map(); const runnerCarries = new Map();
  let qbRushes = 0; let rbCatches = 0; let teCatches = 0;
  for (const game of relevant) {
    const home = game.homeTeam?.index === team.index;
    totals.points += home ? game.homeScore : game.awayScore; totals.allowed += home ? game.awayScore : game.homeScore;
    for (const player of game.players) {
      const own = player.teamIndex === team.index; const stats = player.stats;
      if (own) {
        totals.passAttempts += n(stats, 'PASSATTEMPTS'); totals.completions += n(stats, 'PASSCOMPLETED'); totals.passYards += n(stats, 'PASSYARDS'); totals.passTd += n(stats, 'PASSTDS'); totals.interceptions += n(stats, 'PASSINTS');
        totals.rushAttempts += n(stats, 'RUSHATTEMPTS'); totals.rushYards += n(stats, 'RUSHYARDS'); totals.rushTd += n(stats, 'RUSHTDS'); totals.receptions += n(stats, 'RECEIVECATCHES'); totals.yac += n(stats, 'RECEIVEYARDSAFTER');
        totals.longPass = Math.max(totals.longPass, n(stats, 'PASSLONGEST')); totals.longRush = Math.max(totals.longRush, n(stats, 'RUSHLONGEST'));
        totals.sacks += n(stats, 'DLINESACKS') + n(stats, 'DLINEHALFSACK') * .5; totals.tfl += n(stats, 'DEFTACKLESFORLOSS'); totals.defInt += n(stats, 'DSECINTS'); totals.fumbleRec += n(stats, 'DLINEFUMBLERECOVERIES'); totals.defTd += n(stats, 'DSECINTTDS') + n(stats, 'DLINEFUMBLETDS'); totals.pd += n(stats, 'DEFPASSDEFLECTIONS'); totals.tackles += n(stats, 'DEFTACKLES') + n(stats, 'ASSDEFTACKLES');
        const catches = n(stats, 'RECEIVECATCHES'); const carries = n(stats, 'RUSHATTEMPTS');
        if (catches) receiverCatches.set(player.playerId, (receiverCatches.get(player.playerId) ?? 0) + catches);
        if (carries) runnerCarries.set(player.playerId, (runnerCarries.get(player.playerId) ?? 0) + carries);
        if (player.position === 'QB') qbRushes += carries;
        if (['HB', 'FB'].includes(player.position)) rbCatches += catches;
        if (player.position === 'TE') teCatches += catches;
      } else {
        totals.oppPassAttempts += n(stats, 'PASSATTEMPTS'); totals.oppPassYards += n(stats, 'PASSYARDS'); totals.oppRushAttempts += n(stats, 'RUSHATTEMPTS'); totals.oppRushYards += n(stats, 'RUSHYARDS'); totals.longAllowed = Math.max(totals.longAllowed, n(stats, 'PASSLONGEST'), n(stats, 'RUSHLONGEST'));
      }
    }
  }
  const count = relevant.length;
  const plays = totals.passAttempts + totals.rushAttempts;
  return {
    games: count, pointsPg: perGame(totals.points, count), pointsAllowedPg: perGame(totals.allowed, count), playsPerGame: perGame(plays, count), passRate: ratio(totals.passAttempts, plays), passAttemptsPg: perGame(totals.passAttempts, count), passYpg: perGame(totals.passYards, count), passYpa: ratio(totals.passYards, totals.passAttempts), completionRate: ratio(totals.completions, totals.passAttempts), passTdPg: perGame(totals.passTd, count), interceptionsPg: perGame(totals.interceptions, count), turnoversPg: perGame(totals.interceptions, count), rushAttemptsPg: perGame(totals.rushAttempts, count), rushYpg: perGame(totals.rushYards, count), rushYpc: ratio(totals.rushYards, totals.rushAttempts), rushTdPg: perGame(totals.rushTd, count), offensiveTdPg: perGame(totals.passTd + totals.rushTd, count), qbRushShare: ratio(qbRushes, totals.rushAttempts), qbTdShare: ratio(totals.passTd, totals.passTd + totals.rushTd), leadBackRushShare: ratio(Math.max(0, ...runnerCarries.values()), totals.rushAttempts), topTargetShare: ratio(Math.max(0, ...receiverCatches.values()), totals.receptions), rbCatchShare: ratio(rbCatches, totals.receptions), teCatchShare: ratio(teCatches, totals.receptions), yacShare: ratio(totals.yac, totals.passYards), longPass: totals.longPass, longRush: totals.longRush,
    sacksPg: perGame(totals.sacks, count), tflPg: perGame(totals.tfl, count), interceptionsDefensePg: perGame(totals.defInt, count), takeawaysPg: perGame(totals.defInt + totals.fumbleRec, count), defensiveTdPg: perGame(totals.defTd, count), passDeflectionsPg: perGame(totals.pd, count), tacklesPg: perGame(totals.tackles, count), passAllowedPg: perGame(totals.oppPassYards, count), rushAllowedPg: perGame(totals.oppRushYards, count), yardsAllowedPg: perGame(totals.oppPassYards + totals.oppRushYards, count), passAllowedYpa: ratio(totals.oppPassYards, totals.oppPassAttempts), opponentPassRate: ratio(totals.oppPassAttempts, totals.oppPassAttempts + totals.oppRushAttempts), longAllowed: totals.longAllowed,
  };
}

function normalizedStyleScores(library, metricRows) {
  const distributions = new Map(library.map((style) => {
    const values = metricRows.filter((metrics) => metrics.games > 0).map((metrics) => style.score(metrics));
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(values.length, 1);
    return [style.id, { mean, deviation: Math.sqrt(variance) || 1 }];
  }));
  return metricRows.map((metrics) => metrics.games ? library.map((style) => {
    const distribution = distributions.get(style.id);
    return { id: style.id, name: style.name, description: style.description, score: (style.score(metrics) - distribution.mean) / distribution.deviation };
  }).sort((a, b) => b.score - a.score).slice(0, 3) : []);
}

export function buildNflTeamStyles(games, teams) {
  const metrics = teams.map((team) => teamMetrics(games, team));
  const offense = normalizedStyleScores(NFL_OFFENSIVE_ARCHETYPES, metrics);
  const defense = normalizedStyleScores(NFL_DEFENSIVE_ARCHETYPES, metrics);
  return teams.map((team, index) => ({ team, metrics: metrics[index], offense: offense[index], defense: defense[index] }));
}
