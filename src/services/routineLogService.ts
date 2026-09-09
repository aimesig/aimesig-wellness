import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import type { RoutineLog, RoutineStatus } from "../types/routine";

function routineLogsCollection(userId: string) {
  return collection(db, "users", userId, "routineLogs");
}

export interface RoutineLogInput {
  routineId: string;
  date: Timestamp;
  status: RoutineStatus;
  remark: string;
  value: number | null;
}

export async function getRoutineLog(
  userId: string,
  routineId: string,
  date: Timestamp,
): Promise<RoutineLog | null> {
  const logsQuery = query(
    routineLogsCollection(userId),
    where("routineId", "==", routineId),
    where("date", "==", date),
    limit(1),
  );

  const snapshot = await getDocs(logsQuery);

  if (snapshot.empty) {
    return null;
  }

  const logDoc = snapshot.docs[0];

  return {
    id: logDoc.id,
    ...logDoc.data(),
  } as RoutineLog;
}

export async function saveRoutineLog(
  userId: string,
  input: RoutineLogInput,
): Promise<string> {
  const existingLog = await getRoutineLog(
    userId,
    input.routineId,
    input.date,
  );

  if (existingLog) {
    const logRef = doc(
      db,
      "users",
      userId,
      "routineLogs",
      existingLog.id,
    );

    await updateDoc(logRef, {
      status: input.status,
      remark: input.remark.trim(),
      value: input.value,
      updatedAt: serverTimestamp(),
    });

    return existingLog.id;
  }

  const logRef = await addDoc(routineLogsCollection(userId), {
    routineId: input.routineId,
    date: input.date,
    status: input.status,
    remark: input.remark.trim(),
    value: input.value,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return logRef.id;
}

export async function deleteRoutineLog(
  userId: string,
  logId: string,
): Promise<void> {
  await deleteDoc(
    doc(db, "users", userId, "routineLogs", logId),
  );
}

export async function getRoutineLogsForDate(
  userId: string,
  date: Timestamp,
): Promise<RoutineLog[]> {
  const logsQuery = query(
    routineLogsCollection(userId),
    where("date", "==", date),
  );

  const snapshot = await getDocs(logsQuery);

  return snapshot.docs.map((logDoc) => ({
    id: logDoc.id,
    ...logDoc.data(),
  })) as RoutineLog[];
}
