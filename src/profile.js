const n = (stats, key) => Number(stats?.[key]) || 0;

export function summarizePlayerProfile(logs) {
  const aggregate = {};
  const teamAggregate = {};
  for (const log of logs) {
    for (const [key, value] of Object.entries(log.stats ?? {})) {
      if (typeof value === 'number') aggregate[key] = (aggregate[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(log.teamStats ?? {})) {
      teamAggregate[key] = (teamAggregate[key] ?? 0) + (Number(value) || 0);
    }
  }

  const average = logs.length ? logs.reduce((sum, log) => sum + log.points, 0) / logs.length : 0;
  const variance = logs.length
    ? logs.reduce((sum, log) => sum + ((log.points - average) ** 2), 0) / logs.length
    : 0;
  const deviation = Math.sqrt(variance);
  const consistencyScore = average > 0
    ? Math.max(0, Math.min(100, Math.round(100 - ((deviation / average) * 50))))
    : 0;
  const consistencyLabel = consistencyScore >= 85
    ? 'Consistent'
    : consistencyScore >= 70
      ? 'Steady'
      : consistencyScore >= 50
        ? 'Volatile'
        : 'Boom/Bust';

  return {
    aggregate,
    teamAggregate,
    highLog: [...logs].sort((a, b) => b.points - a.points)[0] ?? null,
    deviation,
    consistencyScore,
    consistencyLabel,
    shares: {
      receptions: teamAggregate.receptions ? n(aggregate, 'RECEIVECATCHES') / teamAggregate.receptions : 0,
      receivingYards: teamAggregate.receivingYards ? n(aggregate, 'RECEIVEYARDS') / teamAggregate.receivingYards : 0,
      rushAttempts: teamAggregate.rushAttempts ? n(aggregate, 'RUSHATTEMPTS') / teamAggregate.rushAttempts : 0,
      rushYards: teamAggregate.rushYards ? n(aggregate, 'RUSHYARDS') / teamAggregate.rushYards : 0,
      passAttempts: teamAggregate.passAttempts ? n(aggregate, 'PASSATTEMPTS') / teamAggregate.passAttempts : 0,
    },
  };
}

