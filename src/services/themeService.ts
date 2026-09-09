import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ThemeMode } from "../context/ThemeContext";

/**
 * Each user's light/dark preference is stored in its own small settings
 * document, kept separate from the fitness profile so saving one never
 * clobbers the other.
 */
function themeDocRef(userId: string) {
  return doc(db, "users", userId, "settings", "preferences");
}

export async function getUserTheme(userId: string): Promise<ThemeMode | null> {
  const snap = await getDoc(themeDocRef(userId));
  if (!snap.exists()) return null;
  const value = snap.data()?.theme;
  return value === "light" || value === "dark" ? value : null;
}

export async function saveUserTheme(userId: string, theme: ThemeMode): Promise<void> {
  await setDoc(
    themeDocRef(userId),
    { theme, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
