import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";

export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface PublicProfile {
  uid: string;
  username: string;
  displayName: string;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt?: Timestamp;
}

export interface Friend extends PublicProfile {
  addedAt?: Timestamp;
}

export async function syncPublicProfile(userId: string, username: string, displayName: string) {
  await runTransaction(db, async (transaction) => {
    const publicRef = doc(db, "publicProfiles", userId);
    transaction.set(publicRef, {
      uid: userId,
      username: username.trim().toLowerCase().replace(/^@+/, ""),
      displayName: displayName.trim() || "AimeSig User",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export async function searchPeople(searchText: string, currentUserId: string): Promise<PublicProfile[]> {
  const value = searchText.trim().replace(/^@+/, "").toLowerCase();
  if (!value) return [];

  const results = new Map<string, PublicProfile>();

  // Exact username lookup is fast and works regardless of name indexing.
  const usernameSnap = await getDoc(doc(db, "usernames", value));
  if (usernameSnap.exists()) {
    const uid = usernameSnap.data().uid as string;
    if (uid !== currentUserId) {
      const profileSnap = await getDoc(doc(db, "publicProfiles", uid));
      if (profileSnap.exists()) results.set(uid, profileSnap.data() as PublicProfile);
    }
  }

  // Also support searching by display-name prefix.
  const nameQuery = query(
    collection(db, "publicProfiles"),
    where("displayNameLower", ">=", value),
    where("displayNameLower", "<=", `${value}\uf8ff`),
    orderBy("displayNameLower"),
    limit(20),
  );
  const nameSnap = await getDocs(nameQuery);
  nameSnap.docs.forEach((item) => {
    const data = item.data() as PublicProfile & { displayNameLower?: string };
    if (data.uid !== currentUserId) results.set(data.uid, {
      uid: data.uid,
      username: data.username,
      displayName: data.displayName,
    });
  });

  return Array.from(results.values()).slice(0, 20);
}

export async function getFriendRequestState(currentUserId: string, otherUserId: string) {
  const id = `${currentUserId}_${otherUserId}`;
  const reverseId = `${otherUserId}_${currentUserId}`;
  const [outgoing, incoming] = await Promise.all([
    getDoc(doc(db, "friendRequests", id)),
    getDoc(doc(db, "friendRequests", reverseId)),
  ]);
  if (outgoing.exists()) return outgoing.data().status as FriendRequestStatus;
  if (incoming.exists()) return incoming.data().status === "pending" ? "incoming" : incoming.data().status as FriendRequestStatus;
  return "none";
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw new Error("You cannot send a request to yourself.");
  const requestId = `${senderId}_${receiverId}`;
  const reverseId = `${receiverId}_${senderId}`;

  await runTransaction(db, async (transaction) => {
    const [existing, reverse] = await Promise.all([
      transaction.get(doc(db, "friendRequests", requestId)),
      transaction.get(doc(db, "friendRequests", reverseId)),
    ]);
    if (existing.exists() && ["pending", "accepted"].includes(existing.data().status)) {
      throw new Error(existing.data().status === "accepted" ? "You are already friends." : "Friend request already sent.");
    }
    if (reverse.exists() && reverse.data().status === "pending") {
      throw new Error("This person has already sent you a friend request. Accept it from Friend Requests.");
    }
    transaction.set(doc(db, "friendRequests", requestId), {
      senderId,
      receiverId,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cancelFriendRequest(senderId: string, receiverId: string) {
  const requestRef = doc(db, "friendRequests", `${senderId}_${receiverId}`);
  await updateDoc(requestRef, { status: "cancelled", updatedAt: serverTimestamp() });
}

export async function declineFriendRequest(receiverId: string, senderId: string) {
  const requestRef = doc(db, "friendRequests", `${senderId}_${receiverId}`);
  await updateDoc(requestRef, { status: "declined", updatedAt: serverTimestamp() });
}

export async function acceptFriendRequest(receiverId: string, senderId: string) {
  const requestId = `${senderId}_${receiverId}`;
  await runTransaction(db, async (transaction) => {
    const requestRef = doc(db, "friendRequests", requestId);
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists() || requestSnap.data().status !== "pending") {
      throw new Error("This friend request is no longer pending.");
    }
    transaction.update(requestRef, { status: "accepted", updatedAt: serverTimestamp() });
    transaction.set(doc(db, "users", receiverId, "friends", senderId), {
      userId: senderId,
      requestId,
      addedAt: serverTimestamp(),
    });
    transaction.set(doc(db, "users", senderId, "friends", receiverId), {
      userId: receiverId,
      requestId,
      addedAt: serverTimestamp(),
    });
  });
}

export async function getFriendRequests(userId: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
  const [incomingSnap, outgoingSnap] = await Promise.all([
    getDocs(query(collection(db, "friendRequests"), where("receiverId", "==", userId), limit(100))),
    getDocs(query(collection(db, "friendRequests"), where("senderId", "==", userId), limit(100))),
  ]);
  const incoming = incomingSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as FriendRequest))
    .filter((r) => r.status === "pending")
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  const outgoing = outgoingSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as FriendRequest))
    .filter((r) => r.status === "pending")
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  return { incoming, outgoing };
}

export async function getFriends(userId: string): Promise<Friend[]> {
  const snap = await getDocs(query(collection(db, "users", userId, "friends"), orderBy("addedAt", "desc"), limit(200)));
  const profiles = await Promise.all(snap.docs.map(async (item) => {
    const friendId = item.data().userId as string;
    const profileSnap = await getDoc(doc(db, "publicProfiles", friendId));
    if (!profileSnap.exists()) return null;
    return { ...(profileSnap.data() as PublicProfile), addedAt: item.data().addedAt } as Friend;
  }));
  return profiles.filter((p): p is Friend => Boolean(p));
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const snap = await getDoc(doc(db, "publicProfiles", userId));
  return snap.exists() ? snap.data() as PublicProfile : null;
}
