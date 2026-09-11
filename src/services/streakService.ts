import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { RoutineLog } from "../types/routine";

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Calendar-safe "previous day". Using setDate() (rather than subtracting
 * 24 * 60 * 60 * 1000 ms) keeps this correct across DST transitions, where a
 * calendar day can be 23 or 25 hours long.
 */
function previousDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d;
}

function nextDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  activeDatesThisYear: Set<string>;
}

/**
 * Pure streak calculation, kept separate from the Firestore fetch so it can
 * be unit tested directly.
 *
 * Rules:
 * - A calendar day counts as a "streak day" as soon as ONE routine on that
 *   day is logged "yes" — it does not matter how many other routines that
 *   day were skipped, marked "no", or never logged at all.
 * - A calendar day with zero "yes" logs (every routine missed, marked "no",
 *   or left untouched) does NOT count, and breaks the streak — except for
 *   "today", which gets a grace period until the day is over (see below).
 */
export function computeStreakStats(
  activeDateKeys: Set<string>,
  today: Date,
): Pick<StreakData, "currentStreak" | "longestStreak" | "lastActiveDate"> {
  const todayStart = startOfDay(today);
  const todayKey = toDateKey(todayStart);
  const yesterdayKey = toDateKey(previousDay(todayStart));

  // Current streak: count consecutive active days ending today.
  // If today has no "yes" yet, fall back to yesterday so the streak isn't
  // considered broken until today actually ends without a log.
  let currentStreak = 0;
  const streakBase = activeDateKeys.has(todayKey)
    ? todayStart
    : activeDateKeys.has(yesterdayKey)
      ? previousDay(todayStart)
      : null;

  if (streakBase) {
    let checkDate = streakBase;
    while (activeDateKeys.has(toDateKey(checkDate))) {
      currentStreak++;
      checkDate = previousDay(checkDate);
    }
  }

  // Longest streak: walk the sorted active days and count consecutive runs,
  // comparing by calendar date key (via nextDay) rather than a raw
  // millisecond difference, which is what keeps this correct across DST.
  const sortedDates = Array.from(activeDateKeys).sort();
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const key of sortedDates) {
    const date = parseDateKey(key);
    if (prevDate && toDateKey(nextDay(prevDate)) === key) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
    prevDate = date;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  const lastKey =
    sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: lastKey ?? null,
  };
}

export async function getStreakData(userId: string): Promise<StreakData> {
  // Fetch all routine logs from the last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const logsRef = collection(db, "users", userId, "routineLogs");
  // Query only by date. Filtering status in memory avoids requiring a
  // Firestore composite index on (date, status), which otherwise makes the
  // whole CalendarView Promise.all() fail and hides the streak cards and
  // "Activity this year" heatmap.
  const logsQuery = query(
    logsRef,
    where("date", ">=", Timestamp.fromDate(oneYearAgo)),
  );

  const snapshot = await getDocs(logsQuery);
  const logs = snapshot.docs
    .map((d) => d.data() as RoutineLog)
    .filter((log) => log.status === "yes");

  // Build a set of active dates (days where at least one routine was
  // completed — one "yes" log is enough, other routines that day can be
  // missed/unlogged and it still counts as a streak day).
  const activeDateKeys = new Set<string>();
  for (const log of logs) {
    const date = log.date.toDate();
    activeDateKeys.add(toDateKey(date));
  }

  const { currentStreak, longestStreak, lastActiveDate } =
    computeStreakStats(activeDateKeys, new Date());

  return {
    currentStreak,
    longestStreak,
    lastActiveDate,
    activeDatesThisYear: activeDateKeys,
  };
}

export interface DayProgress {
  date: string; // YYYY-MM-DD
  completedCount: number;
  totalCount: number;
  percent: number;
}

/**
 * Per-day completion progress (completedCount / totalCount routines logged
 * "yes" that day) for every day whose logged date falls within
 * [startDate, endDate], inclusive. Shared by the month view and the
 * year heatmap so both reflect the same real per-day completion numbers
 * rather than a flat "active/inactive" proxy.
 */
export async function getProgressInRange(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<Map<string, DayProgress>> {
  const logsRef = collection(db, "users", userId, "routineLogs");
  const logsQuery = query(
    logsRef,
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate)),
  );

  const snapshot = await getDocs(logsQuery);
  const logs = snapshot.docs.map((d) => d.data() as RoutineLog);

  // Group by date
  const byDate = new Map<string, { yes: number; total: number }>();
  for (const log of logs) {
    const key = toDateKey(log.date.toDate());
    const existing = byDate.get(key) ?? { yes: 0, total: 0 };
    existing.total++;
    if (log.status === "yes") existing.yes++;
    byDate.set(key, existing);
  }

  const result = new Map<string, DayProgress>();
  for (const [key, { yes, total }] of byDate) {
    result.set(key, {
      date: key,
      completedCount: yes,
      totalCount: total,
      percent: total === 0 ? 0 : Math.round((yes / total) * 100),
    });
  }
  return result;
}

export async function getCalendarProgress(
  userId: string,
  year: number,
  month: number, // 0-indexed
): Promise<Map<string, DayProgress>> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);
  return getProgressInRange(userId, startDate, endDate);
}
