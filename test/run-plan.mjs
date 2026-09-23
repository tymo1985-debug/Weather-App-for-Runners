import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRunPlan, plannedDuration, paceText, parsePace, timeToMinutes, hasAvailability } from '../js/run-plan.js';

test('distance and pace derive a real run duration', () => {
  assert.equal(plannedDuration(60, { mode:'distance', distanceKm:10, paceSecPerKm:345 }), 58);
  assert.equal(plannedDuration(90, { mode:'duration', distanceKm:10, paceSecPerKm:345 }), 90);
});

test('pace parsing and formatting are stable', () => {
  assert.equal(parsePace('5:45'), 345);
  assert.equal(paceText(345), '5:45');
  assert.equal(parsePace('2:59'), null);
  assert.equal(parsePace('6:75'), null);
});

test('availability is opt-in and normalized', () => {
  assert.equal(timeToMinutes('17:30'), 1050);
  assert.equal(timeToMinutes('25:00'), null);
  assert.equal(hasAvailability({ availableFrom:'17:00', availableTo:'22:00' }), true);
  assert.equal(hasAvailability({ availableFrom:'17:00', availableTo:'' }), false);
  const p=normalizeRunPlan({ mode:'wat', distanceKm:-5, paceSecPerKm:9999 });
  assert.equal(p.mode,'duration');
  assert.equal(p.distanceKm,1);
  assert.equal(p.paceSecPerKm,900);
});
