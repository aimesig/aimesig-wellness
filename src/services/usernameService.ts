import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 30;
const USERNAME_PATTERN = /^[a-z0-9._]+$/;

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function validateUsername(value: string): string {
  const username = normalizeUsername(value);
  if (username.length < MIN_USERNAME_LENGTH) {
    throw new Error(`Username must be at least ${MIN_USERNAME_LENGTH} characters.`);
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new Error(`Username must be ${MAX_USERNAME_LENGTH} characters or less.`);
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username can contain only letters, numbers, dots and underscores.");
  }
  if (username.startsWith(".") || username.endsWith(".")) {
    throw new Error("Username cannot start or end with a dot.");
  }
  return username;
}

export async function getUsername(userId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", userId, "profile", "data"));
  if (!snap.exists()) return null;
  const value = snap.data().username;
  return typeof value === "string" && value ? value : null;
}

export async function isUsernameAvailable(username: string, userId?: string): Promise<boolean> {
  const normalized = validateUsername(username);
  const snap = await getDoc(doc(db, "usernames", normalized));
  if (!snap.exists()) return true;
  return userId ? snap.data().uid === userId : false;
}

export async function claimUsername(
  userId: string,
  requestedUsername: string,
  previousUsername?: string | null,
): Promise<string> {
  const username = validateUsername(requestedUsername);
  const previous = previousUsername ? normalizeUsername(previousUsername) : null;
  const profileRef = doc(db, "users", userId, "profile", "data");
  const usernameRef = doc(db, "usernames", username);
  const previousRef = previous && previous !== username ? doc(db, "usernames", previous) : null;

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(usernameRef);
    const profileSnap = await transaction.get(profileRef);
    const previousSnap = previousRef ? await transaction.get(previousRef) : null;
    if (existing.exists() && existing.data().uid !== userId) {
      throw new Error("That username is already taken. Please choose another.");
    }

    const profileName = profileSnap.exists() && typeof profileSnap.data().name === "string"
      ? profileSnap.data().name.trim()
      : "";
    if (previousSnap?.exists() && previousSnap.data().uid === userId) {
      transaction.delete(previousRef!);
    }

    transaction.set(usernameRef, {
      uid: userId,
      username,
      updatedAt: serverTimestamp(),
      createdAt: existing.exists() ? existing.data().createdAt ?? serverTimestamp() : serverTimestamp(),
    });

    transaction.set(profileRef, { username, updatedAt: serverTimestamp() }, { merge: true });
    const publicRef = doc(db, "publicProfiles", userId);
    transaction.set(publicRef, {
      uid: userId,
      username,
      displayName: profileName || username,
      displayNameLower: (profileName || username).toLowerCase(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  return username;
}

export async function suggestUniqueUsername(userId: string, displayName: string): Promise<string> {
  const base = normalizeUsername(displayName).replace(/[^a-z0-9._]/g, "").replace(/^\.+|\.+$/g, "").slice(0, 20) || "user";
  const candidates = [base, `${base}1`, `${base}2`, `${base}3`, `${base}${userId.slice(0, 6).toLowerCase()}`];

  for (const candidate of candidates) {
    if (candidate.length >= MIN_USERNAME_LENGTH && candidate.length <= MAX_USERNAME_LENGTH) {
      if (await isUsernameAvailable(candidate)) return candidate;
    }
  }

  for (let i = 0; i < 100; i += 1) {
    const candidate = `${base.slice(0, 25)}${Math.floor(1000 + Math.random() * 9000)}`;
    if (await isUsernameAvailable(candidate)) return candidate;
  }

  return `user${userId.slice(0, 8).toLowerCase()}`;
}

/** Ensures every signed-in account gets a globally unique username. */
export async function ensureUniqueUsername(userId: string, seed: string): Promise<string> {
  const existing = await getUsername(userId);
  if (existing) {
    // Backfill the public username index for accounts created before usernames existed.
    const index = await getDoc(doc(db, "usernames", normalizeUsername(existing)));
    if (!index.exists()) {
      await claimUsername(userId, existing, null);
    }
    return existing;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suggested = await suggestUniqueUsername(userId, attempt === 0 ? seed : `${seed}${Math.floor(1000 + Math.random() * 9000)}`);
    try {
      return await claimUsername(userId, suggested, null);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("already taken")) throw err;
    }
  }

  throw new Error("Unable to create a unique username. Please try again.");
}
