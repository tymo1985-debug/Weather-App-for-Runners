export function radarOffsetToleranceMinutes(offsetMin) {
  if (offsetMin <= 60) return 20;
  if (offsetMin <= 180) return 35;
  return 45;
}

export function nearestRadarFrameIndex(frames, nowIdx, offsetMin, nowMs = Date.now()) {
  if (!Array.isArray(frames) || !frames.length) return -1;
  if (offsetMin === 0) return Number.isInteger(nowIdx) && frames[nowIdx] ? nowIdx : -1;
  const base = Math.max(nowMs, Number(frames[nowIdx]?.time) || nowMs);
  const target = base + offsetMin * 60e3;
  let best = -1, bestDelta = Infinity;
  frames.forEach((frame, i) => {
    if (!frame?.forecast || !Number.isFinite(frame.time) || frame.time <= base) return;
    const delta = Math.abs(frame.time - target);
    if (delta < bestDelta) { bestDelta = delta; best = i; }
  });
  return bestDelta <= radarOffsetToleranceMinutes(offsetMin) * 60e3 ? best : -1;
}
