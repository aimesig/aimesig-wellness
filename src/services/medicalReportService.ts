import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db } from "../lib/firebase";
import app from "../lib/firebase";

export type CheckupCategory = "lab" | "prescription" | "bill" | "other";
export type ReportCategory = "checkup" | "issue" | "lab" | "prescription" | "other";

export interface MedicalAttachment {
  name: string;
  url: string;
  storagePath: string;
  type: string;
  size: number;
}

export interface ReferencedCheckupAttachment extends MedicalAttachment {
  checkupId: string;
  checkupTitle: string;
  checkupDate: string;
}

export interface HealthCheckup {
  id?: string;
  title: string;
  category: CheckupCategory;
  date: string;
  notes: string;
  attachments: MedicalAttachment[];
  /** Legacy single-link field kept for backward compatibility. */
  healthIssueId?: string | null;
  /** Many-to-many relationship: one checkup can belong to multiple health issues. */
  healthIssueIds?: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface HealthIssue {
  id?: string;
  title: string;
  date: string;
  notes: string;
  attachments: MedicalAttachment[];
  referencedAttachments: ReferencedCheckupAttachment[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Backwards-compatible shape for older code/data.
export interface MedicalReport {
  id?: string;
  title: string;
  category: ReportCategory;
  date: string;
  notes: string;
  attachments: MedicalAttachment[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const storage = getStorage(app, "gs://aimesig-wellness.firebasestorage.app");

function storagePath(userId: string, file: File): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `medicalReports/${userId}/${ts}_${rand}_${safeName}`;
}

function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function subscribeHealthCheckups(userId: string, onChange: (items: HealthCheckup[]) => void, onError?: (error: Error) => void) {
  const q = query(collection(db, "users", userId, "healthCheckups"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthCheckup)));
  }, (err) => {
    console.warn("subscribeHealthCheckups failed", err);
    onError?.(err as Error);
  });
}

export function subscribeHealthIssues(userId: string, onChange: (items: HealthIssue[]) => void, onError?: (error: Error) => void) {
  const q = query(collection(db, "users", userId, "healthIssues"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthIssue)));
  }, (err) => {
    console.warn("subscribeHealthIssues failed", err);
    onError?.(err as Error);
  });
}

export async function getHealthCheckups(userId: string): Promise<HealthCheckup[]> {
  const snap = await getDocs(collection(db, "users", userId, "healthCheckups"));
  return sortByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthCheckup)));
}

export async function getHealthIssues(userId: string): Promise<HealthIssue[]> {
  const snap = await getDocs(collection(db, "users", userId, "healthIssues"));
  return sortByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HealthIssue)));
}

export async function saveHealthCheckup(userId: string, item: Omit<HealthCheckup, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "users", userId, "healthCheckups"), {
    ...item,
    notes: item.notes ?? "",
    attachments: item.attachments ?? [],
    healthIssueId: item.healthIssueId ?? (item.healthIssueIds?.[0] ?? null),
    healthIssueIds: item.healthIssueIds ?? (item.healthIssueId ? [item.healthIssueId] : []),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateHealthCheckup(userId: string, id: string, item: Omit<HealthCheckup, "id" | "createdAt" | "updatedAt">, removedAttachments: MedicalAttachment[] = []) {
  await updateDoc(doc(db, "users", userId, "healthCheckups", id), {
    ...item,
    notes: item.notes ?? "",
    attachments: item.attachments ?? [],
    healthIssueId: item.healthIssueId ?? (item.healthIssueIds?.[0] ?? null),
    healthIssueIds: item.healthIssueIds ?? (item.healthIssueId ? [item.healthIssueId] : []),
    updatedAt: serverTimestamp(),
  });
  await Promise.allSettled(removedAttachments.map((a) => deleteObject(ref(storage, a.storagePath))));
}

export async function setHealthCheckupIssues(userId: string, checkupId: string, healthIssueIds: string[]) {
  const ids = Array.from(new Set(healthIssueIds.filter(Boolean)));
  await updateDoc(doc(db, "users", userId, "healthCheckups", checkupId), {
    healthIssueIds: ids,
    healthIssueId: ids[0] ?? null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteHealthCheckup(userId: string, id: string, attachments: MedicalAttachment[]) {
  await deleteDoc(doc(db, "users", userId, "healthCheckups", id));
  await Promise.allSettled((attachments ?? []).map((a) => deleteObject(ref(storage, a.storagePath))));
}

export async function saveHealthIssue(userId: string, item: Omit<HealthIssue, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const docRef = await addDoc(collection(db, "users", userId, "healthIssues"), {
    ...item,
    notes: item.notes ?? "",
    attachments: item.attachments ?? [],
    referencedAttachments: item.referencedAttachments ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateHealthIssue(userId: string, id: string, item: Omit<HealthIssue, "id" | "createdAt" | "updatedAt">, removedAttachments: MedicalAttachment[] = []) {
  await updateDoc(doc(db, "users", userId, "healthIssues", id), {
    ...item,
    notes: item.notes ?? "",
    attachments: item.attachments ?? [],
    referencedAttachments: item.referencedAttachments ?? [],
    updatedAt: serverTimestamp(),
  });
  await Promise.allSettled(removedAttachments.map((a) => deleteObject(ref(storage, a.storagePath))));
}

export async function deleteHealthIssue(userId: string, id: string, attachments: MedicalAttachment[]) {
  await deleteDoc(doc(db, "users", userId, "healthIssues", id));
  await Promise.allSettled((attachments ?? []).map((a) => deleteObject(ref(storage, a.storagePath))));
}

export function uploadMedicalFile(userId: string, file: File, onProgress: (pct: number) => void): Promise<MedicalAttachment> {
  return new Promise((resolve, reject) => {
    if (!file || file.size <= 0) {
      reject(new Error("The selected file is empty."));
      return;
    }
    // Keep uploads practical for medical documents while allowing PDFs and common office files.
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      reject(new Error(`\"${file.name}\" is larger than 25 MB.`));
      return;
    }

    const path = storagePath(userId, file);
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { originalName: file.name, userId },
    });

    task.on("state_changed", (snap) => {
      const pct = snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
      onProgress(pct);
    }, (err) => {
      console.error("Medical attachment upload failed:", err);
      reject(new Error(
        err.code === "storage/unauthorized"
          ? "Firebase Storage denied this upload. Deploy the storage.rules file and make sure you are signed in."
          : err.code === "storage/bucket-not-found"
            ? "Firebase Storage bucket was not found. Enable Firebase Storage for this project."
            : err.code === "storage/canceled"
              ? "Upload canceled."
              : err.message || "Unable to upload the attachment."
      ));
    }, async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        onProgress(100);
        resolve({
          name: file.name,
          url,
          storagePath: path,
          type: file.type || "application/octet-stream",
          size: file.size,
        });
      } catch (err: any) {
        console.error("Unable to get medical attachment URL:", err);
        reject(new Error(err?.message || "Upload completed but the attachment URL could not be created."));
      }
    });
  });
}

// Legacy helpers retained for any existing imports.
export async function getMedicalReports(userId: string): Promise<MedicalReport[]> {
  const snap = await getDocs(collection(db, "users", userId, "medicalReports"));
  return sortByDate(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedicalReport)));
}

export async function saveMedicalReport(userId: string, report: Omit<MedicalReport, "id" | "createdAt" | "updatedAt">) {
  return saveHealthCheckup(userId, {
    title: report.title,
    category: report.category === "lab" || report.category === "prescription" ? report.category : "other",
    date: report.date,
    notes: report.notes,
    attachments: report.attachments,
    healthIssueId: null,
  });
}

export async function updateMedicalReport(userId: string, id: string, report: Omit<MedicalReport, "id" | "createdAt" | "updatedAt">, removedAttachments: MedicalAttachment[] = []) {
  return updateHealthCheckup(userId, id, {
    title: report.title,
    category: report.category === "lab" || report.category === "prescription" ? report.category : "other",
    date: report.date,
    notes: report.notes,
    attachments: report.attachments,
    healthIssueId: null,
  }, removedAttachments);
}

export async function deleteMedicalReport(userId: string, id: string, attachments: MedicalAttachment[]) {
  return deleteHealthCheckup(userId, id, attachments);
}
