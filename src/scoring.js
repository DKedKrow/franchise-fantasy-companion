export const DEFAULT_SCORING = Object.freeze({
  passingYard: 0.04,
  passingTouchdown: 4,
  interception: -2,
  rushingYard: 0.1,
  rushingTouchdown: 6,
  reception: 1,
  receivingYard: 0.1,
  receivingTouchdown: 6,
  kickReturnTouchdown: 6,
  puntReturnTouchdown: 6,
  extraPointMade: 1,
  fieldGoalUnder40: 3,
  fieldGoal40To49: 4,
  fieldGoal50Plus: 5,
  defensiveTouchdown: 6,
  interceptionMade: 2,
  forcedFumble: 2,
  fumbleRecovery: 2,
  sack: 1,
  safety: 2,
  pointsAllowed0: 10,
  pointsAllowed1To6: 7,
  pointsAllowed7To13: 4,
  pointsAllowed14To20: 1,
  pointsAllowed21To27: 0,
  pointsAllowed28To34: -1,
  pointsAllowed35Plus: -4,
});

const number = (value) => Number(value) || 0;

export function calculateFantasyPoints(stats, rules = DEFAULT_SCORING) {
  const breakdown = {
    passing:
      number(stats.PASSYARDS) * rules.passingYard +
      number(stats.PASSTDS) * rules.passingTouchdown +
      number(stats.PASSINTS) * rules.interception,
    rushing:
      number(stats.RUSHYARDS) * rules.rushingYard +
      number(stats.RUSHTDS) * rules.rushingTouchdown,
    receiving:
      number(stats.RECEIVECATCHES) * rules.reception +
      number(stats.RECEIVEYARDS) * rules.receivingYard +
      number(stats.RECEIVETDS) * rules.receivingTouchdown,
    returns:
      number(stats.KRETTDS) * rules.kickReturnTouchdown +
      number(stats.PRETTDS) * rules.puntReturnTouchdown,
    kicking:
      number(stats.KICKEPMADE) * rules.extraPointMade +
      (number(stats.KICKFGMADE29ORLESS) + number(stats.KICKFGMADE30TO39)) *
        rules.fieldGoalUnder40 +
      number(stats.KICKFGMADE40TO49) * rules.fieldGoal40To49 +
      number(stats.KICKFGMADE50ORMORE) * rules.fieldGoal50Plus,
    defense:
      number(stats.DSECINTTDS) * rules.defensiveTouchdown +
      number(stats.DLINEFUMBLETDS) * rules.defensiveTouchdown +
      number(stats.DSECINTS) * rules.interceptionMade +
      number(stats.DLINEFORCEDFUMBLES) * rules.forcedFumble +
      number(stats.DLINEFUMBLERECOVERIES) * rules.fumbleRecovery +
      (number(stats.DLINESACKS) + number(stats.DLINEHALFSACK) * 0.5) * rules.sack +
      number(stats.DLINESAFETIES) * rules.safety,
  };

  const total = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  return {
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [
        key,
        Math.round((value + Number.EPSILON) * 100) / 100,
      ]),
    ),
  };
}

function pointsAllowedScore(pointsAllowed, rules) {
  if (pointsAllowed === 0) return rules.pointsAllowed0;
  if (pointsAllowed <= 6) return rules.pointsAllowed1To6;
  if (pointsAllowed <= 13) return rules.pointsAllowed7To13;
  if (pointsAllowed <= 20) return rules.pointsAllowed14To20;
  if (pointsAllowed <= 27) return rules.pointsAllowed21To27;
  if (pointsAllowed <= 34) return rules.pointsAllowed28To34;
  return rules.pointsAllowed35Plus;
}

export function calculateTeamDefensePoints(stats, pointsAllowed, rules = DEFAULT_SCORING) {
  const breakdown = {
    sacks: number(stats.sacks) * rules.sack,
    interceptions: number(stats.interceptions) * rules.interceptionMade,
    fumbleRecoveries: number(stats.fumbleRecoveries) * rules.fumbleRecovery,
    touchdowns:
      (number(stats.defensiveTouchdowns) + number(stats.returnTouchdowns)) * rules.defensiveTouchdown,
    safeties: number(stats.safeties) * rules.safety,
    pointsAllowed: pointsAllowedScore(number(pointsAllowed), rules),
  };
  const total = Object.values(breakdown).reduce((sum, points) => sum + points, 0);
  return {
    total: Math.round((total + Number.EPSILON) * 100) / 100,
    breakdown,
  };
}
