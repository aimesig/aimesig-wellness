import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Routine, RoutineInputField, RoutineSchedule } from "../types/routine";

function routinesCollection(userId: string) {
  return collection(db, "users", userId, "routines");
}

export interface RoutineInput {
  title: string;
  description: string;
  frequency: Routine["frequency"];
  schedule: RoutineSchedule;
  alternateDay: boolean;
  inputType: Routine["inputType"];
  /** Legacy single-unit label. Empty string for "multi"/"none". */
  unit: string;
  /** Named numeric fields. Empty array for "none" and legacy "number". */
  inputFields: RoutineInputField[];
  startDate: Timestamp;
  endDate: Timestamp | null;
  active: boolean;
}

export async function createRoutine(
  userId: string,
  routine: RoutineInput,
): Promise<string> {
  const routineRef = await addDoc(routinesCollection(userId), {
    title: routine.title.trim(),
    description: routine.description.trim(),
    frequency: routine.frequency,
    schedule: routine.schedule,
    alternateDay: routine.alternateDay,
    inputType: routine.inputType,
    unit: routine.unit.trim(),
    inputFields: routine.inputFields,
    startDate: routine.startDate,
    endDate: routine.endDate,
    active: routine.active,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return routineRef.id;
}

export interface GetRoutinesOptions {
  /**
   * Include soft-deleted routines in the result. Defaults to false, so
   * every existing screen (routine manager, analytics, today's list, etc.)
   * keeps behaving as if deleted routines don't exist. Pass true only where
   * a deleted routine's original title/details are needed to render its
   * still-existing logs (e.g. the calendar day view).
   */
  includeDeleted?: boolean;
}

export async function getRoutines(
  userId: string,
  options?: GetRoutinesOptions,
): Promise<Routine[]> {
  const routinesQuery = query(
    routinesCollection(userId),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(routinesQuery);

  const routines = snapshot.docs.map((routineDoc) => {
    const data = routineDoc.data();
    // Backfill inputFields for legacy docs that pre-date this field.
    return {
      inputFields: [] as Routine["inputFields"],
      ...data,
      id: routineDoc.id,
    } as unknown as Routine;
  });

  if (options?.includeDeleted) {
    return routines;
  }

  return routines.filter((r) => !r.deletedAt);
}

export async function updateRoutine(
  userId: string,
  routineId: string,
  routine: Partial<RoutineInput>,
): Promise<void> {
  const routineRef = doc(
    db,
    "users",
    userId,
    "routines",
    routineId,
  );

  await updateDoc(routineRef, {
    ...routine,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-deletes a routine: marks it deleted and inactive, but keeps the
 * document (and therefore its title, unit, schedule, etc.) in Firestore.
 * This lets past logs for the routine keep displaying — as "(deleted)" —
 * and stay editable, instead of becoming orphaned/unreadable the moment
 * the routine is removed.
 */
export async function deleteRoutine(
  userId: string,
  routineId: string,
): Promise<void> {
  const routineRef = doc(
    db,
    "users",
    userId,
    "routines",
    routineId,
  );

  await updateDoc(routineRef, {
    deletedAt: serverTimestamp(),
    active: false,
    updatedAt: serverTimestamp(),
  });
}
