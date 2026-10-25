import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestRadarFrameIndex, radarOffsetToleranceMinutes } from '../js/radar-utils.js';

const minute = 60e3;
const now = 1_000_000;
const frame = (offset, forecast = true) => ({ time: now + offset * minute, forecast });

test('radar quick times only select sufficiently close forecast frames', () => {
  const frames = [frame(0, false), frame(15), frame(45), frame(75), frame(170), frame(330)];
  assert.equal(nearestRadarFrameIndex(frames, 0, 30, now), 1);
  assert.equal(nearestRadarFrameIndex(frames, 0, 60, now), 2);
  assert.equal(nearestRadarFrameIndex(frames, 0, 180, now), 4);
  assert.equal(nearestRadarFrameIndex(frames, 0, 360, now), 5);
  assert.equal(nearestRadarFrameIndex([frame(0, false), frame(95)], 0, 60, now), -1);
  assert.equal(nearestRadarFrameIndex([frame(0, false), frame(280)], 0, 360, now), -1);
});

test('radar tolerances stay stricter for near-term promises', () => {
  assert.equal(radarOffsetToleranceMinutes(30), 20);
  assert.equal(radarOffsetToleranceMinutes(60), 20);
  assert.equal(radarOffsetToleranceMinutes(180), 35);
  assert.equal(radarOffsetToleranceMinutes(360), 45);
});
