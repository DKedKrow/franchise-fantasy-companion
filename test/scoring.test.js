import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFantasyPoints, calculateTeamDefensePoints } from '../src/scoring.js';

test('calculates full-PPR offense', () => {
  const result = calculateFantasyPoints({
    PASSYARDS: 250,
    PASSTDS: 2,
    PASSINTS: 1,
    RUSHYARDS: 20,
    RECEIVECATCHES: 3,
    RECEIVEYARDS: 45,
    RECEIVETDS: 1,
  });
  assert.equal(result.total, 31.5);
});

test('calculates distance-based kicking', () => {
  const result = calculateFantasyPoints({
    KICKEPMADE: 3,
    KICKFGMADE29ORLESS: 1,
    KICKFGMADE30TO39: 1,
    KICKFGMADE40TO49: 1,
    KICKFGMADE50ORMORE: 1,
  });
  assert.equal(result.total, 18);
});

test('calculates individual defensive scoring', () => {
  const result = calculateFantasyPoints({
    DSECINTS: 1,
    DSECINTTDS: 1,
    DLINEFORCEDFUMBLES: 1,
    DLINEFUMBLERECOVERIES: 1,
    DLINESACKS: 1,
    DLINEHALFSACK: 1,
    DLINESAFETIES: 1,
  });
  assert.equal(result.total, 15.5);
});

test('calculates team DST scoring with points allowed', () => {
  const result = calculateTeamDefensePoints(
    {
      sacks: 3,
      interceptions: 2,
      fumbleRecoveries: 1,
      defensiveTouchdowns: 1,
      returnTouchdowns: 0,
      safeties: 1,
    },
    10,
  );
  assert.equal(result.total, 21);
  assert.equal(result.breakdown.pointsAllowed, 4);
});

test('uses negative DST scoring for 35 or more points allowed', () => {
  const result = calculateTeamDefensePoints({}, 38);
  assert.equal(result.total, -4);
});
