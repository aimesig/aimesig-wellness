import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
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
  type: string; // mime type
  size: number;
}

export interface MedicalReport {
  id?: string;
  title: string;
  category: ReportCategory;
  date: string; // ISO date string YYYY-MM-DD
  notes: string;
  attachments: MedicalAttachment[];
  createdAt?: Timestamp;
}

const storage = getStorage(app);

export async function getMedicalReports(userId: string): Promise<MedicalReport[]> {
  try {
    const q = query(
      collection(db, "users", userId, "medicalReports"),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedicalReport));
  } catch (err) {
    // If the index isn't ready yet, fall back to unordered fetch and sort client-side
    console.warn("getMedicalReports: orderBy failed, falling back to client-side sort", err);
    const snap = await getDocs(collection(db, "users", userId, "medicalReports"));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MedicalReport));
    return docs.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}

export async function saveMedicalReport(
  userId: string,
  report: Omit<MedicalReport, "id" | "createdAt">
): Promise<string> {
  const ref2 = await addDoc(collection(db, "users", userId, "medicalReports"), {
    title: report.title,
    category: report.category,
    date: report.date,
    notes: report.notes ?? "",
    attachments: report.attachments ?? [],
    createdAt: serverTimestamp(),
  });
  return ref2.id;
}

export async function deleteMedicalReport(
  userId: string,
  reportId: string,
  attachments: MedicalAttachment[]
): Promise<void> {
  // Delete all attachments from storage
  for (const att of attachments) {
    try {
      const storageRef = ref(storage, att.storagePath);
      await deleteObject(storageRef);
    } catch {
      // non-critical — file may already be deleted
    }
  }
  await deleteDoc(doc(db, "users", userId, "medicalReports", reportId));
}

export function uploadMedicalFile(
  userId: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<MedicalAttachment> {
  return new Promise((resolve, reject) => {
    const storagePath = `medicalReports/${userId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
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
            storagePath,
            type: file.type,
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