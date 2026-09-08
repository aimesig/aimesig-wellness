import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { Routine, RoutineSchedule } from "../types/routine";

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
  unit: string;
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
    startDate: routine.startDate,
    endDate: routine.endDate,
    active: routine.active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return routineRef.id;
}

export async function getRoutines(
  userId: string,
): Promise<Routine[]> {
  const routinesQuery = query(
    routinesCollection(userId),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocs(routinesQuery);

  return snapshot.docs.map((routineDoc) => ({
    id: routineDoc.id,
    ...routineDoc.data(),
  })) as Routine[];
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

  await deleteDoc(routineRef);
}