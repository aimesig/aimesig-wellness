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
  displayNameLower?: string;
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
      displayNameLower: (displayName.trim() || "AimeSig User").toLowerCase(),
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


// ============================================================
// PER-FRIEND SHARING PERMISSIONS
// ============================================================

export interface FriendSharePermissions {
  id?: string;
  ownerId: string;
  friendId: string;
  routineCalendar: boolean;
  analytics: boolean;
  medicalReportIds: string[];
  generalDocumentIds: string[];
  updatedAt?: Timestamp;
}

function sharePermissionId(ownerId: string, friendId: string): string {
  return `${ownerId}_${friendId}`;
}

export async function getFriendSharePermissions(
  ownerId: string,
  friendId: string,
): Promise<FriendSharePermissions> {
  const snap = await getDoc(
    doc(db, "sharePermissions", sharePermissionId(ownerId, friendId)),
  );

  if (!snap.exists()) {
    return {
      ownerId,
      friendId,
      routineCalendar: false,
      analytics: false,
      medicalReportIds: [],
      generalDocumentIds: [],
    };
  }

  const data = snap.data() as Partial<FriendSharePermissions>;
  return {
    ownerId,
    friendId,
    routineCalendar: Boolean(data.routineCalendar),
    analytics: Boolean(data.analytics),
    medicalReportIds: Array.isArray(data.medicalReportIds) ? data.medicalReportIds : [],
    generalDocumentIds: Array.isArray(data.generalDocumentIds) ? data.generalDocumentIds : [],
    updatedAt: data.updatedAt,
    id: snap.id,
  };
}

export async function saveFriendSharePermissions(
  ownerId: string,
  friendId: string,
  permissions: Omit<FriendSharePermissions, "id" | "ownerId" | "friendId" | "updatedAt">,
): Promise<void> {
  if (ownerId === friendId) {
    throw new Error("You cannot share your data with yourself.");
  }

  await runTransaction(db, async (transaction) => {
    const shareRef = doc(
      db,
      "sharePermissions",
      sharePermissionId(ownerId, friendId),
    );

    transaction.set(
      shareRef,
      {
        ownerId,
        friendId,
        routineCalendar: Boolean(permissions.routineCalendar),
        analytics: Boolean(permissions.analytics),
        medicalReportIds: Array.from(new Set(permissions.medicalReportIds.filter(Boolean))),
        generalDocumentIds: Array.from(new Set(permissions.generalDocumentIds.filter(Boolean))),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function revokeFriendSharePermissions(
  ownerId: string,
  friendId: string,
): Promise<void> {
  await saveFriendSharePermissions(ownerId, friendId, {
    routineCalendar: false,
    analytics: false,
    medicalReportIds: [],
    generalDocumentIds: [],
  });
}

export async function getSharedWithMe(
  friendId: string,
): Promise<FriendSharePermissions[]> {
  const snap = await getDocs(
    query(
      collection(db, "sharePermissions"),
      where("friendId", "==", friendId),
      limit(100),
    ),
  );

  return snap.docs.map((item) => {
    const data = item.data() as FriendSharePermissions;
    return {
      id: item.id,
      ownerId: data.ownerId,
      friendId: data.friendId,
      routineCalendar: Boolean(data.routineCalendar),
      analytics: Boolean(data.analytics),
      medicalReportIds: Array.isArray(data.medicalReportIds) ? data.medicalReportIds : [],
      generalDocumentIds: Array.isArray(data.generalDocumentIds) ? data.generalDocumentIds : [],
      updatedAt: data.updatedAt,
    };
  });
}
