export const QUICK_DURATIONS = [30, 45, 60, 90, 120];

export function selectDuration(profile, value, persist) {
  const duration = Number(value);
  if (!QUICK_DURATIONS.includes(duration)) return false;
  if (profile.duration === duration) return false;
  profile.duration = duration;
  persist(profile);
  return true;
}

export function freshness(at, now, cached, T) {
  const age = Math.max(0, now - at);
  const minutes = Math.floor(age / 60e3);
  const relative = minutes < 60 ? T.updatedMinutes(minutes)
    : T.updatedHours(Math.floor(minutes / 60));
  return [relative, cached ? T.savedForecast : null,
    age > 12 * 60e3 ? T.staleForecast : null].filter(Boolean).join(' · ');
}
