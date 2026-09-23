const KEY = 'rw.runPlan';

export const DEFAULT_RUN_PLAN = {
  mode: 'duration',
  distanceKm: 10,
  paceSecPerKm: 360,
  availableFrom: '',
  availableTo: ''
};

const finite = (v) => Number.isFinite(Number(v));

export function normalizeRunPlan(value = {}) {
  const plan = { ...DEFAULT_RUN_PLAN, ...(value && typeof value === 'object' ? value : {}) };
  if (!['duration', 'distance'].includes(plan.mode)) plan.mode = 'duration';
  plan.distanceKm = finite(plan.distanceKm) ? Math.min(100, Math.max(1, Number(plan.distanceKm))) : 10;
  plan.paceSecPerKm = finite(plan.paceSecPerKm) ? Math.min(900, Math.max(180, Math.round(Number(plan.paceSecPerKm)))) : 360;
  if (!/^\d{2}:\d{2}$/.test(plan.availableFrom || '')) plan.availableFrom = '';
  if (!/^\d{2}:\d{2}$/.test(plan.availableTo || '')) plan.availableTo = '';
  return plan;
}

export function loadRunPlan(storage = localStorage) {
  try { return normalizeRunPlan(JSON.parse(storage.getItem(KEY) || '{}')); }
  catch { return { ...DEFAULT_RUN_PLAN }; }
}

export function saveRunPlan(plan, storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(normalizeRunPlan(plan)));
}

export function plannedDuration(profileDuration, plan) {
  const p = normalizeRunPlan(plan);
  if (p.mode !== 'distance') return Number(profileDuration) || 60;
  return Math.max(15, Math.min(360, Math.round(p.distanceKm * p.paceSecPerKm / 60)));
}

export function paceText(seconds) {
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function parsePace(text) {
  const m = String(text || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec >= 180 && sec <= 900 && Number(m[2]) < 60 ? sec : null;
}

export function timeToMinutes(text) {
  const m = String(text || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function hasAvailability(plan) {
  return timeToMinutes(plan?.availableFrom) != null && timeToMinutes(plan?.availableTo) != null;
}
