import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
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

export type ReportCategory = "checkup" | "issue" | "lab" | "prescription" | "other";

export interface MedicalAttachment {
  name: string;
  url: string;
  storagePath: string;
  type: string;
  size: number;
}

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

const storage = getStorage(app);

// ── Helpers ───────────────────────────────────────────────

/** Generates a collision-resistant storage path. */
function storagePath(userId: string, file: File): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  // Sanitise the filename so it is safe in a Storage path
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `medicalReports/${userId}/${ts}_${rand}_${safeName}`;
}

// ── CRUD ──────────────────────────────────────────────────

export async function getMedicalReports(userId: string): Promise<MedicalReport[]> {
  try {
    const q = query(
      collection(db, "users", userId, "medicalReports"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedicalReport));
  } catch (err) {
    // Index not yet built — fall back to a client-side sort
    console.warn("getMedicalReports: orderBy failed, falling back to client-side sort", err);
    const snap = await getDocs(collection(db, "users", userId, "medicalReports"));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedicalReport));
    return docs.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}

export async function saveMedicalReport(
  userId: string,
  report: Omit<MedicalReport, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const docRef = await addDoc(collection(db, "users", userId, "medicalReports"), {
    title: report.title,
    category: report.category,
    date: report.date,
    notes: report.notes ?? "",
    attachments: report.attachments ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Update an existing medical report.
 *
 * Pass the **complete final** attachment list in `report.attachments`
 * (existing ones you kept + newly uploaded ones).
 * Pass `removedAttachments` for anything the user deleted — this function
 * will clean up the corresponding Storage objects.
 */
export async function updateMedicalReport(
  userId: string,
  reportId: string,
  report: Omit<MedicalReport, "id" | "createdAt" | "updatedAt">,
  removedAttachments: MedicalAttachment[] = []
): Promise<void> {
  // Write to Firestore first so the user sees the update immediately,
  // then clean up orphaned Storage files in the background.
  const docRef = doc(db, "users", userId, "medicalReports", reportId);
  await updateDoc(docRef, {
    title: report.title,
    category: report.category,
    date: report.date,
    notes: report.notes ?? "",
    attachments: report.attachments ?? [],
    updatedAt: serverTimestamp(),
  });

  // Best-effort Storage cleanup — failures are non-critical
  await Promise.allSettled(
    removedAttachments.map((att) => deleteObject(ref(storage, att.storagePath)))
  );
}

export async function deleteMedicalReport(
  userId: string,
  reportId: string,
  attachments: MedicalAttachment[]
): Promise<void> {
  // Delete Firestore document first, then clean up Storage
  await deleteDoc(doc(db, "users", userId, "medicalReports", reportId));

  await Promise.allSettled(
    attachments.map((att) => deleteObject(ref(storage, att.storagePath)))
  );
}

// ── Upload ────────────────────────────────────────────────

export function uploadMedicalFile(
  userId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<MedicalAttachment> {
  return new Promise((resolve, reject) => {
    const path = storagePath(userId, file);
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => {
        const pct = snap.totalBytes > 0
          ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          : 0;
        onProgress(pct);
      },
      (err) => {
        console.error("uploadMedicalFile failed:", err.code, err.message);
        reject(err);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            name: file.name,
            url,
            storagePath: path,
            type: file.type || "application/octet-stream",
            size: file.size,
          });
        } catch (err) {
          console.error("getDownloadURL failed:", err);
          reject(err);
        }
      }
    );
  });
}