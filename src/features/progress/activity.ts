import type { LearningActivity } from "../../domain/models.js";

/** Calendar dates use the learner's local timezone, including across DST. */
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function recentDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - count + index + 1);
    return dateKey(day);
  });
}
export function activitySummary(
  activities: LearningActivity[],
  now = new Date(),
) {
  const counts = new Map<string, number>();
  for (const event of activities) {
    const key = dateKey(new Date(event.at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const today = dateKey(now);
  const todayEvents = activities.filter(
    (event) => dateKey(new Date(event.at)) === today,
  );
  let streak = 0;
  const cursor = new Date(now);
  if (!counts.has(today)) cursor.setDate(cursor.getDate() - 1);
  while (counts.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return {
    counts,
    today: todayEvents.length,
    streak,
    todayNew: todayEvents.filter((e) => e.isNew).length,
    correct: todayEvents.filter((e) => e.correct).length,
  };
}
