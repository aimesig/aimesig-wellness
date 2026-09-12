import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { GeneralDocument } from "./generalDocumentService";
import type { HealthCheckup, MedicalReport } from "./medicalReportService";
import { getFriendSharePermissions, getSharedWithMe, type FriendSharePermissions } from "./socialService";

export { getFriendSharePermissions, getSharedWithMe };
export type { FriendSharePermissions };

export async function getSharedMedicalReports(ownerId: string, reportIds: string[]): Promise<(HealthCheckup | MedicalReport)[]> {
  if (!reportIds.length) return [];

  const results: (HealthCheckup | MedicalReport)[] = [];
  for (const id of reportIds) {
    const snap = await getDoc(doc(db, "users", ownerId, "healthCheckups", id));
    if (snap.exists()) {
      results.push({ id, ...snap.data() } as HealthCheckup);
      continue;
    }

    const legacy = await getDoc(doc(db, "users", ownerId, "medicalReports", id));
    if (legacy.exists()) results.push({ id, ...legacy.data() } as MedicalReport);
  }

  return results.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getSharedGeneralDocuments(ownerId: string, documentIds: string[]): Promise<GeneralDocument[]> {
  if (!documentIds.length) return [];

  const results: GeneralDocument[] = [];
  for (const id of documentIds) {
    const snap = await getDoc(doc(db, "users", ownerId, "generalDocuments", id));
    if (snap.exists()) results.push({ id, ...snap.data() } as GeneralDocument);
  }

  return results.sort((a, b) => {
    const at = a.createdAt?.toMillis?.() ?? 0;
    const bt = b.createdAt?.toMillis?.() ?? 0;
    return bt - at;
  });
}
