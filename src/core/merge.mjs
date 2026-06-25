import { normalizeState } from "./schema.mjs";

const collections = [
  "tasks",
  "reminders",
  "events",
  "habits",
  "healthEntries",
  "nutritionEntries",
  "bodyMeasurements",
  "wellnessRoutines",
  "wellnessLogs",
  "workoutSessions",
  "trainingPlans",
  "financeEntries",
  "financeBudgets",
  "financeRecurring",
  "financeGoals",
  "learningItems",
  "learningLogs",
  "learningNotes",
  "workItems",
  "personalGoals",
  "goalMilestones",
  "medicalAppointments",
  "medicalRecords",
  "emergencyProfiles",
  "dailyRoutineItems",
  "dailyRoutineLogs",
  "journalEntries",
  "timeline",
  "sessions"
];

function freshness(item) {
  return Number(
    item?.deletedAt
    || item?.updatedAt
    || item?.completedAt
    || item?.endedAt
    || item?.occurredAt
    || item?.createdAt
    || item?.startedAt
    || 0
  );
}

function mergeCollection(local, remote) {
  const merged = new Map();
  for (const item of [...(local || []), ...(remote || [])]) {
    if (!item?.id) continue;
    const current = merged.get(item.id);
    const itemFreshness = freshness(item);
    const currentFreshness = freshness(current);
    const winsTie = itemFreshness === currentFreshness
      && (!current?.deletedAt || Boolean(item.deletedAt));
    if (!current || itemFreshness > currentFreshness || winsTie) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRecord(local, remote) {
  if (!isRecord(local)) return isRecord(remote) ? remote : local;
  if (!isRecord(remote)) return local;
  const localUpdatedAt = Number(local.updatedAt) || 0;
  const remoteUpdatedAt = Number(remote.updatedAt) || 0;
  if (localUpdatedAt || remoteUpdatedAt) {
    return remoteUpdatedAt > localUpdatedAt ? remote : local;
  }
  const merged = { ...remote };
  for (const [key, value] of Object.entries(local)) {
    merged[key] = isRecord(value) && isRecord(remote[key])
      ? mergeRecord(value, remote[key])
      : value;
  }
  return merged;
}

function rawState(value) {
  return isRecord(value?.state) ? value.state : (isRecord(value) ? value : {});
}

export function mergeStates(localRaw, remoteRaw) {
  const local = normalizeState(localRaw);
  const remote = normalizeState(remoteRaw);
  const localSource = rawState(localRaw);
  const remoteSource = rawState(remoteRaw);
  const merged = {
    ...remote,
    ...local,
    settings: mergeRecord(localSource.settings, remoteSource.settings),
    profile: mergeRecord(localSource.profile, remoteSource.profile),
    ui: local.ui,
    timer: local.timer.status === "idle" ? remote.timer : local.timer,
    manualDailyMinutes: { ...remote.manualDailyMinutes, ...local.manualDailyMinutes },
    manualDailyUpdatedAt: { ...remote.manualDailyUpdatedAt, ...local.manualDailyUpdatedAt }
  };
  for (const key of collections) merged[key] = mergeCollection(local[key], remote[key]);
  return normalizeState(merged);
}
