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
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import app, { db } from "../lib/firebase";
import type { RoutineLog, RoutineStatus } from "../types/routine";

function routineLogsCollection(userId: string) {
  return collection(db, "users", userId, "routineLogs");
}

/**
 * Upload an image file to Firebase Storage and return its download URL.
 * Path: routineLogs/{userId}/{routineId}/{dateISO}/{filename}
 */
export async function uploadRoutineLogImage(
  userId: string,
  routineId: string,
  date: Timestamp,
  file: File,
): Promise<string> {
  const storage = getStorage();
  const dateISO = date.toDate().toISOString().slice(0, 10); // YYYY-MM-DD
  const storagePath = `routineLogs/${userId}/${routineId}/${dateISO}/${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/**
 * Delete an image from Firebase Storage by its download URL.
 * Safe to call even if the file has already been removed.
 */
export async function deleteRoutineLogImage(imageUrl: string): Promise<void> {
  try {
    const storage = getStorage(app);
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch {
    // Ignore "object-not-found" — the file may have been deleted already.
  }
}

export interface RoutineLogInput {
  routineId: string;
  date: Timestamp;
  status: RoutineStatus;
  remark: string;
  value: number | null;
  imageUrl: string | null;
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
      imageUrl: input.imageUrl,
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
    imageUrl: input.imageUrl,
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
