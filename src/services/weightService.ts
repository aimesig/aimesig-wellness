import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Routine, RoutineLog } from "../types/routine";

export interface WeightEntry {
  date: Timestamp;
  value: number;
  logId: string;
}

export interface WeightAnalytics {
  entries: WeightEntry[];
  latest: number | null;
  starting: number | null;
  minimum: number | null;
  maximum: number | null;
  average: number | null;
  change: number | null;
}

function routineLogsCollection(userId: string) {
  return collection(
    db,
    "users",
    userId,
    "routineLogs",
  );
}

function routinesCollection(userId: string) {
  return collection(
    db,
    "users",
    userId,
    "routines",
  );
}

export async function getWeightRoutine(
  userId: string,
): Promise<Routine | null> {
  const routinesQuery = query(
    routinesCollection(userId),
    where("inputType", "==", "number"),
  );

  const snapshot = await getDocs(routinesQuery);

  const routines = snapshot.docs.map((routineDoc) => ({
    id: routineDoc.id,
    ...routineDoc.data(),
  })) as Routine[];

  const weightRoutine = routines.find((routine) => {
    const title = routine.title.trim().toLowerCase();
    const unit = routine.unit.trim().toLowerCase();

    return title === "weight" || unit === "kg";
  });

  return weightRoutine ?? null;
}

export async function getWeightEntries(
  userId: string,
  routineId: string,
): Promise<WeightEntry[]> {
  /*
   * Only query by routineId.
   *
   * Filtering and sorting are done locally so that
   * Firestore does not require a composite index.
   */
  const logsQuery = query(
    routineLogsCollection(userId),
    where("routineId", "==", routineId),
  );

  const snapshot = await getDocs(logsQuery);

  const logs = snapshot.docs.map((logDoc) => ({
    id: logDoc.id,
    ...logDoc.data(),
  })) as RoutineLog[];

  return logs
    .filter(
      (log) =>
        typeof log.value === "number" &&
        Number.isFinite(log.value) &&
        log.value > 0,
    )
    .map((log) => ({
      date: log.date,
      value: log.value as number,
      logId: log.id,
    }))
    .sort(
      (first, second) =>
        first.date.toMillis() -
        second.date.toMillis(),
    );
}

export function calculateWeightAnalytics(
  entries: WeightEntry[],
): WeightAnalytics {
  if (entries.length === 0) {
    return {
      entries: [],
      latest: null,
      starting: null,
      minimum: null,
      maximum: null,
      average: null,
      change: null,
    };
  }

  const values = entries.map(
    (entry) => entry.value,
  );

  const starting = values[0];
  const latest = values[values.length - 1];

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  const average =
    values.reduce(
      (sum, value) => sum + value,
      0,
    ) / values.length;

  return {
    entries,
    latest,
    starting,
    minimum,
    maximum,
    average,
    change: latest - starting,
  };
}

export async function getWeightAnalytics(
  userId: string,
): Promise<WeightAnalytics> {
  const routine = await getWeightRoutine(userId);

  if (!routine) {
    return calculateWeightAnalytics([]);
  }

  const entries = await getWeightEntries(
    userId,
    routine.id,
  );

  return calculateWeightAnalytics(entries);
}