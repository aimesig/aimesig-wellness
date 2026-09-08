import {
  collection,
  doc,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type CollectionReference,
} from "firebase/firestore";

import { db } from "../lib/firebase";

export function getUserRoutinesCollection(
  userId: string,
): CollectionReference<DocumentData> {
  return collection(db, "users", userId, "routines");
}

export function getUserRoutineLogsCollection(
  userId: string,
): CollectionReference<DocumentData> {
  return collection(db, "users", userId, "routineLogs");
}

export function getRoutineDocument(
  firestore: Firestore,
  userId: string,
  routineId: string,
): DocumentReference<DocumentData> {
  return doc(firestore, "users", userId, "routines", routineId);
}

export function getRoutineLogDocument(
  firestore: Firestore,
  userId: string,
  logId: string,
): DocumentReference<DocumentData> {
  return doc(firestore, "users", userId, "routineLogs", logId);
}

export { db };