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

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  activeDatesThisYear: Set<string>;
}

export async function getStreakData(userId: string): Promise<StreakData> {
  // Fetch all routine logs from the last year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const logsRef = collection(db, "users", userId, "routineLogs");
  const logsQuery = query(
    logsRef,
    where("date", ">=", Timestamp.fromDate(oneYearAgo)),
    where("status", "==", "yes"),
  );

  const snapshot = await getDocs(logsQuery);
  const logs = snapshot.docs.map((d) => d.data() as RoutineLog);

  // Build a set of active dates (days where at least one routine was completed)
  const activeDateKeys = new Set<string>();
  for (const log of logs) {
    const date = log.date.toDate();
    activeDateKeys.add(toDateKey(date));
  }

  // Calculate streak
  const today = startOfDay(new Date());
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(new Date(today.getTime() - 86400000));

  let currentStreak = 0;
  // Streak is active if today or yesterday has activity
  const streakBase = activeDateKeys.has(todayKey)
    ? today
    : activeDateKeys.has(yesterdayKey)
      ? new Date(today.getTime() - 86400000)
      : null;

  if (streakBase) {
    let checkDate = streakBase;
    while (true) {
      const key = toDateKey(checkDate);
      if (!activeDateKeys.has(key)) break;
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }

  // Calculate longest streak
  const sortedDates = Array.from(activeDateKeys).sort();
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const key of sortedDates) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (prevDate) {
      const diff =
        (date.getTime() - prevDate.getTime()) / 86400000;
      if (diff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    prevDate = date;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  const lastKey =
    sortedDates.length > 0
      ? sortedDates[sortedDates.length - 1]
      : null;

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: lastKey ?? null,
    activeDatesThisYear: activeDateKeys,
  };
}

export interface DayProgress {
  date: string; // YYYY-MM-DD
  completedCount: number;
  totalCount: number;
  percent: number;
}

export async function getCalendarProgress(
  userId: string,
  year: number,
  month: number, // 0-indexed
): Promise<Map<string, DayProgress>> {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);

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
