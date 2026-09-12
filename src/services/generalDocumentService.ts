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
  Timestamp,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
  getStorage,
} from "firebase/storage";
import { db } from "../lib/firebase";
import app from "../lib/firebase";

export interface GeneralFolder {
  id?: string;
  name: string;
  createdAt?: Timestamp;
  parentFolderId?: string | null;
}

export interface GeneralDocument {
  id?: string;
  name: string;
  originalName?: string;
  url: string;
  storagePath: string;
  type: string;
  size: number;
  folderId?: string | null;
  folderName?: string;
  createdAt?: Timestamp;
}

const storage = getStorage(app, "gs://aimesig-wellness.firebasestorage.app");
const MAX_SIZE = 25 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
}

function formatError(err: any) {
  if (err?.code === "storage/unauthorized") return "Firebase Storage denied this upload. Deploy the storage.rules file and make sure you are signed in.";
  if (err?.code === "storage/bucket-not-found") return "Firebase Storage bucket was not found. Enable Firebase Storage for this project.";
  if (err?.code === "storage/canceled") return "Upload canceled.";
  return err?.message || "Unable to upload the document.";
}

export async function getGeneralFolders(userId: string): Promise<GeneralFolder[]> {
  const q = query(collection(db, "users", userId, "generalDocumentFolders"), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as GeneralFolder));
}


export const DEFAULT_GENERAL_FOLDERS = [
  "Identity Documents",
  "Insurance",
  "Education",
  "Financial",
  "Certificates",
] as const;

export async function ensureDefaultGeneralFolders(userId: string): Promise<GeneralFolder[]> {
  const existing = await getGeneralFolders(userId);
  const existingNames = new Set(existing.map((folder) => folder.name.trim().toLowerCase()));
  const missing = DEFAULT_GENERAL_FOLDERS.filter((name) => !existingNames.has(name.toLowerCase()));

  if (missing.length === 0) return existing;

  await Promise.all(missing.map((name) =>
    addDoc(collection(db, "users", userId, "generalDocumentFolders"), {
      name,
      isDefault: true,
      createdAt: serverTimestamp(),
    })
  ));

  return getGeneralFolders(userId);
}

export async function createGeneralFolder(userId: string, name: string, parentFolderId: string | null = null): Promise<GeneralFolder> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Folder name is required.");
  if (cleanName.length > 60) throw new Error("Folder name must be 60 characters or less.");

  const existing = await getGeneralFolders(userId);
  if (existing.some((folder) => (folder.parentFolderId || null) === parentFolderId && folder.name.toLowerCase() === cleanName.toLowerCase())) {
    throw new Error("A folder with this name already exists.");
  }

  const saved = await addDoc(collection(db, "users", userId, "generalDocumentFolders"), {
    name: cleanName,
    parentFolderId: parentFolderId || null,
    createdAt: serverTimestamp(),
  });
  return { id: saved.id, name: cleanName, parentFolderId };
}

export async function getGeneralDocuments(userId: string): Promise<GeneralDocument[]> {
  const q = query(collection(db, "users", userId, "generalDocuments"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((item) => ({ id: item.id, ...item.data() } as GeneralDocument));
}

export function uploadGeneralDocument(
  userId: string,
  file: File,
  documentName: string,
  folderId: string | null,
  folderName: string | null,
  onProgress: (pct: number) => void,
): Promise<GeneralDocument> {
  if (file.size > MAX_SIZE) {
    return Promise.reject(new Error(`"${file.name}" is larger than 25 MB.`));
  }

  const cleanDocumentName = documentName.trim();
  if (!cleanDocumentName) return Promise.reject(new Error("Document name is required."));

  return new Promise((resolve, reject) => {
    const storageFolder = folderId ? `generalDocuments/${userId}/${folderId}` : `generalDocuments/${userId}/Unsorted`;
    const storagePath = `${storageFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName(cleanDocumentName)}`;
    const storageRef = ref(storage, storagePath);
    const task: UploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream",
      customMetadata: { originalName: file.name, documentName: cleanDocumentName, userId, ...(folderId ? { folderId } : {}) },
    });

    task.on(
      "state_changed",
      (snapshot) => {
        onProgress(snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0);
      },
      (err) => reject(new Error(formatError(err))),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          const item = {
            name: cleanDocumentName,
            originalName: file.name,
            url,
            storagePath,
            type: file.type || "application/octet-stream",
            size: file.size,
            folderId: folderId || null,
            folderName: folderName || "Unsorted",
            createdAt: serverTimestamp(),
          };
          const saved = await addDoc(collection(db, "users", userId, "generalDocuments"), item);
          onProgress(100);
          resolve({ id: saved.id, ...item, createdAt: undefined });
        } catch (err: any) {
          reject(new Error(err?.message || "Document uploaded but could not be saved."));
        }
      },
    );
  });
}

export async function moveGeneralDocument(userId: string, documentId: string, folderId: string | null, folderName: string | null) {
  await updateDoc(doc(db, "users", userId, "generalDocuments", documentId), {
    folderId: folderId || null,
    folderName: folderName || "Unsorted",
  });
}

export async function moveGeneralFolder(userId: string, folderId: string, parentFolderId: string | null) {
  if (!folderId) throw new Error("Folder ID is required.");
  if (folderId === parentFolderId) throw new Error("A folder cannot be moved inside itself.");

  const folders = await getGeneralFolders(userId);
  const byId = new Map(folders.filter((folder) => folder.id).map((folder) => [folder.id!, folder]));
  let current = parentFolderId ? byId.get(parentFolderId) : undefined;
  const seen = new Set<string>();
  while (current?.id) {
    if (seen.has(current.id)) throw new Error("Invalid folder hierarchy.");
    seen.add(current.id);
    if (current.id === folderId) throw new Error("A folder cannot be moved inside one of its own subfolders.");
    current = current.parentFolderId ? byId.get(current.parentFolderId) : undefined;
  }

  await updateDoc(doc(db, "users", userId, "generalDocumentFolders", folderId), {
    parentFolderId: parentFolderId || null,
  });
}

export async function deleteGeneralFolder(userId: string, folder: GeneralFolder) {
  if (!folder.id) throw new Error("Folder ID is required.");

  const [folders, documents] = await Promise.all([
    getGeneralFolders(userId),
    getGeneralDocuments(userId),
  ]);

  const hasSubfolders = folders.some((item) => item.parentFolderId === folder.id);
  const hasDocuments = documents.some((item) => item.folderId === folder.id);

  if (hasSubfolders || hasDocuments) {
    throw new Error("This folder is not empty. Move or delete its contents before deleting the folder.");
  }

  await deleteDoc(doc(db, "users", userId, "generalDocumentFolders", folder.id));
}

export async function deleteGeneralDocument(userId: string, item: GeneralDocument) {
  await deleteDoc(doc(db, "users", userId, "generalDocuments", item.id!));
  if (item.storagePath) {
    try {
      await deleteObject(ref(storage, item.storagePath));
    } catch (err: any) {
      if (err?.code !== "storage/object-not-found") throw err;
    }
  }
}
